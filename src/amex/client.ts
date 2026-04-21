// ---------------------------------------------------------------------------
// Facade that composes AmexAuth + AmexTransactions behind a single API.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import type { Config } from '../config/schema.js';
import type { Logger } from '../lib/logger.js';
import { HttpClient } from '../lib/http-client.js';
import { AmexAuth } from './auth.js';
import { AmexTransactions, type FetchOptions } from './transactions.js';
import { DEFAULT_HEADERS, AMEX } from './endpoints.js';
import type { AmexTransaction } from '../types/amex.js';
import type { OtpProvider } from '../types/common.js';

interface AmexClientDeps {
  config: Readonly<Config>;
  logger: Logger;
}

export class AmexClient {
  private readonly http: HttpClient;
  private readonly auth: AmexAuth;
  private readonly transactions: AmexTransactions;
  private readonly logger: Logger;

  constructor(deps: AmexClientDeps) {
    this.logger = deps.logger;
    this.http = new HttpClient({
      correlationId: randomUUID(),
      timeoutMs: deps.config.sync.httpTimeoutMs,
      maxRetries: deps.config.sync.httpMaxRetries,
      logger: deps.logger,
      baseHeaders: DEFAULT_HEADERS,
    });
    this.auth = new AmexAuth({ httpClient: this.http, config: deps.config, logger: deps.logger });
    this.transactions = new AmexTransactions({ httpClient: this.http, config: deps.config, logger: deps.logger });
  }

  async login(otpProvider: OtpProvider): Promise<void> {
    await this.auth.authenticate(otpProvider);
  }

  async getTransactions(options?: FetchOptions): Promise<AmexTransaction[]> {
    return this.transactions.fetchAll(options);
  }

  async refreshSession(): Promise<void> {
    this.logger.info('Refreshing Amex session via UpdateUserSession');
    await this.http.post(`${AMEX.BASE_URL}${AMEX.UPDATE_SESSION}`, {}, {
      headers: { 'x-amex-locale': AMEX.LOCALE },
    });
  }

  async close(): Promise<void> {
    this.http.clearCookies();
  }
}
