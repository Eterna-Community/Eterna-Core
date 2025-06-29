export enum LogLevel {
	Debug = "DEBUG",
	Info = "INFO",
	Warn = "WARN",
	Error = "ERROR",
}

export const LogLevelOrder: Record<LogLevel, number> = {
	[LogLevel.Debug]: 0,
	[LogLevel.Info]: 1,
	[LogLevel.Warn]: 2,
	[LogLevel.Error]: 3,
};

export const shouldLog = (level: LogLevel, minLevel: LogLevel): boolean =>
	LogLevelOrder[level] >= LogLevelOrder[minLevel];
