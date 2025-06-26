import { DecoratorMetadataKey } from "../constants";
import { addMethodMetadata } from "../reflect";

export enum Interval {
	EVERY_FRAME = 0,
	EVERY_SECOND = 1000,
	EVERY_MINUTE = 60000,
	EVERY_5_MINUTE = 300000,
	EVERY_10_MINUTE = 600000,
	EVERY_15_MINUTE = 900000,
	EVERY_30_MINUTE = 1800000,
	EVERY_HOUR = 3600000,
}

export type TickMetadata = {
	interval: Interval | number;
	name: string;
	context: boolean;
	maxRetries?: number;
	retryDelay?: number;
};

export const Tick = (
	interval: number | Interval,
	name: string,
	context: boolean = false,
	options?: { maxRetries?: number; retryDelay?: number }
): MethodDecorator => {
	if (typeof interval !== "number" || interval < 0) {
		throw new Error("Interval must be a non-negative number");
	}

	if (typeof name !== "string" || name.length === 0) {
		throw new Error("Tick name must be a non-empty string");
	}

	return (target, propertyKey, descriptor) => {
		const metadata: TickMetadata = {
			interval,
			name,
			context,
			...options,
		};

		addMethodMetadata(DecoratorMetadataKey.tick, metadata, target, propertyKey);
	};
};
