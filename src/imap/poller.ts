// ---------------------------------------------------------------------------
// IMAP poller: connects to the mailbox and waits for the Amex OTP email.
// ---------------------------------------------------------------------------

import { ImapFlow } from 'imapflow';
import type { Config } from '../config/schema.js';
import type { Logger } from '../lib/logger.js';
import { ImapError } from '../lib/errors.js';
import { extractOtp } from './parser.js';

interface ImapPollerDeps {
  config: Readonly<Config>;
  logger: Logger;
}

export class ImapPoller {
  private readonly config: Readonly<Config>;
  private readonly logger: Logger;
  private client: ImapFlow | null = null;

  constructor(deps: ImapPollerDeps) {
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async waitForOtp(): Promise<string> {
    const startTime = Date.now();
    const { otpPollIntervalSec, otpPollTimeoutSec } = this.config.sync;
    const since = new Date(startTime);
    const maxAttempts = Math.ceil(otpPollTimeoutSec / otpPollIntervalSec);

    this.client = new ImapFlow({
      host: this.config.email.imapHost,
      port: this.config.email.imapPort,
      secure: true,
      auth: {
        user: this.config.email.username,
        pass: this.config.email.password,
      },
      logger: false,
    });

    try {
      await this.client.connect();
    } catch (err) {
      throw new ImapError('Failed to connect to IMAP server', 'IMAP_CONNECTION_FAILED', {
        cause: err as Error,
      });
    }

    await this.client.mailboxOpen('INBOX');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.debug(`IMAP polling attempt ${attempt}/${maxAttempts}`);

      const otp = await this.searchForOtp(since);
      if (otp) {
        this.logger.info('OTP received — proceeding to verification');
        return otp;
      }

      if (Date.now() - startTime >= otpPollTimeoutSec * 1000) break;
      await this.sleep(otpPollIntervalSec * 1000);
    }

    throw new ImapError(
      `OTP not received within ${otpPollTimeoutSec}s`,
      'OTP_TIMEOUT',
    );
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // Idempotent — ignore errors during cleanup
      }
      this.client = null;
    }
  }

  private async searchForOtp(since: Date): Promise<string | null> {
    if (!this.client) return null;

    // Search by date only — sender filtering done in code to avoid
    // Gmail IMAP quirks with FROM matching
    const result = await this.client.search({ since }, { uid: true });
    const uids = result || [];
    this.logger.debug(`IMAP: ${uids.length} message(s) since ${since.toISOString().slice(0, 10)}`);
    if (uids.length === 0) return null;

    // Fetch envelopes + source for all recent messages, newest first
    const sortedUids = [...uids].sort((a, b) => b - a);
    const senderFilter = this.config.email.senderFilter.toLowerCase();

    let foundOtp: string | null = null;
    let foundUid: number | null = null;

    const messages = this.client.fetch(
      sortedUids.map(String).join(','),
      { envelope: true, source: true },
      { uid: true },
    );

    for await (const msg of messages) {
      if (foundOtp) continue; // drain the stream but skip processing

      const from = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? '';
      if (!from.includes(senderFilter)) continue;

      const raw = msg.source?.toString('utf-8');
      if (!raw) continue;

      const otp = extractOtp(raw);
      if (otp) {
        foundOtp = otp;
        foundUid = msg.uid;
      }
    }

    if (foundUid !== null) {
      await this.deleteMessage(foundUid);
    }

    return foundOtp;
  }

  private async deleteMessage(uid: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true });
      this.logger.debug(`IMAP: flagged OTP email for deletion (UID ${uid})`);
    } catch (err) {
      this.logger.warn(`IMAP: failed to delete OTP email (UID ${uid}): ${(err as Error).message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
