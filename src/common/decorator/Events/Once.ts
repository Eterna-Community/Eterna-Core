import { DecoratorMetadataKey } from "../../constants";
import {
	OnceClientEvents,
	OnceServerEvents,
	OnceSharedEvents,
} from "../../events/Once";
import { addMethodMetadata } from "../../reflect";

export type OnceMetadata = {
	step: OnceClientEvents | OnceServerEvents | OnceSharedEvents;
	reload: boolean;
	priority?: number; // Für Ausführungsreihenfolge
	timeout?: number; // Timeout für die Methode
	methodName: string; // Für besseres Debugging
};

export type OnceOptions = {
	reload?: boolean;
	priority?: number;
	timeout?: number;
};

export const Once = (
	step: OnceClientEvents | OnceServerEvents | OnceSharedEvents,
	options: OnceOptions = {}
): MethodDecorator => {
	return (target, propertyKey) => {
		// Validierung
		if (typeof propertyKey !== "string") {
			throw new Error(
				`Once decorator can only be used on methods with string property keys`
			);
		}

		const metadata: OnceMetadata = {
			step,
			reload: options.reload ?? false,
			priority: options.priority ?? 0,
			timeout: options.timeout,
			methodName: propertyKey,
		};

		addMethodMetadata(DecoratorMetadataKey.once, metadata, target, propertyKey);
	};
};

// Convenience Decorators
export const OnceClient = (
	step: OnceClientEvents,
	options: OnceOptions = {}
): MethodDecorator => {
	return Once(step, options);
};

export const OnceServer = (
	step: OnceServerEvents,
	options: OnceOptions = {}
): MethodDecorator => {
	return Once(step, options);
};

export const OnceShared = (
	step: OnceSharedEvents,
	options: OnceOptions = {}
): MethodDecorator => {
	return Once(step, options);
};

export const OnceWithReload = (
	step: OnceClientEvents | OnceServerEvents | OnceSharedEvents,
	options: Omit<OnceOptions, "reload"> = {}
): MethodDecorator => {
	return Once(step, { ...options, reload: true });
};

export const OncePriority = (
	step: OnceClientEvents | OnceServerEvents | OnceSharedEvents,
	priority: number,
	options: Omit<OnceOptions, "priority"> = {}
): MethodDecorator => {
	return Once(step, { ...options, priority });
};

export const OnceTimeout = (
	step: OnceClientEvents | OnceServerEvents | OnceSharedEvents,
	timeout: number,
	options: Omit<OnceOptions, "timeout"> = {}
): MethodDecorator => {
	return Once(step, { ...options, timeout });
};
