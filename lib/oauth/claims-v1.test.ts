import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  buildIdTokenClaims,
  roleOf,
  gradeBandOf,
  studentGradeBand,
  ohsVerifiedMethod,
  candidateGradesForStudent,
  type SignupForClaims,
} from "./claims";
import { __resetPepperForTests } from "./secrets";
import { OHS_AFFILIATIONS } from "@/lib/options";

// family_id needs the pepper (OAUTH_PRIVATE_KEY).
beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  process.env.OAUTH_PRIVATE_KEY = privateKey;
  __resetPepperForTests();
});

const POST_CUTOFF = new Date("2026-09-01T00:00:00Z");
const CLIENT = "ppc_live_test";

function mk(over: Partial<SignupForClaims> = {}): SignupForClaims {
  return {
    extra: { approvalStatus: "approved" },
    createdAt: POST_CUTOFF,
    ohsAffiliation: OHS_AFFILIATIONS[1], // existing parent
    familyId: "fam-uuid-1",
    ...over,
  } as SignupForClaims;
}

describe("roleOf", () => {
  it("classifies a student account", () => {
    expect(roleOf(mk({ extra: { accountType: "student", approvalStatus: "approved" } }))).toBe("student");
  });
  it("classifies an alumni by affiliation", () => {
    expect(roleOf(mk({ ohsAffiliation: OHS_AFFILIATIONS[4] }))).toBe("alumni");
  });
  it("defaults to parent", () => {
    expect(roleOf(mk())).toBe("parent");
  });
  it("is undefined for no signup", () => {
    expect(roleOf(null)).toBeUndefined();
  });
});

describe("gradeBandOf — coarsening, NEVER the exact grade", () => {
  it("bands middle and high", () => {
    expect(gradeBandOf("7th")).toBe("middle");
    expect(gradeBandOf("8th")).toBe("middle");
    expect(gradeBandOf("9th")).toBe("high");
    expect(gradeBandOf("12th")).toBe("high");
  });
  it("returns undefined for non-OHS / unknown grades", () => {
    expect(gradeBandOf("Not an OHS child")).toBeUndefined();
    expect(gradeBandOf(null)).toBeUndefined();
    expect(gradeBandOf("Kindergarten")).toBeUndefined();
  });
});

describe("studentGradeBand — only for a student subject", () => {
  const student = mk({ extra: { accountType: "student", approvalStatus: "approved" } });
  it("bands a student's own grade", () => {
    expect(studentGradeBand(student, ["9th"])).toBe("high");
    expect(studentGradeBand(student, ["7th"])).toBe("middle");
  });
  it("a parent gets no grade band (don't mix a minor's data into a parent token)", () => {
    expect(studentGradeBand(mk(), ["9th"])).toBeUndefined();
  });
});

describe("ohsVerifiedMethod", () => {
  it("student_email vs admin vs grandfathered", () => {
    expect(ohsVerifiedMethod(mk({ extra: { approvalStatus: "approved", approvalBy: "student-email" } }))).toBe("student_email");
    expect(ohsVerifiedMethod(mk({ extra: { approvalStatus: "approved", approvalBy: "api-access" } }))).toBe("admin");
    expect(ohsVerifiedMethod(mk({ extra: { approvalStatus: "approved", approvalBy: "Daniel" } }))).toBe("admin");
    // grandfathered: created before cutoff, no approval
    expect(ohsVerifiedMethod(mk({ extra: {}, createdAt: new Date("2025-01-01") }))).toBe("grandfathered");
  });
  it("is undefined for an unverified user", () => {
    expect(ohsVerifiedMethod(mk({ extra: { approvalStatus: "pending" } }))).toBeUndefined();
  });
});

describe("buildIdTokenClaims — V1 scopes, gating, and student coarsening", () => {
  it("emits role/family only when consented; family_id is HMAC'd (not the raw uuid)", () => {
    const c = buildIdTokenClaims({
      scopes: ["openid", "role", "family"],
      clientId: CLIENT,
      email: "p@x.com",
      signup: mk(),
    });
    expect(c.role).toBe("parent");
    expect(c.family_id).toBeTruthy();
    expect(c.family_id).not.toContain("fam-uuid-1");
    // email not requested → omitted
    expect(c.email).toBeUndefined();
  });

  it("a STUDENT requesting grade_band gets a BAND, never the exact grade", () => {
    const c = buildIdTokenClaims({
      scopes: ["openid", "ohs_verified", "role", "grade_band"],
      clientId: CLIENT,
      email: "s@stanford.edu",
      signup: mk({ extra: { accountType: "student", approvalStatus: "approved" }, ohsAffiliation: OHS_AFFILIATIONS[3] }),
      childGrades: ["10th"],
    });
    expect(c.role).toBe("student");
    expect(c.grade_band).toBe("high");
    expect(c.ohs_verified).toBe(true);
    // No exact-grade leakage anywhere in the claims.
    expect(JSON.stringify(c)).not.toContain("10th");
  });

  it("a parent never gets a grade_band even with the scope", () => {
    const c = buildIdTokenClaims({
      scopes: ["openid", "grade_band"],
      clientId: CLIENT,
      email: "p@x.com",
      signup: mk(),
      childGrades: ["9th"],
    });
    expect(c.grade_band).toBeUndefined();
  });

  it("the same student gets a DIFFERENT family_id in two different clients", () => {
    const s = mk({ extra: { accountType: "student", approvalStatus: "approved" } });
    const a = buildIdTokenClaims({ scopes: ["openid", "family"], clientId: "ppc_live_a", email: null, signup: s });
    const b = buildIdTokenClaims({ scopes: ["openid", "family"], clientId: "ppc_live_b", email: null, signup: s });
    expect(a.family_id).toBeTruthy();
    expect(a.family_id).not.toBe(b.family_id);
  });
});

describe("candidateGradesForStudent — prefers the student's OWN linked grade", () => {
  const student = mk({ extra: { accountType: "student", approvalStatus: "approved" } });
  const kids = [
    { grade: "12th", studentEmail: "me@ohs.stanford.edu" },
    { grade: "7th", studentEmail: "sibling@ohs.stanford.edu" },
  ];
  it("uses the grade of the child row whose email matches the student's verified email", () => {
    const grades = candidateGradesForStudent(student, kids, ["me@ohs.stanford.edu"]);
    expect(grades).toEqual(["12th"]);
  });
  it("falls back to all family kids when no email link resolves", () => {
    const grades = candidateGradesForStudent(student, kids, []);
    expect(grades).toEqual(["12th", "7th"]);
  });
  it("returns [] for a non-student", () => {
    expect(candidateGradesForStudent(mk(), kids, [])).toEqual([]);
  });
});
