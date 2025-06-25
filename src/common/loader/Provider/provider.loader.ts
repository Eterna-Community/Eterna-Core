import { Inject } from "../../decorator/Injectable";
import { EventLoader } from "../Events/event.loader";
import { TickLoader } from "../tick.loader";

export abstract class ProviderLoader {
	// Inject all the Loader into the code
	@Inject(EventLoader)
	private readonly eventLoader: EventLoader;

	@Inject(TickLoader)
	private readonly tickLoader: TickLoader;

	public load(instance: any) {
		this.eventLoader.load(instance);
		this.tickLoader.load(instance);
		// Handle Loading the Loaders
	}

	public unload() {
		// Handle Unloading the Loaders
		this.eventLoader.unload();
		this.tickLoader.unload();
	}
}
