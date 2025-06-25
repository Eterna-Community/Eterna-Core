import { DecoratorMetadataKey } from "../../constants";
import { OnceMetadata } from "../../decorator/Events/Once";
import { Inject, Injectable } from "../../decorator/Injectable";
import {
	OnceClientEvents,
	OnceServerEvents,
	OnceSharedEvents,
} from "../../events/Once";
import { Logger } from "../../logger/logger";
import { getMethodMetadata } from "../../reflect";

interface MethodTrigger {
	method: Function;
	reload: boolean;
	priority: number;
	timeout?: number;
	provider: any;
	methodName: string;
	metadata: OnceMetadata;
}

interface StepExecution {
	step: OnceServerEvents | OnceClientEvents | OnceSharedEvents;
	timestamp: number;
	executedMethods: string[];
	errors: Array<{ method: string; error: any }>;
}

@Injectable()
export class OnceLoader {
	@Inject(Logger)
	private logger: Logger;

	private methods: Record<
		OnceServerEvents | OnceClientEvents | OnceSharedEvents,
		MethodTrigger[]
	> = {} as any;
	private triggered = new Set<
		OnceServerEvents | OnceClientEvents | OnceSharedEvents
	>();
	private loadedProviders = new Set<any>();
	private executionHistory: StepExecution[] = [];

	constructor() {
		this.initializeMethodsObject();
	}

	private initializeMethodsObject(): void {
		const allSteps = [
			...Object.values(OnceClientEvents),
			...Object.values(OnceServerEvents),
			...Object.values(OnceSharedEvents),
		] as (OnceServerEvents | OnceClientEvents | OnceSharedEvents)[];

		for (const step of allSteps) {
			this.methods[step] = [];
		}
	}

	public async trigger(
		step: OnceServerEvents | OnceClientEvents | OnceSharedEvents,
		...args: any[]
	): Promise<void> {
		const startTime = Date.now();
		const isRetrigger = this.triggered.has(step);

		this.logger.info(
			`[once] Triggering step: ${step}${isRetrigger ? " (retrigger)" : ""}`
		);

		const stepMethods = this.methods[step] || [];

		if (stepMethods.length === 0) {
			this.logger.debug(`[once] No methods registered for step: ${step}`);
			return;
		}

		const sortedMethods = stepMethods
			.filter((methodTrigger) => !isRetrigger || methodTrigger.reload)
			.sort((a, b) => b.priority - a.priority);

		const executedMethods: string[] = [];
		const errors: Array<{ method: string; error: any }> = [];

		const promises = sortedMethods.map(async (methodTrigger) => {
			const methodId = `${methodTrigger.provider.constructor.name}.${methodTrigger.methodName}`;

			try {
				await this.executeWithTimeout(methodTrigger, step, args);
				executedMethods.push(methodId);
				this.logger.debug(
					`[once] Successfully executed: ${methodId} for step ${step}`
				);
			} catch (error) {
				errors.push({ method: methodId, error });
				this.logger.error(
					`[once] Error executing ${methodId} for step ${step}:`,
					error
				);
			}
		});

		await Promise.allSettled(promises);

		this.triggered.add(step);

		const execution: StepExecution = {
			step,
			timestamp: startTime,
			executedMethods,
			errors,
		};
		this.executionHistory.push(execution);

		const duration = Date.now() - startTime;
		this.logger.info(
			`[once] Step ${step} completed in ${duration}ms. Executed: ${executedMethods.length}, Errors: ${errors.length}`
		);

		if (errors.length > 0) {
			throw new Error(
				`Step ${step} completed with ${errors.length} errors. Check logs for details.`
			);
		}
	}

