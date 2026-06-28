// The exact prompt sent to Chief's research mode to produce a PUBLIC, professional
// dossier on a Founder Festival profile. Kept in its own module so the wording can
// be tuned without touching the run/sweep plumbing.
//
// Two kinds of placeholders in the source prompt:
//   • {{ff.*}}  — Founder Festival values WE fill in before sending (name, url,
//     title, location). Per the spec, the "name (full name)" form drops the parens
//     when there's no nickname (e.g. "DROdio (Daniel R. Odio)" vs "Daniel R. Odio").
//   • [bracketed] — instructions left verbatim for Chief to act on (including the
//     [red circle emoji] / [orange emoji] markers).

export type DossierSubject = {
  nickname: string | null;
  fullName: string | null;
  // Canonical Founder Festival profile URL (absolute).
  ffUrl: string;
  // Optional grounding hints; rendered as "Unknown" when blank.
  title?: string | null;
  location?: string | null;
};

export function buildDossierPrompt(s: DossierSubject): string {
  const nick = s.nickname?.trim() || null;
  const full = s.fullName?.trim() || null;
  // The name shown in section headers: nickname if present, else full name.
  const display = nick || full || "this person";
  // The "Nickname (Full Name)" form — parens only when both exist.
  const nameWithFull = nick && full ? `${nick} (${full})` : nick || full || display;
  const title = s.title?.trim() || "Unknown";
  const location = s.location?.trim() || "Unknown";

  return `You are producing a professional intelligence dossier on a named individual for a
business audience. Accuracy and sourcing are mandatory.

SUBJECT
- Name: ${nameWithFull}
- Founder Festival profile: ${s.ffUrl}
- Title/role (as known): ${title}
- Location (as known): ${location}

Use the Founder Festival profile as the authoritative anchor to confirm you are
researching the correct person. If you cannot confidently disambiguate this exact
individual from others with similar names, say so explicitly and do not guess.

WHAT TO PRODUCE:

A well-organized in-depth report dossier in text output, in the following format:

# Deep Intelligence Dossier on ${nameWithFull}

[red circle emoji]: **This dossier is AI-generated based on publicly available data and may contain inaccuracies. Verify underlying data before relying on any of the information below.**

## ${display}'s Likely Superpower:

[Summarize what the person's likely superpower is. Their "superpower" is something they are better at than most of the world that gives them energy.]

## ${display}  At A Glance:

1. **Professional summary:** [— who they are and what they're known for (2–3 sentences).]

2. **Career history:** [Bullet point list of companies, roles, dates, and notable transitions]

3. **Companies founded or led:** [Bullet point list with stage, sector, what the company does, funding raised (rounds, amounts, lead investors) where publicly reported.]

4. **Notable products, launches, exits, acquisitions, or IPOs:** [bullet point list with a one sentence summary of each]

5. **Known investments, board seats, and advisory roles:** [bullet point list with a one sentence summary of each]

6. **Public writing, talks, patents, press coverage, and other public output:** [bullet point list with a one sentence summary of each]

7. **Education and professional credentials:** [bullet point list with a one sentence summary of each]

## ${display}'s Inferred Interpersonal Characteristics:

[orange emoji] These characteristics are inferred from public data and are AI generated. Verify these with the person before relying on them.

- [Create a list of 2 to 10 inferred interpersonal characteristics that could be helpful for others to know and understand about the person's working style, beliefs, preferences, and other helpful work characteristics. The goal is to help others work as effectively as possible with this person. Be sure to state these as your inferences and not as facts.]

## Fun Facts About ${display}:

- [Curate 2 to 10 verifiable facts about the person that help round them out to go beyond just a work dossier. Bonus if these facts are non-obvious or not work related.]


RULES:
- Use only publicly available, verifiable information from reputable sources.
- Cite a source (with linked URL citation) for every non-trivial factual claim. Prefer primary
  sources (company sites, SEC/Crunchbase, the person's own posts) and reputable
  press over aggregators.
- Clearly separate confirmed facts from anything uncertain. Flag unverified items
  as "unconfirmed" rather than stating them as fact.
- Do NOT include: personal/private-life details beyond publicly reported data.
- Beyond the specific instructions above for inferring working style and interpersonal characteristics, do NOT speculate about character or personality, "red flags," rumors, or any claim you cannot source.
- If a section has no reliable public information, write "No public information
  found" for that section rather than inventing content.
- Be neutral and factual in tone; offer a helpful but clear-eyed perspective. This is a reference document, not an opinion piece.`;
}
