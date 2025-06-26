import { Injectable } from "../../decorator/Injectable";
import { Inject } from "../../decorator/Injectable";
import { EventLoader } from "../Events/event.loader";
import { TickLoader } from "../tick.loader";

@Injectable()
export abstract class ProviderLoader {
	// I dont know if this is needed, normally I use Property Injection
	constructor(
		@Inject(EventLoader) private readonly eventLoader: EventLoader,
		@Inject(TickLoader) private readonly tickLoader: TickLoader
	) {}

	public load(instance: any) {
		console.log("[DEBUG] ProviderLoader.load called with:", instance);

		if (!this.eventLoader) {
			console.log("[DEBUG] eventLoader value:", this.eventLoader);
			throw new Error("EventLoader is not initialized");
		}
		if (!this.tickLoader) {
			throw new Error("TickLoader is not initialized");
		}

		this.eventLoader.load(instance);
		this.tickLoader.load(instance);
		// Handle Loading the Loaders
	}

	public unload() {
		console.log("[DEBUG] ProviderLoader.unload called");
		// Handle Unloading the Loaders
		if (this.eventLoader) {
			this.eventLoader.unload();
		}
		if (this.tickLoader) {
			this.tickLoader.unload();
		}
	}
}
