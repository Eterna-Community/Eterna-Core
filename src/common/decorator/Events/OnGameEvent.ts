import { DecoratorMetadataKey } from "../../constants";
import { addMethodMetadata } from "../../reflect";

//TODO! Create an GameEvent Enum and put it here
export const GameEvent = (event: string, context = false): MethodDecorator => {
  return (target, propertyKey) => {
    addMethodMetadata(
      DecoratorMetadataKey.gameEvent,
      {
        name: event.toString(),
        net: false,
        context,
        methodName: propertyKey.toString(),
      },
      target,
      propertyKey
    );
  };
};
