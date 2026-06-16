import { z } from "zod";

// Shape of a self-serve API-key request submitted from the /developers console.
// Free-text fields are length-capped so a hostile caller can't post megabytes;
// email is format-checked so the approval contact is reachable.
export const keyRequestSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: z.email("Enter a valid email").max(200),
  intended_use: z
    .string()
    .trim()
    .min(1, "Tell us what you're building")
    .max(2000),
  label: z.string().trim().max(60).optional(),
});

export type KeyRequest = z.infer<typeof keyRequestSchema>;
