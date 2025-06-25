import { LogLevel } from "./log-level";

// log-color.ts
export enum LogColor {
  Red = 1,
  Green = 2,
  Yellow = 3,
  Blue = 4,
  Magenta = 5,
  Cyan = 6,
  White = 7,
}

export const levelToColor: Record<LogLevel, LogColor> = {
  [LogLevel.Debug]: LogColor.White,
  [LogLevel.Info]: LogColor.Blue,
  [LogLevel.Warn]: LogColor.Yellow,
  [LogLevel.Error]: LogColor.Red,
};
