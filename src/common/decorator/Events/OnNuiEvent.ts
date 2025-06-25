import { DecoratorMetadataKey } from "../../constants";
import { EventsNui } from "../../events/NuiEvents";
import { addMethodMetadata } from "../../reflect";

export const OnNuiEvent = <T = any, R = any>(
	event: EventsNui,
	context = false
) => {
	return (
		target: any, // What is this Type ?
		propertyKey: any, // What is this Type ?
		descriptor: TypedPropertyDescriptor<(data?: T) => Promise<R>>
	) => {
		addMethodMetadata(
			DecoratorMetadataKey.nui,
			{
				name: event,
				context,
				methodName: propertyKey.toString(),
			},
			target,
			propertyKey
		);

		return descriptor;
	};
};
