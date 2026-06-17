import { pgTable, uuid, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

export type Photo = {
  url: string;
  pathname: string;
  contentType?: string;
  width?: number;
  height?: number;
};

// Parent signup + family-level profile (1:1 with a parent).
export const signups = pgTable("signups", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

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
  parentInterests: text("parent_interests").array(),
  photos: jsonb("photos").$type<Photo[]>().default([]),

  // Secret share URL (off by default). The token lives in /p/<token>; we keep it
  // when the parent disables sharing so re-enabling restores the same URL.
  // shareFields holds the field keys the parent has chosen to make visible.
  shareEnabled: boolean("share_enabled").default(false).notNull(),
  shareToken: text("share_token").unique(),
  shareFields: text("share_fields").array(),

  // Reserved for future follow-up question sets.
  extra: jsonb("extra").$type<Record<string, unknown>>().default({}),
});

// One row per child (step 2 — repeats via "Done + add another child").
export const children = pgTable("children", {
  id: uuid("id").primaryKey().defaultRandom(),
  signupId: uuid("signup_id")
    .notNull()
    .references(() => signups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  firstName: text("first_name").notNull(),
  grade: text("grade"),
  interests: text("interests").array(),
  notes: text("notes"),
});

export type SignupRow = typeof signups.$inferSelect;
export type ChildRow = typeof children.$inferSelect;
