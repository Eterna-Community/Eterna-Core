import { DecoratorMetadataKey } from "../constants";
import { Injectable } from "./Injectable";

export type ProviderMetadata = {
  name?: string;
};

export const Provider = (options: ProviderMetadata = {}): ClassDecorator => {
  return (target: Function) => {
    const metadata: ProviderMetadata = {
      name: options.name ?? target.name,
    };

    Reflect.defineMetadata(DecoratorMetadataKey.provider, metadata, target);
    Reflect.decorate([Injectable()], target);
  };
};
