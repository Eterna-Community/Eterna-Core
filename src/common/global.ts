import { Container } from "inversify";
import { DecoratorMetadataKey } from "./constants";

let _globalContainer: Container | undefined;

export const getGlobalContainer = (): Container => {
  if (!_globalContainer) {
    _globalContainer = createGlobalContainer();
  }
  return _globalContainer;
};

export const createGlobalContainer = (): Container => {
  const globalContainer = new Container({
    defaultScope: "Singleton",
    autobind: true,
  });

  Reflect.defineMetadata(DecoratorMetadataKey.global, globalContainer, global);

  return globalContainer;
};

export const unloadGlobalContainer = () => {
  _globalContainer = undefined;
  Reflect.deleteMetadata(DecoratorMetadataKey.global, global);
};

export const bindService = async <T>(
  identifier: string | symbol,
  implementation: new (...args: any[]) => T
): Promise<void> => {
  const container = getGlobalContainer();

  if (container.isBound(identifier)) {
    const binding = await container.rebind(identifier);
    binding.to(implementation).inSingletonScope();
  } else {
    container.bind(identifier).to(implementation).inSingletonScope();
  }
};

export const bindInstance = async <T>(
  identifier: string | symbol,
  instance: T
): Promise<void> => {
  const container = getGlobalContainer();

  if (container.isBound(identifier)) {
    const binding = await container.rebind(identifier);
    binding.toConstantValue(instance);
  } else {
    container.bind(identifier).toConstantValue(instance);
  }
};

export const getService = <T>(identifier: string | symbol): T => {
  try {
    const container = getGlobalContainer();
    return container.get<T>(identifier);
  } catch (error) {
    throw new Error(
      `Service '${String(
        identifier
      )}' not found or could not be resolved: ${error}`
    );
  }
};
