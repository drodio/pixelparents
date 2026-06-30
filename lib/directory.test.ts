import { describe, expect, it } from "vitest";
import {
  buildDirectoryCard,
  childAge,
  directoryPhotoPaths,
  geocodeLocation,
  haversineMiles,
  isDirectoryVisible,
  hasShareableProfile,
  isFamilyVerified,
  VERIFICATION_CUTOFF,
  childFullName,
  aggregatedChildInterests,
  linkedStudentAccountForChild,
} from "@/lib/directory";
import { familyMatchesAgeRange, familyWithinRadius } from "@/lib/directory-filters";
import type { SignupRow, ChildRow } from "@/lib/db/schema/signups";

// Fixed "current year" so age derivation is deterministic in tests.
const YEAR = 2026;

// Minimal SignupRow factory — only the fields the directory helpers read matter;
// the rest are filled with harmless defaults and cast to the row type.
function signup(overrides: Partial<SignupRow> = {}): SignupRow {
  return {
    id: "s1",
    createdAt: new Date(),
    familyId: "f1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "owner@example.com",
    phone: "555-0100",
    githubUsername: "ada",
    ohsAffiliation: null,
    technicalDepth: null,
    linkedinUrl: null,
    skillsets: null,
    timeCommitment: null,
    city: "Palo Alto",
    state: "CA",
    parentInterests: ["Chess", "AI"],
    photos: [],
    shareEnabled: true,
    shareToken: "tok-123",
    shareFields: null, // null => DEFAULT_SHARE_FIELDS (everything)
    shareVisibility: "ohs",
    // Default to verified so the sharing-gate tests below stay focused on sharing;
    // verification is exercised in its own describe block.
    extra: { approvalStatus: "approved" },
    ...overrides,
  } as SignupRow;
}

function child(overrides: Partial<ChildRow> = {}): ChildRow {
  return {
    id: "c1",
    signupId: "s1",
    familyId: "f1",
    createdAt: new Date(),
    firstName: "Byron",
    grade: "9th",
    birthYear: null,
    interests: ["Robotics"],
    notes: "secret note",
    photos: [],
    ...overrides,
  } as ChildRow;
}

describe("isDirectoryVisible (directory inclusion gate)", () => {
  it("includes an enabled, tokened, OHS profile with a name", () => {
    expect(isDirectoryVisible(signup())).toBe(true);
  });

  it("excludes private profiles", () => {
    expect(isDirectoryVisible(signup({ shareVisibility: "private" }))).toBe(false);
  });

  it("includes legacy 'link' visibility (coerced to ohs)", () => {
    expect(isDirectoryVisible(signup({ shareVisibility: "link" }))).toBe(true);
  });

  it("excludes when sharing is disabled", () => {
    expect(isDirectoryVisible(signup({ shareEnabled: false }))).toBe(false);
  });

  it("excludes when there is no share token", () => {
    expect(isDirectoryVisible(signup({ shareToken: null }))).toBe(false);
  });

  it("excludes blank auto-save drafts (no name)", () => {
    expect(isDirectoryVisible(signup({ firstName: "  " }))).toBe(false);
  });

  it("excludes student accounts (shown as a child name on the parent card, not standalone)", () => {
    expect(
      isDirectoryVisible(signup({ extra: { approvalStatus: "approved", accountType: "student" } })),
    ).toBe(false);
  });

  it("excludes unverified families who joined after the cutoff", () => {
    expect(
      isDirectoryVisible(signup({ extra: {}, createdAt: new Date(VERIFICATION_CUTOFF + 86_400_000) })),
    ).toBe(false);
  });

  it("includes verified families who joined after the cutoff", () => {
    expect(
      isDirectoryVisible(
        signup({ extra: { approvalStatus: "approved" }, createdAt: new Date(VERIFICATION_CUTOFF + 86_400_000) }),
      ),
    ).toBe(true);
  });
});

