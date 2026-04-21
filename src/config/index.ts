// ---------------------------------------------------------------------------
// Loads, decrypts, validates and freezes the application configuration.
//
// ENCRYPTION_KEY is read ONLY from process.env, never from the .env file:
// the ciphertext and its key must live in separate files.
// ---------------------------------------------------------------------------

import 'dotenv/config';
import { decrypt, isEncrypted } from '../lib/crypto.js';
import { ConfigError } from '../lib/errors.js';
import { ENCRYPTION_KEY_ENV, SCHEMA, type Config, type ConfigField } from './schema.js';

/** Reads, decrypts, validates and returns a frozen Config. */
export function loadConfig(): Readonly<Config> {
  const encryptionKey = process.env[ENCRYPTION_KEY_ENV];
  const config: Record<string, unknown> = {};

  for (const field of SCHEMA) {
    const raw = process.env[field.envVar];
    const value = resolveFieldValue(field, raw, encryptionKey);
    setByPath(config, field.path, value);
  }

  return Object.freeze(config as unknown as Config);
}

function resolveFieldValue(
  field: ConfigField,
  raw: string | undefined,
  encryptionKey: string | undefined,
): string | number {
  const present = raw !== undefined && raw.length > 0;

  if (!present) {
    if (field.required) {
      throw new ConfigError(`Missing required configuration: ${field.envVar}`);
    }
    if (field.default === undefined) {
      throw new ConfigError(`Field ${field.envVar} has no default and was not provided`);
    }
    return field.default;
  }

  let value = raw!;

  if (field.encrypted && isEncrypted(value)) {
    if (!encryptionKey) {
      throw new ConfigError(
        `Field ${field.envVar} is encrypted but env var ${ENCRYPTION_KEY_ENV} is not set`,
      );
    }
    try {
      value = decrypt(value, encryptionKey);
    } catch (err) {
      throw new ConfigError(`Failed to decrypt ${field.envVar}`, { cause: err as Error });
    }
  }

  if (field.type === 'number') {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      throw new ConfigError(`Field ${field.envVar} must be a number, got "${value}"`);
    }
    return parsed;
  }

  return value;
}

function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cursor = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
}
