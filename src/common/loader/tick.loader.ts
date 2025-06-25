import { DecoratorMetadataKey } from "../constants";
import { Inject, Injectable } from "../decorator/Injectable";
import { TickMetadata } from "../decorator/Tick";
import { MiddlewareTickFactory } from "../middleware/middleware";
import { getMethodMetadata } from "../reflect";
import { sleep } from "../utils";

@Injectable()
export class TickLoader {
	private ticks = [];

	@Inject("MiddlewareTickFactory")
	private middlewareFactory: MiddlewareTickFactory;

	public load(provider): void {
		const tickMethodList = getMethodMetadata<TickMetadata>(
			DecoratorMetadataKey.tick,
			provider
		);

		for (const methodName of Object.keys(tickMethodList)) {
			const metadata = tickMethodList[methodName];
			const method = provider[methodName].bind(provider);
			const methodWithMiddleware = this.middlewareFactory.create(
				metadata,
				method
			);

			const tick = setTick(async () => {
				try {
					const result = await methodWithMiddleware();

					if (result === false) {
						clearTick(tick);
						return;
					}
				} catch (error) {
					/* empty */
				}

				if (metadata.interval > 0) {
					await sleep(metadata.interval);
				}
			});

			this.ticks.push(tick);
		}
	}

	public unload(): void {
		for (const tick of this.ticks) {
			clearTick(tick);
		}

		this.ticks = [];
	}
}
