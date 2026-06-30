import { describe, expect, it } from "vitest";
import {
  buildDirectoryCard,
  childAge,
  directoryPhotoPaths,
  geocodeLocation,
  haversineMiles,
  isDirectoryVisible,
  isFamilyVerified,
  VERIFICATION_CUTOFF,
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

describe("isFamilyVerified (directory verification gate)", () => {
  it("treats approvalStatus=approved as verified", () => {
    expect(isFamilyVerified({ extra: { approvalStatus: "approved" }, createdAt: new Date() })).toBe(true);
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
      { firstName: "Byron", grade: "9th", interests: ["Robotics"], age: 14 },
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