describe("hasShareableProfile (profile-link gate, student-inclusive)", () => {
  it("returns true for a student with shareEnabled + ohs (but isDirectoryVisible is false)", () => {
    const student = signup({
      extra: { approvalStatus: "approved", accountType: "student" },
    });
    // The whole point of the bug fix: a student CAN share a profile (linkable from
    // a board post / responder card) even though they get no standalone grid card.
    expect(hasShareableProfile(student)).toBe(true);
    expect(isDirectoryVisible(student)).toBe(false);
  });

  it("agrees with isDirectoryVisible for a non-student parent", () => {
    expect(hasShareableProfile(signup())).toBe(true);
    expect(isDirectoryVisible(signup())).toBe(true);
  });

  it("excludes private profiles (student or not)", () => {
    expect(hasShareableProfile(signup({ shareVisibility: "private" }))).toBe(false);
    expect(
      hasShareableProfile(
        signup({ shareVisibility: "private", extra: { approvalStatus: "approved", accountType: "student" } }),
      ),
    ).toBe(false);
  });

  it("excludes when sharing is disabled, there's no token, or the name is blank", () => {
    expect(hasShareableProfile(signup({ shareEnabled: false }))).toBe(false);
    expect(hasShareableProfile(signup({ shareToken: null }))).toBe(false);
    expect(hasShareableProfile(signup({ firstName: "  " }))).toBe(false);
  });

  it("excludes an unverified family that joined after the cutoff", () => {
    expect(
      hasShareableProfile(
        signup({ extra: {}, createdAt: new Date(VERIFICATION_CUTOFF + 86_400_000) }),
      ),
    ).toBe(false);
  });
});

describe("childFullName", () => {
  it("appends the parent surname", () => {
    expect(childFullName("Ansh", "Vasani")).toBe("Ansh Vasani");
  });
  it("does not double an already-present surname", () => {
    expect(childFullName("Devina Odio", "Odio")).toBe("Devina Odio");
  });
  it("handles a missing/blank surname", () => {
    expect(childFullName("Ansh", null)).toBe("Ansh");
    expect(childFullName("Ansh", "  ")).toBe("Ansh");
  });
});

describe("isFamilyVerified (directory verification gate)", () => {
  it("treats approvalStatus=approved as verified", () => {
    expect(isFamilyVerified({ extra: { approvalStatus: "approved" }, createdAt: new Date() })).toBe(true);
  });

  it("treats an api-access approval as verified (post-cutoff, not grandfathered)", () => {
    expect(
      isFamilyVerified({
        extra: { approvalStatus: "approved", approvalBy: "api-access" },
        createdAt: new Date(VERIFICATION_CUTOFF + 86_400_000),
      }),
    ).toBe(true);
  });

  it("grandfathers families created before the cutoff", () => {
    expect(isFamilyVerified({ extra: {}, createdAt: new Date(VERIFICATION_CUTOFF - 1) })).toBe(true);
  });

  it("gates unverified families created after the cutoff", () => {
    expect(isFamilyVerified({ extra: {}, createdAt: new Date(VERIFICATION_CUTOFF + 1) })).toBe(false);
    expect(isFamilyVerified({ extra: { approvalStatus: "pending" }, createdAt: new Date(VERIFICATION_CUTOFF + 1) })).toBe(false);
  });
});

