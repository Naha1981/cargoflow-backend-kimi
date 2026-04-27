import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

export const logger = pino({
  level: isDev ? "debug" : "info",
  redact: {
    paths: [
      "apiKey",
      "api_key",
      "kimiApiKey",
      "kimi_api_key",
      "password",
      "password_hash",
      "token",
      "jwtSecret",
      "sentryDsn",
      "headers.authorization",
      "headers['x-api-key']",
    ],
    remove: true,
  },
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  base: {
    pid: process.pid,
    env: process.env.NODE_ENV || "unknown",
  },
});

/**
 * Create a child logger bound to a specific task/run context.
 * Every log entry automatically includes tenantId, runId, and taskId.
 */
export function taskLogger(context: {
  tenantId?: string;
  runId?: string;
  taskId?: string;
  [key: string]: any;
}) {
  return logger.child(context);
}
