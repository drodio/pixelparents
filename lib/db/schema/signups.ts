import { pgTable, uuid, text, timestamp, jsonb, boolean, integer } from "drizzle-orm/pg-core";

export type Photo = {
  url: string;
  pathname: string;
  contentType?: string;
  width?: number;
  height?: number;
  // Optional caption with inline @[Name](childId) mention markers — who's in the
  // photo. Set by the uploading parent or an admin. See lib/mentions.ts.
  caption?: string;
};

// A family groups one or more parents (signups) who share the same children.
// `inviteToken` is the hard-to-guess secret a parent shares to invite a
// co-parent (spouse / other parent) to attach their own signup to this family.
export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  inviteToken: text("invite_token").notNull().unique(),
});

// Parent signup + per-parent profile. Each parent is its own row (own name /
// email / contact, editable only via their own thanks-page secret `?id=` link),
// but every parent in a family shares the same `familyId` (and thus children).
export const signups = pgTable("signups", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  // The family this parent belongs to. Always set (created with the draft).
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id),

  // Required contact info (step 1).
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  githubUsername: text("github_username").notNull(),

  // Optional recruitment profile (step 1).
  ohsAffiliation: text("ohs_affiliation"),
  technicalDepth: text("technical_depth"),
  linkedinUrl: text("linkedin_url"),
  skillsets: text("skillsets").array(),
  timeCommitment: text("time_commitment"),

  // Optional family-level profile (step 2 — entered once).
  city: text("city"),
  state: text("state"),
  // Country (optional). OHS is a global online school, so the community map plots
  // international families by country centroid; US families keep plotting by `state`.
  country: text("country"),
  parentInterests: text("parent_interests").array(),
  photos: jsonb("photos").$type<Photo[]>().default([]),

  // Secret share URL (off by default). The token lives in /p/<token>; we keep it
  // when the parent disables sharing so re-enabling restores the same URL.
  // shareFields holds the field keys the parent has chosen to make visible.
  shareEnabled: boolean("share_enabled").default(false).notNull(),
  shareToken: text("share_token").unique(),
  shareFields: text("share_fields").array(),
  // Who can view the /p share page: 'ohs' (signed-in OHS families) or
  // 'private' (just the owner). Default 'private'.
  shareVisibility: text("share_visibility").default("private").notNull(),

  // Reserved for future follow-up question sets.
  extra: jsonb("extra").$type<Record<string, unknown>>().default({}),
});

// One row per child (step 2 — repeats via "Done + add another child").
// Children are shared across a family: every parent in the family sees and edits
// the same kids. `familyId` is the grouping/sharing key; `signupId` is retained
// to record which parent originally added the child.
export const children = pgTable("children", {
  id: uuid("id").primaryKey().defaultRandom(),
  signupId: uuid("signup_id")
    .notNull()
    .references(() => signups.id, { onDelete: "cascade" }),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  firstName: text("first_name").notNull(),
  grade: text("grade"),
  // For a non-OHS child we collect birth year instead of a grade and derive age.
  birthYear: integer("birth_year"),
  interests: text("interests").array(),
  notes: text("notes"),
  // Photos of this specific child (separate from family-level signups.photos).
  photos: jsonb("photos").$type<Photo[]>().default([]),
  // The child's OHS (stanford.edu) student email, captured + confirmed via the
  // student-email verification flow. Its presence means a real OHS student email
  // was verified for this family; the family's approvalStatus is set to
  // "approved" at the same time. See lib/verify.ts + the thanks verify-actions.
  studentEmail: text("student_email"),
});

export type FamilyRow = typeof families.$inferSelect;
export type SignupRow = typeof signups.$inferSelect;
export type ChildRow = typeof children.$inferSelect;
