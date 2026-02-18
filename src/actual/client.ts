import fs from 'fs';

import * as actualApi from '@actual-app/api';

import { config } from '../config.js';
import { log } from '../logger.js';

import type { ActualTransaction } from './mapper.js';

let initialized = false;

/**
 * Initialize the Actual API connection (idempotent).
 */
export async function initActual(): Promise<void> {
  if (initialized) return;

  const { serverURL, password, syncId, encryptionPassword, dataDir } = config.actual;

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  log.info('Connecting to Actual server at %s (dataDir: %s)...', serverURL, dataDir);

  await actualApi.init({
    dataDir,
    serverURL,
    password,
  });

  log.info('Downloading budget %s...', syncId);
  if (encryptionPassword) {
    await actualApi.downloadBudget(syncId, { password: encryptionPassword });
  } else {
    await actualApi.downloadBudget(syncId);
  }

  initialized = true;
  log.info('Actual API initialized');
}

/**
 * Import transactions using importTransactions (deduplicates via imported_id).
 * Returns the count of actually-new transactions inserted.
 */
export async function importTransactions(
  actualAccountId: string,
  transactions: ActualTransaction[],
): Promise<{ added: number; updated: number }> {
  if (transactions.length === 0) {
    return { added: 0, updated: 0 };
  }

  log.info(
    'Importing %d transactions into Actual account %s...',
    transactions.length,
    actualAccountId,
  );

  // importTransactions deduplicates by imported_id automatically
  const result = await actualApi.importTransactions(actualAccountId, transactions);

  log.info(
    'Import result: added=%d, updated=%d',
    result.added?.length ?? 0,
    result.updated?.length ?? 0,
  );

  return {
    added: result.added?.length ?? 0,
    updated: result.updated?.length ?? 0,
  };
}

/**
 * Gracefully close the Actual API connection.
 */
export async function shutdownActual(): Promise<void> {
  if (!initialized) return;
  try {
    await actualApi.shutdown();
    initialized = false;
    log.info('Actual API shut down');
  } catch (err) {
    log.warn('Error shutting down Actual API: %s', err);
  }
}
