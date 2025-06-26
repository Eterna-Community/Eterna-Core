import { Inject, Injectable } from "./decorator/Injectable";
import { OnceSharedEvents } from "./events/Once";
import { getGlobalContainer } from "./global";
import { OnceLoader } from "./loader/Events/once.loader";
import { ModuleLoader } from "./loader/module.loader";
import { ClientProviderLoader } from "./loader/Provider/provider.client.loader";
import { ProviderLoader } from "./loader/Provider/provider.loader";
import { ServerProviderLoader } from "./loader/Provider/provider.server.loader";
import { Logger } from "./logger/logger";

export enum ApplicationState {
	STOPPED = "stopped",
	STARTING = "starting",
	RUNNING = "running",
	STOPPING = "stopping",
}

export interface ApplicationModule {
	name?: string;
	initialize?(): Promise<void>;
	cleanup?(): Promise<void>;
}

export interface ApplicationOptions {
	gracefulShutdownTimeout?: number;
	enableResourceListener?: boolean;
}

export interface ApplicationModuleWithClass extends ApplicationModule {
	moduleClass?: new () => ApplicationModule;
}

export type ModuleInput = ApplicationModule | (new () => ApplicationModule);

// Helper function to check if this is server or client environment
function IsDuplicityVersion(): boolean {
	// Adjust this logic based on your environment detection
	return (
		typeof GetCurrentResourceName !== "undefined" &&
		typeof global !== "undefined"
	);
}

@Injectable()
export class Application {
	private state: ApplicationState = ApplicationState.STOPPED;
	private shutdownPromise: Promise<boolean> | null = null;
	private shutdownResolver: ((value: boolean) => void) | null = null;
	private onStopCallback: (() => void) | null = null;
	private readonly container = getGlobalContainer();
	private readonly modules: ApplicationModuleWithClass[] = [];
	private readonly options: Required<ApplicationOptions>;

	@Inject(ModuleLoader)
	private readonly moduleLoader: ModuleLoader;

	@Inject(OnceLoader)
	private readonly onceLoader: OnceLoader;

	@Inject(Logger)
	private readonly logger: Logger;

	constructor(options: ApplicationOptions = {}) {
		this.options = {
			gracefulShutdownTimeout: 30000,
			enableResourceListener: true,
			...options,
		};
	}

	static async create<T>(
		providerTarget: new (...args: any[]) => T,
		modules: (ApplicationModule | (new () => ApplicationModule))[] = [],
		options?: ApplicationOptions
	): Promise<Application> {
		try {
			const container = getGlobalContainer();
			if (!container.isBound(providerTarget)) {
				container.bind<T>(providerTarget).to(providerTarget).inSingletonScope();
			}

			Application.registerCoreServices();

			const app = container.get<Application>(Application);

			for (const module of modules) {
				await app.addModule(module);
			}
			await app.start();
			return app;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(`Application couldn't be created: ${errorMessage}`);
			console.error(
				"Stack:",
				error instanceof Error ? error.stack : "No stack available"
			);
			throw error;
		}
	}

	/**
	 * Later on this method will be removed, it was for debug Purpose
	 */
	private static registerCoreServices(): void {
		const container = getGlobalContainer();
		try {
			const providerLoader = container.get<ProviderLoader>(ProviderLoader);
			console.log("[DEBUG] ProviderLoader instance created successfully");
			console.log(
				"[DEBUG] ProviderLoader has load method:",
				typeof providerLoader.load === "function"
			);
		} catch (error) {
			console.error("[DEBUG] Failed to create ProviderLoader instance:", error);
		}

		console.log("[DEBUG] All core services registered");
	}

	async start(): Promise<void> {
		if (this.state !== ApplicationState.STOPPED) {
			this.logger.warn(`Application is already in state ${this.state}`);
			return;
		}

		this.state = ApplicationState.STARTING;
		this.logger.info("Starting Application...");

		try {
			this.shutdownPromise = new Promise<boolean>((resolve) => {
				this.shutdownResolver = resolve;
			});

			await this.loadModules();
			this.registerEventListeners();
			await this.onceLoader.trigger(OnceSharedEvents.Start);

			this.state = ApplicationState.RUNNING;
			this.logger.info("Application started successfully");
		} catch (error) {
			this.state = ApplicationState.STOPPED;
			this.logger.error("Error while starting Application", error);
			throw error;
		}
	}

