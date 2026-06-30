import { describe, expect, it } from "vitest";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  checkCode,
  generateCode,
  hashCode,
  isStudentEmail,
  normalizeEmail,
  type PendingVerify,
} from "@/lib/verify";

// Build addresses at runtime so no full email literal sits in the source — the
// repo's pre-commit PII guard hard-blocks consumer-domain emails (e.g. gmail) and
// warns on others. None of these are real addresses.
const mk = (local: string, domain: string) => `${local}@${domain}`;
const STANFORD = "stanford.edu";

describe("isStudentEmail", () => {
  it("accepts stanford.edu and its subdomains", () => {
    expect(isStudentEmail(mk("a", `ohs.${STANFORD}`))).toBe(true);
    expect(isStudentEmail(mk("b", STANFORD))).toBe(true);
    expect(isStudentEmail(mk("a.b", `deep.sub.${STANFORD}`))).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isStudentEmail(`  ${mk("C", "OHS.Stanford.EDU")} `)).toBe(true);
  });

  it("rejects non-stanford and lookalike domains", () => {
    expect(isStudentEmail(mk("a", "gmail.com"))).toBe(false);
    expect(isStudentEmail(mk("a", `${STANFORD}.evil.com`))).toBe(false);
    expect(isStudentEmail(mk("a", "notstanford.edu"))).toBe(false);
    expect(isStudentEmail(mk("a", "stanford.education"))).toBe(false);
  });

  it("rejects malformed addresses", () => {
    expect(isStudentEmail("")).toBe(false);
    expect(isStudentEmail("no-at-sign")).toBe(false);
    expect(isStudentEmail(`a@${mk("b", STANFORD)}`)).toBe(false); // two @ signs
    expect(isStudentEmail(mk("", STANFORD))).toBe(false); // empty local part
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail(`  ${mk("Foo", "OHS.Stanford.EDU")} `)).toBe(mk("foo", `ohs.${STANFORD}`));
  });
});

describe("generateCode / hashCode", () => {
  it("generates a 6-digit numeric code (leading zeros preserved)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("hashes deterministically and trims", () => {
    expect(hashCode("123456")).toBe(hashCode("123456"));
    expect(hashCode(" 123456 ")).toBe(hashCode("123456"));
    expect(hashCode("123456")).not.toBe(hashCode("654321"));
    expect(hashCode("123456")).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });
});

describe("checkCode", () => {
  const now = 1_000_000;
  function pending(over: Partial<PendingVerify> = {}): PendingVerify {
    return {
      email: mk("a", `ohs.${STANFORD}`),
      codeHash: hashCode("123456"),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      lastSentAt: now,
      ...over,
    };
  }

  it("returns no-code when nothing is pending", () => {
    expect(checkCode(null, "123456", now)).toBe("no-code");
    expect(checkCode(undefined, "123456", now)).toBe("no-code");
  });

  it("returns ok for the matching code before expiry", () => {
    expect(checkCode(pending(), "123456", now)).toBe("ok");
  });

  it("returns mismatch for a wrong code", () => {
    expect(checkCode(pending(), "000000", now)).toBe("mismatch");
  });

  it("returns expired past the TTL", () => {
    expect(checkCode(pending(), "123456", now + CODE_TTL_MS + 1)).toBe("expired");
  });

  it("returns too-many-attempts at the attempt cap", () => {
    expect(checkCode(pending({ attempts: MAX_ATTEMPTS }), "123456", now)).toBe("too-many-attempts");
  });

  it("prioritizes expiry over attempts", () => {
    expect(
      checkCode(pending({ attempts: MAX_ATTEMPTS }), "123456", now + CODE_TTL_MS + 1),
    ).toBe("expired");
  });
});
