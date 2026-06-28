import { describe, it, expect } from "vitest";
import { buildConnectionIntroEmail } from "@/lib/email";

const base = {
  nameA: "Ada Lovelace",
  nameB: "Alan Turing",
  eventTitle: "Founder Dinner",
  eventUrl: "https://festival.so/events/founder-dinner",
  dateStr: "June 3, 2026",
  profileUrlA: "https://festival.so/profile/founder/ada-lovelace",
  profileUrlB: "https://festival.so/profile/founder/alan-turing",
};

describe("buildConnectionIntroEmail", () => {
  it("puts both names, the event, and the date in the subject", () => {
    const { subject } = buildConnectionIntroEmail(base);
    expect(subject).toBe("Festival: Connecting Ada Lovelace ←→ Alan Turing from Founder Dinner on June 3, 2026");
  });

  it("links the event name and lists both profile links + the sign-off", () => {
    const { html } = buildConnectionIntroEmail(base);
    expect(html).toContain('<a href="https://festival.so/events/founder-dinner">Founder Dinner</a>');
    // Name links to profile and is bold; title/dossier omitted when not provided.
    expect(html).toContain('<a href="https://festival.so/profile/founder/ada-lovelace"><strong>Ada Lovelace</strong></a></li>');
    expect(html).toContain('<a href="https://festival.so/profile/founder/alan-turing"><strong>Alan Turing</strong></a></li>');
    expect(html).toContain("Hope it&#39;s a valuable connection!");
    // The DROdio sign-off is no longer baked into the builder — it's the central
    // editable signature appended at send time (see @/lib/email-signature).
    expect(html).not.toContain("#Velocity");
  });

  it("shows each person's title (plain) and a dossier link only when one exists", () => {
    const { html } = buildConnectionIntroEmail({
      ...base,
      titleA: "5x-exited YC W17 founder now building Chief",
      dossierUrlA: "https://chief.bot/shared/chat/abc?leaf=m1",
      titleB: "Co-Founder & CCO of Storytell.ai",
      // B has no dossier.
    });
    expect(html).toContain(
      '<a href="https://festival.so/profile/founder/ada-lovelace"><strong>Ada Lovelace</strong></a>: 5x-exited YC W17 founder now building Chief (+ view their <a href="https://chief.bot/shared/chat/abc?leaf=m1">Deep Intelligence dossier</a>)',
    );
    // B: title shown, but no dossier link (bullet ends right after the title).
    expect(html).toContain(
      '<a href="https://festival.so/profile/founder/alan-turing"><strong>Alan Turing</strong></a>: Co-Founder &amp; CCO of Storytell.ai</li>',
    );
  });

  it("adds a chat deep-link (?section=chat) to the event", () => {
    const { html } = buildConnectionIntroEmail(base);
    expect(html).toContain(
      'You can also chat, reply &amp; upvote comments with other event attendees <a href="https://festival.so/events/founder-dinner?section=chat">right here</a>.',
    );
  });

  it("escapes HTML in names", () => {
    const { html } = buildConnectionIntroEmail({ ...base, nameA: "A <b>& co" });
    expect(html).toContain("A &lt;b&gt;&amp; co");
    expect(html).not.toContain("<b>&");
  });
});
