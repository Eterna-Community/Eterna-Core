import { LogHandler } from "./log-handler.interface";
import { LogConsoleHandler } from "./log-console-handler";
import { LogLevel } from "./log-level";
import { Inject, Injectable } from "../decorator/Injectable";

@Injectable()
export class LogChainHandler implements LogHandler {
  private handlers: LogHandler[] = [];

  constructor(@Inject(LogConsoleHandler) consoleHandler: LogConsoleHandler) {
    this.handlers.push(consoleHandler);
  }

  public addHandler(handler: LogHandler): void {
    this.handlers.push(handler);
  }

  public write(level: LogLevel, ...message: string[]): void {
    for (const handler of this.handlers) {
      handler.write(level, ...message);
    }
  }
}
