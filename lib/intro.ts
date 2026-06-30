import { shareFieldsOrDefault } from "@/lib/share";
import { hasShareableProfile } from "@/lib/directory";
import { websiteUrlOf } from "@/lib/enrichment/profile";
import { isStudentAccount } from "@/lib/family-display";
import { shareUrlFor } from "@/lib/url";
import type { SignupRow } from "@/lib/db/schema/signups";

// The "you're connected" derivation layer for the Community board. When the
// author of a post accepts a response, that MUTUAL accept is consent to connect
// (the responder opted in by responding; the author opted in by accepting — a
// clean double opt-in). This module turns that consent into:
//   1) a `ConnectionParty` — the SAFE, share-honoring view of one person's
//      contact to reveal IN-APP to the other party, and
//   2) the body of a warm double-intro email sent to both.
//
// SECURITY / MINORS (paramount): a STUDENT account is a minor. We NEVER expose a
// student's raw email/phone. Instead we route the connection through the family
// — a parent/guardian in the same family — and surface the PARENT's shared
// contact, clearly labelled "contact the parent". This mirrors the directory's
// student-coarsening rules. We only ever reveal a field the person opted to
// share (shareFieldsOrDefault); if nothing is shareable we leak nothing and show
// an in-app message-channel hint instead. Pure + unit-tested so the gate can't
// silently regress — the page/action just render what this returns.

// One contact method to display on the connected card / in the intro email.
export type ContactMethod =
  | { kind: "email"; value: string; href: string }
  | { kind: "phone"; value: string; href: string }
  | { kind: "linkedin"; value: string; href: string }
  | { kind: "github"; value: string; href: string }
  | { kind: "website"; value: string; href: string }
  | { kind: "profile"; value: string; href: string };

// The fully-derived, reveal-safe view of one connected person, as seen by the
// OTHER party. Contains only what that person opted to share (and, for a minor,
// only their parent's shared contact). `viaParent` flags a minor routed through
// a guardian so the UI/email can say "reach <Student> through their parent
// <Parent>". `methods` is empty when nothing is shareable — then `messageHint`
// carries the fallback ("reply on the board") so we never leak anything.
export type ConnectionParty = {
  // The display name of the person you connected WITH. A student is first-name
  // only (minor coarsening); a parent is full name.
  name: string;
  isStudent: boolean;
  // Set for a minor whose contact is routed through a guardian: the parent's
  // display name. The card/email says "contact <Parent> (<Student>'s parent)".
  viaParentName: string | null;
  // The share-honored contact methods to reveal. May be empty.
  methods: ContactMethod[];
  // Shown when there are no shareable methods — an in-app channel hint, never PII.
  messageHint: string | null;
};

// Display name for a signup, honoring the directory's coarsening: a student
// (minor) is first-name only; a parent is "First Last".
export function displayNameOf(row: Pick<SignupRow, "firstName" | "lastName" | "extra">): string {
  if (isStudentAccount(row)) return row.firstName?.trim() || "A community member";
  return [row.firstName, row.lastName].map((s) => s?.trim()).filter(Boolean).join(" ") || "A community member";
}

// Build the share-honored contact methods for a SINGLE (non-minor) signup row.
// Each method is gated by exactly the same per-field share selection the /p
// profile + the author card on the post page use (shareFieldsOrDefault): email
// behind "email", phone behind "phone", LinkedIn/GitHub/website behind the
// default-OFF "links" field. The shareable profile link rides along whenever the
// member has one (it's already OHS-gated by hasShareableProfile). Returns [] when
// the row has no shareable profile at all (private / sharing disabled), so a
// member who shares nothing leaks nothing.
function methodsForRow(row: SignupRow): ContactMethod[] {
  if (!hasShareableProfile(row)) return [];
  const fields = new Set(shareFieldsOrDefault(row.shareFields));
  const methods: ContactMethod[] = [];

  if (fields.has("email")) {
    const email = row.email?.trim();
    if (email) methods.push({ kind: "email", value: email, href: `mailto:${email}` });
  }
  if (fields.has("phone")) {
    const phone = row.phone?.trim();
    if (phone) methods.push({ kind: "phone", value: phone, href: `tel:${phone}` });
  }
  if (fields.has("links")) {
    const linkedin = row.linkedinUrl?.trim();
    if (linkedin) methods.push({ kind: "linkedin", value: "LinkedIn", href: linkedin });
    const gh = row.githubUsername?.trim();
    if (gh) methods.push({ kind: "github", value: "GitHub", href: `https://github.com/${gh}` });
    const site = websiteUrlOf((row.extra ?? {}) as Record<string, unknown>);
    if (site) methods.push({ kind: "website", value: "Website", href: site });
  }
  // The shareable /p profile link — always safe to offer here (the gate is the
  // OHS-family check, already passed by both connected parties).
  if (row.shareToken) {
    methods.push({ kind: "profile", value: "Profile", href: shareUrlFor(row.shareToken) });
  }
  return methods;
}

// The first parent/guardian in a family who has at least one shareable contact
// method — the person a minor's connection is routed through. Falls back to the
// first parent (for naming only) if none are shareable.
function firstParentOf(parents: SignupRow[]): { row: SignupRow; methods: ContactMethod[] } | null {
  if (parents.length === 0) return null;
  for (const p of parents) {
    const methods = methodsForRow(p);
    if (methods.length > 0) return { row: p, methods };
  }
  return { row: parents[0], methods: [] };
}

