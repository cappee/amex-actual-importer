// ---------------------------------------------------------------------------
// Custom error hierarchy
//
// Each error has:
//   - code:        ID (e.g. "OTP_TIMEOUT")
//   - isRetryable: whether the SyncEngine can retry the operation
//   - cause:       original error (native ES2022 error chaining)
// ---------------------------------------------------------------------------

/** Base application error. All concrete classes extend this. */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly isRetryable: boolean;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export class ConfigError extends AppError {
  readonly code = 'CONFIG_INVALID';
  readonly isRetryable = false;
}

// ---------------------------------------------------------------------------
// Amex IT
// ---------------------------------------------------------------------------

/** Base error for all AMEX interactions */
export abstract class AmexError extends AppError {}

/** Login failed - wrong credentials or unexpected response */
export class AmexAuthError extends AmexError {
  readonly code = 'AMEX_AUTH_FAILED';
  readonly isRetryable = false;
}

/** MFA failed - wrong/expired OTP, or no EMAIL option available */
export class AmexMfaError extends AmexError {
  readonly code = 'AMEX_MFA_FAILED';
  readonly isRetryable = false;
}

/** Session expired - the aat cookie has expired (TTL 5 min) */
export class AmexSessionError extends AmexError {
  readonly code = 'AMEX_SESSION_EXPIRED';
  readonly isRetryable = true;
}

// ---------------------------------------------------------------------------
// IMAP
// ---------------------------------------------------------------------------

export class ImapError extends AppError {
  readonly code: string;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    code: 'IMAP_CONNECTION_FAILED' | 'OTP_TIMEOUT' | 'OTP_PARSE_FAILED',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.isRetryable = code === 'IMAP_CONNECTION_FAILED';
  }
}

// ---------------------------------------------------------------------------
// Actual Budget
// ---------------------------------------------------------------------------

export class ActualError extends AppError {
  readonly code = 'ACTUAL_ERROR';
  readonly isRetryable = false;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/** Generic network error after all retries have been exhausted */
export class NetworkError extends AppError {
  readonly code = 'NETWORK_ERROR';
  readonly isRetryable = false; // retries were already performed by http-client
}