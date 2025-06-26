import { build, context, type BuildOptions } from "esbuild";
import { rmSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { execa } from "execa";
import path from "path";
import { writeFxmanifest, type FxmanifestConfig } from "./createFxmanifest";

const args = process.argv.slice(2);
const isWatch = args.includes("--watch") || args.includes("-w");
const isDev = args.includes("--dev") || args.includes("-d");

//!TODO: GITHUB_TODO this path to your output Path
const BuildOutputPath = "../../game_server/data_files/resources/Eterna";

const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
} as const;

function log(message: string, color: keyof typeof colors = "reset") {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function prepareDistFolder() {
	try {
		if (existsSync(BuildOutputPath)) {
			log("🗑️  Cleaning dist folder...", "yellow");
			rmSync(BuildOutputPath, { recursive: true, force: true });
		}
		mkdirSync(BuildOutputPath, { recursive: true });
		log("📁 Created dist folder", "green");
	} catch (error) {
		log(`❌ Error preparing dist folder: ${error}`, "red");
		throw error;
	}
}

const createSharedConfig = (isDev: boolean): Partial<BuildOptions> => ({
	bundle: true,
	minify: false,
	minifyIdentifiers: false,
	sourcemap: "inline", // Ask in Production to create seperate files
	logLevel: "info",
	metafile: true,
	color: true,
	define: {
		"process.env.NODE_ENV": isDev ? '"development"' : '"production"',
	},
});

function createBuildConfigs(shared: Partial<BuildOptions>): BuildOptions[] {
	return [
		{
			entryPoints: ["src/main/client/index.ts"],
			outfile: `${BuildOutputPath}/client.js`,
			platform: "browser",
			target: ["es2021"],
			format: "iife",
			globalName: "ClientApp",
			define: {
				isServer: "false",
				isClient: "true",
			},
			...shared,
		},
		{
			entryPoints: ["src/main/server/index.ts"],
			outfile: `${BuildOutputPath}/server.js`,
			target: ["node22"],
			platform: "node",
			format: "cjs",
			define: {
				isClient: "false",
				isServer: "true",
			},
			external: ["fs", "path", "http", "https", "crypto", "os", "tslib"],
			...shared,
		},
	];
}

async function executeBuild(config: BuildOptions, name: string): Promise<void> {
	try {
		log(`🔨 Building ${name}...`, "blue");
		const result = await build(config);
		if (result.metafile) {
			const outputSize = Object.values(result.metafile.outputs).reduce(
				(total, output) => total + output.bytes,
				0
			);
			log(
				`✅ ${name} built successfully (${(outputSize / 1024).toFixed(1)}kb)`,
				"green"
			);
		} else {
			log(`✅ ${name} built successfully`, "green");
		}
	} catch (error) {
		log(`❌ Error building ${name}:`, "red");
		console.error(error);
		throw error;
	}
}

async function createWatchContext(config: BuildOptions, name: string) {
	try {
		const ctx = await context({
			...config,
			plugins: [
				...(config.plugins || []),
				{
					name: "watch-plugin",
					setup(build) {
						build.onStart(() => {
							log(`🔄 Rebuilding ${name}...`, "yellow");
						});
						build.onEnd(async (result) => {
							if (result.errors.length > 0) {
								log(`❌ ${name} build failed`, "red");
							} else {
								const time = new Date().toLocaleTimeString();
								log(`✅ ${name} rebuilt at ${time}`, "green");

								// fxmanifest.lua nach jedem erfolgreichen Build neu erstellen
								await generateFxmanifest();
							}
						});
					},
				},
			],
		});
		await ctx.watch();
		log(`👀 Watching ${name} for changes...`, "cyan");
		return ctx;
	} catch (error) {
		log(`❌ Error setting up watch for ${name}:`, "red");
		console.error(error);
		throw error;
	}
}

// Funktion um alle Dateien im web/dist Ordner zu sammeln
function getWebFiles(): string[] {
	const webDistPath = path.join(BuildOutputPath, "web");

	if (!existsSync(webDistPath)) {
		return [];
	}

	const getAllFiles = (
		dirPath: string,
		arrayOfFiles: string[] = []
	): string[] => {
		const files = readdirSync(dirPath);

		files.forEach((file) => {
			const filePath = path.join(dirPath, file);
			if (statSync(filePath).isDirectory()) {
				arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
			} else {
				// Relativer Pfad zum dist Ordner
				const relativePath = path.relative(BuildOutputPath, filePath);
				arrayOfFiles.push(relativePath);
			}
		});

		return arrayOfFiles;
	};

	return getAllFiles(webDistPath);
}

async function generateFxmanifest(): Promise<void> {
	try {
		log("📝 Generating fxmanifest.lua...", "blue");

		const webFiles = getWebFiles();

		const fxmanifestConfig: FxmanifestConfig = {
			pathToClient: "client.js",
			pathToServer: "server.js",
			pathToIndexHtml: path.join("web", "index.html"),
			pathToFiles: [
				...webFiles,
				// Weitere statische Dateien hier hinzufügen falls nötig
			],
			outputPath: path.join(BuildOutputPath, "fxmanifest.lua"),
		};

		writeFxmanifest(fxmanifestConfig);
		log("✅ fxmanifest.lua generated successfully", "green");
	} catch (error) {
		log(`❌ Error generating fxmanifest.lua: ${error}`, "red");
		throw error;
	}
}

async function buildAll(): Promise<void> {
	const startTime = Date.now();
	try {
		prepareDistFolder();
		const shared = createSharedConfig(isDev || isWatch);
		const configs = createBuildConfigs(shared);

		log(
			`🚀 Starting ${isDev ? "development" : "production"} build...`,
			"bright"
		);

		if (isWatch) {
			log("👀 Watch mode enabled", "cyan");
			await Promise.all(
				configs.map((config, index) =>
					executeBuild(config, getBuildName(index))
				)
			);

			await buildWeb();
			await generateFxmanifest();

			const contexts = await Promise.all(
				configs.map((config, index) =>
					createWatchContext(config, getBuildName(index))
				)
			);

			await buildWeb();

			log("🎯 All builds are being watched. Press Ctrl+C to stop.", "bright");

			process.on("SIGINT", async () => {
				log("\n🛑 Stopping watch mode...", "yellow");
				await Promise.all(contexts.map((ctx) => ctx.dispose()));
				log("👋 Watch mode stopped", "green");
				process.exit(0);
			});
		} else {
			await Promise.all(
				configs.map((config, index) =>
					executeBuild(config, getBuildName(index))
				)
			);

			await buildWeb();
			await generateFxmanifest();

			const duration = Date.now() - startTime;
			log(`🎉 All builds completed in ${duration}ms`, "bright");
		}
	} catch (error) {
		log("💥 Build failed:", "red");
		console.error(error);
		process.exit(1);
	}
}

function getBuildName(index: number): string {
	const names = ["Client", "Server", "Web"];
	return names[index] || `Build ${index}`;
}

async function buildWeb(): Promise<void> {
	try {
		log("🌐 Building web interface with Vite...", "blue");
		await execa("bun", ["run", "vite", "build"], {
			cwd: path.resolve("web"),
			stdio: "inherit",
		});
		log("✅ Web interface built successfully", "green");
	} catch (error) {
		log("❌ Failed to build web interface", "red");
		throw error;
	}
}

async function watchWeb(): Promise<void> {
	try {
		log("👀 Starting Vite dev server...", "cyan");
		const subprocess = execa("bun", ["run", "vite"], {
			cwd: path.resolve("web"),
			stdio: "inherit",
		});

		subprocess.on("exit", (code) => {
			log(`🌐 Vite process exited with code ${code}`, "yellow");
		});

		// Optional: Handle SIGINT for subprocess too
		process.on("SIGINT", () => {
			subprocess.kill("SIGINT");
		});
	} catch (error) {
		log("❌ Failed to start Vite dev server", "red");
		throw error;
	}
}

function showHelp() {
	console.log(`
${colors.bright}Build Script Usage:${colors.reset}
${colors.green}bun run build${colors.reset}              - Production build
${colors.green}bun run build --dev${colors.reset}        - Development build
${colors.green}bun run build --watch${colors.reset}      - Production build with watch
${colors.green}bun run build --dev --watch${colors.reset} - Development build with watch

${colors.bright}Options:${colors.reset}
  --dev, -d     Development mode (no minification, inline sourcemaps)
  --watch, -w   Watch mode (rebuild on file changes)
  --help, -h    Show this help

${colors.bright}Examples:${colors.reset}
  ${colors.cyan}bun run build.ts --dev --watch${colors.reset}
  ${colors.cyan}bun run build.ts --watch${colors.reset}
  ${colors.cyan}bun run build.ts --dev${colors.reset}
`);
}

if (args.includes("--help") || args.includes("-h")) {
	showHelp();
} else {
	buildAll().catch((err) => {
		log("💥 Fatal error:", "red");
		console.error(err);
		process.exit(1);
	});
}

process.on("SIGINT", () => {
	log("\n🛑 Stopping build script...", "yellow");
	process.exit(0);
});
