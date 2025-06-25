import { DecoratorMetadataKey } from "../constants";
import { Injectable } from "./Injectable";

export type ModuleMetadata = {
  name?: string;
  providers?: any[];
  services?: any[];
  imports?: any[]; // Import modules
  exports?: any[]; // export public services
};

export const Module = (options: ModuleMetadata = {}): ClassDecorator => {
  return (target: Function) => {
    const metadata: ModuleMetadata = {
      name: options.name || target.name,
      providers: options.providers || [],
      services: options.services || [],
      imports: options.imports || [],
      exports: options.exports || [],
    };

    Reflect.defineMetadata(DecoratorMetadataKey.module, metadata, target);

    // injectable only if not already decorated
    if (!Reflect.hasMetadata("inversify:paramtypes", target)) {
      Reflect.decorate([Injectable()], target);
    }
  };
};
