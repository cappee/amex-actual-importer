import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPayee, mapTransaction, mapTransactions } from '../src/sync/mapper.js';
import type { AmexTransaction } from '../src/types/amex.js';

describe('cleanPayee', () => {
  it('strips city after 3+ spaces and title-cases', () => {
    assert.equal(cleanPayee('DELIVEROO               MILANO'), 'Deliveroo');
  });

  it('preserves special characters', () => {
    assert.equal(cleanPayee('NETFLIX.COM             AMSTERDAM'), 'Netflix.com');
  });

  it('handles multi-word merchant names', () => {
    assert.equal(cleanPayee('RISTORANTE DA MARIO     ROMA'), 'Ristorante Da Mario');
  });

  it('handles asterisk notation', () => {
    assert.equal(cleanPayee('UBER *TRIP              HELP.UBER'), 'Uber *trip');
  });

  it('handles description with no padding', () => {
    assert.equal(cleanPayee('SINGLE WORD'), 'Single Word');
  });
});

describe('mapTransaction', () => {
  const baseTxn: AmexTransaction = {
    identifier: 'AT260830033',
    description: 'DELIVEROO               MILANO',
    amount: 16.49,
    type: 'DEBIT',
    chargeDate: '2026-03-23',
    postDate: '2026-03-24',
    status: 'posted',
    merchantName: 'DELIVEROO',
  };

  it('maps a debit transaction with negative cents', () => {
    const result = mapTransaction(baseTxn);
    assert.equal(result.imported_id, 'AT260830033');
    assert.equal(result.payee_name, 'Deliveroo');
    assert.equal(result.amount, -1649);
    assert.equal(result.date, '2026-03-23');
  });

  it('maps a credit transaction with positive cents', () => {
    const result = mapTransaction({ ...baseTxn, type: 'CREDIT' });
    assert.equal(result.amount, 1649);
  });

  it('includes raw description in notes', () => {
    const result = mapTransaction(baseTxn);
    assert.equal(result.notes, 'DELIVEROO               MILANO');
  });

  it('includes merchant name when it differs from payee', () => {
    const txn = { ...baseTxn, merchantName: 'Deliveroo Ireland Ltd' };
    const result = mapTransaction(txn);
    assert.ok(result.notes?.includes('Deliveroo Ireland Ltd'));
  });

  it('includes foreign currency details in notes', () => {
    const txn = {
      ...baseTxn,
      foreignDetails: { amount: 18.50, currency: 'USD', exchangeRate: 0.89 },
    };
    const result = mapTransaction(txn);
    assert.ok(result.notes?.includes('Original: 18.5 USD @ 0.89'));
  });

  it('includes wallet provider in notes', () => {
    const txn = { ...baseTxn, walletProvider: 'Apple' };
    const result = mapTransaction(txn);
    assert.ok(result.notes?.includes('via Apple Pay'));
  });

  it('includes merchant address in notes excluding Italy', () => {
    const txn = {
      ...baseTxn,
      merchantAddress: { city: 'London', countryName: 'UNITED KINGDOM' },
    };
    const result = mapTransaction(txn);
    assert.ok(result.notes?.includes('London, UNITED KINGDOM'));
  });

  it('excludes country from notes when Italy', () => {
    const txn = {
      ...baseTxn,
      merchantAddress: { city: 'Roma', country: 'IT' },
    };
    const result = mapTransaction(txn);
    assert.ok(result.notes?.includes('Roma'));
    assert.ok(!result.notes?.includes('IT'));
  });

  it('handles fractional cents correctly', () => {
    const txn = { ...baseTxn, amount: 9.99 };
    const result = mapTransaction(txn);
    assert.equal(result.amount, -999);
  });
});

describe('mapTransactions', () => {
  it('maps an array of transactions', () => {
    const txns: AmexTransaction[] = [
      {
        identifier: 'A1',
        description: 'SHOP               CITY',
        amount: 10,
        type: 'DEBIT',
        chargeDate: '2026-01-01',
        postDate: '2026-01-02',
        status: 'posted',
        merchantName: 'SHOP',
      },
      {
        identifier: 'A2',
        description: 'REFUND             CITY',
        amount: 5,
        type: 'CREDIT',
        chargeDate: '2026-01-03',
        postDate: '2026-01-04',
        status: 'pending',
        merchantName: 'REFUND',
      },
    ];
    const result = mapTransactions(txns);
    assert.equal(result.length, 2);
    assert.equal(result[0].amount, -1000);
    assert.equal(result[0].cleared, true);
    assert.equal(result[1].amount, 500);
    assert.equal(result[1].cleared, false);
  });
});
