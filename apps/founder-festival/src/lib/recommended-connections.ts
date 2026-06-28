// "Attendee Insights" (Recommended Connections): from a person's Festival profile,
// ALL of the event's learnings, and the roster of every OTHER attendee, Chief
// recommends the top-3 people to connect with (a paragraph each) plus a give/get
// match. Sibling of personalized-learnings.ts. Generation is async (chiefSubmit +
// the chief-insights-sweep cron) — see the connections route + lib/chief.ts.

// Canonical public base URL for the profile + event links in the prompt.
export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://festival.so").replace(/\/+$/, "");
}

export type AttendeeRef = { fullName: string; profileUrl: string | null };

// Compose the exact Recommended Connections prompt. `attendees` is every OTHER
// attendee (the subject is excluded by the caller). We append a clean-HTML
// instruction so the output renders alongside the other learnings tiers.
export function buildConnectionsPrompt(opts: {
  fullName: string;
  eventUrl: string;
  profileUrl: string;
  learningsText: string;
  attendees: AttendeeRef[];
}): string {
  const { fullName, eventUrl, profileUrl, learningsText, attendees } = opts;
  const roster = attendees.length
    ? attendees
        .map((a) => `- ${a.fullName}${a.profileUrl ? `: ${a.profileUrl}` : ""}`)
        .join("\n")
    : "(no other attendee profiles available)";

  return `I want you to help ${fullName} get more value from ${eventUrl}. Here is the Founder Festival profile for ${fullName}: ${profileUrl}.

Here are all the learnings from the event: ${learningsText || "(none provided)"}.

These are the profiles of the other people who attended the event:
${roster}

Based on the profile and everything you know about ${fullName}, and all the learnings from the event, and all the attendees of the event, do the following:

1) Recommend the top 3 people that ${fullName} should connect with after the event. For each person, provide a paragraph summary of why they should make that connection. What will they each learn from each other? What will be valuable to each of them?

2) Recommend 1 thing to "give" to and one thing to "get" from any people at the event where there's a strong match from a give or get perspective.

FORMAT: Output CLEAN HTML ONLY (no markdown, no <html>/<body> wrapper). Use <h3> for the two section headers ("Top 3 connections" and "Give & get"), <p> for prose, <strong> for each recommended person's name, and <ul>/<li> where a list reads better. No inline styles. When you name a person who has a Festival profile URL above, link their name with an <a href="…"> to that URL.`;
}
