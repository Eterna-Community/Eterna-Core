import { Inject, Injectable } from "./decorator/Injectable";
import { OnceSharedEvents } from "./events/Once";
import { getGlobalContainer } from "./global";
import { OnceLoader } from "./loader/Events/once.loader";
import { ModuleLoader } from "./loader/module.loader";
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

@Injectable()
export class Application {
	private state: ApplicationState = ApplicationState.STOPPED;
	private shutdownPromise: Promise<boolean> | null = null;
	private shutdownResolver: ((value: boolean) => void) | null = null;
	private onStopCallback: (() => void) | null = null;
	private readonly container = getGlobalContainer();
	private readonly modules: ApplicationModule[] = [];
	private readonly options: Required<ApplicationOptions>;

	@Inject(ModuleLoader)
	private readonly moduleLoader: ModuleLoader;

	@Inject(OnceLoader)
	private readonly onceLoader: OnceLoader;

	@Inject(Logger)
	private readonly logger: Logger;

	/**
	 * @param {ApplicationOptions} [options] - Optional configuration options for the Application.
	 * @param {number} [options.gracefulShutdownTimeout=30000] - The amount of time in milliseconds to wait for all modules to finish shutting down before the application is fully stopped.
	 * @param {boolean} [options.enableResourceListener=true] - Whether or not to enable the resource listener to automatically detect and load modules.
	 */
	constructor(options: ApplicationOptions = {}) {
		this.options = {
			gracefulShutdownTimeout: 30000,
			enableResourceListener: true,
			...options,
		};
	}

	/**
	 * Creates a new Application instance and starts it.
	 * @param {new (...args: any[]) => T} providerTarget - The target class to be used as the provider for the application.
	 * @param {ApplicationModule[]} [modules=[]] - An array of modules to be loaded into the application.
	 * @param {ApplicationOptions} [options] - Optional configuration options for the Application.
	 * @returns {Promise<Application>} - A Promise that resolves with the created Application instance.
	 */
	static async create<T>(
		providerTarget: new (...args: any[]) => T,
		modules: ApplicationModule[] = [],
		options?: ApplicationOptions
	): Promise<Application> {
		try {
			getGlobalContainer()
				.bind<T>(providerTarget)
				.to(providerTarget)
				.inSingletonScope();

			const app = getGlobalContainer().get<Application>(Application);

			for (const module of modules) {
				await app.addModule(module);
			}

			await app.start();
			return app;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(`Application couldn't be created: ${errorMessage}`);
			throw error;
		}
	}

	/**
	 * Starts the Application and begins loading all modules.
	 *
	 * If the Application is already running, this method will do nothing.
	 *
	 * @returns {Promise<void>} - A Promise that resolves when the Application has finished starting.
	 * @throws {Error} - If an error occurs while starting the Application.
	 */
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

	/**
	 * Stops the Application and attempts to gracefully shut down all modules.
	 *
	 * If the Application is already stopped or stopping, appropriate messages are logged.
	 *
	 * @returns {Promise<boolean>} - A Promise that resolves to true if the Application was stopped successfully,
	 *                               or false if an error occurred during the shutdown process.
	 */
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

	/**
	 * Retrieves the current state of the Application.
	 *
	 * @returns {ApplicationState} - The current state of the Application.
	 */
	getState(): ApplicationState {
		return this.state;
	}

	/**
	 * Checks if the Application is currently running.
	 *
	 * @returns {boolean} - True if the Application state is RUNNING, otherwise false.
	 */
	isRunning(): boolean {
		return this.state === ApplicationState.RUNNING;
	}

	/**
	 * Waits for the Application to finish shutting down.
	 *
	 * If the Application is already stopped, this method will return immediately with a value of true.
	 * If the Application is currently shutting down, this method will wait for the shutdown to finish and
	 * return the result of the shutdown process.
	 *
	 * @returns {Promise<boolean>} - A Promise that resolves with a boolean indicating whether the shutdown process
	 *                               was successful. If the Application is already stopped, the Promise will resolve
	 *                               immediately with a value of true.
	 */
	async waitForShutdown(): Promise<boolean> {
		if (this.state === ApplicationState.STOPPED) {
			return true;
		}
		return this.shutdownPromise || Promise.resolve(true);
	}

