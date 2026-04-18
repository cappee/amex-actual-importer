// ---------------------------------------------------------------------------
// Configuration schema. Only types and metadata, no logic.
// ---------------------------------------------------------------------------

export interface Config {
  amex: {
    username: string;
    password: string;
    accountToken: string;
  };
  email: {
    imapHost: string;
    imapPort: number;
    username: string;
    password: string;
    senderFilter: string;
  };
  actual: {
    serverUrl: string;
    password: string;
    budgetId: string;
    accountId: string;
  };
  sync: {
    fetchDaysBack: number;
    otpPollIntervalSec: number;
    otpPollTimeoutSec: number;
    httpTimeoutMs: number;
    httpMaxRetries: number;
  };
  logLevel: string;
}

export type ConfigFieldType = 'string' | 'number';

export interface ConfigField {
  envVar: string;
  type: ConfigFieldType;
  required: boolean;
  encrypted: boolean;
  default?: string | number;
  /** Dot path into the Config object (e.g. "amex.username"). */
  path: string;
}

export const SCHEMA: readonly ConfigField[] = [
  // Amex
  { envVar: 'AMEX_USERNAME', type: 'string', required: true, encrypted: true, path: 'amex.username' },
  { envVar: 'AMEX_PASSWORD', type: 'string', required: true, encrypted: true, path: 'amex.password' },
  { envVar: 'AMEX_ACCOUNT_TOKEN', type: 'string', required: true, encrypted: false, path: 'amex.accountToken' },

  // Email
  { envVar: 'EMAIL_IMAP_HOST', type: 'string', required: true, encrypted: false, path: 'email.imapHost' },
  { envVar: 'EMAIL_IMAP_PORT', type: 'number', required: false, encrypted: false, default: 993, path: 'email.imapPort' },
  { envVar: 'EMAIL_USERNAME', type: 'string', required: true, encrypted: false, path: 'email.username' },
  { envVar: 'EMAIL_PASSWORD', type: 'string', required: true, encrypted: true, path: 'email.password' },
  { envVar: 'EMAIL_SENDER_FILTER', type: 'string', required: false, encrypted: false, default: 'AmericanExpress@welcome.americanexpress.com', path: 'email.senderFilter' },

  // Actual Budget
  { envVar: 'ACTUAL_SERVER_URL', type: 'string', required: true, encrypted: false, path: 'actual.serverUrl' },
  { envVar: 'ACTUAL_PASSWORD', type: 'string', required: true, encrypted: true, path: 'actual.password' },
  { envVar: 'ACTUAL_BUDGET_ID', type: 'string', required: true, encrypted: false, path: 'actual.budgetId' },
  { envVar: 'ACTUAL_ACCOUNT_ID', type: 'string', required: true, encrypted: false, path: 'actual.accountId' },

  // Sync
  { envVar: 'SYNC_FETCH_DAYS_BACK', type: 'number', required: false, encrypted: false, default: 7, path: 'sync.fetchDaysBack' },
  { envVar: 'OTP_POLL_INTERVAL_SEC', type: 'number', required: false, encrypted: false, default: 5, path: 'sync.otpPollIntervalSec' },
  { envVar: 'OTP_POLL_TIMEOUT_SEC', type: 'number', required: false, encrypted: false, default: 120, path: 'sync.otpPollTimeoutSec' },
  { envVar: 'HTTP_TIMEOUT_MS', type: 'number', required: false, encrypted: false, default: 30000, path: 'sync.httpTimeoutMs' },
  { envVar: 'HTTP_MAX_RETRIES', type: 'number', required: false, encrypted: false, default: 3, path: 'sync.httpMaxRetries' },

  // Logging
  { envVar: 'LOG_LEVEL', type: 'string', required: false, encrypted: false, default: 'info', path: 'logLevel' },
];

/** The env var that holds the passphrase used to decrypt ENC: fields. */
export const ENCRYPTION_KEY_ENV = 'AMEX_SYNC_ENCRYPTION_KEY';
