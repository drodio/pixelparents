// Pure, DB-free constants + types for event priorities. Kept in its own module
// (NO "@/db" import) so client components — e.g. EventPrioritiesEditor — can use
// the taxonomy/colors WITHOUT pulling the Neon DB client into the browser bundle.
// (A top-level `import { db } from "@/db"` runs neon() at module-eval; in the
// browser DATABASE_URL is undefined, so it throws "No database connection
// string…", which crashed the whole /admin/events/[id]/recap page.)
// The server module "@/lib/event-priorities" re-exports these.

// Same taxonomy as founder recommendation priorities (see Recommendations.tsx),
// so event priorities can later be matched against founder priorities.
export const PRIORITY_CATEGORIES = [
  "fundraising",
  "hiring",
  "intros",
  "tactical",
  "positioning",
  "wellbeing",
] as const;
export type PriorityCategory = (typeof PRIORITY_CATEGORIES)[number];

export const CATEGORY_COLORS: Record<PriorityCategory, string> = {
  fundraising: "text-emerald-400 border-emerald-400/40",
  hiring: "text-blue-400 border-blue-400/40",
  intros: "text-violet-400 border-violet-400/40",
  tactical: "text-amber-400 border-amber-400/40",
  positioning: "text-pink-400 border-pink-400/40",
  wellbeing: "text-zinc-400 border-zinc-400/40",
};

export function isPriorityCategory(s: string): s is PriorityCategory {
  return (PRIORITY_CATEGORIES as readonly string[]).includes(s);
}

export type PriorityInput = { text: string; category: string };
