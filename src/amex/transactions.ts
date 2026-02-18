import type { Page } from 'patchright';

import { log } from '../logger.js';

// ── Constants ────────────────────────────────────────────────────────
const AMEX_API_BASE = 'https://global.americanexpress.com/api';
const TRANSACTIONS_URL = `${AMEX_API_BASE}/servicing/v1/financials/transactions`;
const STATEMENT_PERIODS_URL = `${AMEX_API_BASE}/servicing/v1/financials/statement_periods`;

// ── Types ────────────────────────────────────────────────────────────
export interface AmexRawTransaction {
  identifier: string;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  sub_type?: 'payment' | string;
  post_date: string;
  charge_date: string;
  foreign_details?: {
    amount: number | string;
    currency?: string;
    conversion_rate?: number;
    iso_alpha_currency_code?: string;
    exchange_rate?: string;
    commission_amount?: number;
  };
  extended_details?: {
    merchant?: {
      name: string;
      address?: {
        city?: string;
        country?: string;
        country_name?: string;
      };
    };
    additional_attributes?: {
      wallet_provider?: string;
    };
  };
  [key: string]: unknown;
}

interface AmexRawResponse {
  transactions: AmexRawTransaction[];
  total_count: number;
}

interface StatementPeriod {
  statement_start_date: string;
  statement_end_date: string;
  index: number;
}

/** Normalized transaction ready for Actual */
export interface NormalizedTransaction {
  transactionId: string;
  amount: number;        // decimal, negative = expense
  payeeName: string;
  notes: string;
  date: string;          // YYYY-MM-DD
  booked: boolean;
}

// ── API helpers ──────────────────────────────────────────────────────

/**
 * Fetch from Amex API using the browser's page context (inherits all cookies).
 */
async function amexFetch<T>(page: Page, url: string, extraHeaders: Record<string, string> = {}): Promise<T> {
  const result = await page.evaluate(
    async ({ url, headers }) => {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      if (!res.ok) {
        return { error: true as const, status: res.status, body: (await res.text()).slice(0, 200) };
      }

      return { error: false as const, data: await res.json() };
    },
    { url, headers: extraHeaders },
  );

  if (result.error) {
    throw new Error(`Amex API error: ${result.status} ${result.body}`);
  }

  return result.data as T;
}

async function fetchStatementTransactions(
  page: Page,
  accountToken: string,
  statementEndDate?: string,
): Promise<AmexRawTransaction[]> {
  const params = new URLSearchParams({ limit: '1000', status: 'posted' });
  if (statementEndDate) params.set('statement_end_date', statementEndDate);

  const url = `${TRANSACTIONS_URL}?${params}`;
  const data = await amexFetch<AmexRawResponse>(page, url, { account_token: accountToken });

  log.debug(
    'Fetched %d transactions (statement ending %s)',
    data.transactions?.length ?? 0,
    statementEndDate ?? 'current',
  );

  return data.transactions ?? [];
}

async function fetchStatementPeriods(page: Page, accountToken: string): Promise<StatementPeriod[]> {
  try {
    const periods = await amexFetch<StatementPeriod[]>(page, STATEMENT_PERIODS_URL, {
      account_token: accountToken,
    });
    log.debug('Fetched %d statement periods', periods?.length ?? 0);
    return periods ?? [];
  } catch (err) {
    log.warn('Error fetching statement periods: %s', err);
    return [];
  }
}

// ── Normalize ────────────────────────────────────────────────────────
function normalizeTransaction(raw: AmexRawTransaction): NormalizedTransaction {
  const isPayment = raw.sub_type === 'payment';

  let amount: number;
  if (isPayment) {
    amount = Math.abs(raw.amount);
  } else {
    amount = raw.type === 'DEBIT' ? -raw.amount : raw.amount;
  }

  let payeeName = raw.extended_details?.merchant?.name || raw.description || 'Unknown';
  if (isPayment) payeeName = 'Credit Card Payment';

  const notes: string[] = [];

  if (isPayment) {
    notes.push('Convert to transfer from bank account');
    if (raw.description) notes.push(raw.description);
  } else {
    if (raw.description && raw.description !== payeeName) notes.push(raw.description);

    const addr = raw.extended_details?.merchant?.address;
    if (addr) {
      const parts: string[] = [];
      if (addr.city) parts.push(addr.city);
      const country = addr.country_name || addr.country;
      if (country && country !== 'ITALY' && country !== 'IT') parts.push(country);
      if (parts.length) notes.push(parts.join(', '));
    }

    const wallet = raw.extended_details?.additional_attributes?.wallet_provider;
    if (wallet) notes.push(`via ${wallet} Pay`);

    if (raw.foreign_details) {
      const fd = raw.foreign_details;
      const cur = fd.iso_alpha_currency_code || fd.currency;
      const rate = fd.exchange_rate || fd.conversion_rate;
      if (cur && rate) notes.push(`Original: ${fd.amount} ${cur} @ ${rate}`);
      else if (fd.amount) notes.push(`Original: ${fd.amount}`);
    }
  }

  return {
    transactionId: raw.identifier,
    amount,
    payeeName: payeeName.trim(),
    notes: notes.join(' | '),
    date: raw.post_date,
    booked: true,
  };
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Fetch all transactions for an account (current + all historical statement periods).
 * Uses the browser page context for API calls (inherits cookies automatically).
 */
export async function fetchAllTransactions(page: Page, accountToken: string): Promise<NormalizedTransaction[]> {
  log.info('Fetching transactions for account %s...', accountToken);

  const all: AmexRawTransaction[] = [];
  const seen = new Set<string>();

  // 1. Current / unbilled
  const current = await fetchStatementTransactions(page, accountToken);
  for (const tx of current) {
    if (!seen.has(tx.identifier)) {
      seen.add(tx.identifier);
      all.push(tx);
    }
  }
  log.info('Current/unbilled transactions: %d', all.length);

  // 2. Historical statement periods
  const periods = await fetchStatementPeriods(page, accountToken);
  if (periods.length > 0) {
    log.info('Fetching from %d statement periods...', periods.length);
    for (const period of periods) {
      try {
        const txs = await fetchStatementTransactions(page, accountToken, period.statement_end_date);
        let added = 0;
        for (const tx of txs) {
          if (!seen.has(tx.identifier)) {
            seen.add(tx.identifier);
            all.push(tx);
            added++;
          }
        }
        log.debug('Period ending %s: +%d new transactions', period.statement_end_date, added);
      } catch (err) {
        log.warn('Error fetching period %s: %s', period.statement_end_date, err);
      }
    }
  }

  log.info('Total unique raw transactions: %d', all.length);

  const normalized = all.map(normalizeTransaction);
  normalized.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return normalized;
}
