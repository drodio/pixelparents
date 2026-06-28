// Pure helpers for bulk-scoring-job run history. Re-running a job CLONES it into
// a new run (rather than resetting the old one in place), so each run is its own
// dated record; and because an evaluation row is overwritten per re-score, each
// run snapshots its own score so historical runs stay truthful.

export type JobItemInputs = {
  inputRaw: string;
  inputName: string | null;
  inputCompany: string | null;
  linkedinUrl: string | null;
};

// Build a fresh item for a re-run clone: copy the inputs; an item with a
// resolved URL goes straight to "resolved" (→ scoring), one without goes to
// "pending" (→ re-resolve the handle). No evaluationId — the fresh run scores.
export function cloneJobItemForRerun(
  src: JobItemInputs,
): JobItemInputs & { status: "pending" | "resolved" } {
  return {
    inputRaw: src.inputRaw,
    inputName: src.inputName,
    inputCompany: src.inputCompany,
    linkedinUrl: src.linkedinUrl,
    status: src.linkedinUrl ? "resolved" : "pending",
  };
}

// The score to display for a run's item: the snapshot taken at run time if
// present (truthful history), else the live eval value (legacy rows scored
// before snapshots). A snapshot of 0 is a real value, not "missing".
export function runScore(
  snapshot: number | null | undefined,
  liveEval: number | null | undefined,
): number | null {
  return snapshot ?? liveEval ?? null;
}
