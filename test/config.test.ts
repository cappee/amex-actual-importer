import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt } from '../src/lib/crypto.js';

// Trigger `import 'dotenv/config'` (side-effect inside the config module)
// once now, so subsequent clearEnv() calls aren't undone by dotenv
// repopulating process.env on the first dynamic import inside a test.
await import('../src/config/index.js');

const PASSPHRASE = 'test-encryption-key-32char!!!!!x';

function setEnvDefaults(): void {
  process.env.AMEX_USERNAME = 'user';
  process.env.AMEX_PASSWORD = 'pass';
  process.env.AMEX_ACCOUNT_TOKEN = 'token';
  process.env.EMAIL_IMAP_HOST = 'imap.test.com';
  process.env.EMAIL_USERNAME = 'email@test.com';
  process.env.EMAIL_PASSWORD = 'emailpass';
  process.env.ACTUAL_SERVER_URL = 'http://localhost:5006';
  process.env.ACTUAL_PASSWORD = 'actualpass';
  process.env.ACTUAL_BUDGET_ID = 'budget-id';
  process.env.ACTUAL_ACCOUNT_ID = 'account-id';
  process.env.LOG_LEVEL = 'info';
}

function clearEnv(): void {
  const vars = [
    'AMEX_USERNAME', 'AMEX_PASSWORD', 'AMEX_ACCOUNT_TOKEN',
    'EMAIL_IMAP_HOST', 'EMAIL_IMAP_PORT', 'EMAIL_USERNAME', 'EMAIL_PASSWORD',
    'EMAIL_SENDER_FILTER',
    'ACTUAL_SERVER_URL', 'ACTUAL_PASSWORD', 'ACTUAL_BUDGET_ID', 'ACTUAL_ACCOUNT_ID',
    'SYNC_FETCH_DAYS_BACK', 'OTP_POLL_INTERVAL_SEC', 'OTP_POLL_TIMEOUT_SEC',
    'HTTP_TIMEOUT_MS', 'HTTP_MAX_RETRIES',
    'LOG_LEVEL', 'AMEX_SYNC_ENCRYPTION_KEY',
  ];
  for (const v of vars) delete process.env[v];
}

describe('loadConfig', () => {
  beforeEach(() => clearEnv());
  afterEach(() => clearEnv());

  it('loads all required fields with defaults for optional ones', async () => {
    setEnvDefaults();
    const { loadConfig } = await import('../src/config/index.js');
    const config = loadConfig();
    assert.equal(config.amex.username, 'user');
    assert.equal(config.email.imapPort, 993);
    assert.equal(config.sync.fetchDaysBack, 7);
    assert.equal(config.logLevel, 'info');
  });

  it('throws when a required field is missing', async () => {
    setEnvDefaults();
    delete process.env.AMEX_USERNAME;
    const { loadConfig } = await import('../src/config/index.js');
    assert.throws(() => loadConfig(), /Missing required configuration: AMEX_USERNAME/);
  });

  it('decrypts ENC: values when encryption key is provided', async () => {
    setEnvDefaults();
    process.env.AMEX_SYNC_ENCRYPTION_KEY = PASSPHRASE;
    process.env.AMEX_USERNAME = encrypt('decrypted-user', PASSPHRASE);
    const { loadConfig } = await import('../src/config/index.js');
    const config = loadConfig();
    assert.equal(config.amex.username, 'decrypted-user');
  });

  it('throws when ENC: value present but no encryption key', async () => {
    setEnvDefaults();
    process.env.AMEX_USERNAME = 'ENC:aaa:bbb:ccc';
    const { loadConfig } = await import('../src/config/index.js');
    assert.throws(() => loadConfig(), /encrypted.*AMEX_SYNC_ENCRYPTION_KEY/);
  });

  it('parses numeric fields', async () => {
    setEnvDefaults();
    process.env.EMAIL_IMAP_PORT = '465';
    const { loadConfig } = await import('../src/config/index.js');
    const config = loadConfig();
    assert.equal(config.email.imapPort, 465);
  });

  it('throws on non-numeric value for numeric field', async () => {
    setEnvDefaults();
    process.env.EMAIL_IMAP_PORT = 'abc';
    const { loadConfig } = await import('../src/config/index.js');
    assert.throws(() => loadConfig(), /must be a number/);
  });
});
