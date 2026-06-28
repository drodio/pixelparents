import { describe, it, expect } from "vitest";
import { classifyProfileSource } from "@/lib/profiles-scored";

// The displayed source used to be derived from request_ip ("web" only if an IP
// was captured, else "api"), so older web-form scores with a null request_ip
// showed as "API". The real API signal is a CHARGE (the paid developer API
// records a credit debit); web/bulk are never charged. So: charged → api, else
// bulk, else web.
describe("classifyProfileSource", () => {
  it("classifies a charged profile as api (the paid developer API)", () => {
    expect(classifyProfileSource({ chargeCents: 70, isBulk: false })).toBe("api");
  });

  it("classifies an uncharged bulk-job profile as bulk", () => {
    expect(classifyProfileSource({ chargeCents: 0, isBulk: true })).toBe("bulk");
  });

  it("classifies an uncharged, non-bulk profile as web — even with no request_ip", () => {
    // The fix: the old request_ip-based logic defaulted these to "api".
    expect(classifyProfileSource({ chargeCents: 0, isBulk: false })).toBe("web");
  });
});
