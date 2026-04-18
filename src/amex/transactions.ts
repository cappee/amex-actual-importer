// ---------------------------------------------------------------------------
// Fetch and parse Amex transactions from the servicing API.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../lib/http-client.js';
import type { Logger } from '../lib/logger.js';
import type { Config } from '../config/schema.js';
import { AmexError, AmexSessionError } from '../lib/errors.js';
import type { AmexTransaction, TransactionsApiResponse } from '../types/amex.js';
import { AMEX } from './endpoints.js';

class AmexFetchError extends AmexError {
  readonly code = 'AMEX_FETCH_FAILED';
  readonly isRetryable = false;
}

interface AmexTransactionsDeps {
  httpClient: HttpClient;
  config: Readonly<Config>;
  logger: Logger;
}

export interface FetchOptions {
  status?: string;
  daysBack?: number;
  limit?: number;
}

export class AmexTransactions {
  private readonly http: HttpClient;
  private readonly config: Readonly<Config>;
  private readonly logger: Logger;

  constructor(deps: AmexTransactionsDeps) {
    this.http = deps.httpClient;
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async fetchAll(options: FetchOptions = {}): Promise<AmexTransaction[]> {
    const [posted, pending] = await Promise.all([
      this.fetch({ ...options, status: 'posted' }),
      this.fetch({ ...options, status: 'pending' }),
    ]);
    this.logger.info(`Amex transactions: ${posted.length} posted + ${pending.length} pending`);
    return [...posted, ...pending];
  }

  async fetch(options: FetchOptions = {}): Promise<AmexTransaction[]> {
    const status = options.status ?? 'posted';
    const limit = options.limit ?? 1000;
    const daysBack = options.daysBack ?? this.config.sync.fetchDaysBack;

    const url = new URL(`${AMEX.BASE_URL}${AMEX.TRANSACTIONS_PATH}`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('status', status);
    url.searchParams.set('extended_details', 'merchant,category');

    const response = await this.http.get<TransactionsApiResponse>(url.toString(), {
      headers: {
        'account_token': this.config.amex.accountToken,
        'x-amex-locale': AMEX.LOCALE,
      },
    });

    if (response.status === 401) {
      throw new AmexSessionError('Transactions fetch returned 401 — session expired');
    }
    if (response.status !== 200) {
      throw new AmexFetchError(`Transactions fetch HTTP ${response.status}`);
    }

    const raw = response.data?.transactions ?? [];
    const parsed = raw.map((t): AmexTransaction => {
      const addr = t.extended_details?.merchant?.address;
      const fd = t.foreign_details;
      return {
        identifier: t.identifier,
        description: t.description,
        amount: t.amount,
        type: t.type,
        chargeDate: t.charge_date,
        postDate: t.post_date,
        status: status as 'posted' | 'pending',
        merchantName: t.extended_details?.merchant?.name ?? '',
        merchantAddress: addr ? {
          city: addr.city,
          country: addr.country,
          countryName: addr.country_name,
        } : undefined,
        walletProvider: t.extended_details?.additional_attributes?.wallet_provider,
        foreignDetails: fd ? {
          amount: fd.amount,
          currency: fd.iso_alpha_currency_code || fd.currency,
          exchangeRate: fd.exchange_rate || fd.conversion_rate,
        } : undefined,
      };
    });

    const filtered = this.filterByDate(parsed, daysBack);
    this.logger.info(`Amex ${status}: fetched ${parsed.length}, kept ${filtered.length} within ${daysBack} days`);
    return filtered;
  }

  private filterByDate(txns: AmexTransaction[], daysBack: number): AmexTransaction[] {
    if (daysBack <= 0) return txns;
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    return txns.filter((t) => {
      const time = Date.parse(t.chargeDate);
      return Number.isNaN(time) ? true : time >= cutoff;
    });
  }
}
