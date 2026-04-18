// ---------------------------------------------------------------------------
// Pure mapping functions: AmexTransaction → ActualTransaction.
// No side effects, no IO, fully testable.
// ---------------------------------------------------------------------------

import type { AmexTransaction } from '../types/amex.js';
import type { ActualTransaction } from '../types/actual.js';

const PADDING_SPLIT = /\s{3,}/;

/**
 * Cleans an Amex `description` into a human-readable payee name.
 *
 * The raw format is: `NAME + PADDING_SPACES + CITY`.
 * We split on 3+ spaces, keep the first segment, trim, and title-case it.
 */
export function cleanPayee(description: string): string {
  const firstSegment = description.split(PADDING_SPLIT)[0] ?? '';
  return titleCase(firstSegment.trim());
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (ch) => ch.toUpperCase());
}

/** Maps a single Amex transaction to the Actual Budget shape. */
export function mapTransaction(txn: AmexTransaction): ActualTransaction {
  const payee = cleanPayee(txn.description);
  const sign = txn.type === 'DEBIT' ? -1 : 1;
  const amountCents = Math.round(Math.abs(txn.amount) * 100) * sign;

  const result: ActualTransaction = {
    date: txn.chargeDate,
    payee_name: payee,
    amount: amountCents,
    imported_id: txn.identifier,
    cleared: txn.status === 'posted',
  };

  const notes = buildNotes(txn, payee);
  if (notes) result.notes = notes;

  return result;
}

function buildNotes(txn: AmexTransaction, payeeName: string): string | undefined {
  const parts: string[] = [];

  if (txn.merchantName && titleCase(txn.merchantName) !== payeeName) {
    parts.push(txn.merchantName);
  }

  if (txn.description && txn.description !== payeeName) {
    parts.push(txn.description);
  }

  const addr = txn.merchantAddress;
  if (addr) {
    const locParts: string[] = [];
    if (addr.city) locParts.push(addr.city);
    const country = addr.countryName || addr.country;
    if (country && country !== 'ITALY' && country !== 'IT') locParts.push(country);
    if (locParts.length) parts.push(locParts.join(', '));
  }

  if (txn.walletProvider) {
    parts.push(`via ${txn.walletProvider} Pay`);
  }

  if (txn.foreignDetails) {
    const fd = txn.foreignDetails;
    if (fd.currency && fd.exchangeRate) {
      parts.push(`Original: ${fd.amount} ${fd.currency} @ ${fd.exchangeRate}`);
    } else if (fd.amount) {
      parts.push(`Original: ${fd.amount}`);
    }
  }

  return parts.length > 0 ? parts.join(' | ') : undefined;
}

/** Maps an array of Amex transactions. */
export function mapTransactions(txns: AmexTransaction[]): ActualTransaction[] {
  return txns.map(mapTransaction);
}