	/**
	 * Adds a module to the list of modules that will be loaded when the application
	 * starts. If the module is a class, it will be instantiated and the instance
	 * will be added to the list. If the module is an instance, it will be added to
	 * the list directly.
	 *
	 * If the module has an `initialize` method, it will be called after the module
	 * has been added to the list.
	 *
	 * @param {ApplicationModule} module - The module to add. Can be a class or an instance.
	 * @returns {Promise<void>} - A Promise that resolves when the module has been added.
	 * @throws {Error} - If an error occurs while adding the module.
	 */
	private async addModule(module: ApplicationModule): Promise<void> {
		try {
			let moduleInstance: ApplicationModule;

			if (typeof module === "function") {
				moduleInstance = this.container.get(module);
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

	/**
	 * Loads all modules that were added to the application.
	 *
	 * Goes through all modules that were added to the application and calls the
	 * `load` method on the module loader for each of them. If an error occurs while
	 * loading a module, it will be logged and re-thrown.
	 *
	 * @returns {Promise<void>} - A Promise that resolves when all modules have been loaded.
	 * @throws {Error} - If an error occurs while loading a module.
	 */
	private async loadModules(): Promise<void> {
		for (const module of this.modules) {
			try {
				await this.moduleLoader.load(module);
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

	/**
	 * Registers event listeners for resource stops and application stops.
	 *
	 * Registers two event listeners:
	 *  1. A listener for the "onResourceStop" event that will be triggered when the
	 *     resource the application is running in stops. This listener will call the
	 *     `handleStop` method.
	 *  2. A listener for the "Eterna.__internal__.stop_application" event that will be
	 *     triggered when the application is stopped. This listener will also call the
	 *     `handleStop` method.
	 *
	 * @returns {void}
	 */
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

	/**
	 * Handles the stop event for the application.
	 *
	 * This method is called when a stop event is received, either through the
	 * "onResourceStop" event or the "Eterna.__internal__.stop_application" event.
	 *
	 * If the application is already stopped or stopping, this method will do
	 * nothing and return immediately.
	 *
	 * Otherwise, this method will log an info message, call the `stop` method to
	 * initiate the shutdown process, and catch and log any errors that may occur
	 * during shutdown.
	 *
	 * @returns {void}
	 */
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

	/**
	 * Performs the shutdown sequence for the Application.
	 *
	 * This method triggers the stop event for OnceLoader, cleans up and unloads all modules,
	 * removes event listeners, resolves the shutdown promise, and performs cleanup operations.
	 * If any error occurs during the shutdown process, it will be caught, logged, and the
	 * shutdown promise will be resolved with a false value.
	 *
	 * @returns {Promise<boolean>} - A Promise that resolves to true if the shutdown process
	 *                               completed successfully, or false if an error occurred.
	 */
	private async performShutdown(): Promise<boolean> {
		try {
			// OnceLoader stopping
			await this.onceLoader.trigger(OnceSharedEvents.Stop);

			// Module cleanup
			await this.cleanupModules();

			// ModuleLoader unloading
			await this.moduleLoader.unload();

			// Event Listener removing
			this.removeEventListeners();

			// Shutdown Promise resolve
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

	/**
	 * Performs cleanup operations on all modules that were loaded.
	 *
	 * Calls the `cleanup` method on each of the loaded modules, if they have one.
	 * If an error occurs while cleaning a module, it will be logged and ignored.
	 *
	 * @returns {Promise<void>} - A Promise that resolves when all modules have been cleaned.
	 */
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

	/**
	 * Removes the event listener for the "Eterna.__internal__.stop_application"
	 * event, if it was set.
	 *
	 * @private
	 */
	private removeEventListeners(): void {
		if (this.onStopCallback && typeof removeEventListener !== "undefined") {
			removeEventListener(
				"Eterna.__internal__.stop_application",
				this.onStopCallback
			);
		}
	}

	/**
	 * Creates a Promise that resolves to false after the specified timeout has passed.
	 *
	 * The timeout is set to the value of the `gracefulShutdownTimeout` option, which is
	 * set to 5000ms (5 seconds) by default.
	 *
	 * When the timeout is reached, a warn message is logged and the Promise is resolved
	 * to false, indicating that the shutdown was not graceful.
	 *
	 * @returns {Promise<boolean>} - A Promise that resolves to false after the specified timeout.
	 */
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

	/**
	 * Cleans up internal variables after a shutdown.
	 *
	 * Resets the {@link shutdownPromise}, {@link shutdownResolver}, and
	 * {@link onStopCallback} properties to `null`.
	 *
	 * @private
	 */
	private cleanup(): void {
		this.shutdownPromise = null;
		this.shutdownResolver = null;
		this.onStopCallback = null;
	}
}
