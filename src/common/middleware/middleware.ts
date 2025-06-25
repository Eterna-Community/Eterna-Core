import { EventMetadata } from "../decorator/Events/OnEvent";
import { TickMetadata } from "../decorator/Tick";

export type Middleware = (...args: any[]) => any | Promise<any>;

export interface MiddlewareFactory {
	create(event: EventMetadata, next: Middleware): Middleware;
}

export interface MiddlewareTickFactory {
	create(data: TickMetadata, next: Middleware): Middleware;
}
