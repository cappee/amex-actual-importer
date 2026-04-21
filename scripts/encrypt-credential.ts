#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// CLI to encrypt a value to place in .env
//
// Usage:
//   AMEX_SYNC_ENCRYPTION_KEY="my-key" npm run encrypt
//
// Prompts for the input value and prints the encrypted string to copy into .env.
// ---------------------------------------------------------------------------

import { createInterface } from 'node:readline/promises';
import { stdin, stdout, env, exit } from 'node:process';
import { encrypt } from '../src/lib/crypto';

async function main(): Promise<void> {
  const key = env.AMEX_SYNC_ENCRYPTION_KEY;

  if (!key) {
    console.error('Error: AMEX_SYNC_ENCRYPTION_KEY variable is not set.');
    console.error('Usage: AMEX_SYNC_ENCRYPTION_KEY="my-key" npm run encrypt');
    exit(2);
  }

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const value = await rl.question('Value to encrypt: ');

    if (!value.trim()) {
      console.error('Error: empty value.');
      exit(2);
    }

    const encrypted = encrypt(value.trim(), key);
    console.log('\nEncrypted value (copy into .env):\n');
    console.log(encrypted);
  } finally {
    rl.close();
  }
}

main();