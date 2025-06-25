import { DecoratorMetadataKey } from "../../constants";
import { EventsClient } from "../../events/Client";
import { EventsServer } from "../../events/Server";
import { addMethodMetadata } from "../../reflect";

export type EventMetadata = {
	name: EventsClient | EventsServer;
	networked: boolean;
	context: boolean;
	methodName: string;
	condition?: string;
};

export type EventOptions = {
	networked?: boolean;
	context?: boolean;
	priority?: number;
	once?: boolean;
	condition?: string;
};

export const OnEvent = (
	name: EventsClient | EventsServer,
	options: EventOptions = {}
): MethodDecorator => {
	return (target, propertyKey) => {
		// Validierung
		if (typeof propertyKey !== "string") {
			throw new Error(
				`OnEvent decorator can only be used on methods with string property keys`
			);
		}

		const metadata: EventMetadata = {
			name,
			networked: options.networked ?? true,
			context: options.context ?? false,
			methodName: propertyKey,
			condition: options.condition,
		};

		addMethodMetadata(
			DecoratorMetadataKey.event,
			metadata,
			target,
			propertyKey
		);
	};
};

export const OnClientEvent = (
	name: EventsClient,
	options: EventOptions = {}
): MethodDecorator => {
	return OnEvent(name, { ...options, networked: true });
};

export const OnServerEvent = (
	name: EventsServer,
	options: EventOptions = {}
): MethodDecorator => {
	return OnEvent(name, { ...options, networked: true });
};
