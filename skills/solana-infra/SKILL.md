---
name: solana-infra
description: Reason about Solana RPC infrastructure - endpoint health/latency, priority-fee estimation for landing, epoch/slot state, upcoming slot leaders, comparing RPC providers, and relaying a signed transaction with on-chain landing confirmation. Use whenever the task involves choosing/checking a Solana RPC endpoint, pricing compute-unit fees, timing a transaction, or confirming that a tx actually landed.
---

# Solana infra

These capabilities come from the `solana-infra` MCP server. Prefer them over guessing —
they return live chain data.

## When to reach for each tool

- **Pricing a transaction to land?** Call `priority_fee_estimate` and set your compute-unit
  price near p75-p90 during congestion. Don't hardcode a fee.
- **Is an endpoint usable / how fast?** `rpc_health` (version, slot, latency) and
  `latency_compare` (this endpoint vs a public baseline). Read latency is network-inclusive —
  it reflects distance to the server, not landing performance.
- **Timing a submission?** `next_leaders` shows the upcoming slot leaders; `epoch_info` gives
  slot/epoch position.
- **Sending a transaction?** Sign it upstream (the server never holds keys), then call
  `submit_transaction` with the base64-signed tx — it relays and confirms **actual on-chain
  inclusion** (landed slot + time), not just a `sendTransaction` success.

## Configuration

Every tool defaults to `SOLANA_RPC_URL` (set it to a low-latency endpoint such as
`https://rpc.rpcedge.com/?api-key=…`; unset → public mainnet-beta), or takes an explicit `url`
argument. The API key stays in the environment and is never printed — only the host is shown.

## Notes
- All read tools are safe/side-effect-free. `submit_transaction` broadcasts a transaction you
  already signed — it does not sign anything itself.
- For the metrics that reflect co-located infra (gRPC first-seen, landing under load), use the
  companion tool [solbench](https://github.com/rpc-edge/solbench) run from your edge.
