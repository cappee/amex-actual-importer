// ---------------------------------------------------------------------------
// Structured logging with winston. Console transport only, so output is
// captured by the systemd journal (or any parent process).
// ---------------------------------------------------------------------------

import winston from 'winston';

export type Logger = winston.Logger;

/** Creates a winston logger configured with the given level. */
export function createLogger(level: string): Logger {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => {
        const lvl = String(level).toUpperCase().padEnd(5);
        return `[${timestamp}] [${lvl}] ${message}`;
      }),
    ),
    transports: [new winston.transports.Console()],
  });
}

/**
 * Masks a sensitive value keeping the first and last 3 characters.
 * Short values are fully masked.
 */
export function maskSecret(value: string): string {
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}
