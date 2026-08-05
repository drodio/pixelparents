import { checkFields } from "@/lib/content-filter";
import { restrictionFor } from "@/lib/db/enforcement";

// One guard for every member-generated write (posts, replies, boards,
// contributions). Two independent checks, in the order that gives the clearest
// message:
//
//   1. Is this account restricted? A muted member is told when it lifts, not
//      just "no" — an unexplained silent failure reads as a bug.
//   2. Does the text violate content policy? The message NAMES the term, because
//      "rejected" with no reason is unactionable and makes a false positive
//      impossible to report.
//
// Restriction is checked first: telling a muted person to fix their wording
// would be misleading, since fixing it still wouldn't let them post.
export type WriteGuardResult = { ok: true } | { ok: false; error: string };

function fmtUntil(until: Date | null): string {
  if (!until) return "permanently";
  return `until ${until.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} PT`;
}

export async function guardWrite(
  signupId: string,
  fields: { value: string | null | undefined; label: string }[],
): Promise<WriteGuardResult> {
  const r = await restrictionFor(signupId);
  if (r.banned) {
    return {
      ok: false,
      error: `Your account is suspended ${fmtUntil(r.until)}${
        r.reason ? ` (${r.reason})` : ""
      }. Contact a GoPixel admin if you think this is a mistake.`,
    };
  }
  if (r.muted) {
    return {
      ok: false,
      error: `You can't post ${fmtUntil(r.until)}${
        r.reason ? ` (${r.reason})` : ""
      }. You can still read and reply to messages.`,
    };
  }

  const content = checkFields(fields);
  if (!content.allowed) return { ok: false, error: content.message };
  return { ok: true };
}