describe("buildDirectoryCard (per-field redaction)", () => {
  const kids = [child()];
  const noUrls = new Map<string, string>();

  it("never exposes phone/email/notes on the card", () => {
    const card = buildDirectoryCard(signup(), kids, noUrls, 4, YEAR);
    const serialized = JSON.stringify(card);
    expect(serialized).not.toContain("555-0100");
    expect(serialized).not.toContain("owner@example.com");
    expect(serialized).not.toContain("secret note");
  });

  it("with all fields shared, exposes name, location, children, interests", () => {
    const card = buildDirectoryCard(signup(), kids, noUrls, 4, YEAR);
    expect(card.name).toBe("Ada Lovelace");
    expect(card.location).toBe("Palo Alto, CA");
    expect(card.children).toEqual([
      { firstName: "Byron", name: "Byron Lovelace", grade: "9th", interests: ["Robotics"], age: 14 },
    ]);
    // Parent + child interests, deduped, in first-seen order.
    expect(card.interests).toEqual(["Chess", "AI", "Robotics"]);
  });

  it("omits location when 'location' is not shared", () => {
    const card = buildDirectoryCard(signup({ shareFields: ["interests"] }), kids, noUrls, 4, YEAR);
    expect(card.location).toBeNull();
  });

  it("omits children (and their interests) when 'children' is not shared", () => {
    const card = buildDirectoryCard(
      signup({ shareFields: ["location", "interests"] }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(card.children).toEqual([]);
    expect(card.interests).toEqual(["Chess", "AI"]); // no "Robotics"
  });

  it("omits parent interests when 'interests' is not shared", () => {
    const card = buildDirectoryCard(signup({ shareFields: ["children"] }), kids, noUrls, 4, YEAR);
    expect(card.interests).toEqual(["Robotics"]); // only child interests
  });

  it("defaults to non-builder when extra carries no builder flags", () => {
    const card = buildDirectoryCard(signup(), kids, noUrls, 4, YEAR);
    expect(card.isBuilder).toBe(false);
    expect(card.contributions).toBe(0);
  });

  it("reflects an auto builder flag + contribution count from extra", () => {
    const card = buildDirectoryCard(
      signup({ extra: { approvalStatus: "approved", builder: true, githubContributions: 5 } }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(card.isBuilder).toBe(true);
    expect(card.contributions).toBe(5);
  });

  it("reflects a manual builder override (no commits counted)", () => {
    const card = buildDirectoryCard(
      signup({ extra: { approvalStatus: "approved", builderManual: true } }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(card.isBuilder).toBe(true);
    expect(card.contributions).toBe(0);
  });

  it("dedupes interests case-insensitively, keeping the first label", () => {
    const card = buildDirectoryCard(
      signup({ parentInterests: ["Chess", "chess"] }),
      [child({ interests: ["CHESS"] })],
      noUrls,
      4,
      YEAR,
    );
    expect(card.interests).toEqual(["Chess"]);
  });

  it("keeps the first-seen label across the parent/child boundary (parent wins)", () => {
    // Parent's lowercase "chess" is seen before the child's "Chess", so the
    // parent label is kept — pins first-seen-wins, not last-seen.
    const card = buildDirectoryCard(
      signup({ parentInterests: ["chess"] }),
      [child({ interests: ["Chess"] })],
      noUrls,
      4,
      YEAR,
    );
    expect(card.interests).toEqual(["chess"]);
  });

  it("exposes skillsets behind the 'interests' share field, trimmed + non-empty", () => {
    const shown = buildDirectoryCard(
      signup({ skillsets: ["React", "  Rust  ", "", null as unknown as string] }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(shown.skillsets).toEqual(["React", "Rust"]);
    // Not shared when "interests" is off.
    const hidden = buildDirectoryCard(
      signup({ shareFields: ["location"], skillsets: ["React"] }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(hidden.skillsets).toEqual([]);
  });

  it("exposes LinkedIn/GitHub links ONLY when the 'links' field is opted in", () => {
    // Default share fields do NOT include "links" → no links leak.
    const off = buildDirectoryCard(
      signup({ linkedinUrl: "https://linkedin.com/in/ada", githubUsername: "ada" }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(off.linkedinUrl).toBeNull();
    expect(off.githubUrl).toBeNull();
    // Opted in → both surface (GitHub built from the public username).
    const on = buildDirectoryCard(
      signup({
        shareFields: ["links"],
        linkedinUrl: "https://linkedin.com/in/ada",
        githubUsername: "ada",
      }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(on.linkedinUrl).toBe("https://linkedin.com/in/ada");
    expect(on.githubUrl).toBe("https://github.com/ada");
  });

  it("defaults to a non-student card for a parent account", () => {
    const card = buildDirectoryCard(signup(), kids, noUrls, 4, YEAR);
    expect(card.isStudent).toBe(false);
    expect(card.name).toBe("Ada Lovelace"); // full name for parents
  });
});

describe("buildDirectoryCard — student coarsening (minor privacy)", () => {
  const kids = [child()];
  const noUrls = new Map<string, string>();
  // A student ACCOUNT is detected via extra.accountType === "student".
  const studentExtra = { approvalStatus: "approved", accountType: "student" };

  it("shows first name only — never the surname", () => {
    const card = buildDirectoryCard(
      signup({ extra: studentExtra }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(card.isStudent).toBe(true);
    expect(card.name).toBe("Ada");
    expect(JSON.stringify(card)).not.toContain("Lovelace");
  });

  it("coarsens location to the region — never the precise city", () => {
    const card = buildDirectoryCard(
      signup({ extra: studentExtra, city: "Palo Alto", state: "CA" }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(card.location).toBe("CA");
    expect(card.location).not.toContain("Palo Alto");
  });

  it("falls back to country when no state is shared", () => {
    const card = buildDirectoryCard(
      signup({ extra: studentExtra, city: "Toronto", state: null, country: "Canada" }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(card.location).toBe("Canada");
  });

  it("never lists children (or mixes in their interests)", () => {
    const card = buildDirectoryCard(
      signup({ extra: studentExtra, parentInterests: ["AI"] }),
      [child({ firstName: "Byron", interests: ["Robotics"] })],
      noUrls,
      4,
      YEAR,
    );
    expect(card.children).toEqual([]);
    expect(card.interests).toEqual(["AI"]); // no "Robotics" from a child
    expect(JSON.stringify(card)).not.toContain("Byron");
  });

  it("still shows opt-in skills, builder badge, and links", () => {
    const card = buildDirectoryCard(
      signup({
        extra: { ...studentExtra, builder: true, githubContributions: 3 },
        shareFields: ["interests", "links"],
        skillsets: ["Python"],
        linkedinUrl: "https://linkedin.com/in/ada",
        githubUsername: "ada",
      }),
      kids,
      noUrls,
      4,
      YEAR,
    );
    expect(card.skillsets).toEqual(["Python"]);
    expect(card.isBuilder).toBe(true);
    expect(card.contributions).toBe(3);
    expect(card.linkedinUrl).toBe("https://linkedin.com/in/ada");
    expect(card.githubUrl).toBe("https://github.com/ada");
  });
});

describe("directoryPhotoPaths + photo projection", () => {
  const photoSignup = signup({
    shareFields: ["photos"],
    photos: [{ url: "u", pathname: "fam/1.jpg" }],
  });
  const photoKids = [
    child({ photos: [{ url: "u", pathname: "kid/1.jpg" }] }),
  ];

  it("returns family-then-child pathnames only when 'photos' is shared", () => {
    expect(directoryPhotoPaths(photoSignup, photoKids)).toEqual(["fam/1.jpg", "kid/1.jpg"]);
  });

  it("returns no photo paths when 'photos' is not shared", () => {
    const noPhotoShare = signup({
      shareFields: ["location"],
      photos: [{ url: "u", pathname: "fam/1.jpg" }],
    });
    expect(directoryPhotoPaths(noPhotoShare, photoKids)).toEqual([]);
  });

  it("maps hero + thumbnails from the presigned url map; drops unsigned paths", () => {
    const urls = new Map([
      ["fam/1.jpg", "https://signed/fam"],
      ["kid/1.jpg", "https://signed/kid"],
    ]);
    const card = buildDirectoryCard(photoSignup, photoKids, urls, 4, YEAR);
    expect(card.heroUrl).toBe("https://signed/fam");
    expect(card.thumbUrls).toEqual(["https://signed/kid"]);
  });

  it("yields no hero/thumbs when photos aren't shared", () => {
    const card = buildDirectoryCard(signup({ shareFields: ["interests"] }), photoKids, new Map(), 4, YEAR);
    expect(card.heroUrl).toBeNull();
    expect(card.thumbUrls).toEqual([]);
  });
});

describe("childAge (age derivation for the age-range filter)", () => {
  it("prefers birthYear: age = currentYear − birthYear", () => {
    expect(childAge({ birthYear: 2016 }, YEAR)).toBe(10);
    expect(childAge({ birthYear: 2008, grade: "9th" }, YEAR)).toBe(18); // birthYear wins
  });

  it("maps OHS grades to typical ages (grade N → N+5)", () => {
    expect(childAge({ grade: "7th" }, YEAR)).toBe(12);
    expect(childAge({ grade: "9th" }, YEAR)).toBe(14);
    expect(childAge({ grade: "12th" }, YEAR)).toBe(17);
  });

  it("maps kindergarten to ≈5", () => {
    expect(childAge({ grade: "Kindergarten" }, YEAR)).toBe(5);
    expect(childAge({ grade: "K" }, YEAR)).toBe(5);
  });

  it("returns null for 'Not an OHS child' / blank / unparseable with no birthYear", () => {
    expect(childAge({ grade: "Not an OHS child" }, YEAR)).toBeNull();
    expect(childAge({ grade: null, birthYear: null }, YEAR)).toBeNull();
    expect(childAge({}, YEAR)).toBeNull();
  });

  it("rejects a future birthYear (negative age) → null", () => {
    expect(childAge({ birthYear: YEAR + 2 }, YEAR)).toBeNull();
  });

  it("flows derived ages onto the card's children", () => {
    const card = buildDirectoryCard(
      signup(),
      [child({ firstName: "Kid", grade: null, birthYear: 2014 })],
      new Map(),
      4,
      YEAR,
    );
    expect(card.children[0].age).toBe(12);
  });
});

describe("haversineMiles (distance for the radius filter)", () => {
  it("is zero for identical points", () => {
    expect(haversineMiles([37.77, -122.42], [37.77, -122.42])).toBeCloseTo(0, 5);
  });

  it("matches a known distance (SF → LA ≈ 347 mi)", () => {
    const d = haversineMiles([37.7749, -122.4194], [34.0522, -118.2437]);
    expect(d).toBeGreaterThan(340);
    expect(d).toBeLessThan(355);
  });

  it("is symmetric", () => {
    const a: [number, number] = [40.7128, -74.006];
    const b: [number, number] = [41.8781, -87.6298];
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 6);
  });
});

describe("geocodeLocation (offline static geocoding)", () => {
  it("resolves an exact city match (full state name or abbr)", () => {
    expect(geocodeLocation("Palo Alto, CA")).toEqual([37.4419, -122.143]);
    expect(geocodeLocation("Palo Alto, California")).toEqual([37.4419, -122.143]);
  });

  it("is case-insensitive on the city name", () => {
    expect(geocodeLocation("PALO ALTO, ca")).toEqual([37.4419, -122.143]);
  });

  it("falls back to the state centroid for an unknown city", () => {
    expect(geocodeLocation("Nowheresville, CA")).toEqual([36.117, -119.682]);
  });

  it("resolves a bare state", () => {
    expect(geocodeLocation("Texas")).toEqual([31.054, -97.563]);
  });

  it("resolves a 5-digit ZIP to a coarse region centroid", () => {
    expect(geocodeLocation("94301")).toEqual([38.0, -121.0]); // 9 → west coast
    expect(geocodeLocation("02139-1234")).toEqual([42.3, -71.5]); // ZIP+4, 0 → NE
  });

  it("returns null for blank or unrecognizable input", () => {
    expect(geocodeLocation("")).toBeNull();
    expect(geocodeLocation(null)).toBeNull();
    expect(geocodeLocation("Atlantis")).toBeNull();
  });
});

describe("familyMatchesAgeRange (age filter predicate)", () => {
  const MAX = 18;

  it("matches when any child's age is in [lower, upper]", () => {
    expect(familyMatchesAgeRange([8, 14], 12, 16, MAX)).toBe(true);
    expect(familyMatchesAgeRange([8], 12, 16, MAX)).toBe(false);
  });

  it("treats upper at AGE_MAX as '18+' (no upper bound)", () => {
    expect(familyMatchesAgeRange([25], 8, 18, MAX)).toBe(true); // 18+ catches 25
    expect(familyMatchesAgeRange([25], 8, 17, MAX)).toBe(false); // capped at 17
  });

  it("ignores null ages and excludes families with no derivable ages", () => {
    expect(familyMatchesAgeRange([null, 10], 8, 12, MAX)).toBe(true);
    expect(familyMatchesAgeRange([null, null], 8, 12, MAX)).toBe(false);
    expect(familyMatchesAgeRange([], 8, 12, MAX)).toBe(false);
  });

  it("matches a single age at the boundaries", () => {
    expect(familyMatchesAgeRange([12], 12, 12, MAX)).toBe(true);
  });
});

describe("familyWithinRadius (radius filter predicate)", () => {
  const sf: [number, number] = [37.7749, -122.4194];
  const la: [number, number] = [34.0522, -118.2437];

  it("includes a family inside the radius and excludes one outside", () => {
    expect(familyWithinRadius(sf, sf, 10)).toBe(true);
    expect(familyWithinRadius(la, sf, 100)).toBe(false); // ~347 mi apart
    expect(familyWithinRadius(la, sf, 400)).toBe(true);
  });

  it("Worldwide (Infinity) matches everyone, including ungeocodable", () => {
    expect(familyWithinRadius(null, sf, Infinity)).toBe(true);
    expect(familyWithinRadius(la, sf, Infinity)).toBe(true);
  });

  it("excludes ungeocodable families under a finite radius", () => {
    expect(familyWithinRadius(null, sf, 50)).toBe(false);
  });
});

// --- Enrichment share-field gating (the "profile_enrichment" field) -----------
//
// The curated auto-built profile may appear on a directory card ONLY when the
// owner enabled the NEW, default-OFF "profile_enrichment" share field. The raw
// fact dump + source-status roster are never projected onto a card.
describe("buildDirectoryCard — enrichment is gated behind profile_enrichment", () => {
  const URLS = new Map<string, string>();
  const stored = {
    enrichedAt: "2026-06-30T00:00:00.000Z",
    subject: { name: "Ada Lovelace" },
    info: {
      identity: {
        name: "Ada Lovelace",
        headline: null,
        currentRole: null,
        currentCompany: null,
        location: null,
        education: [],
      },
      bio: "Builds compilers.",
      expertiseTags: ["compilers"],
      canHelpWith: ["mentoring"],
    },
    infoExtracted: true,
    factsBySource: [{ source: "github", facts: ["SECRET RAW FACT"] }],
    statuses: [{ source: "github", status: "ok", factCount: 1 }],
    citations: [],
    buildStatus: "ready",
  };

  it("omits enrichment when the share field is OFF (default)", () => {
    // DEFAULT_SHARE_FIELDS (shareFields:null) does NOT include profile_enrichment.
    const card = buildDirectoryCard(
      signup({ extra: { approvalStatus: "approved", enrichment: stored } }),
      [],
      URLS,
      3,
      YEAR,
    );
    expect(card.enrichment).toBeNull();
  });

  it("surfaces only the curated info when the share field is ON — never raw facts/statuses", () => {
    const card = buildDirectoryCard(
      signup({
        shareFields: ["profile_enrichment"],
        extra: { approvalStatus: "approved", enrichment: stored },
      }),
      [],
      URLS,
      3,
      YEAR,
    );
    expect(card.enrichment).toEqual({
      bio: "Builds compilers.",
      expertiseTags: ["compilers"],
      canHelpWith: ["mentoring"],
    });
    // The raw fact dump is NEVER exposed on a card.
    expect(JSON.stringify(card)).not.toContain("SECRET RAW FACT");
    expect(card).not.toHaveProperty("factsBySource");
    expect(card).not.toHaveProperty("statuses");
  });

  it("is null when opted into the field but no enrichment was built", () => {
    const card = buildDirectoryCard(
      signup({ shareFields: ["profile_enrichment"], extra: { approvalStatus: "approved" } }),
      [],
      URLS,
      3,
      YEAR,
    );
    expect(card.enrichment).toBeNull();
  });
});

// The fix for the "two records, different tags" bug: a child row carries the
// kid-interest tags the parent typed on the family form; when that child is ALSO a
// real student account (matched by the child's studentEmail == one of the
// account's verified OHS emails), the directory must show the de-duplicated UNION
// of those kid interests and the student account's accurate expertise signals
// (enrichment expertiseTags + skillsets + parentInterests).
describe("aggregatedChildInterests (child↔student tag union)", () => {
  // A student account in the same family, verified to the child's student email,
  // whose enrichment expertise + skillsets are the accurate tag set.
  function studentAccount(overrides: Partial<SignupRow> = {}): SignupRow {
    return signup({
      id: "student-1",
      firstName: "Byron",
      lastName: "Lovelace",
      skillsets: ["Python", "JavaScript"],
      parentInterests: null,
      extra: {
        accountType: "student",
        verifiedStudentEmails: ["byron@ohs.stanford.edu"],
        enrichment: {
          info: {
            bio: "Builds things.",
            expertiseTags: ["AI", "Finance", "Cybersecurity"],
            canHelpWith: ["mentoring"],
          },
        },
      },
      ...overrides,
    });
  }

  it("returns the child's interests unchanged when no student account matches", () => {
    const kid = child({ interests: ["Robotics"], studentEmail: "byron@ohs.stanford.edu" });
    // No student accounts passed → nothing to link to.
    expect(aggregatedChildInterests(kid, [])).toEqual(["Robotics"]);
  });

  it("returns the child's interests unchanged when the child has no studentEmail", () => {
    const kid = child({ interests: ["Robotics"], studentEmail: null });
    expect(aggregatedChildInterests(kid, [studentAccount()])).toEqual(["Robotics"]);
  });

  it("unions kid interests with the linked student account's expertise signals", () => {
    const kid = child({
      interests: ["Finance", "Mountain biking", "Cars"],
      studentEmail: "byron@ohs.stanford.edu",
    });
    const result = aggregatedChildInterests(kid, [studentAccount()]);
    // Child interests come first, in order; then NEW student signals appended.
    // "Finance" is shared and not duplicated.
    expect(result).toEqual([
      "Finance",
      "Mountain biking",
      "Cars",
      "AI",
      "Cybersecurity",
      "Python",
      "JavaScript",
    ]);
  });

  it("matches the verified email case-insensitively and dedupes case-insensitively", () => {
    const kid = child({
      interests: ["finance"],
      studentEmail: "BYRON@OHS.STANFORD.EDU",
    });
    const result = aggregatedChildInterests(kid, [studentAccount()]);
    // "finance" (child label kept) is not duplicated by the student's "Finance".
    expect(result).toContain("finance");
    expect(result.filter((t) => t.toLowerCase() === "finance")).toHaveLength(1);
    expect(result).toContain("AI");
  });

  it("tolerates the legacy singular verifiedStudentEmail field", () => {
    const acct = studentAccount({
      skillsets: null,
      extra: {
        accountType: "student",
        verifiedStudentEmail: "byron@ohs.stanford.edu",
        enrichment: { info: { bio: "", expertiseTags: ["AI"], canHelpWith: [] } },
      },
    });
    const kid = child({ interests: ["Robotics"], studentEmail: "byron@ohs.stanford.edu" });
    expect(aggregatedChildInterests(kid, [acct])).toEqual(["Robotics", "AI"]);
  });

  it("linkedStudentAccountForChild resolves the right account (or null)", () => {
    const acct = studentAccount();
    expect(
      linkedStudentAccountForChild(
        { studentEmail: "byron@ohs.stanford.edu" },
        [acct],
      ),
    ).toBe(acct);
    expect(
      linkedStudentAccountForChild({ studentEmail: "nobody@ohs.stanford.edu" }, [acct]),
    ).toBeNull();
    expect(linkedStudentAccountForChild({ studentEmail: null }, [acct])).toBeNull();
  });
});

describe("buildDirectoryCard — aggregates a linked child's student-account tags", () => {
  function studentAccount(): SignupRow {
    return signup({
      id: "student-1",
      firstName: "Byron",
      lastName: "Lovelace",
      skillsets: ["Python"],
      parentInterests: null,
      extra: {
        accountType: "student",
        verifiedStudentEmails: ["byron@ohs.stanford.edu"],
        enrichment: {
          info: { bio: "", expertiseTags: ["AI", "Finance"], canHelpWith: [] },
        },
      },
    });
  }

  const noUrlsLocal = new Map<string, string>();

  it("shows the union on the child row AND in the card's combined interest chips", () => {
    const parent = signup({ parentInterests: ["Chess"] });
    const kid = child({
      interests: ["Finance", "Cars"],
      studentEmail: "byron@ohs.stanford.edu",
    });
    const card = buildDirectoryCard(parent, [kid], noUrlsLocal, 4, YEAR, [studentAccount()]);
    // Per-child interests are the aggregated union.
    expect(card.children[0]?.interests).toEqual(["Finance", "Cars", "AI", "Python"]);
    // Combined card chips = parent interests + the aggregated child interests.
    expect(card.interests).toEqual(["Chess", "Finance", "Cars", "AI", "Python"]);
  });

  it("leaves an unlinked child's interests untouched (default empty student list)", () => {
    const parent = signup({ parentInterests: ["Chess"] });
    const kid = child({ interests: ["Robotics"], studentEmail: null });
    const card = buildDirectoryCard(parent, [kid], noUrlsLocal, 4, YEAR);
    expect(card.children[0]?.interests).toEqual(["Robotics"]);
    expect(card.interests).toEqual(["Chess", "Robotics"]);
  });
});
