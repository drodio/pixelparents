import { describe, it, expect } from "vitest";
import { buildAdminApiGuide } from "@/lib/developers/admin-api-guide";

describe("buildAdminApiGuide", () => {
  it("uses the base URL (trailing slash trimmed) and documents the gate endpoint", () => {
    const md = buildAdminApiGuide({ baseUrl: "https://festival.so/" });
    expect(md).toContain("https://festival.so/api/admin/me");
    expect(md).not.toContain("festival.so//api");
    expect(md).toContain("/api/admin/audit");
  });

  it("documents bearer auth, the super-admin model, MFA, and the audit trail", () => {
    const md = buildAdminApiGuide({ baseUrl: "https://festival.so" });
    expect(md).toContain("Authorization: Bearer");
    expect(md.toLowerCase()).toContain("session token");
    expect(md.toLowerCase()).toContain("super admin");
    expect(md).toMatch(/MFA|2FA/);
    expect(md.toLowerCase()).toContain("audit");
    // Never instructs storing a long-lived secret on the device.
    expect(md.toLowerCase()).toContain("no long-lived secret");
  });
});
