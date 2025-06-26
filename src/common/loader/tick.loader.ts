import { DecoratorMetadataKey } from "../constants";
import { Inject, Injectable } from "../decorator/Injectable";
import { TickMetadata } from "../decorator/Tick";
import { Logger } from "../logger/logger";
import { MiddlewareTickFactory } from "../middleware/middleware";
import { getMethodMetadata } from "../reflect";
import { sleep } from "../utils";

interface TickHandle {
	id: string;
	clear: () => void;
	isActive: boolean;
}

interface LoadedTick {
	handle: TickHandle;
	metadata: TickMetadata;
	provider: any;
	methodName: string;
}

interface TickLoaderOptions {
	maxRetries?: number;
	retryDelay?: number;
	enableLogging?: boolean;
	gracefulShutdownTimeout?: number;
}

@Injectable()
export class TickLoader {
	private readonly loadedTicks = new Map<string, LoadedTick>();
	private readonly options: Required<TickLoaderOptions>;
	private isShuttingDown = false;

	@Inject("MiddlewareTickFactory")
	private readonly middlewareFactory: MiddlewareTickFactory;

	@Inject(Logger)
	private logger: Logger;

	constructor() {
		this.options = {
			maxRetries: 3,
			retryDelay: 1000,
			enableLogging: true,
			gracefulShutdownTimeout: 5000,
		};
	}

	public async load(provider: any): Promise<void> {
		if (!provider || typeof provider !== "object") {
			throw new Error("Provider must be a valid object");
		}

		if (this.isShuttingDown) {
			throw new Error("TickLoader is shutting down, cannot load new ticks");
		}

		try {
			const tickMethodList = getMethodMetadata<TickMetadata>(
				DecoratorMetadataKey.tick,
				provider
			);

			if (!tickMethodList || Object.keys(tickMethodList).length === 0) {
				this.log(
					"warn",
					`No tick methods found for provider ${provider.constructor?.name}`
				);
				return;
			}

			for (const methodName of Object.keys(tickMethodList)) {
				await this.loadSingleTick(
					provider,
					methodName,
					tickMethodList[methodName]
				);
			}

			this.log(
				"info",
				`Loaded ${Object.keys(tickMethodList).length} ticks for provider ${
					provider.constructor?.name
				}`
			);
		} catch (error) {
			this.log("error", "Failed to load ticks", error);
			throw new Error(`Failed to load ticks: ${error.message}`);
		}
	}

	private async loadSingleTick(
		provider: any,
		methodName: string,
		metadata: TickMetadata
	): Promise<void> {
		const tickId = this.generateTickId(provider, methodName);

		if (this.loadedTicks.has(tickId)) {
			this.log("warn", `Tick ${tickId} already loaded, skipping`);
			return;
		}

		if (!this.isValidMetadata(metadata)) {
			throw new Error(
				`Invalid metadata for tick ${tickId}: ${JSON.stringify(metadata)}`
			);
		}

		const method = provider[methodName];
		if (typeof method !== "function") {
			throw new Error(`Method ${methodName} is not a function on provider`);
		}

		try {
			const boundMethod = method.bind(provider);
			const methodWithMiddleware = this.middlewareFactory.create(
				metadata,
				boundMethod
			);

			const tickHandle = setTick(async () => {
				await this.executeTickSafely(tickId, methodWithMiddleware, metadata);
			});

			const enhancedHandle: TickHandle = {
				id: tickId,
				clear: () => {
					clearTick(tickHandle);
					(enhancedHandle as any).isActive = false;
				},
				isActive: true,
			};

			this.loadedTicks.set(tickId, {
				handle: enhancedHandle,
				metadata,
				provider,
				methodName,
			});

			this.log("debug", `Successfully loaded tick ${tickId}`);
		} catch (error) {
			this.log("error", `Failed to load tick ${tickId}`, error);
			throw error;
		}
	}

