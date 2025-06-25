import { EventMetadata } from "../decorator/Events/OnEvent";
import { Inject, Injectable } from "../decorator/Injectable";
import { TickMetadata } from "../decorator/Tick";
import { Logger } from "../logger/logger";
import { Middleware, MiddlewareFactory } from "./middleware";

@Injectable()
export class LogMiddlewareFactory implements MiddlewareFactory {
	@Inject(Logger)
	private readonly logger: Logger;

	public create(
		event: EventMetadata | TickMetadata,
		next: Middleware
	): Middleware {
		return async (...args): Promise<any> => {
			try {
				return await next(...args);
			} catch (e) {
				this.logger.error(
					`error in ${event.name}: ${e.toString()}\n${e.stack}`
				);

				throw e;
			}
		};
	}
}
