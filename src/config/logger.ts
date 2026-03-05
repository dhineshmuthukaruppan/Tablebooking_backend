/**
 * Structured logger: JSON to stdout for Loki/observability.
 * Include trace/span IDs in context when available (e.g. from OpenTelemetry).
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

function formatEntry(level: LogLevel, message: string, meta?: unknown): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (meta !== undefined && meta !== null) {
    if (typeof meta === "object" && !Array.isArray(meta) && meta !== null) {
      Object.assign(entry, meta as Record<string, unknown>);
    } else {
      entry.context = { value: meta };
    }
  }
  return JSON.stringify(entry);
}

export const logger = {
  info: (message: string, meta?: unknown) => {
    process.stdout.write(formatEntry("info", message, meta) + "\n");
  },
  warn: (message: string, meta?: unknown) => {
    process.stderr.write(formatEntry("warn", message, meta) + "\n");
  },
  error: (message: string, meta?: unknown) => {
    process.stderr.write(formatEntry("error", message, meta) + "\n");
  },
};
