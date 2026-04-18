// ---------------------------------------------------------------------------
// Entry point: bootstrap, run sync, and clean up.
//
// Exit codes:
//   0 — success
//   1 — runtime error
//   2 — configuration error
// ---------------------------------------------------------------------------

import { loadConfig } from './config/index.js';
import { createLogger } from './lib/logger.js';
import { ConfigError } from './lib/errors.js';
import { AmexClient } from './amex/client.js';
import { ImapPoller } from './imap/poller.js';
import { ActualClient } from './actual/client.js';
import { SyncEngine } from './sync/engine.js';
import * as mapper from './sync/mapper.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Configuration error: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }

  const logger = createLogger(config.logLevel);

  const amexClient = new AmexClient({ config, logger });
  const imapPoller = new ImapPoller({ config, logger });
  const actualClient = new ActualClient({ config, logger });

  const engine = new SyncEngine({
    amexClient,
    imapPoller,
    actualClient,
    mapper,
    logger,
  });

  try {
    const result = await engine.run();
    process.exit(result.success ? 0 : 1);
  } finally {
    await imapPoller.close();
    await actualClient.close();
    await amexClient.close();
  }
}

const shutdown = (signal: string) => {
  console.error(`Received ${signal}, shutting down...`);
  process.exit(1);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
