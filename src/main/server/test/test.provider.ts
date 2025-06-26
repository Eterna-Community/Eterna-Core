import { Once } from "../../../common/decorator/Events/Once";
import { OnEvent } from "../../../common/decorator/Events/OnEvent";
import { Provider } from "../../../common/decorator/Provider";
import { Interval, Tick } from "../../../common/decorator/Tick";
import { OnceSharedEvents } from "../../../common/events/Once";
import { EventsServer } from "../../../common/events/Server";

@Provider()
export class TestProvider {
	@Tick(Interval.EVERY_SECOND, "test")
	public async test() {
		console.log("test");
	}

	@OnEvent(EventsServer.onResourceStart)
	public async onServerResourceStart(resourceName: string) {
		console.log("onServerResourceStart");
	}

	@Once(OnceSharedEvents.Start)
	async start() {
		console.log("start");
	}
}
