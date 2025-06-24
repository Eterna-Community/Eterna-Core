import { build, context, type BuildOptions } from "esbuild";
import { rmSync, existsSync, mkdirSync } from "fs";
import { execa } from "execa";
import path from "path";

const args = process.argv.slice(2);
const isWatch = args.includes("--watch") || args.includes("-w");
const isDev = args.includes("--dev") || args.includes("-d");

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
    if (existsSync("dist")) {
      log("🗑️  Cleaning dist folder...", "yellow");
      rmSync("dist", { recursive: true, force: true });
    }
    mkdirSync("dist", { recursive: true });
    log("📁 Created dist folder", "green");
  } catch (error) {
    log(`❌ Error preparing dist folder: ${error}`, "red");
    throw error;
  }
}

const createSharedConfig = (isDev: boolean): Partial<BuildOptions> => ({
  bundle: true,
  minify: !isDev,
  sourcemap: isDev ? "inline" : true,
  logLevel: "info",
  target: "es2021",
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
      outfile: "dist/client.js",
      platform: "browser",
      format: "iife",
      globalName: "ClientApp",
      ...shared,
    },
    {
      entryPoints: ["src/main/server/index.ts"],
      outfile: "dist/server.js",
      platform: "node",
      format: "cjs",
      external: ["fs", "path", "http", "https", "crypto", "os"],
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
            build.onEnd((result) => {
              if (result.errors.length > 0) {
                log(`❌ ${name} build failed`, "red");
              } else {
                const time = new Date().toLocaleTimeString();
                log(`✅ ${name} rebuilt at ${time}`, "green");
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

async function buildAll(): Promise<void> {
  const startTime = Date.now();

  try {
    prepareDistFolder();

    const shared = createSharedConfig(isDev);
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

      const contexts = await Promise.all(
        configs.map((config, index) =>
          createWatchContext(config, getBuildName(index))
        )
      );

      await watchWeb();

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
