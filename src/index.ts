#!/usr/bin/env node
import { importTransactions, initActual, shutdownActual } from './actual/client.js';
import { toActualTransaction } from './actual/mapper.js';
import { closeAmexSession, openAmexSession } from './amex/auth.js';
import { runLogin } from './amex/login.js';
import { fetchAllTransactions } from './amex/transactions.js';
import { config } from './config.js';
import { log, setLogLevel } from './logger.js';

// ── Import logic ─────────────────────────────────────────────────────
async function runImport(): Promise<void> {
  log.info('=== Starting import ===');

  await initActual();

  // Open browser once for all accounts
  const session = await openAmexSession();

  try {
    for (const mapping of config.accountMapping) {
      log.info(
        'Syncing Amex account %s → Actual account %s',
        mapping.amexToken,
        mapping.actualId,
      );

      try {
        const transactions = await fetchAllTransactions(session.page, mapping.amexToken);
        log.info('Fetched %d transactions from Amex', transactions.length);

        if (transactions.length === 0) {
          log.info('No transactions to import, skipping');
          continue;
        }

        const actualTxs = transactions.map(tx => toActualTransaction(tx, mapping.actualId));

        const result = await importTransactions(mapping.actualId, actualTxs);
        log.info(
          'Import complete for %s: %d added, %d updated',
          mapping.amexToken,
          result.added,
          result.updated,
        );
      } catch (err) {
        log.error('Error syncing account %s: %s', mapping.amexToken, err);
      }
    }
  } finally {
    await closeAmexSession(session);
  }

  log.info('=== Import finished ===');
}

// ── Entry point ──────────────────────────────────────────────────────
async function main(): Promise<void> {
  setLogLevel(config.logLevel);

  const command = process.argv[2];

  switch (command) {
    case 'login':
      await runLogin();
      break;

    case 'import':
      log.info('amex-actual-importer starting');
      log.info('Accounts configured: %d', config.accountMapping.length);
      try {
        await runImport();
      } finally {
        await shutdownActual();
      }
      break;

    default:
      console.log('Usage: amex-actual-importer <command>');
      console.log('');
      console.log('Commands:');
      console.log('  login    Open a browser to log in manually and save cookies');
      console.log('  import   Run a single import (fetch from Amex, import into Actual)');
      process.exit(1);
  }
}

main().catch(err => {
  log.error('Fatal error: %s', err);
  process.exit(1);
});
