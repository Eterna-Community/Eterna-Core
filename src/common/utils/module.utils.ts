import { DecoratorMetadataKey } from "../constants";
import { ModuleMetadata } from "../decorator/Module";

export class ModuleUtils {
  static getModuleMetadata(moduleClass: any): ModuleMetadata | null {
    return (
      Reflect.getMetadata(DecoratorMetadataKey.module, moduleClass) || null
    );
  }

  static isModule(target: any): boolean {
    return Reflect.hasMetadata(DecoratorMetadataKey.module, target);
  }

  static validateModule(moduleClass: any): void {
    if (!this.isModule(moduleClass)) {
      throw new Error(
        `${moduleClass.name} is not a valid module. Use @Module decorator.`
      );
    }
  }
}