	async stop(): Promise<boolean> {
		if (this.state === ApplicationState.STOPPED) {
			this.logger.warn("Application is already stopped");
			return true;
		}

		if (this.state === ApplicationState.STOPPING) {
			this.logger.info("Application is already stopping...");
			return this.shutdownPromise || Promise.resolve(true);
		}

		this.state = ApplicationState.STOPPING;
		this.logger.info("Stopping Application...");

		try {
			const shutdownResult = await Promise.race([
				this.performShutdown(),
				this.createShutdownTimeout(),
			]);

			this.state = ApplicationState.STOPPED;
			this.logger.info("Application stopped successfully");

			return shutdownResult;
		} catch (error) {
			this.state = ApplicationState.STOPPED;
			this.logger.error("Error while stopping Application", error);
			return false;
		}
	}

	getState(): ApplicationState {
		return this.state;
	}

	isRunning(): boolean {
		return this.state === ApplicationState.RUNNING;
	}

	async waitForShutdown(): Promise<boolean> {
		if (this.state === ApplicationState.STOPPED) {
			return true;
		}
		return this.shutdownPromise || Promise.resolve(true);
	}

	private async addModule(module: ModuleInput): Promise<void> {
		try {
			let moduleInstance: ApplicationModuleWithClass;

			if (typeof module === "function") {
				moduleInstance = new module();
				moduleInstance.moduleClass = module;
			} else {
				moduleInstance = module;
			}

			if (moduleInstance.initialize) {
				await moduleInstance.initialize();
			}
			this.modules.push(moduleInstance);
			this.logger.debug(`Module added: ${moduleInstance.name || "N/A"}`);
		} catch (error) {
			this.logger.error("There was an Error adding a module", error);
			throw error;
		}
	}

	private async loadModules(): Promise<void> {
		for (const module of this.modules) {
			try {
				const moduleToLoad =
					(module as ApplicationModuleWithClass).moduleClass || module;
				this.moduleLoader.load(moduleToLoad);
				this.logger.debug(`Module loaded: ${module.name || "N/A"}`);
			} catch (error) {
				this.logger.error(
					`Error while loading module: ${module.name || "N/A"}`,
					error
				);
				throw error;
			}
		}
	}

	private registerEventListeners(): void {
		this.onStopCallback = this.handleStop.bind(this);

		if (
			this.options.enableResourceListener &&
			typeof addEventListener !== "undefined"
		) {
			addEventListener("onResourceStop", (resourceName: string) => {
				if (
					typeof GetCurrentResourceName !== "undefined" &&
					resourceName === GetCurrentResourceName()
				) {
					this.handleStop();
				}
			});
		}

		if (typeof addEventListener !== "undefined") {
			addEventListener(
				"Eterna.__internal__.stop_application",
				this.onStopCallback,
				false
			);
		}
	}

	private handleStop(): void {
		if (
			this.state === ApplicationState.STOPPED ||
			this.state === ApplicationState.STOPPING
		) {
			return;
		}

		this.logger.info("Stop-Event empfangen");
		this.stop().catch((error) => {
			this.logger.error("Fehler beim Behandeln des Stop-Events", error);
		});
	}

	private async performShutdown(): Promise<boolean> {
		try {
			await this.onceLoader.trigger(OnceSharedEvents.Stop);
			await this.cleanupModules();
			await this.moduleLoader.unload();
			this.removeEventListeners();

			if (this.shutdownResolver) {
				this.shutdownResolver(true);
			}

			this.cleanup();
			return true;
		} catch (error) {
			this.logger.error("Error while shutdowning Application", error);

			if (this.shutdownResolver) {
				this.shutdownResolver(false);
			}

			this.cleanup();
			return false;
		}
	}

	private async cleanupModules(): Promise<void> {
		for (const module of this.modules) {
			try {
				if (module.cleanup) {
					await module.cleanup();
				}
				this.logger.debug(`Module cleaned: ${module.name || "N/A"}`);
			} catch (error) {
				this.logger.error(
					`Error while cleaning module: ${module.name || "N/A"}`,
					error
				);
			}
		}
	}

	private removeEventListeners(): void {
		if (this.onStopCallback && typeof removeEventListener !== "undefined") {
			removeEventListener(
				"Eterna.__internal__.stop_application",
				this.onStopCallback
			);
		}
	}

	private createShutdownTimeout(): Promise<boolean> {
		return new Promise((resolve) => {
			setTimeout(() => {
				this.logger.warn(
					`Graceful shutdown timeout ${this.options.gracefulShutdownTimeout}ms reached. Forcing shutdown.`
				);
				resolve(false);
			}, this.options.gracefulShutdownTimeout);
		});
	}

	private cleanup(): void {
		this.shutdownPromise = null;
		this.shutdownResolver = null;
		this.onStopCallback = null;
	}
}
