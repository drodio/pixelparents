import { describe, expect, it } from "vitest";
import {
  deriveConnectionParty,
  displayNameOf,
  contactLinesFor,
  buildIntroEmail,
  type ConnectionParty,
} from "@/lib/intro";
import type { SignupRow } from "@/lib/db/schema/signups";

// A verified parent signup with everything shared by default (shareFields=null →
// DEFAULT_SHARE_FIELDS = location/interests/photos/children/phone/email — note
// "links" is NOT default-on). Mirrors the fixture in directory.test.ts so the
// share-gate semantics match production.
function parent(overrides: Partial<SignupRow> = {}): SignupRow {
  return {
    id: "p1",
    createdAt: new Date(),
    familyId: "fam-1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "555-0100",
    githubUsername: "ada",
    ohsAffiliation: null,
    technicalDepth: null,
    linkedinUrl: "https://linkedin.com/in/ada",
    skillsets: null,
    timeCommitment: null,
    city: "Palo Alto",
    state: "CA",
    country: null,
    parentInterests: ["AI"],
    photos: [],
    shareEnabled: true,
    shareToken: "tok-parent",
    shareFields: null,
    shareVisibility: "ohs",
    extra: { approvalStatus: "approved" },
    ...overrides,
  } as SignupRow;
}

// A verified STUDENT account (minor): extra.accountType === "student". Carries a
// raw email/phone that MUST NEVER be revealed to another party.
function student(overrides: Partial<SignupRow> = {}): SignupRow {
  return parent({
    id: "stu-1",
    firstName: "Charlie",
    lastName: "Lovelace",
    email: "charlie@ohs.stanford.edu",
    phone: "555-9999",
    shareToken: "tok-student",
    extra: { approvalStatus: "approved", accountType: "student" },
    ...overrides,
  });
}

describe("displayNameOf", () => {
  it("uses full name for a parent", () => {
    expect(displayNameOf(parent())).toBe("Ada Lovelace");
  });
  it("coarsens a student to first name only (minor privacy)", () => {
    expect(displayNameOf(student())).toBe("Charlie");
  });
});

describe("deriveConnectionParty — parent", () => {
  it("reveals email + phone (default-shared) and the profile link", () => {
    const party = deriveConnectionParty(parent(), []);
    expect(party.isStudent).toBe(false);
    expect(party.viaParentName).toBeNull();
    const kinds = party.methods.map((m) => m.kind);
    expect(kinds).toContain("email");
    expect(kinds).toContain("phone");
    expect(kinds).toContain("profile");
    // links field is default-OFF, so LinkedIn is NOT revealed despite being set.
    expect(kinds).not.toContain("linkedin");
    const email = party.methods.find((m) => m.kind === "email");
    expect(email?.value).toBe("ada@example.com");
  });

  it("honors an explicit field selection — only what's opted in", () => {
    const party = deriveConnectionParty(parent({ shareFields: ["links"] }), []);
    const kinds = party.methods.map((m) => m.kind);
    expect(kinds).toContain("linkedin");
    expect(kinds).not.toContain("email");
    expect(kinds).not.toContain("phone");
  });

  it("reveals NOTHING (message hint) when sharing is disabled", () => {
    const party = deriveConnectionParty(parent({ shareEnabled: false }), []);
    expect(party.methods).toHaveLength(0);
    expect(party.messageHint).toMatch(/reply on the Community post/i);
  });

  it("reveals nothing when the member shares an empty field set", () => {
    const party = deriveConnectionParty(parent({ shareFields: [] }), []);
    // profile link still rides along (OHS-gated), but no PII fields.
    const kinds = party.methods.map((m) => m.kind);
    expect(kinds).not.toContain("email");
    expect(kinds).not.toContain("phone");
  });
});