// Derive the reveal-safe ConnectionParty for `person` as seen by the other side.
// `familyParents` is the set of PARENT (non-student) signups in `person`'s family
// — required to route a minor's connection. For a parent author/responder this
// is unused; for a student it's how we surface a guardian's contact instead of
// the student's raw details.
//
// THE MINOR RULE: if `person` is a student account, we do NOT read their email /
// phone / links at all. We find a guardian in their family and reveal the
// GUARDIAN's shared contact, labelled so the other party knows to reach the
// student through their parent. If no guardian is reachable, methods is empty and
// we fall back to the in-app message hint — never the student's own PII.
export function deriveConnectionParty(
  person: SignupRow,
  familyParents: SignupRow[],
): ConnectionParty {
  const isStudent = isStudentAccount(person);
  const name = displayNameOf(person);

  if (isStudent) {
    // Route through a guardian. NEVER touch the student's own contact fields.
    const guardians = familyParents.filter((p) => !isStudentAccount(p));
    const parent = firstParentOf(guardians);
    if (parent && parent.methods.length > 0) {
      return {
        name,
        isStudent: true,
        viaParentName: displayNameOf(parent.row),
        methods: parent.methods,
        messageHint: null,
      };
    }
    // A minor with no reachable guardian contact: leak nothing.
    return {
      name,
      isStudent: true,
      viaParentName: parent ? displayNameOf(parent.row) : null,
      methods: [],
      messageHint:
        `${name} is a student. Reply on their Community post to coordinate — ` +
        `we keep students' direct contact private and route it through a parent.`,
    };
  }

  // A parent/guardian: reveal their own share-honored contact.
  const methods = methodsForRow(person);
  if (methods.length > 0) {
    return { name, isStudent: false, viaParentName: null, methods, messageHint: null };
  }
  return {
    name,
    isStudent: false,
    viaParentName: null,
    methods: [],
    messageHint: `${name} hasn't shared contact details — reply on the Community post to reach them.`,
  };
}

// --- The warm double-intro email -------------------------------------------

// A short human label for each contact method, used to render the email's
// plain-text contact block ("Email: a@b.com", "LinkedIn: https://…").
const METHOD_LABEL: Record<ContactMethod["kind"], string> = {
  email: "Email",
  phone: "Phone",
  linkedin: "LinkedIn",
  github: "GitHub",
  website: "Website",
  profile: "Profile",
};

// Render one party's contact block for the intro email. For a minor routed
// through a guardian we lead with the "via parent" line so the recipient knows
// who to actually contact. Falls back to the message hint when nothing's shared.
export function contactLinesFor(party: ConnectionParty): string[] {
  const lines: string[] = [];
  if (party.viaParentName) {
    lines.push(`(${party.name} is a student — please reach them through their parent, ${party.viaParentName}.)`);
  }
  if (party.methods.length === 0) {
    lines.push(party.messageHint ?? "No contact shared — reply on the Community post.");
    return lines;
  }
  for (const m of party.methods) {
    lines.push(`- ${METHOD_LABEL[m.kind]}: ${m.value === m.href ? m.value : m.href.replace(/^(mailto:|tel:)/, "")}`);
  }
  return lines;
}

// Compose the warm DOUBLE intro email connecting `asker` and `responder` after a
// mutual accept. Following double-opt-in intro etiquette: a clear "A <> B"
// subject with the topic, context on WHY they're connected (the post + what was
// offered), each side's shared contact, and a friendly nudge. The SAME body goes
// to both people (each can see the other's shared contact); the post itself is
// linked so they can pick up the thread there. `topic` is the post title.
export function buildIntroEmail(input: {
  asker: ConnectionParty;
  responder: ConnectionParty;
  // Which side of the post each person is on, for natural phrasing. For an Ask
  // the author needed help and the responder offered; for an Offer it's flipped.
  isOffer: boolean;
  topic: string;
  offerNote: string;
  postUrl: string;
}): { subject: string; text: string } {
  const { asker, responder, isOffer, topic, offerNote, postUrl } = input;
  const subject = `Intro: ${asker.name} <> ${responder.name} — ${topic}`;

  // Who-helps-whom framing. On an Ask the responder is helping the author; on an
  // Offer the author is helping the responder.
  const context = isOffer
    ? `${responder.name} took ${asker.name} up on their offer "${topic}" on the Pixel Parents Community board.`
    : `${responder.name} offered to help ${asker.name} with "${topic}" on the Pixel Parents Community board.`;

  const text = [
    `You're connected! 🎉`,
    ``,
    context,
    offerNote.trim() ? `` : null,
    offerNote.trim() ? `What was offered: ${offerNote.trim()}` : null,
    ``,
    `Here's how to reach each other — only what each of you chose to share:`,
    ``,
    `${asker.name}:`,
    ...contactLinesFor(asker).map((l) => `  ${l}`),
    ``,
    `${responder.name}:`,
    ...contactLinesFor(responder).map((l) => `  ${l}`),
    ``,
    `You can also pick up the conversation right on the post:`,
    postUrl,
    ``,
    `No pressure either way — if the timing isn't right, just reply on the board.`,
    `Have a great connection!`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return { subject, text };
}
