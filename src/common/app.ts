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

	constructor(options: ApplicationOptions = {}) {
		this.options = {
			gracefulShutdownTimeout: 30000,
			enableResourceListener: true,
			...options,
		};
	}

	/**
	 * Erstellt und startet eine neue Application-Instanz
	 */
	static async create<T>(
		providerTarget: new (...args: any[]) => T,
		modules: ApplicationModule[] = [],
		options?: ApplicationOptions
	): Promise<Application> {
		try {
			// Provider registrieren
			getGlobalContainer()
				.bind<T>(providerTarget)
				.to(providerTarget)
				.inSingletonScope();

			const app = getGlobalContainer().get<Application>(Application);

			// Module hinzufügen
			for (const module of modules) {
				await app.addModule(module);
			}

			await app.start();
			return app;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(`Application kann nicht erstellt werden: ${errorMessage}`);
			throw error;
		}
	}

	/**
	 * Startet die Applikation
	 */
	async start(): Promise<void> {
		if (this.state !== ApplicationState.STOPPED) {
			this.logger.warn(`Application ist bereits ${this.state}`);
			return;
		}

		this.state = ApplicationState.STARTING;
		this.logger.info("Starte Application...");

		try {
			// Shutdown Promise erstellen
			this.shutdownPromise = new Promise<boolean>((resolve) => {
				this.shutdownResolver = resolve;
			});

			// Module laden
			await this.loadModules();

			// Event Listener registrieren
			this.registerEventListeners();

			// OnceLoader starten
			await this.onceLoader.trigger(OnceSharedEvents.Start);

			this.state = ApplicationState.RUNNING;
			this.logger.info("Application erfolgreich gestartet");
		} catch (error) {
			this.state = ApplicationState.STOPPED;
			this.logger.error("Fehler beim Starten der Application", error);
			throw error;
		}
	}

	/**
	 * Stoppt die Applikation graceful
	 */
	async stop(): Promise<boolean> {
		if (this.state === ApplicationState.STOPPED) {
			this.logger.warn("Application ist bereits gestoppt");
			return true;
		}

		if (this.state === ApplicationState.STOPPING) {
			this.logger.info(
				"Application wird bereits gestoppt, warte auf Beendigung..."
			);
			return this.shutdownPromise || Promise.resolve(true);
		}

		this.state = ApplicationState.STOPPING;
		this.logger.info("Stoppe Application...");

		try {
			// Graceful shutdown mit Timeout
			const shutdownResult = await Promise.race([
				this.performShutdown(),
				this.createShutdownTimeout(),
			]);

			this.state = ApplicationState.STOPPED;
			this.logger.info("Application erfolgreich gestoppt");

			return shutdownResult;
		} catch (error) {
			this.state = ApplicationState.STOPPED;
			this.logger.error("Fehler beim Stoppen der Application", error);
			return false;
		}
	}

	/**
	 * Gibt den aktuellen Status der Application zurück
	 */
	getState(): ApplicationState {
		return this.state;
	}

	/**
	 * Prüft ob die Application läuft
	 */
	isRunning(): boolean {
		return this.state === ApplicationState.RUNNING;
	}

	/**
	 * Wartet bis die Application gestoppt wird
	 */
	async waitForShutdown(): Promise<boolean> {
		if (this.state === ApplicationState.STOPPED) {
			return true;
		}
		return this.shutdownPromise || Promise.resolve(true);
	}

	/**
	 * Fügt ein Modul zur Application hinzu
	 */
	private async addModule(module: ApplicationModule): Promise<void> {
		try {
			let moduleInstance: ApplicationModule;

			if (typeof module === "function") {
				// Modul aus Container holen falls es ein Constructor ist
				moduleInstance = this.container.get(module);
			} else {
				moduleInstance = module;
			}

			// Modul initialisieren falls möglich
			if (moduleInstance.initialize) {
				await moduleInstance.initialize();
			}

			this.modules.push(moduleInstance);
			this.logger.debug(
				`Modul hinzugefügt: ${moduleInstance.name || "Unbenannt"}`
			);
		} catch (error) {
			this.logger.error("Fehler beim Hinzufügen des Moduls", error);
			throw error;
		}
	}

	/**
	 * Lädt alle Module
	 */
	private async loadModules(): Promise<void> {
		for (const module of this.modules) {
			try {
				await this.moduleLoader.load(module);
				this.logger.debug(`Modul geladen: ${module.name || "Unbenannt"}`);
			} catch (error) {
				this.logger.error(
					`Fehler beim Laden des Moduls: ${module.name || "Unbenannt"}`,
					error
				);
				throw error;
			}
		}
	}

	/**
	 * Registriert Event Listener
	 */
	private registerEventListeners(): void {
		this.onStopCallback = this.handleStop.bind(this);

		// Resource Stop Listener (falls aktiviert)
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

		// Interner Stop Event
		if (typeof addEventListener !== "undefined") {
			addEventListener(
				"Eterna.__internal__.stop_application",
				this.onStopCallback,
				false
			);
		}
	}

	/**
	 * Behandelt Stop-Events
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
	 * Führt den eigentlichen Shutdown durch
	 */
	private async performShutdown(): Promise<boolean> {
		try {
			// OnceLoader stoppen
			await this.onceLoader.trigger(OnceSharedEvents.Stop);

			// Module cleanup
			await this.cleanupModules();

			// ModuleLoader entladen
			await this.moduleLoader.unload();

			// Event Listener entfernen
			this.removeEventListeners();

			// Shutdown Promise auflösen
			if (this.shutdownResolver) {
				this.shutdownResolver(true);
			}

			this.cleanup();
			return true;
		} catch (error) {
			this.logger.error("Fehler während Shutdown", error);

			if (this.shutdownResolver) {
				this.shutdownResolver(false);
			}

			this.cleanup();
			return false;
		}
	}

	/**
	 * Cleanup der Module
	 */
	private async cleanupModules(): Promise<void> {
		for (const module of this.modules) {
			try {
				if (module.cleanup) {
					await module.cleanup();
				}
				this.logger.debug(`Modul bereinigt: ${module.name || "Unbenannt"}`);
			} catch (error) {
				this.logger.error(
					`Fehler beim Bereinigen des Moduls: ${module.name || "Unbenannt"}`,
					error
				);
			}
		}
	}

	/**
	 * Entfernt Event Listener
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
	 * Erstellt ein Shutdown-Timeout
	 */
	private createShutdownTimeout(): Promise<boolean> {
		return new Promise((resolve) => {
			setTimeout(() => {
				this.logger.warn(
					`Graceful shutdown timeout nach ${this.options.gracefulShutdownTimeout}ms erreicht`
				);
				resolve(false);
			}, this.options.gracefulShutdownTimeout);
		});
	}

	/**
	 * Bereinigt interne Referenzen
	 */
	private cleanup(): void {
		this.shutdownPromise = null;
		this.shutdownResolver = null;
		this.onStopCallback = null;
	}
}
