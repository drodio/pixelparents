// Personalized copy helpers for the OHS student-email verification flow.
//
// The verify flow asks a parent to confirm their OHS student's stanford.edu
// email. Referencing the student by first name ("Have Maya check her Stanford
// email") makes it unambiguous *whose* email we mean — far warmer and clearer
// than the generic "your student". These helpers derive the student first
// name(s) from the family's children records and format them gracefully for
// zero, one, or many students. Pure + side-effect free so they're easy to test
// and safe to import from a server component.

// The grade we record for a child who is NOT an OHS student. Kept in lockstep
// with GRADES in lib/options.ts (the last entry). A child with any other grade
// is an OHS student whose Stanford email the family can verify.
const NON_OHS_GRADE = "Not an OHS child";

// Minimal shape we need off a ChildRow — keeps this module decoupled from the
// Drizzle schema and trivially testable with plain objects.
export type StudentNameSource = {
  firstName: string | null | undefined;
  grade: string | null | undefined;
};

// Is this child an OHS student (i.e. someone the family verifies via a Stanford
// email)? True when a real grade is set and it isn't the "Not an OHS child"
// sentinel. We intentionally include children with a blank/unknown grade OUT —
// we only personalize when we're confident the child is an OHS student.
function isOhsStudent(child: StudentNameSource): boolean {
  const grade = child.grade?.trim();
  return Boolean(grade) && grade !== NON_OHS_GRADE;
}

// The OHS-student first names for a family, trimmed, de-duped (case-insensitive,
// first spelling wins), and order-preserved. Children with no usable first name
// or who aren't OHS students are dropped. Returns [] when there's nothing to
// personalize with — callers fall back to generic copy.
export function studentFirstNames(children: readonly StudentNameSource[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const child of children) {
    if (!isOhsStudent(child)) continue;
    const name = child.firstName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

// Format a list of names into a natural English phrase:
//   []            -> ""            (caller should use generic copy instead)
//   ["A"]         -> "A"
//   ["A","B"]     -> "A or B"
//   ["A","B","C"] -> "A, B, or C"
// `conj` lets callers pick "or" (default) or "and".
export function formatNameList(names: readonly string[], conj: "or" | "and" = "or"): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ${conj} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, ${conj} ${names[names.length - 1]}`;
}
