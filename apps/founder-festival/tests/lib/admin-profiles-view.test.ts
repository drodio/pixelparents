import { describe, it, expect } from "vitest";
import { profileEmailInfo } from "@/lib/admin-profiles-view";

describe("profileEmailInfo", () => {
  it("marks an unclaimed profile with no emails as Unclaimed, null status", () => {
    const info = profileEmailInfo({ claimerClerkUserId: null, emails: [] }, new Map());
    expect(info).toEqual({ claimed: false, emails: null, emailStatus: null, list: [] });
  });

  it("marks a claimed profile Verified with its resolved address", () => {
    const map = new Map([["u_1", ["ada@example.com"]]]);
    const info = profileEmailInfo({ claimerClerkUserId: "u_1" }, map);
    expect(info).toEqual({
      claimed: true,
      emails: "ada@example.com",
      emailStatus: "verified",
      list: [{ email: "ada@example.com", status: "verified" }],
    });
  });

  it("comma-joins multiple addresses for a claimer", () => {
    const map = new Map([["u_1", ["ada@example.com", "ada@work.com"]]]);
    const info = profileEmailInfo({ claimerClerkUserId: "u_1" }, map);
    expect(info.emails).toBe("ada@example.com, ada@work.com");
    expect(info.emailStatus).toBe("verified");
    expect(info.list).toHaveLength(2);
  });

  it("still reports a claimed profile as Verified when no address resolved", () => {
    const info = profileEmailInfo({ claimerClerkUserId: "u_1" }, new Map());
    expect(info).toEqual({ claimed: true, emails: null, emailStatus: "verified", list: [] });
  });

  it("surfaces an anymailfinder email as Unverified for an unclaimed profile", () => {
    const info = profileEmailInfo(
      { claimerClerkUserId: null, emails: [{ email: "x@acme.com", status: "unverified", source: "anymailfinder" }] },
      new Map(),
    );
    expect(info).toEqual({
      claimed: false,
      emails: "x@acme.com",
      emailStatus: "unverified",
      list: [{ email: "x@acme.com", status: "unverified" }],
    });
  });

  it("keeps BOTH a verified operator email and an unverified anymailfinder email", () => {
    const info = profileEmailInfo(
      {
        claimerClerkUserId: null,
        emails: [
          { email: "found@acme.com", status: "unverified", source: "anymailfinder" },
          { email: "provided@acme.com", status: "verified", source: "operator" },
        ],
      },
      new Map(),
    );
    // verified first
    expect(info.list).toEqual([
      { email: "provided@acme.com", status: "verified" },
      { email: "found@acme.com", status: "unverified" },
    ]);
    expect(info.emailStatus).toBe("verified");
  });

  it("claimer email comes first and de-dupes a matching provided email", () => {
    const map = new Map([["u_1", ["ada@example.com"]]]);
    const info = profileEmailInfo(
      { claimerClerkUserId: "u_1", emails: [{ email: "ada@example.com", status: "verified", source: "operator" }] },
      map,
    );
    expect(info.list).toEqual([{ email: "ada@example.com", status: "verified" }]);
  });
});
