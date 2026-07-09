// Shared HTTP helpers for enrichers. All fetches are best-effort: on any failure
// (network, non-OK, parse) they resolve to null so an enricher degrades to
// "no_data" rather than throwing. A byte cap protects against pathological
// responses.

export const USER_AGENT = "pixelparents-enrichment/1.0 (+https://gopixel.org)";

const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.ENRICHMENT_FETCH_TIMEOUT_MS) || 10_000;
// Cap any single response body we buffer (defends against huge pages/files).
const MAX_BYTES = 2_000_000;

// fetch with a hard timeout via AbortController. Returns the Response or null.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) },
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// GET JSON; null on any failure or non-OK status.
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<T | null> {
  const res = await fetchWithTimeout(
    url,
    { ...init, headers: { accept: "application/json", ...(init.headers ?? {}) } },
    timeoutMs,
  );
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// GET text (byte-capped); null on any failure or non-OK status.
export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<string | null> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res || !res.ok) return null;
  try {
    const buf = await res.arrayBuffer();
    const sliced = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
    return new TextDecoder("utf-8").decode(sliced);
  } catch {
    return null;
  }
}

// Compact a number for human-readable facts: 1234 -> "1.2K", 2_500_000 -> "2.5M".
export function fmtCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
