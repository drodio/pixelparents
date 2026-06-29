import { describe, it, expect } from "vitest";
import { openapiSpec } from "@/lib/api/openapi";

type OpenApiDocShape = {
  openapi: string;
  info: { title: string };
  paths: Record<string, { get?: { parameters?: Array<{ name: string }> } }>;
  components: { securitySchemes: { bearerAuth: { scheme: string } } };
};

describe("openapiSpec", () => {
  const spec = openapiSpec() as unknown as OpenApiDocShape;

  it("is a valid-shaped OpenAPI 3.1 document", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBeTruthy();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(5);
  });

  it("documents the new endpoints", () => {
    expect(spec.paths["/api/v1/trends"]).toBeTruthy();
    expect(spec.paths["/api/v1/health"]).toBeTruthy();
    expect(spec.paths["/api/mcp"]).toBeTruthy();
  });

  it("declares a bearer security scheme", () => {
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });

  it("exposes filter params on /stats", () => {
    const names = (spec.paths["/api/v1/stats"]?.get?.parameters ?? []).map((x) => x.name);
    expect(names).toContain("state");
    expect(names).toContain("tech_depth");
  });
});
