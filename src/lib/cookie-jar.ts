// ---------------------------------------------------------------------------
// In-memory cookie jar. Node's global fetch does not persist cookies
// across requests, so we parse Set-Cookie headers and emit Cookie headers
// ourselves. Essential because the `aat` cookie is the Amex session token.
// ---------------------------------------------------------------------------

interface StoredCookie {
  value: string;
  expires?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
}

export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>();

  /** Parses all Set-Cookie headers from a response and stores them. */
  setFromResponse(headers: Headers): void {
    const raw = headers.getSetCookie?.() ?? this.fallbackSetCookie(headers);
    for (const line of raw) {
      const parsed = this.parseSetCookie(line);
      if (parsed) this.cookies.set(parsed.name, parsed.cookie);
    }
  }

  /** Builds the Cookie header value for outgoing requests. */
  getCookieHeader(): string {
    const now = Date.now();
    const parts: string[] = [];
    for (const [name, cookie] of this.cookies) {
      if (cookie.expires !== undefined && cookie.expires < now) {
        this.cookies.delete(name);
        continue;
      }
      parts.push(`${name}=${cookie.value}`);
    }
    return parts.join('; ');
  }

  /** Returns a snapshot of all current cookies as name → value. */
  snapshot(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [name, cookie] of this.cookies) {
      result.set(name, cookie.value);
    }
    return result;
  }

  /** Returns the value of a single cookie, or undefined. */
  get(name: string): string | undefined {
    return this.cookies.get(name)?.value;
  }

  clear(): void {
    this.cookies.clear();
  }

  private parseSetCookie(line: string): { name: string; cookie: StoredCookie } | null {
    const segments = line.split(';').map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) return null;

    const first = segments[0];
    const eqIdx = first.indexOf('=');
    if (eqIdx === -1) return null;

    const name = first.slice(0, eqIdx).trim();
    const value = first.slice(eqIdx + 1).trim();
    if (!name) return null;

    const cookie: StoredCookie = { value };

    for (let i = 1; i < segments.length; i++) {
      const [rawKey, ...rest] = segments[i].split('=');
      const key = rawKey.toLowerCase();
      const val = rest.join('=').trim();
      switch (key) {
        case 'expires': {
          const t = Date.parse(val);
          if (!Number.isNaN(t)) cookie.expires = t;
          break;
        }
        case 'max-age': {
          const seconds = parseInt(val, 10);
          if (!Number.isNaN(seconds)) cookie.expires = Date.now() + seconds * 1000;
          break;
        }
        case 'domain':
          cookie.domain = val;
          break;
        case 'path':
          cookie.path = val;
          break;
        case 'secure':
          cookie.secure = true;
          break;
        case 'httponly':
          cookie.httpOnly = true;
          break;
      }
    }

    return { name, cookie };
  }

  // Older Node targets may not have getSetCookie(). Fallback merges the
  // raw `set-cookie` header, splitting cautiously on commas that are not
  // part of an Expires date.
  private fallbackSetCookie(headers: Headers): string[] {
    const raw = headers.get('set-cookie');
    if (!raw) return [];
    const result: string[] = [];
    let buffer = '';
    const parts = raw.split(',');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (/^\s*(mon|tue|wed|thu|fri|sat|sun)/i.test(part)) {
        buffer += ',' + part;
      } else {
        if (buffer) result.push(buffer);
        buffer = part;
      }
    }
    if (buffer) result.push(buffer);
    return result.map((s) => s.trim()).filter(Boolean);
  }
}
