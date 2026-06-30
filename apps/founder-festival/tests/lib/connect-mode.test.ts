import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isConnectMode } from "@/lib/config/connect-mode";

// The server flag. (The client constant CONNECT_MODE_CLIENT is evaluated at
// module load from NEXT_PUBLIC_CONNECT_MODE and can't be re-toggled per-test,
// so we cover the parser via the server entry point — same parseFlag.)
describe("isConnectMode (CONNECT_MODE server flag)", () => {
  beforeEach(() => {
    delete process.env.CONNECT_MODE;
  });
  afterEach(() => {
    delete process.env.CONNECT_MODE;
  });

  it("is OFF by default (unset) — festival.so behavior is unchanged", () => {
    expect(isConnectMode()).toBe(false);
  });

  it("is OFF for anything other than an explicit on value", () => {
    for (const v of ["off", "false", "0", "no", "", " "]) {
      process.env.CONNECT_MODE = v;
      expect(isConnectMode()).toBe(false);
    }
  });

  it("is ON for on/1/true (case-insensitive, trimmed)", () => {
    for (const v of ["on", "ON", "1", "true", "TRUE", "  true  "]) {
      process.env.CONNECT_MODE = v;
      expect(isConnectMode()).toBe(true);
    }
  });

  it("reads the env at call time (not module load), so a re-score in a long-lived process picks up a flip", () => {
    expect(isConnectMode()).toBe(false);
    process.env.CONNECT_MODE = "true";
    expect(isConnectMode()).toBe(true);
    process.env.CONNECT_MODE = "off";
    expect(isConnectMode()).toBe(false);
  });
});
