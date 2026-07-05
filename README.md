# solana-infra-mcp

[![CI](https://github.com/rpc-edge/solana-infra-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/rpc-edge/solana-infra-mcp/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**An MCP server that gives your agent Solana-infra awareness** — RPC health, priority-fee
estimation, leader schedule, chain state, and latency comparison. Provider-agnostic; point it
at any Solana RPC ([rpc edge](https://rpcedge.com) is the flagship backend). Read-only, no keys
logged, no heavy deps (plain JSON-RPC over `fetch`).

## Tools

| Tool | What it answers |
|---|---|
| `rpc_health` | Is this endpoint healthy? version, current slot, measured request latency |
| `priority_fee_estimate` | What compute-unit price lands right now? p50/p75/p90/max micro-lamports/CU |
| `epoch_info` | Where are we in the epoch? slot index, block height |
| `next_leaders` | Who are the next N slot leaders? (time your submissions) |
| `latency_compare` | How does my endpoint's read latency compare to a baseline? |

## Add it to Claude

Build it, then register the server. Claude Code:

```sh
git clone https://github.com/rpc-edge/solana-infra-mcp && cd solana-infra-mcp
pnpm install && pnpm build
claude mcp add solana-infra -- node "$(pwd)/dist/index.js"
```

Or in a client config (Claude Desktop / others):

```json
{
  "mcpServers": {
    "solana-infra": {
      "command": "node",
      "args": ["/abs/path/to/solana-infra-mcp/dist/index.js"],
      "env": { "SOLANA_RPC_URL": "https://rpc.rpcedge.com/?api-key=YOUR_KEY" }
    }
  }
}
```

## Provider config

`SOLANA_RPC_URL` sets the default endpoint every tool uses (unset → public mainnet-beta).
Point it at rpc edge with your key for the low-latency path; the API key is read from the
environment at runtime and **never logged** (tools display the host only). Any tool also takes
an explicit `url` argument to override per call.

## Status & roadmap

Working today: the five read-only tools above (verified against live mainnet).

Next:
- `submit_transaction` with landing confirmation (opt-in; keypair via env, never committed).
- `yellowstone_subscribe` — stream slots/accounts/transactions over gRPC.
- Ship as a Claude Code plugin + skills pack; list in MCP registries.

## Develop

```sh
pnpm install
pnpm typecheck
pnpm build      # -> dist/
pnpm start      # runs the stdio server
```

## License

MIT — see [LICENSE](./LICENSE). By [rpc edge](https://rpcedge.com).
