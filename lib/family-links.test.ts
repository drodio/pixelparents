import { describe, it, expect } from "vitest";
import {
  canRequestLink,
  canDecideLink,
  membersMovedByLink,
  canCreateAnotherRequest,
  linkNotFoundMessage,
  MAX_PENDING_OUTGOING,
} from "./family-links";

const requester = {
  signupId: "11111111-1111-1111-1111-111111111111",
  familyId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  email: "student@school.test",
};

const target = {
  email: "parent@home.test",
  signupId: "22222222-2222-2222-2222-222222222222",
  familyId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
};

describe("canRequestLink", () => {
  it("allows a student to ask to join their parent's existing family", () => {
    expect(canRequestLink(requester, target)).toEqual({ ok: true });
  });

  it("rejects your own email", () => {
    const r = canRequestLink(requester, { ...target, email: "STUDENT@school.test" });
    expect(r.ok).toBe(false);
  });

  it("rejects someone already in your family", () => {
    const r = canRequestLink(requester, { ...target, familyId: requester.familyId });
    expect(r).toEqual({ ok: false, reason: "You're already in the same family." });
  });

  it("rejects a malformed email", () => {
    expect(canRequestLink(requester, { ...target, email: "nope" }).ok).toBe(false);
  });

  it("signals NOT_FOUND (not a user-facing error) when the email has no account", () => {
    const r = canRequestLink(requester, { ...target, signupId: null, familyId: null });
    expect(r).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("linkNotFoundMessage", () => {
  // Account enumeration: the "no such account" path must read identically to
  // the success path, or this endpoint becomes an oracle for which OHS families
  // are registered.
  it("does not confirm whether the address is registered", () => {
    const msg = linkNotFoundMessage().toLowerCase();
    expect(msg).toContain("if that email has");
    expect(msg).not.toContain("no account");
    expect(msg).not.toContain("not found");
    expect(msg).not.toContain("doesn't exist");
  });
});

describe("membersMovedByLink", () => {
  it("names everyone who moves so nobody is relocated invisibly", () => {
    const out = membersMovedByLink([
      { id: "1", firstName: "Ava", isStudent: true },
      { id: "2", firstName: "Sam", isStudent: false },
    ]);
    expect(out.count).toBe(2);
    expect(out.names).toEqual(["Ava", "Sam"]);
  });

  it("flags when more than one adult would move (worth warning about)", () => {
    const single = membersMovedByLink([{ id: "1", firstName: "Ava", isStudent: true }]);
    expect(single.hasOtherAdults).toBe(false);

    const twoAdults = membersMovedByLink([
      { id: "1", firstName: "Sam", isStudent: false },
      { id: "2", firstName: "Kim", isStudent: false },
    ]);
    expect(twoAdults.hasOtherAdults).toBe(true);
  });

  it("skips blank names rather than rendering empty entries", () => {
    const out = membersMovedByLink([
      { id: "1", firstName: "", isStudent: true },
      { id: "2", firstName: null, isStudent: false },
    ]);
    expect(out.names).toEqual([]);
    expect(out.count).toBe(2);
  });
});

describe("canDecideLink", () => {
  const req = { toSignupId: target.signupId, toEmail: target.email, status: "pending" };
  const decider = { signupId: target.signupId, email: target.email, familyId: target.familyId };

  it("lets the person who was asked decide", () => {
    expect(canDecideLink(req, decider, target.familyId)).toEqual({ ok: true });
  });

  it("lets a co-parent in the same family decide", () => {
    const coParent = {
      signupId: "33333333-3333-3333-3333-333333333333",
      email: "coparent@home.test",
      familyId: target.familyId,
    };
    expect(canDecideLink(req, coParent, target.familyId)).toEqual({ ok: true });
  });

  it("refuses a stranger holding the request id", () => {
    const stranger = {
      signupId: "99999999-9999-9999-9999-999999999999",
      email: "stranger@elsewhere.test",
      familyId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    };
    const r = canDecideLink(req, stranger, target.familyId);
    expect(r).toEqual({ ok: false, reason: "This request wasn't sent to you." });
  });

  it("refuses to re-decide an already-handled request", () => {
    const r = canDecideLink({ ...req, status: "approved" }, decider, target.familyId);
    expect(r.ok).toBe(false);
  });

  it("matches on email case-insensitively", () => {
    const upper = { ...decider, email: "PARENT@HOME.TEST" };
    expect(canDecideLink(req, upper, target.familyId)).toEqual({ ok: true });
  });
});

describe("canCreateAnotherRequest", () => {
  it("allows up to the cap and blocks past it", () => {
    expect(canCreateAnotherRequest(0)).toEqual({ ok: true });
    expect(canCreateAnotherRequest(MAX_PENDING_OUTGOING - 1)).toEqual({ ok: true });
    expect(canCreateAnotherRequest(MAX_PENDING_OUTGOING).ok).toBe(false);
  });
});
