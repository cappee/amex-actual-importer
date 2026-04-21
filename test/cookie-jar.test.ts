import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CookieJar } from '../src/lib/cookie-jar.js';

function headersFromSetCookies(cookies: string[]): Headers {
  const h = new Headers();
  for (const c of cookies) h.append('set-cookie', c);
  return h;
}

describe('CookieJar', () => {
  it('stores and retrieves a simple cookie', () => {
    const jar = new CookieJar();
    jar.setFromResponse(headersFromSetCookies(['aat=token123; Path=/']));
    assert.equal(jar.get('aat'), 'token123');
    assert.equal(jar.getCookieHeader(), 'aat=token123');
  });

  it('stores multiple cookies from a single response', () => {
    const jar = new CookieJar();
    jar.setFromResponse(
      headersFromSetCookies(['a=1; Path=/', 'b=2; Path=/']),
    );
    assert.equal(jar.get('a'), '1');
    assert.equal(jar.get('b'), '2');
  });

  it('overwrites a cookie with the same name', () => {
    const jar = new CookieJar();
    jar.setFromResponse(headersFromSetCookies(['a=1']));
    jar.setFromResponse(headersFromSetCookies(['a=2']));
    assert.equal(jar.get('a'), '2');
  });

  it('removes expired cookies from the header', () => {
    const jar = new CookieJar();
    const past = new Date(Date.now() - 60_000).toUTCString();
    jar.setFromResponse(headersFromSetCookies([`x=old; Expires=${past}`]));
    assert.equal(jar.getCookieHeader(), '');
  });

  it('clears all cookies', () => {
    const jar = new CookieJar();
    jar.setFromResponse(headersFromSetCookies(['a=1', 'b=2']));
    jar.clear();
    assert.equal(jar.getCookieHeader(), '');
  });

  it('snapshot returns a Map of name → value', () => {
    const jar = new CookieJar();
    jar.setFromResponse(headersFromSetCookies(['x=hello', 'y=world']));
    const snap = jar.snapshot();
    assert.equal(snap.get('x'), 'hello');
    assert.equal(snap.get('y'), 'world');
    assert.equal(snap.size, 2);
  });
});
