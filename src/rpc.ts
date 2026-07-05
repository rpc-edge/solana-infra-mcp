/** Minimal Solana JSON-RPC over fetch, with request timing. No SDK, no heavy deps. */

export interface Endpoint {
  url: string;
  label: string; // host only, credentials/query stripped
}

/** Host of a URL with any key/query stripped (never surface credentials). */
export function hostOf(url: string): string {
  const noScheme = url.split("://")[1] ?? url;
  return noScheme.split(/[/?]/)[0] ?? noScheme;
}

/** The endpoint to use by default: SOLANA_RPC_URL if set (point this at rpc edge
    with your key), else the public mainnet-beta baseline. Provider-agnostic. */
export function defaultEndpoint(): Endpoint {
  const url = process.env.SOLANA_RPC_URL?.trim();
  if (url) return { url, label: hostOf(url) };
  return { url: "https://api.mainnet-beta.solana.com", label: "api.mainnet-beta.solana.com" };
}

export function endpointFor(url?: string): Endpoint {
  return url ? { url, label: hostOf(url) } : defaultEndpoint();
}

export interface RpcResult<T> {
  result: T;
  latencyMs: number;
}

export async function rpc<T>(
  url: string,
  method: string,
  params: unknown[] = [],
  timeoutMs = 8000,
): Promise<RpcResult<T>> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    });
    const json = (await resp.json()) as { result?: T; error?: { message?: string } };
    const latencyMs = Math.round((performance.now() - started) * 10) / 10;
    if (json.error) throw new Error(json.error.message ?? "RPC error");
    if (json.result === undefined) throw new Error(`${method}: no result`);
    return { result: json.result, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}
