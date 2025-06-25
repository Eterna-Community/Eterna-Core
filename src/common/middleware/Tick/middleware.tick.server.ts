import { Inject, Injectable } from "../../decorator/Injectable";
import { TickMetadata } from "../../decorator/Tick";
import { ContextTickMiddlewareFactory } from "../context.middleware";
import { LogMiddlewareFactory } from "../log.middleware";
import { MetricTickMiddlewareFactory } from "./metric.tick.middleware";
import { Middleware, MiddlewareTickFactory } from "../middleware";

@Injectable()
export class ChainMiddlewareTickServerFactory implements MiddlewareTickFactory {
	@Inject(LogMiddlewareFactory)
	private logMiddlewareFactory: LogMiddlewareFactory;

	@Inject(MetricTickMiddlewareFactory)
	private metricMiddlewareFactory: MetricTickMiddlewareFactory;

	@Inject(ContextTickMiddlewareFactory)
	private contextTickMiddlewareFactory: ContextTickMiddlewareFactory;

	create(tick: TickMetadata, next: Middleware): Middleware {
		return this.logMiddlewareFactory.create(
			tick,
			this.metricMiddlewareFactory.create(
				tick,
				this.contextTickMiddlewareFactory.create(tick, next)
			)
		);
	}
}
