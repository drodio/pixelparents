import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

// Content filter for anything a member can publish (posts, replies, board
// titles, contributions, bios).
//
// This community includes minors, so profanity and sexual content are blocked at
// the write path rather than cleaned up afterwards by a moderator. We use
// `obscenity` rather than a naive word list because a word list is trivially
// defeated: it catches "fvck" and spaced/leetspeaked variants that a
// `.includes()` check would sail past.
//
// IMPORTANT — the block message names the trigger. Being told "your post was
// rejected" with no reason is infuriating and unactionable, and it also makes
// false positives impossible for a member to report intelligibly.

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export type ContentVerdict =
  | { allowed: true }
  | { allowed: false; triggers: string[]; message: string };

// The Scunthorpe problem: legitimate words that contain a flagged substring, and
// terms this community uses normally. Checked BEFORE reporting a trigger so a
// parent writing about "Essex" or a class on "Middlesex" isn't blocked.
const ALLOWLIST = [
  "essex",
  "middlesex",
  "sussex",
  "scunthorpe",
  "analysis",
  "analyst",
  "analytical",
  "assignment",
  "assess",
  "assessment",
  "class",
  "classic",
  "classroom",
  "grape",
  "shiitake",
  "cockpit",
  "therapist",
  "specialist",
];

function isAllowlisted(word: string, text: string): boolean {
  const lower = text.toLowerCase();
  return ALLOWLIST.some((safe) => safe.includes(word.toLowerCase()) && lower.includes(safe));
}

// Human-readable label for what was matched, used in the block message.
function describeTriggers(text: string): string[] {
  const found = new Set<string>();
  for (const match of matcher.getAllMatches(text, true)) {
    const meta = englishDataset.getPayloadWithPhraseMetadata(match);
    const word = meta.phraseMetadata?.originalWord ?? "";
    if (!word) continue;
    if (isAllowlisted(word, text)) continue;
    found.add(word);
  }
  return [...found];
}

// Check one field of user-submitted text.
//
// `label` names the field ("post", "reply", "board title") so the message can be
// specific about WHERE the problem is when a form has several inputs.
export function checkContent(text: string | null | undefined, label = "content"): ContentVerdict {
  if (!text || !text.trim()) return { allowed: true };
  const triggers = describeTriggers(text);
  if (triggers.length === 0) return { allowed: true };

  // Quote the terms back so the member can find and fix them. Sorted for a
  // stable message (same input always produces the same string).
  const quoted = triggers
    .slice()
    .sort()
    .map((t) => `"${t}"`)
    .join(", ");
  return {
    allowed: false,
    triggers,
    message: `Content policies do not permit ${quoted} in your ${label}. Please edit and try again.`,
  };
}

// Check several fields at once and return the FIRST failure, so a caller can
// guard a whole submission with one call.
export function checkFields(
  fields: { value: string | null | undefined; label: string }[],
): ContentVerdict {
  for (const f of fields) {
    const v = checkContent(f.value, f.label);
    if (!v.allowed) return v;
  }
  return { allowed: true };
}