	private async executeTickSafely(
		tickId: string,
		methodWithMiddleware: () => Promise<any>,
		metadata: TickMetadata
	): Promise<void> {
		const loadedTick = this.loadedTicks.get(tickId);
		if (!loadedTick || !loadedTick.handle.isActive || this.isShuttingDown) {
			return;
		}

		let retryCount = 0;

		while (retryCount <= this.options.maxRetries) {
			try {
				const result = await methodWithMiddleware();

				if (result === false) {
					this.log("info", `Tick ${tickId} returned false, stopping`);
					this.clearSingleTick(tickId);
					return;
				}

				break;
			} catch (error) {
				retryCount++;
				this.log(
					"error",
					`Tick ${tickId} failed (attempt ${retryCount}/${
						this.options.maxRetries + 1
					})`,
					error
				);

				if (retryCount > this.options.maxRetries) {
					this.log("error", `Tick ${tickId} exceeded max retries, stopping`);
					this.clearSingleTick(tickId);
					return;
				}

				if (this.options.retryDelay > 0) {
					await sleep(this.options.retryDelay);
				}
			}
		}

		if (
			metadata.interval > 0 &&
			loadedTick.handle.isActive &&
			!this.isShuttingDown
		) {
			await sleep(metadata.interval);
		}
	}

	public async unload(provider?: any): Promise<void> {
		if (provider) {
			await this.unloadProvider(provider);
		} else {
			await this.unloadAll();
		}
	}

	private async unloadProvider(provider: any): Promise<void> {
		const ticksToRemove: string[] = [];

		for (const [tickId, loadedTick] of this.loadedTicks.entries()) {
			if (loadedTick.provider === provider) {
				ticksToRemove.push(tickId);
			}
		}

		for (const tickId of ticksToRemove) {
			this.clearSingleTick(tickId);
		}

		this.log(
			"info",
			`Unloaded ${ticksToRemove.length} ticks for provider ${provider.constructor?.name}`
		);
	}

	private async unloadAll(): Promise<void> {
		this.isShuttingDown = true;

		const tickIds = Array.from(this.loadedTicks.keys());
		this.log("info", `Shutting down ${tickIds.length} ticks`);

		const shutdownPromise = Promise.all(
			tickIds.map((tickId) => this.clearSingleTick(tickId))
		);

		try {
			await Promise.race([
				shutdownPromise,
				sleep(this.options.gracefulShutdownTimeout),
			]);
		} catch (error) {
			this.log("error", "Error during graceful shutdown", error);
		}

		for (const tickId of this.loadedTicks.keys()) {
			this.clearSingleTick(tickId);
		}

		this.loadedTicks.clear();
		this.log("info", "All ticks unloaded");
	}

	private clearSingleTick(tickId: string): void {
		const loadedTick = this.loadedTicks.get(tickId);
		if (loadedTick) {
			try {
				loadedTick.handle.clear();
				this.loadedTicks.delete(tickId);
				this.log("debug", `Cleared tick ${tickId}`);
			} catch (error) {
				this.log("error", `Error clearing tick ${tickId}`, error);
			}
		}
	}

	public getLoadedTicks(): ReadonlyMap<string, Omit<LoadedTick, "provider">> {
		const result = new Map();
		for (const [tickId, tick] of this.loadedTicks.entries()) {
			result.set(tickId, {
				handle: { ...tick.handle },
				metadata: { ...tick.metadata },
				methodName: tick.methodName,
			});
		}
		return result;
	}

	public getTickStatus(
		tickId: string
	): { isActive: boolean; metadata?: TickMetadata } | null {
		const tick = this.loadedTicks.get(tickId);
		if (!tick) return null;

		return {
			isActive: tick.handle.isActive,
			metadata: { ...tick.metadata },
		};
	}

	private generateTickId(provider: any, methodName: string): string {
		const providerName = provider.constructor?.name || "UnknownProvider";
		return `${providerName}.${methodName}`;
	}

	private isValidMetadata(metadata: TickMetadata): boolean {
		return (
			metadata &&
			typeof metadata === "object" &&
			typeof metadata.interval === "number" &&
			metadata.interval >= 0 &&
			typeof metadata.name === "string" &&
			metadata.name.length > 0 &&
			typeof metadata.context === "boolean"
		);
	}

	private log(
		level: "debug" | "info" | "warn" | "error",
		message: string,
		error?: any
	): void {
		if (!this.options.enableLogging) return;

		const logData = error ? { message, error } : { message };
		this.logger[level](logData.error ? JSON.stringify(logData) : message);
	}

	public async dispose(): Promise<void> {
		await this.unloadAll();
	}
}
