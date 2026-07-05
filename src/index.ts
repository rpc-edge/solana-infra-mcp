#!/usr/bin/env node
/** solana-infra-mcp — an MCP server exposing Solana infrastructure tools.
 *
 * Provider-agnostic: point SOLANA_RPC_URL at any Solana RPC (rpc edge is the
 * flagship backend). Tools are read-only JSON-RPC; no keys are logged. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { defaultEndpoint } from "./rpc.js";
import {
  epochInfo,
  health,
  latencyCompare,
  nextLeaders,
  priorityFees,
  submitTransaction,
} from "./solana.js";

const server = new McpServer({ name: "solana-infra-mcp", version: "0.1.0" });

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const fail = (e: unknown) => ({
  content: [{ type: "text" as const, text: `error: ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
});

const urlArg = z.string().url().optional().describe("RPC URL (default: SOLANA_RPC_URL, else public mainnet-beta)");

server.registerTool(
  "rpc_health",
  {
    title: "RPC health",
    description: "Health, solana-core version, current slot, and measured getSlot latency for a Solana RPC endpoint.",
    inputSchema: { url: urlArg },
  },
  async ({ url }) => {
    try {
      return text(await health(url));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "priority_fee_estimate",
  {
    title: "Priority fee estimate",
    description: "Recent prioritization-fee distribution (p50/p75/p90/max micro-lamports per CU) to price compute-unit fees for landing.",
    inputSchema: { url: urlArg },
  },
  async ({ url }) => {
    try {
      return text(await priorityFees(url));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "epoch_info",
  {
    title: "Epoch info",
    description: "Current epoch, slot index / slots-in-epoch, absolute slot, and block height.",
    inputSchema: { url: urlArg },
  },
  async ({ url }) => {
    try {
      return text(await epochInfo(url));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "next_leaders",
  {
    title: "Next slot leaders",
    description: "The next N slot leaders (validator identities) from the current slot - for timing transaction submission.",
    inputSchema: { url: urlArg, count: z.number().int().min(1).max(20).default(8) },
  },
  async ({ url, count }) => {
    try {
      return text(await nextLeaders(url, count));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "latency_compare",
  {
    title: "Compare RPC latency",
    description: "getSlot read-latency (p50) across endpoints, default the configured one vs public mainnet-beta. Network-inclusive - not a landing/first-seen proxy.",
    inputSchema: { urls: z.array(z.string().url()).optional(), samples: z.number().int().min(1).max(25).default(8) },
  },
  async ({ urls, samples }) => {
    try {
      return text(await latencyCompare(urls, samples));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submit_transaction",
  {
    title: "Submit transaction + confirm landing",
    description:
      "Relay a caller-SIGNED base64 transaction and confirm actual on-chain inclusion (landed slot + time). Keyless: the server never signs or holds keys - sign upstream, submit here.",
    inputSchema: {
      url: urlArg,
      signedTransaction: z.string().describe("Base64-encoded, fully signed transaction"),
      maxWaitMs: z.number().int().min(1000).max(90000).default(30000),
    },
  },
  async ({ url, signedTransaction, maxWaitMs }) => {
    try {
      return text(await submitTransaction(url, signedTransaction, maxWaitMs));
    } catch (e) {
      return fail(e);
    }
  },
);

const ep = defaultEndpoint();
const transport = new StdioServerTransport();
await server.connect(transport);
// stderr only - stdout is the MCP stream.
console.error(`solana-infra-mcp ready (default endpoint: ${ep.label})`);
