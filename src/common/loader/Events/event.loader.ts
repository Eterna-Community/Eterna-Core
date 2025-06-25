import { DecoratorMetadataKey } from "../../constants";
import { EventMetadata } from "../../decorator/Events/OnEvent";
import { Inject, Injectable } from "../../decorator/Injectable";
import { Logger } from "../../logger/logger";
import { MiddlewareFactory } from "../../middleware/middleware";
import { getMethodMetadata } from "../../reflect";

interface EventBinding {
	handler: Function;
	metadata: EventMetadata;
	provider: any;
	methodName: string;
}

@Injectable()
export class EventLoader {
	private events: Map<string, EventBinding[]> = new Map();
	private loadedProviders = new Set<any>();

	@Inject("MiddlewareFactory")
	private readonly middlewareFactory: MiddlewareFactory;

	@Inject(Logger)
	private readonly logger: Logger;

	public load(provider: any): void {
		if (this.loadedProviders.has(provider)) {
			this.logger.debug(
				`[events] Provider ${provider.constructor.name} already loaded, skipping`
			);
			return;
		}

		const eventMethodList = getMethodMetadata<EventMetadata[]>(
			DecoratorMetadataKey.event,
			provider
		);

		if (!eventMethodList || Object.keys(eventMethodList).length === 0) {
			this.logger.debug(
				`[events] No event handlers found in ${provider.constructor.name}`
			);
			return;
		}

		let handlerCount = 0;

		for (const methodName of Object.keys(eventMethodList)) {
			const eventMetadataList = eventMethodList[methodName] as EventMetadata[];

			if (!provider[methodName] || typeof provider[methodName] !== "function") {
				this.logger.error(
					`[events] Method ${methodName} not found or not a function in ${provider.constructor.name}`
				);
				continue;
			}

			const method = provider[methodName].bind(provider);

			for (const eventMetadata of eventMetadataList) {
				try {
					this.registerEventHandler(
						provider,
						method,
						eventMetadata,
						methodName
					);
					handlerCount++;
				} catch (error) {
					this.logger.error(
						`[events] Failed to register handler ${methodName} for event ${eventMetadata.name}:`,
						error
					);
				}
			}
		}

		this.loadedProviders.add(provider);
		this.logger.info(
			`[events] Loaded ${handlerCount} event handlers from ${provider.constructor.name}`
		);
	}

	private registerEventHandler(
		provider: any,
		method: any,
		eventMetadata: EventMetadata,
		methodName: string
	): void {
		const eventName = eventMetadata.name.toString();

		if (!this.events.has(eventName)) {
			this.events.set(eventName, []);
		}

		const methodWithMiddleware = this.middlewareFactory.create(
			eventMetadata,
			method
		);

		const binding: EventBinding = {
			handler: methodWithMiddleware,
			metadata: eventMetadata,
			provider,
			methodName,
		};

		// Check for duplicate handlers
		const existingBindings = this.events.get(eventName)!;
		const isDuplicate = existingBindings.some(
			(b) => b.provider === provider && b.methodName === methodName
		);

		if (isDuplicate) {
			this.logger.warn(
				`[events] Duplicate handler ${provider.constructor.name}.${methodName} for event ${eventName}`
			);
			return;
		}

		addEventListener(eventName, methodWithMiddleware, eventMetadata.networked);
		existingBindings.push(binding);

		this.logger.debug(
			`[events] Registered handler ${provider.constructor.name}.${methodName} for event ${eventName}`
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
				`[events] Provider ${provider.constructor.name} not loaded, skipping unload`
			);
			return;
		}

		let unloadedCount = 0;

		for (const [eventName, bindings] of this.events.entries()) {
			const providerBindings = bindings.filter((b) => b.provider === provider);

			for (const binding of providerBindings) {
				try {
					removeEventListener(eventName, binding.handler);
					unloadedCount++;
				} catch (error) {
					this.logger.error(
						`[events] Failed to remove event listener for ${eventName}:`,
						error
					);
				}
			}

			// Remove provider bindings from the list
			const remainingBindings = bindings.filter((b) => b.provider !== provider);

			if (remainingBindings.length === 0) {
				this.events.delete(eventName);
			} else {
				this.events.set(eventName, remainingBindings);
			}
		}

		this.loadedProviders.delete(provider);
		this.logger.info(
			`[events] Unloaded ${unloadedCount} event handlers from ${provider.constructor.name}`
		);
	}

	private unloadAll(): void {
		let totalUnloaded = 0;

		for (const [eventName, bindings] of this.events.entries()) {
			for (const binding of bindings) {
				try {
					removeEventListener(eventName, binding.handler);
					totalUnloaded++;
				} catch (error) {
					this.logger.error(
						`[events] Failed to remove event listener for ${eventName}:`,
						error
					);
				}
			}
		}

		this.events.clear();
		this.loadedProviders.clear();
		this.logger.info(`[events] Unloaded all ${totalUnloaded} event handlers`);
	}

	public getEventStats(): {
		eventName: string;
		handlerCount: number;
		handlers: string[];
	}[] {
		return Array.from(this.events.entries()).map(([eventName, bindings]) => ({
			eventName,
			handlerCount: bindings.length,
			handlers: bindings.map(
				(b) => `${b.provider.constructor.name}.${b.methodName}`
			),
		}));
	}

	public hasEventHandlers(eventName: string): boolean {
		return this.events.has(eventName) && this.events.get(eventName)!.length > 0;
	}

	public getHandlerCount(): number {
		return Array.from(this.events.values()).reduce(
			(total, bindings) => total + bindings.length,
			0
		);
	}

	public isProviderLoaded(provider: any): boolean {
		return this.loadedProviders.has(provider);
	}
}
