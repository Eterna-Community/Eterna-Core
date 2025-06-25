import { LogHandler } from "./log-handler.interface";
import { LogLevel, shouldLog } from "./log-level";
import { LogColor, levelToColor } from "./log-color";
import { Injectable } from "../decorator/Injectable";

// Make this Variable Public Later
const isProduction = false;

@Injectable()
export class LogConsoleHandler implements LogHandler {
  private level: LogLevel;

  constructor() {
    this.level = isProduction ? LogLevel.Info : LogLevel.Debug;
  }

  private format(color: LogColor, ...message: string[]): string {
    return `^${color}[${new Date().toLocaleTimeString()}] ${message.join(
      " "
    )}^7`;
  }

  public write(level: LogLevel, ...message: string[]): void {
    if (shouldLog(level, this.level)) {
      const color = levelToColor[level];
      console.log(this.format(color, ...message));
    }
  }
}
