// ---------------------------------------------------------------------------
// Wrapper around @actual-app/api for importing transactions.
// ---------------------------------------------------------------------------

import * as api from '@actual-app/api';
import type { Config } from '../config/schema.js';
import type { Logger } from '../lib/logger.js';
import { ActualError } from '../lib/errors.js';
import type { ActualTransaction, ImportResult } from '../types/actual.js';

interface ActualClientDeps {
  config: Readonly<Config>;
  logger: Logger;
}

export class ActualClient {
  private readonly config: Readonly<Config>;
  private readonly logger: Logger;
  private connected = false;

  constructor(deps: ActualClientDeps) {
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async connect(): Promise<void> {
    try {
      await api.init({
        serverURL: this.config.actual.serverUrl,
        password: this.config.actual.password,
      });
      await api.downloadBudget(this.config.actual.budgetId);
      this.connected = true;
      this.logger.info('Actual Budget: connected and budget loaded');
    } catch (err) {
      throw new ActualError('Failed to connect to Actual Budget', { cause: err as Error });
    }
  }

  async importTransactions(transactions: ActualTransaction[]): Promise<ImportResult> {
    if (!this.connected) {
      throw new ActualError('Not connected — call connect() first');
    }

    try {
      const accountId = this.config.actual.accountId;
      const withAccount = transactions.map((t) => ({ ...t, account: accountId }));
      const result = await api.importTransactions(accountId, withAccount);
      const imported = (result as { added?: string[] })?.added?.length ?? 0;
      const skipped = transactions.length - imported;

      // Update pending→posted: find existing transactions that are now cleared
      const updated = await this.updateClearedStatus(transactions);

      this.logger.info(
        `Actual Budget: imported ${imported} new, ${skipped} duplicates, ${updated} updated pending→posted`,
      );

      if (imported > 0 || updated > 0) {
        await api.sync();
        this.logger.info('Actual Budget: synced to server');
      }

      return { imported, skipped, updated };
    } catch (err) {
      throw new ActualError('Failed to import transactions', { cause: err as Error });
    }
  }

  private async updateClearedStatus(transactions: ActualTransaction[]): Promise<number> {
    const accountId = this.config.actual.accountId;

    // Get date range from transactions for the query
    const dates = transactions.map((t) => t.date).sort();
    if (dates.length === 0) return 0;
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const existing = await api.getTransactions(accountId, startDate, endDate);
    const existingByImportId = new Map<string, { id: string; cleared: boolean }>();
    for (const t of existing) {
      if (t.imported_id) {
        existingByImportId.set(t.imported_id, { id: t.id, cleared: t.cleared });
      }
    }

    let updated = 0;
    for (const txn of transactions) {
      if (!txn.cleared) continue; // only upgrade to cleared
      const match = existingByImportId.get(txn.imported_id);
      if (match && !match.cleared) {
        await api.updateTransaction(match.id, { cleared: true });
        updated++;
      }
    }

    return updated;
  }

  async close(): Promise<void> {
    if (this.connected) {
      try {
        await api.shutdown();
      } catch {
        // Idempotent — ignore errors during cleanup
      }
      this.connected = false;
    }
  }
}
