// ---------------------------------------------------------------------------
// SyncEngine: orchestrates the entire sync cycle.
//   login → fetch transactions → map → import → produce SyncResult
// ---------------------------------------------------------------------------

import type { AmexClient } from '../amex/client.js';
import type { ImapPoller } from '../imap/poller.js';
import type { ActualClient } from '../actual/client.js';
import type { Logger } from '../lib/logger.js';
import { AmexSessionError } from '../lib/errors.js';
import type { SyncResult, OtpProvider } from '../types/common.js';
import type { mapTransactions as MapFn } from './mapper.js';

interface SyncEngineDeps {
  amexClient: AmexClient;
  imapPoller: ImapPoller;
  actualClient: ActualClient;
  mapper: { mapTransactions: typeof MapFn };
  logger: Logger;
}

export class SyncEngine {
  private readonly amex: AmexClient;
  private readonly imap: ImapPoller;
  private readonly actual: ActualClient;
  private readonly mapper: SyncEngineDeps['mapper'];
  private readonly logger: Logger;

  constructor(deps: SyncEngineDeps) {
    this.amex = deps.amexClient;
    this.imap = deps.imapPoller;
    this.actual = deps.actualClient;
    this.mapper = deps.mapper;
    this.logger = deps.logger;
  }

  async run(): Promise<SyncResult> {
    const started = Date.now();
    this.logger.info('Sync started');

    try {
      const otpProvider: OtpProvider = () => this.imap.waitForOtp();

      await this.amex.login(otpProvider);

      const amexTxns = await this.fetchWithSessionRetry();

      const actualTxns = this.mapper.mapTransactions(amexTxns);
      this.logger.info(`Mapped ${actualTxns.length} transactions`);

      await this.actual.connect();
      const result = await this.actual.importTransactions(actualTxns);

      const durationMs = Date.now() - started;
      this.logger.info(`Sync completed in ${(durationMs / 1000).toFixed(1)}s`);

      return {
        success: true,
        transactionsFound: amexTxns.length,
        transactionsImported: result.imported,
        transactionsUpdated: result.updated,
        transactionsSkipped: result.skipped,
        durationMs,
        error: null,
      };
    } catch (err) {
      const durationMs = Date.now() - started;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync failed: ${message}`);

      return {
        success: false,
        transactionsFound: 0,
        transactionsImported: 0,
        transactionsUpdated: 0,
        transactionsSkipped: 0,
        durationMs,
        error: message,
      };
    }
  }

  private async fetchWithSessionRetry() {
    try {
      return await this.amex.getTransactions();
    } catch (err) {
      if (err instanceof AmexSessionError) {
        this.logger.warn('Session expired — refreshing and retrying');
        await this.amex.refreshSession();
        return await this.amex.getTransactions();
      }
      throw err;
    }
  }
}
