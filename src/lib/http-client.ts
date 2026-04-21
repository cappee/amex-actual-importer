// ---------------------------------------------------------------------------
// fetch() wrapper with cookie jar, correlation-id injection, timeout,
// retries on transient network/5xx errors, and request logging.
// ---------------------------------------------------------------------------

import type { HttpResponse, RequestOptions } from '../types/common.js';
import { NetworkError } from './errors.js';
import { CookieJar } from './cookie-jar.js';
import type { Logger } from './logger.js';

export interface HttpClientOptions {
  correlationId: string;
  timeoutMs: number;
  maxRetries: number;
  logger: Logger;
  baseHeaders?: Record<string, string>;
}

const RETRYABLE_NET_ERRORS = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN']);

export class HttpClient {
  private readonly jar = new CookieJar();
  private readonly correlationId: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly logger: Logger;
  private readonly baseHeaders: Record<string, string>;

  constructor(options: HttpClientOptions) {
    this.correlationId = options.correlationId;
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries;
    this.logger = options.logger;
    this.baseHeaders = options.baseHeaders ?? {};
  }

  async get<T>(url: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('GET', url, undefined, options);
  }

  async post<T>(url: string, body: unknown, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('POST', url, body, options);
  }

  getCookies(): Map<string, string> {
    return this.jar.snapshot();
  }

  getCookie(name: string): string | undefined {
    return this.jar.get(name);
  }

  clearCookies(): void {
    this.jar.clear();
  }

  private async request<T>(
    method: 'GET' | 'POST',
    url: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse<T>> {
    const contentType = options?.contentType ?? 'json';
    const headers = this.buildHeaders(contentType, options?.headers);
    const encodedBody = this.encodeBody(body, contentType);

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      const started = Date.now();
      try {
        const response = await this.fetchWithTimeout(url, method, headers, encodedBody);
        const durationMs = Date.now() - started;

        this.jar.setFromResponse(response.headers);

        this.logger.info(
          `HTTP ${method} ${url} → ${response.status} (${durationMs}ms)`,
        );

        if (response.status >= 500 && attempt < this.maxRetries) {
          attempt++;
          await this.backoff(attempt);
          continue;
        }

        const data = await this.parseBody<T>(response);
        return { status: response.status, data, headers: response.headers };
      } catch (err) {
        lastError = err;
        const code = (err as NodeJS.ErrnoException).code;
        const retryable =
          (typeof code === 'string' && RETRYABLE_NET_ERRORS.has(code)) ||
          (err as Error).name === 'AbortError';

        this.logger.warn(
          `HTTP ${method} ${url} failed (attempt ${attempt + 1}/${this.maxRetries + 1}): ${(err as Error).message}`,
        );

        if (!retryable || attempt >= this.maxRetries) break;

        attempt++;
        await this.backoff(attempt);
      }
    }

    throw new NetworkError(`HTTP ${method} ${url} failed after ${attempt + 1} attempts`, {
      cause: lastError as Error,
    });
  }

  private buildHeaders(
    contentType: 'json' | 'form',
    extra: Record<string, string> | undefined,
  ): Headers {
    const headers = new Headers();

    for (const [k, v] of Object.entries(this.baseHeaders)) headers.set(k, v);

    headers.set('one-data-correlation-id', this.correlationId);
    headers.set('accept', 'application/json, text/plain, */*');

    if (contentType === 'json') {
      headers.set('content-type', 'application/json');
    } else {
      headers.set('content-type', 'application/x-www-form-urlencoded');
    }

    const cookieHeader = this.jar.getCookieHeader();
    if (cookieHeader) headers.set('cookie', cookieHeader);

    if (extra) {
      for (const [k, v] of Object.entries(extra)) headers.set(k, v);
    }

    return headers;
  }

  private encodeBody(body: unknown, contentType: 'json' | 'form'): string | undefined {
    if (body === undefined || body === null) return undefined;
    if (contentType === 'json') return JSON.stringify(body);
    if (typeof body === 'string') return body;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    return params.toString();
  }

  private async fetchWithTimeout(
    url: string,
    method: string,
    headers: Headers,
    body: string | undefined,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: 'manual',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseBody<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type') ?? '';
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as unknown as T;
    }
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  private backoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
