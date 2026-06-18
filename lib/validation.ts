import { z } from "zod";
import {
  OHS_AFFILIATIONS,
  TECHNICAL_DEPTH,
  SKILLSETS,
  TIME_COMMITMENT,
  GRADES,
} from "./options";

// Allow an enum value or empty string (optional select left blank).
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.enum(values), z.literal("")]).optional();

export const signupSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  phone: z.string().trim().min(1, "Phone is required").max(40),
  // Optional — empty allowed; if provided, must be a valid GitHub handle.
  githubUsername: z
    .string()
    .trim()
    .max(39)
    .regex(/^[A-Za-z0-9-]*$/, "Use only letters, numbers, and dashes"),
  ohsAffiliation: z.enum(OHS_AFFILIATIONS, {
    error: "Please select your OHS affiliation",
  }),
  technicalDepth: optionalEnum(TECHNICAL_DEPTH),
  // LinkedIn is captured as a handle (the part after linkedin.com/in/).
  linkedinHandle: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9._-]*$/, "Use only letters, numbers, dots, dashes")
    .optional(),
  skillsets: z.array(z.enum(SKILLSETS)).optional(),
  timeCommitment: optionalEnum(TIME_COMMITMENT),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const familySchema = z.object({
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  parentInterests: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
});

export const childSchema = z.object({
  firstName: z.string().trim().min(1, "Child's first name is required").max(100),
  grade: z.union([z.enum(GRADES), z.literal("")]).optional(),
  // Birth year (for a "Not an OHS child"); age is derived, not stored.
  birthYear: z.coerce.number().int().min(1980).max(2100).optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type FamilyInput = z.infer<typeof familySchema>;
export type ChildInput = z.infer<typeof childSchema>;

// Build a full LinkedIn URL from a handle (or null if blank).
export function linkedinUrlFromHandle(handle?: string | null): string | null {
  const h = (handle ?? "").trim();
  return h ? `https://linkedin.com/in/${h}` : null;
}

// --- Developer API: access request (from the authed /account page) ---
// Name + email come from the Clerk session, so the form only collects this.
export const apiRequestSchema = z.object({
  intended_use: z
    .string()
    .trim()
    .min(1, "Tell us what you're building")
    .max(2000),
});

export type ApiRequest = z.infer<typeof apiRequestSchema>;
