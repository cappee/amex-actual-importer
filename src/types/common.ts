// ---------------------------------------------------------------------------
// Types shared between multiple modules
// ---------------------------------------------------------------------------

/** Generic response from the HTTP wrapper */
export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

/** Options for a single HTTP request */
export interface RequestOptions {
  headers?: Record<string, string>;
  contentType?: 'json' | 'form';
}

/** Final result of a sync cycle */
export interface SyncResult {
  success: boolean;
  transactionsFound: number;
  transactionsImported: number;
  transactionsSkipped: number;
  durationMs: number;
  error: string | null;
}

/**
 * Function that returns an OTP code.
 *
 * Used as a hook between AmexAuth and ImapPoller:
 * AmexAuth doesn't know about IMAP, it only receives this function.
 */
export type OtpProvider = () => Promise<string>;