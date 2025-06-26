import { Inject, Injectable } from "../decorator/Injectable";
import { Logger } from "../logger/logger";
import { ModuleMetadata } from "../decorator/Module";
import { DecoratorMetadataKey } from "../constants";
import { getGlobalContainer } from "../global";
import { ProviderLoader } from "./Provider/provider.loader";

@Injectable()
export class ModuleLoader {
	@Inject(ProviderLoader)
	private readonly providerLoader: ProviderLoader;

	@Inject(Logger)
	private readonly logger: Logger;

	private container = getGlobalContainer();
	private loadedModules = new Set<string>();

	public load(moduleClass: any): void {
		const moduleMetadata = this.getModuleMetadata(moduleClass);

		if (!this.providerLoader) {
			throw new Error("ProviderLoader is not initialized");
		}

		if (!moduleMetadata) {
			throw new Error(
				`Class ${moduleClass.name} is not decorated with @Module`
			);
		}

		// Prevent duplicate loading
		if (this.loadedModules.has(moduleMetadata.name!)) {
			this.logger.debug(
				`[module] ${moduleMetadata.name} already loaded, skipping`
			);
			return;
		}

		this.logger.debug("[module] loading:", moduleMetadata.name);

		try {
			// Load imported modules first
			this.loadImports(moduleMetadata.imports || []);

			// Load providers
			this.loadProviders(moduleMetadata.providers || []);

			// Load services
			this.loadServices(moduleMetadata.services || []);

			this.loadedModules.add(moduleMetadata.name!);
			this.logger.info(`[module] ${moduleMetadata.name} loaded successfully`);
		} catch (error) {
			this.logger.error(
				`[module] Failed to load ${moduleMetadata.name}:`,
				error
			);
			throw error;
		}
	}

	private getModuleMetadata(moduleClass: any): ModuleMetadata | null {
		return (
			(Reflect.getMetadata(
				DecoratorMetadataKey.module,
				moduleClass
			) as ModuleMetadata) || null
		);
	}

	private loadImports(imports: any[]): void {
		if (imports.length === 0) return;
		for (const importModule of imports) {
			this.load(importModule);
		}
	}

	private loadProviders(providers: any[]): void {
		for (const provider of providers) {
			try {
				const providerInstance = this.container.get(provider);

				if (!providerInstance) {
					this.logger.error(`[module] Provider ${provider.name} not found`);
					return;
				}

				this.providerLoader.load(providerInstance);
			} catch (error) {
				this.logger.error(
					`[module] Failed to load provider ${provider.name}:`,
					error
				);
				throw error;
			}
		}
	}

	private loadServices(services: any[]): void {
		// Services normally will be auto registered, but here we could implement more logic to it
		for (const service of services) {
			this.logger.debug(`[module] Service ${service.name} registered`);
		}
	}

	public unload(moduleName?: string): void {
		if (moduleName) {
			this.loadedModules.delete(moduleName);
			this.logger.debug(`[module] ${moduleName} unloaded`);
		} else {
			this.loadedModules.clear();
			this.providerLoader.unload();
			this.logger.debug("[module] All modules unloaded");
		}
	}

	public isLoaded(moduleName: string): boolean {
		return this.loadedModules.has(moduleName);
	}

	public getLoadedModules(): string[] {
		return Array.from(this.loadedModules);
	}
}
