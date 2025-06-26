import { DecoratorMetadataKey } from "../../constants";
import { Injectable } from "../../decorator/Injectable";
import { Inject } from "../../decorator/Injectable";
import { ProviderMetadata } from "../../decorator/Provider";
import { Logger } from "../../logger/logger";
import { EventLoader } from "../Events/event.loader";
import { TickLoader } from "../tick.loader";

@Injectable()
export abstract class ProviderLoader {
	// I dont know if this is needed, normally I use Property Injection
	constructor(
		@Inject(EventLoader) private readonly eventLoader: EventLoader,
		@Inject(TickLoader) private readonly tickLoader: TickLoader,
		@Inject(Logger) private readonly logger: Logger
	) {}

	public load(instance: any) {
		try {
			const metadata = Reflect.getMetadata(
				DecoratorMetadataKey.provider,
				instance
			) as ProviderMetadata;

			this.eventLoader.load(instance);
			this.tickLoader.load(instance);

			this.logger.info(
				`[Provider] Successfully loaded the Provider - ${metadata.name}`
			);
		} catch (error) {
			this.logger.error(
				`[Provider] Failed to load the Provider - ${instance}`,
				error
			);
		}
	}

	public unload() {
		try {
			this.eventLoader.unload();
			this.tickLoader.unload();
		} catch (error) {
			this.logger.error(`[Provider] Failed to unload the Provider`, error);
		}
	}
}
