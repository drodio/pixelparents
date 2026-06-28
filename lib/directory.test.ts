import { describe, expect, it } from "vitest";
import { buildDirectoryCard, directoryPhotoPaths, isDirectoryVisible } from "@/lib/directory";
import type { SignupRow, ChildRow } from "@/lib/db/schema/signups";

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
    extra: {},
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
});

describe("buildDirectoryCard (per-field redaction)", () => {
  const kids = [child()];
  const noUrls = new Map<string, string>();

  it("never exposes phone/email/notes on the card", () => {
    const card = buildDirectoryCard(signup(), kids, noUrls, 4);
    const serialized = JSON.stringify(card);
    expect(serialized).not.toContain("555-0100");
    expect(serialized).not.toContain("owner@example.com");
    expect(serialized).not.toContain("secret note");
  });

  it("with all fields shared, exposes name, location, children, interests", () => {
    const card = buildDirectoryCard(signup(), kids, noUrls, 4);
    expect(card.name).toBe("Ada Lovelace");
    expect(card.location).toBe("Palo Alto, CA");
    expect(card.children).toEqual([
      { firstName: "Byron", grade: "9th", interests: ["Robotics"] },
    ]);
    // Parent + child interests, deduped, in first-seen order.
    expect(card.interests).toEqual(["Chess", "AI", "Robotics"]);
  });

  it("omits location when 'location' is not shared", () => {
    const card = buildDirectoryCard(signup({ shareFields: ["interests"] }), kids, noUrls, 4);
    expect(card.location).toBeNull();
  });

  it("omits children (and their interests) when 'children' is not shared", () => {
    const card = buildDirectoryCard(
      signup({ shareFields: ["location", "interests"] }),
      kids,
      noUrls,
      4,
    );
    expect(card.children).toEqual([]);
    expect(card.interests).toEqual(["Chess", "AI"]); // no "Robotics"
  });

  it("omits parent interests when 'interests' is not shared", () => {
    const card = buildDirectoryCard(signup({ shareFields: ["children"] }), kids, noUrls, 4);
    expect(card.interests).toEqual(["Robotics"]); // only child interests
  });

  it("dedupes interests case-insensitively, keeping the first label", () => {
    const card = buildDirectoryCard(
      signup({ parentInterests: ["Chess", "chess"] }),
      [child({ interests: ["CHESS"] })],
      noUrls,
      4,
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
    const card = buildDirectoryCard(photoSignup, photoKids, urls, 4);
    expect(card.heroUrl).toBe("https://signed/fam");
    expect(card.thumbUrls).toEqual(["https://signed/kid"]);
  });

  it("yields no hero/thumbs when photos aren't shared", () => {
    const card = buildDirectoryCard(signup({ shareFields: ["interests"] }), photoKids, new Map(), 4);
    expect(card.heroUrl).toBeNull();
    expect(card.thumbUrls).toEqual([]);
  });
});
