import { NextResponse } from "next/server";
import { authorize } from "@/lib/api/authorize";
import { handleMcp, MCP_TOOLS, MCP_PROTOCOL_VERSION, type JsonRpcRequest } from "@/lib/api/mcp";
import { corsPreflight, API_VERSION } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function rpc(body: unknown, status = 200): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

// POST /api/mcp — Model Context Protocol (JSON-RPC 2.0). Discovery is open;
// tools/call requires Authorization: Bearer <approved-key>.
export async function POST(req: Request) {
  const auth = await authorize(req);
  const authed = auth.ok;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return rpc({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  if (Array.isArray(payload)) {
    const out = (
      await Promise.all((payload as JsonRpcRequest[]).map((m) => handleMcp(m, { authed })))
    ).filter((r) => r !== null);
    return out.length ? rpc(out) : new NextResponse(null, { status: 202, headers: CORS });
  }

  const res = await handleMcp(payload as JsonRpcRequest, { authed });
  return res === null ? new NextResponse(null, { status: 202, headers: CORS }) : rpc(res);
}

// GET /api/mcp — human-friendly info (some clients probe with GET).
export async function GET(): Promise<NextResponse> {
  return rpc({
    name: "Pixel Parents MCP server",
    protocol: "Model Context Protocol",
    protocolVersion: MCP_PROTOCOL_VERSION,
    version: API_VERSION,
    transport: "HTTP POST, JSON-RPC 2.0",
    tools: MCP_TOOLS.map((t) => t.name),
    note: "POST an `initialize` request to begin. `tools/call` requires Authorization: Bearer <your-key>.",
  });
}

export function OPTIONS() {
  return corsPreflight();
}
