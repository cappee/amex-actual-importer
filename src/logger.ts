const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

let currentLevel: keyof typeof LEVELS = 'info';

export function setLogLevel(level: keyof typeof LEVELS) {
  currentLevel = level;
}

function ts(): string {
  return new Date().toISOString();
}

function shouldLog(level: keyof typeof LEVELS): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

export const log = {
  debug(msg: string, ...args: unknown[]) {
    if (shouldLog('debug')) console.log(`${ts()} [DEBUG] ${msg}`, ...args);
  },
  info(msg: string, ...args: unknown[]) {
    if (shouldLog('info')) console.log(`${ts()} [INFO]  ${msg}`, ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    if (shouldLog('warn')) console.warn(`${ts()} [WARN]  ${msg}`, ...args);
  },
  error(msg: string, ...args: unknown[]) {
    if (shouldLog('error')) console.error(`${ts()} [ERROR] ${msg}`, ...args);
  },
};
