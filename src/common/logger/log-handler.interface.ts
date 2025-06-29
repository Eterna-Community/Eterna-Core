import { LogLevel } from "./log-level";

export interface LogHandler {
	write(level: LogLevel, ...message: string[]): void;
}
