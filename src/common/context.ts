import { AsyncTrace } from "./utils/profiler";
import { sleep } from "./utils";

export class Context {
	private readonly name: string;

	private readonly type: "event" | "tick";

	private asyncTrace: AsyncTrace;

	public constructor(name: string, type: "event" | "tick") {
		this.name = name;
		this.type = type;

		this.asyncTrace = new AsyncTrace(name, type);
	}

	public async trace<T>(name: string, fn: () => Promise<T>): Promise<T> {
		this.asyncTrace.start(name);

		try {
			return await fn();
		} catch (error) {
		} finally {
			this.asyncTrace.stop(name);
		}
	}

	public wait(ms: number): Promise<boolean> {
		return this.trace<boolean>("wait", async () => {
			await sleep(ms);
			return true;
		});
	}

	public start(): void {
		this.asyncTrace.start(this.name, true);
	}

	public stop(): void {
		this.asyncTrace.stop(this.name);
	}
}
