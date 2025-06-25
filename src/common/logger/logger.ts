import { LogLevel } from "./log-level";
import { LogChainHandler } from "./log-chain-handler";
import { Inject, Injectable } from "../decorator/Injectable";

@Injectable()
export class Logger {
  @Inject(LogChainHandler)
  private handler!: LogChainHandler;

  public debug(...message: string[]): void {
    this.write(LogLevel.Debug, ...message);
  }

  public info(...message: string[]): void {
    this.write(LogLevel.Info, ...message);
  }

  public warn(...message: string[]): void {
    this.write(LogLevel.Warn, ...message);
  }

  public error(...message: string[]): void {
    this.write(LogLevel.Error, ...message);
  }

  public log(level: LogLevel, ...message: string[]): void {
    this.write(level, ...message);
  }

  private write(level: LogLevel, ...message: string[]): void {
    this.handler.write(level, ...message);
  }
}
