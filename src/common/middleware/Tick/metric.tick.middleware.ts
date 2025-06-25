import { Histogram } from "prom-client";
import { Injectable } from "../../decorator/Injectable";
import { Middleware, MiddlewareTickFactory } from "../middleware";
import { TickMetadata } from "../../decorator/Tick";

@Injectable()
export class MetricTickMiddlewareFactory implements MiddlewareTickFactory {
	private tickHistogram: Histogram<string> = new Histogram({
		name: "Eterna_tick",
		help: "Tick execution histogram",
		labelNames: ["tick"],
	});

	public create(tick: TickMetadata, next: Middleware): Middleware {
		return async (...args): Promise<void> => {
			const end = this.tickHistogram.startTimer({
				tick: tick.name,
			});

			const result = await next(...args);

			end();

			return result;
		};
	}
}
