import type { NormalizedTransaction } from '../amex/transactions.js';

/**
 * Transaction format expected by @actual-app/api importTransactions().
 * See: https://actualbudget.org/docs/api/reference#importtransactions
 */
export interface ActualTransaction {
  account: string;
  date: string;              // YYYY-MM-DD
  amount: number;            // integer in cents (negative = expense)
  payee_name?: string;
  imported_id?: string;      // used for deduplication
  cleared?: boolean;
  notes?: string;
  imported_payee?: string;
}

/**
 * Convert a normalized Amex transaction to the Actual importTransactions format.
 *
 * - Uses `imported_id` = "amex-<identifier>" for deduplication
 * - Converts decimal amount → integer cents
 */
export function toActualTransaction(
  tx: NormalizedTransaction,
  actualAccountId: string,
): ActualTransaction {
  return {
    account: actualAccountId,
    date: tx.date,
    amount: Math.round(tx.amount * 100), // decimal → cents
    payee_name: tx.payeeName,
    imported_id: `amex-${tx.transactionId}`,
    cleared: tx.booked,
    notes: tx.notes || undefined,
    imported_payee: tx.payeeName,
  };
}
