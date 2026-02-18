import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  amex: {
    username: required('AMEX_USERNAME'),
    password: required('AMEX_PASSWORD'),
  },
  imap: {
    host: required('IMAP_HOST'),
    port: parseInt(optional('IMAP_PORT', '993'), 10),
    user: required('IMAP_USER'),
    password: required('IMAP_PASSWORD'),
    folder: optional('IMAP_FOLDER', 'INBOX'),
  },
  actual: {
    serverURL: required('ACTUAL_SERVER_URL'),
    password: required('ACTUAL_PASSWORD'),
    syncId: required('ACTUAL_SYNC_ID'),
    encryptionPassword: process.env.ACTUAL_ENCRYPTION_PASSWORD || null,
    dataDir: optional('ACTUAL_DATA_DIR', './actual-data'),
  },
  /** amex_account_token:actual_account_id pairs */
  accountMapping: parseAccountMapping(required('ACCOUNT_MAPPING')),
  authJsonPath: optional('AUTH_JSON_PATH', './amex.json'),
  proxyUrl: process.env.PROXY_URL || null,
  logLevel: optional('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
} as const;

function parseAccountMapping(raw: string): Array<{ amexToken: string; actualId: string }> {
  return raw.split(',').map(pair => {
    const [amexToken, actualId] = pair.trim().split(':');
    if (!amexToken || !actualId) {
      throw new Error(
        `Invalid ACCOUNT_MAPPING pair: "${pair}". Expected format: amex_token:actual_id`,
      );
    }
    return { amexToken, actualId };
  });
}
