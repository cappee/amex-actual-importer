// ---------------------------------------------------------------------------
// Encryption / decryption of credentials at rest
//
// Algorithm: AES-256-GCM
// Encrypted string format: ENC:<iv>:<authTag>:<ciphertext>  (all base64)
// The key is derived from the passphrase using scrypt.
// ---------------------------------------------------------------------------

import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'ENC:';
const KEY_LENGTH = 32;         // 256 bit
const IV_LENGTH = 16;          // 128 bit
const AUTH_TAG_LENGTH = 16;    // 128 bit
const SCRYPT_COST = 16384;     // N
const SCRYPT_BLOCK_SIZE = 8;   // r
const SCRYPT_PARALLEL = 1;     // p

// Fixed salt for key derivation. Acceptable because the passphrase
// is unique per installation and is not a user password.
// If stronger security were needed, the salt should be stored next to the ciphertext.
const SALT = Buffer.from('amex-sync-key-derivation', 'utf-8');

/**
 * Derives an AES-256 key from the passphrase using scrypt.
 */
function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, SALT, KEY_LENGTH, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLEL,
  });
}

/**
 * Encrypts a plaintext value.
 *
 * @returns String in the format `ENC:<iv>:<authTag>:<ciphertext>` (base64)
 */
export function encrypt(plaintext: string, passphrase: string): string {
  const key = deriveKey(passphrase);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString('base64'),
    ':',
    authTag.toString('base64'),
    ':',
    encrypted.toString('base64'),
  ].join('');
}

/**
 * Decrypts a string in the format `ENC:<iv>:<authTag>:<ciphertext>`.
 *
 * @throws {Error} If the format is invalid or decryption fails
 *                 (wrong passphrase or corrupted data).
 */
export function decrypt(encrypted: string, passphrase: string): string {
  if (!encrypted.startsWith(PREFIX)) {
    throw new Error(`Cypher format error: missing prefix "${PREFIX}"`);
  }

  const parts = encrypted.slice(PREFIX.length).split(':');

  if (parts.length !== 3) {
    throw new Error(
      `Cypher format error: expected 3 segments (iv:tag:ciphertext), found ${parts.length}`,
    );
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;

  const key = deriveKey(passphrase);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}

/**
 * Checks whether a string is an encrypted value (it has the `ENC:` prefix).
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}