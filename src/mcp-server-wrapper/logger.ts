import { createLogger, format, Logger, transports } from "winston";

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.colorize(),
    format.timestamp(),
    format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [new transports.Console()],
});

function childProcessLogger(pid: number | undefined): Logger {
  return createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: format.combine(
      format.colorize(),
      format.timestamp(),
      format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level}]: \x1b[34m[child_process[${pid}]]\x1b[0m: ${message}`;
      })
    ),
    transports: [new transports.Console()],
  });
}

export { childProcessLogger, logger };