describe("deriveConnectionParty — STUDENT (minor) — never leak raw contact", () => {
  it("routes through a parent: reveals the GUARDIAN's contact, never the student's", () => {
    const guardian = parent({ id: "g1", email: "guardian@example.com", phone: "555-0001" });
    const party = deriveConnectionParty(student(), [guardian, student()]);
    expect(party.isStudent).toBe(true);
    expect(party.viaParentName).toBe("Ada Lovelace");
    const emails = party.methods.filter((m) => m.kind === "email").map((m) => m.value);
    // The guardian's email is present...
    expect(emails).toContain("guardian@example.com");
    // ...and the student's raw email/phone are NOWHERE in any method.
    const allValues = JSON.stringify(party.methods);
    expect(allValues).not.toContain("charlie@ohs.stanford.edu");
    expect(allValues).not.toContain("555-9999");
    // ...nor the student's own profile token.
    expect(allValues).not.toContain("tok-student");
  });

  it("never exposes the student's contact even if the student opted to share email", () => {
    // Student row explicitly shares email/phone — the routing must STILL ignore it.
    const sharingStudent = student({ shareFields: ["email", "phone", "links"] });
    const guardian = parent({ id: "g1", email: "guardian@example.com" });
    const party = deriveConnectionParty(sharingStudent, [guardian, sharingStudent]);
    const json = JSON.stringify(party.methods);
    expect(json).not.toContain("charlie@ohs.stanford.edu");
    expect(json).not.toContain("555-9999");
  });

  it("leaks nothing (hint only) for a minor with no reachable guardian contact", () => {
    // Guardian exists but shares nothing → no methods, hint instead of PII.
    const guardian = parent({ id: "g1", shareEnabled: false });
    const party = deriveConnectionParty(student(), [guardian, student()]);
    expect(party.methods).toHaveLength(0);
    expect(party.messageHint).toMatch(/student/i);
    const json = JSON.stringify(party);
    expect(json).not.toContain("charlie@ohs.stanford.edu");
    expect(json).not.toContain("555-9999");
  });

  it("leaks nothing for a minor whose family has no parent at all", () => {
    const party = deriveConnectionParty(student(), [student()]);
    expect(party.methods).toHaveLength(0);
    expect(party.viaParentName).toBeNull();
    expect(JSON.stringify(party)).not.toContain("charlie@ohs.stanford.edu");
  });
});

describe("contactLinesFor", () => {
  it("leads with the via-parent note for a routed minor", () => {
    const guardian = parent({ id: "g1", email: "guardian@example.com" });
    const party = deriveConnectionParty(student(), [guardian, student()]);
    const lines = contactLinesFor(party);
    expect(lines[0]).toMatch(/student/i);
    expect(lines[0]).toContain("Ada Lovelace");
    expect(lines.join("\n")).not.toContain("charlie@ohs.stanford.edu");
  });

  it("falls back to the hint when nothing's shared", () => {
    const party = deriveConnectionParty(parent({ shareEnabled: false }), []);
    const lines = contactLinesFor(party);
    expect(lines.join(" ")).toMatch(/reply on the Community post/i);
  });
});

describe("buildIntroEmail", () => {
  const askerParty: ConnectionParty = {
    name: "Ada Lovelace",
    isStudent: false,
    viaParentName: null,
    methods: [{ kind: "email", value: "ada@example.com", href: "mailto:ada@example.com" }],
    messageHint: null,
  };
  const responderParty: ConnectionParty = {
    name: "Grace Hopper",
    isStudent: false,
    viaParentName: null,
    methods: [{ kind: "email", value: "grace@example.com", href: "mailto:grace@example.com" }],
    messageHint: null,
  };

  it("builds an A <> B subject with the topic", () => {
    const { subject } = buildIntroEmail({
      asker: askerParty,
      responder: responderParty,
      isOffer: false,
      topic: "College essays",
      offerNote: "Happy to review a draft.",
      postUrl: "https://gopixel.org/community/abc",
    });
    expect(subject).toBe("Intro: Ada Lovelace <> Grace Hopper — College essays");
  });

  it("includes both parties' contact + the post link + the offer note", () => {
    const { text } = buildIntroEmail({
      asker: askerParty,
      responder: responderParty,
      isOffer: false,
      topic: "College essays",
      offerNote: "Happy to review a draft.",
      postUrl: "https://gopixel.org/community/abc",
    });
    expect(text).toContain("ada@example.com");
    expect(text).toContain("grace@example.com");
    expect(text).toContain("https://gopixel.org/community/abc");
    expect(text).toContain("Happy to review a draft.");
    // Ask framing: responder offered to help author.
    expect(text).toContain("offered to help");
  });

  it("uses offer framing for an Offer post", () => {
    const { text } = buildIntroEmail({
      asker: askerParty,
      responder: responderParty,
      isOffer: true,
      topic: "Resume reviews",
      offerNote: "",
      postUrl: "https://gopixel.org/community/abc",
    });
    expect(text).toContain("took");
    expect(text).toContain("up on their offer");
  });

  it("never includes a routed minor's raw contact in the email body", () => {
    const guardian = parent({ id: "g1", email: "guardian@example.com" });
    const minorParty = deriveConnectionParty(student(), [guardian, student()]);
    const { text } = buildIntroEmail({
      asker: askerParty,
      responder: minorParty,
      isOffer: false,
      topic: "Chess",
      offerNote: "",
      postUrl: "https://gopixel.org/community/abc",
    });
    expect(text).not.toContain("charlie@ohs.stanford.edu");
    expect(text).not.toContain("555-9999");
    expect(text).toContain("guardian@example.com");
    expect(text).toMatch(/through their parent/i);
  });
});