	private async executeWithTimeout(
		methodTrigger: MethodTrigger,
		step: OnceServerEvents | OnceClientEvents | OnceSharedEvents,
		args: any[]
	): Promise<void> {
		const promise = methodTrigger.method(step, ...args);

		if (methodTrigger.timeout) {
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => {
					reject(
						new Error(
							`Method ${methodTrigger.methodName} timed out after ${methodTrigger.timeout}ms`
						)
					);
				}, methodTrigger.timeout);
			});

			await Promise.race([promise, timeoutPromise]);
		} else {
			await promise;
		}
	}

	public load(provider: any): void {
		if (this.loadedProviders.has(provider)) {
			this.logger.debug(
				`[once] Provider ${provider.constructor.name} already loaded, skipping`
			);
			return;
		}

		const eventMethodList = getMethodMetadata<OnceMetadata>(
			DecoratorMetadataKey.once,
			provider
		);

		if (!eventMethodList || Object.keys(eventMethodList).length === 0) {
			this.logger.debug(
				`[once] No once methods found in ${provider.constructor.name}`
			);
			return;
		}

		let loadedCount = 0;

		for (const methodName of Object.keys(eventMethodList)) {
			const onceMetadata = eventMethodList[methodName];

			if (!provider[methodName] || typeof provider[methodName] !== "function") {
				this.logger.error(
					`[once] Method ${methodName} not found or not a function in ${provider.constructor.name}`
				);
				continue;
			}

			const method = provider[methodName].bind(provider);

			const decoratedMethod = async (
				step: OnceServerEvents | OnceClientEvents | OnceSharedEvents,
				...args: any[]
			) => {
				try {
					await method(...args);
				} catch (error) {
					throw new Error(
						`Error in ${provider.constructor.name}.${methodName}: ${error.message}`
					);
				}
			};

			const methodTrigger: MethodTrigger = {
				method: decoratedMethod,
				reload: onceMetadata.reload,
				priority: onceMetadata.priority || 0,
				timeout: onceMetadata.timeout,
				provider,
				methodName,
				metadata: onceMetadata,
			};

			if (!this.methods[onceMetadata.step]) {
				this.methods[onceMetadata.step] = [];
			}

			this.methods[onceMetadata.step].push(methodTrigger);
			loadedCount++;

			this.logger.debug(
				`[once] Registered ${provider.constructor.name}.${methodName} for step ${onceMetadata.step}`
			);
		}

		this.loadedProviders.add(provider);
		this.logger.info(
			`[once] Loaded ${loadedCount} once methods from ${provider.constructor.name}`
		);
	}

	public unload(provider?: any): void {
		if (provider) {
			this.unloadProvider(provider);
		} else {
			this.unloadAll();
		}
	}

	private unloadProvider(provider: any): void {
		if (!this.loadedProviders.has(provider)) {
			this.logger.debug(
				`[once] Provider ${provider.constructor.name} not loaded, skipping unload`
			);
			return;
		}

		let unloadedCount = 0;

		for (const step of Object.keys(this.methods) as (
			| OnceServerEvents
			| OnceClientEvents
			| OnceSharedEvents
		)[]) {
			const methodsForStep = this.methods[step];
			const remainingMethods = methodsForStep.filter(
				(m) => m.provider !== provider
			);

			unloadedCount += methodsForStep.length - remainingMethods.length;
			this.methods[step] = remainingMethods;
		}

		this.loadedProviders.delete(provider);
		this.logger.info(
			`[once] Unloaded ${unloadedCount} once methods from ${provider.constructor.name}`
		);
	}

	private unloadAll(): void {
		let totalUnloaded = 0;

		for (const step of Object.keys(this.methods) as (
			| OnceServerEvents
			| OnceClientEvents
			| OnceSharedEvents
		)[]) {
			totalUnloaded += this.methods[step].length;
			this.methods[step] = [];
		}

		this.loadedProviders.clear();
		this.triggered.clear();
		this.executionHistory = [];

		this.logger.info(`[once] Unloaded all ${totalUnloaded} once methods`);
	}

	public isStepTriggered(
		step: OnceServerEvents | OnceClientEvents | OnceSharedEvents
	): boolean {
		return this.triggered.has(step);
	}

	public getMethodCount(
		step?: OnceServerEvents | OnceClientEvents | OnceSharedEvents
	): number {
		if (step) {
			return this.methods[step]?.length || 0;
		}
		return Object.values(this.methods).reduce(
			(total, methods) => total + methods.length,
			0
		);
	}

	public getExecutionHistory(): StepExecution[] {
		return [...this.executionHistory];
	}

	public getStepStats(): {
		step: string;
		methodCount: number;
		triggered: boolean;
		methods: string[];
	}[] {
		return Object.entries(this.methods).map(([step, methods]) => ({
			step,
			methodCount: methods.length,
			triggered: this.triggered.has(step as any),
			methods: methods.map(
				(m) => `${m.provider.constructor.name}.${m.methodName}`
			),
		}));
	}

	public resetStep(
		step: OnceServerEvents | OnceClientEvents | OnceSharedEvents
	): void {
		this.triggered.delete(step);
		this.logger.info(`[once] Reset step ${step} - can be triggered again`);
	}

	public isProviderLoaded(provider: any): boolean {
		return this.loadedProviders.has(provider);
	}
}
