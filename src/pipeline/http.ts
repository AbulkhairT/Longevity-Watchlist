/**
 * Small HTTP helper for the research pipeline (GitHub Actions only, never the website).
 *
 * - Hard timeout per request.
 * - Minimum spacing between requests (rate limits).
 * - A per-run request cap: when reached, CapReachedError is thrown and the
 *   caller stops and saves its checkpoint.
 * - Retries only timeouts, network errors and 5xx, at most `maxRetries` times,
 *   with exponential backoff. 4xx (including 429) is never retried here.
 * - Errors never include request headers, query keys or response bodies.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class CapReachedError extends Error {
  override name = "CapReachedError";
}

export class HttpError extends Error {
  override name = "HttpError";
  constructor(
    message: string,
    readonly status: number,
    /** Provider error code parsed from the body, if any (e.g. Z.ai "1211"). Never the body itself. */
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

export interface HttpOptions {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs: number;
  maxRetries: number;
  minIntervalMs: number;
  maxRequests: number;
  /** Label used in error messages, e.g. "PubMed". */
  label: string;
}

export interface HttpClient {
  readonly requests: number;
  readonly retries: number;
  request(url: string, init?: RequestInit): Promise<Response>;
}

export const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Strip query parameters from a URL for logs (they can carry api_key or email). */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "[url]";
  }
}

export function createHttp(opts: HttpOptions): HttpClient {
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  let last = -Infinity;
  let requests = 0;
  let retries = 0;

  async function once(url: string, init?: RequestInit): Promise<Response> {
    if (requests >= opts.maxRequests) {
      throw new CapReachedError(`${opts.label}: request cap of ${opts.maxRequests} reached`);
    }
    const wait = last + opts.minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    last = now();
    requests++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
      return await doFetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get requests() {
      return requests;
    },
    get retries() {
      return retries;
    },
    async request(url, init) {
      for (let attempt = 0; ; attempt++) {
        let transient: string;
        try {
          const res = await once(url, init);
          if (res.status < 500) return res;
          transient = `HTTP ${res.status}`;
          // Drain the body so the connection can be reused; never log it.
          await res.arrayBuffer().catch(() => undefined);
          if (attempt >= opts.maxRetries) throw new HttpError(`${opts.label}: ${transient} from ${redactUrl(url)}`, res.status);
        } catch (err) {
          if (err instanceof CapReachedError || err instanceof HttpError) throw err;
          const e = err as Error;
          transient = e.name === "AbortError" ? `timeout after ${opts.timeoutMs} ms` : "network error";
          if (attempt >= opts.maxRetries) throw new HttpError(`${opts.label}: ${transient} for ${redactUrl(url)}`, 0);
        }
        retries++;
        await sleep(1000 * 2 ** attempt);
      }
    },
  };
}
