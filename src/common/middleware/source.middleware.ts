import { EventMetadata } from "../decorator/Events/OnEvent";
import { Injectable } from "../decorator/Injectable";
import { Middleware, MiddlewareFactory } from "./middleware";

// Edit this to Submit the Player Class Later instead of Source
@Injectable()
export class SourceMiddlewareFactory implements MiddlewareFactory {
	public create(event: EventMetadata, next: Middleware): Middleware {
		if (IsDuplicityVersion()) {
			return (...args): void | Promise<any> => {
				if (event.networked) {
					const source = (globalThis as any).source as number;

					return next(source, ...args);
				}

				return next(...args);
			};
		} else {
			return next;
		}
	}
}
