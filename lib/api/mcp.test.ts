import { describe, it, expect } from "vitest";
import { handleMcp, MCP_TOOLS } from "@/lib/api/mcp";

describe("handleMcp (JSON-RPC)", () => {
  it("initialize returns protocol + serverInfo", async () => {
    const r = await handleMcp({ id: 1, method: "initialize" }, { authed: false });
    expect(r?.result).toHaveProperty("protocolVersion");
    expect((r?.result as { serverInfo: { name: string } }).serverInfo.name).toBe("Pixel Parents");
  });

  it("tools/list returns every tool", async () => {
    const r = await handleMcp({ id: 2, method: "tools/list" }, { authed: false });
    expect((r?.result as { tools: unknown[] }).tools).toHaveLength(MCP_TOOLS.length);
  });

  it("tools/call is gated without a key", async () => {
    const r = await handleMcp(
      { id: 3, method: "tools/call", params: { name: "community_stats" } },
      { authed: false },
    );
    expect(r?.error?.code).toBe(-32001);
  });

  it("tools/call rejects an unknown tool when authed", async () => {
    const r = await handleMcp(
      { id: 4, method: "tools/call", params: { name: "nope" } },
      { authed: true },
    );
    expect(r?.error?.code).toBe(-32602);
  });

  it("tools/call returns text content for a known tool (degrades without a DB)", async () => {
    const r = await handleMcp(
      { id: 5, method: "tools/call", params: { name: "community_stats", arguments: {} } },
      { authed: true },
    );
    expect((r?.result as { content: Array<{ type: string }> }).content[0].type).toBe("text");
  });

  it("notifications get no response", async () => {
    const r = await handleMcp({ method: "notifications/initialized" }, { authed: true });
    expect(r).toBeNull();
  });

  it("unknown method returns -32601", async () => {
    const r = await handleMcp({ id: 6, method: "frobnicate" }, { authed: true });
    expect(r?.error?.code).toBe(-32601);
  });
});
