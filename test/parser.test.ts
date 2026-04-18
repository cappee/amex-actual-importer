import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractOtp } from '../src/imap/parser.js';

describe('extractOtp', () => {
  it('extracts a 6-digit OTP from plain text', () => {
    assert.equal(extractOtp('Your verification code is 748291'), '748291');
  });

  it('returns the last 6-digit match', () => {
    assert.equal(extractOtp('Code: 111111 then 222222'), '222222');
  });

  it('extracts OTP from HTML body', () => {
    const html = '<div><p>Code: <strong>654321</strong></p></div>';
    assert.equal(extractOtp(html), '654321');
  });

  it('returns null when no 6-digit sequence is present', () => {
    assert.equal(extractOtp('No code here'), null);
  });

  it('does not match 5-digit or 7-digit sequences', () => {
    assert.equal(extractOtp('code 12345 or 1234567'), null);
  });

  it('handles empty string', () => {
    assert.equal(extractOtp(''), null);
  });

  it('works with mixed HTML and text containing multiple codes', () => {
    const body = '<html><body>Ref: 999999<br/>OTP: <b>123456</b></body></html>';
    assert.equal(extractOtp(body), '123456');
  });
});
