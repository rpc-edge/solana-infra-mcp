/** High-level Solana infra queries. Pure of MCP - each returns a formatted string
    an agent can read. Testable without a server. */

import { endpointFor, rpc } from "./rpc.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(q * sortedAsc.length) - 1));
  return sortedAsc[idx]!;
}

/** Health, version, current slot, and measured request latency for an endpoint. */
export async function health(url?: string): Promise<string> {
  const ep = endpointFor(url);
  const slot = await rpc<number>(ep.url, "getSlot");
  let version = "unknown";
  try {
    const v = await rpc<{ "solana-core"?: string }>(ep.url, "getVersion");
    version = v.result["solana-core"] ?? "unknown";
  } catch {
    /* getVersion is optional */
  }
  return [
    `${ep.label}: healthy`,
    `  solana-core ${version}`,
    `  slot ${slot.result}`,
    `  getSlot latency ${slot.latencyMs} ms (single request, from this host)`,
  ].join("\n");
}

/** Priority-fee estimate from getRecentPrioritizationFees (micro-lamports per CU). */
export async function priorityFees(url?: string): Promise<string> {
  const ep = endpointFor(url);
  const r = await rpc<Array<{ slot: number; prioritizationFee: number }>>(
    ep.url,
    "getRecentPrioritizationFees",
    [[]],
  );
  const fees = r.result.map((x) => x.prioritizationFee).sort((a, b) => a - b);
  if (fees.length === 0) return `${ep.label}: no recent prioritization fees returned`;
  const nonZero = fees.filter((f) => f > 0).length;
  return [
    `${ep.label}: priority fees over the last ${fees.length} slots (micro-lamports/CU)`,
    `  p50 ${percentile(fees, 0.5)} · p75 ${percentile(fees, 0.75)} · p90 ${percentile(fees, 0.9)} · max ${fees[fees.length - 1]}`,
    `  ${nonZero}/${fees.length} slots had a non-zero floor`,
    `  tip: set your compute-unit price near p75-p90 to land during congestion.`,
  ].join("\n");
}

/** Chain state: epoch, slot index, block height. */
export async function epochInfo(url?: string): Promise<string> {
  const ep = endpointFor(url);
  const r = await rpc<{
    epoch: number;
    slotIndex: number;
    slotsInEpoch: number;
    absoluteSlot: number;
    blockHeight: number;
  }>(ep.url, "getEpochInfo");
  const e = r.result;
  const pct = ((e.slotIndex / e.slotsInEpoch) * 100).toFixed(1);
  return [
    `${ep.label}: epoch ${e.epoch} (${pct}% through)`,
    `  slot ${e.absoluteSlot} · slot ${e.slotIndex}/${e.slotsInEpoch} in epoch`,
    `  block height ${e.blockHeight}`,
  ].join("\n");
}

/** The next N slot leaders (validator identities) from the current slot. */
export async function nextLeaders(url: string | undefined, count: number): Promise<string> {
  const ep = endpointFor(url);
  const n = Math.min(Math.max(count, 1), 20);
  const slot = await rpc<number>(ep.url, "getSlot");
  const leaders = await rpc<string[]>(ep.url, "getSlotLeaders", [slot.result, n]);
  const lines = leaders.result.map((id, i) => `  slot ${slot.result + i}  ${id}`);
  return [`${ep.label}: next ${leaders.result.length} slot leaders (from slot ${slot.result})`, ...lines].join("\n");
}

/** Relay a CALLER-SIGNED base64 transaction and confirm actual on-chain landing.
    Keyless by design: the server never signs and never holds a keypair - the agent
    (or its wallet) signs, this just submits + confirms inclusion. */
export async function submitTransaction(
  url: string | undefined,
  signedTxBase64: string,
  maxWaitMs: number,
): Promise<string> {
  const ep = endpointFor(url);
  const wait = Math.min(Math.max(maxWaitMs, 1000), 90_000);

  const send = await rpc<string>(ep.url, "sendTransaction", [
    signedTxBase64,
    { encoding: "base64", skipPreflight: false, maxRetries: 5 },
  ]);
  const sig = send.result;
  const submitSlot = (await rpc<number>(ep.url, "getSlot").catch(() => ({ result: 0 }))).result;

  const started = Date.now();
  while (Date.now() - started < wait) {
    const st = await rpc<{
      value: Array<null | { slot: number; confirmationStatus?: string; err: unknown }>;
    }>(ep.url, "getSignatureStatuses", [[sig], { searchTransactionHistory: true }]);
    const s = st.result.value[0];
    if (s && s.err != null) {
      return `${ep.label}: FAILED on-chain\n  signature ${sig}\n  err ${JSON.stringify(s.err)}`;
    }
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) {
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const delta = submitSlot ? ` (+${s.slot - submitSlot} slots from submit)` : "";
      return `${ep.label}: LANDED (${s.confirmationStatus})\n  signature ${sig}\n  slot ${s.slot}${delta}\n  ${secs}s to confirm`;
    }
    await sleep(600);
  }
  return `${ep.label}: submitted but NOT confirmed within ${wait / 1000}s\n  signature ${sig}\n  (it may still land - check the signature)`;
}

/** Compare getSlot read latency across endpoints (default: configured + public). */
export async function latencyCompare(urls: string[] | undefined, samples: number): Promise<string> {
  const eps = (urls && urls.length > 0 ? urls : [endpointFor().url, "https://api.mainnet-beta.solana.com"]).map(
    endpointFor,
  );
  const n = Math.min(Math.max(samples, 1), 25);
  const rows: string[] = [];
  for (const ep of eps) {
    const lat: number[] = [];
    let slot = 0;
    let errors = 0;
    for (let i = 0; i < n; i++) {
      try {
        const r = await rpc<number>(ep.url, "getSlot", [], 6000);
        lat.push(r.latencyMs);
        slot = r.result;
      } catch {
        errors++;
      }
      await new Promise((res) => setTimeout(res, 40));
    }
    lat.sort((a, b) => a - b);
    const p50 = lat.length ? percentile(lat, 0.5) : NaN;
    rows.push(
      `  ${ep.label.padEnd(30)} p50 ${Number.isNaN(p50) ? "—" : `${p50} ms`}  (${lat.length}/${n} ok${errors ? `, ${errors} err` : ""}, slot ${slot})`,
    );
  }
  return [
    `getSlot read latency from THIS host (network-inclusive, not a landing/first-seen proxy):`,
    ...rows,
    `  for the infra-reflecting metrics (gRPC first-seen, landing), run solbench co-located.`,
  ].join("\n");
}
