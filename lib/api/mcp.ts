import {
  getStats,
  getBreakdowns,
  getTrends,
  getInterestsPool,
  type Filters,
  type TrendInterval,
} from "@/lib/db/aggregates";
import { OPTIONS as OPTION_TAXONOMIES } from "@/lib/options";
import { API_VERSION } from "./http";

// Minimal Model Context Protocol server (JSON-RPC 2.0) exposing the same
// aggregate, non-PII community data as agent-callable tools. Discovery
// (initialize / tools/list) is open; tools/call requires an approved API key.

export const MCP_PROTOCOL_VERSION = "2025-06-18";

type Json = Record<string, unknown>;

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Json;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const FILTER_PROPS: Json = {
  state: { type: "string", description: "US state (full name or USPS abbreviation)" },
  country: { type: "string", description: "Country (e.g. United States, Canada, India)" },
  affiliation: { type: "string", description: "OHS affiliation" },
  tech_depth: { type: "string", description: "Self-described technical depth" },
  time_commitment: { type: "string", description: "Weekly time commitment" },
  skillset: { type: "string", description: "Skillset tag" },
  grade: { type: "string", description: "Child grade" },
  builder_interest: { type: "string", description: "Interest in building (builder|aspiring|no)" },
};

export const MCP_TOOLS = [
  {
    name: "community_stats",
    description:
      "Total signups / families / children for the Pixel Parents community (optionally filtered). Counts only, never PII. Filtered totals below 5 are suppressed.",
    inputSchema: { type: "object", properties: FILTER_PROPS },
  },
  {
    name: "community_breakdowns",
    description:
      "Signup counts by state, country, affiliation, technical depth, time commitment, skillset, grade, plus a tech-depth×skillset cross-tab and top interests (optionally filtered).",
    inputSchema: { type: "object", properties: FILTER_PROPS },
  },
  {
    name: "community_trends",
    description: "Signup counts bucketed over time, with a running cumulative.",
    inputSchema: {
      type: "object",
      properties: { interval: { type: "string", enum: ["week", "month"] } },
    },
  },
  {
    name: "community_options",
    description: "The static option taxonomies plus the live distinct-interests pool.",
    inputSchema: { type: "object", properties: {} },
  },
];

function pickFilters(args: Json): Filters {
  const f: Filters = {};
  for (const k of [
    "state",
    "country",
    "affiliation",
    "tech_depth",
    "time_commitment",
    "skillset",
    "grade",
    "builder_interest",
  ] as const) {
    const v = args[k];
    if (typeof v === "string" && v) f[k] = v;
  }
  return f;
}

async function runTool(name: string, args: Json): Promise<unknown> {
  switch (name) {
    case "community_stats":
      return getStats(pickFilters(args));
    case "community_breakdowns":
      return getBreakdowns(pickFilters(args));
    case "community_trends": {
      const interval: TrendInterval = args.interval === "month" ? "month" : "week";
      return getTrends(interval);
    }
    case "community_options":
      return { ...OPTION_TAXONOMIES, interests: await getInterestsPool() };
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

const reply = (id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id: id ?? null,
  result,
});
const fail = (id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

// Handle a single JSON-RPC message. Returns null for notifications (no `id`),
// which get no response per the JSON-RPC spec.
export async function handleMcp(
  msg: JsonRpcRequest,
  opts: { authed: boolean },
): Promise<JsonRpcResponse | null> {
  const { id, method, params } = msg;
  const isNotification = id === undefined;

  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "Pixel Parents", version: API_VERSION },
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: MCP_TOOLS });
    case "tools/call": {
      if (!opts.authed) {
        return fail(
          id,
          -32001,
          "Unauthorized: an approved API key is required to call tools. Request access at /developers.",
        );
      }
      const name = String((params as Json)?.name ?? "");
      const args = ((params as Json)?.arguments ?? {}) as Json;
      if (!MCP_TOOLS.some((t) => t.name === name)) {
        return fail(id, -32602, `Unknown tool: ${name}`);
      }
      try {
        const data = await runTool(name, args);
        return reply(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      } catch (e) {
        return reply(id, {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        });
      }
    }
    default:
      return isNotification ? null : fail(id, -32601, `Method not found: ${method}`);
  }
}
