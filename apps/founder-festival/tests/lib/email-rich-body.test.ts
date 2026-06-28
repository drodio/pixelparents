import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/email-variables";
import {
  renderForRecipient,
  looksLikeHtmlBody,
  sanitizeEmailHtml,
  linkifyOutsideAnchors,
  unwrapPillSpans,
  normalizeEmailBlocks,
} from "@/lib/email-render";

const event = {
  title: "Founder Summit",
  descriptionHtml: "<p>An evening for founders</p>",
  slug: "founder-summit",
  startsAt: new Date("2026-06-12T01:00:00Z"),
  venue: "SF",
  attendeeCount: 12,
};

const recipient = {
  toEmail: "jane@x.com",
  clerkUserId: "u1",
  evaluationId: "e1",
  fullName: "Jane Public",
  nickname: null,
  profileHref: "/profile/jane",
  companyName: '<b>Acme</b> & Co',
};

function render(bodyTemplate: string, subjectTemplate = "Hi") {
  return renderForRecipient({
    subjectTemplate,
    bodyTemplate,
    signatureText: "DROdio",
    recipient,
    event,
    personalizedHtml: null,
    baseUrl: "https://festival.so",
  });
}

describe("renderTemplate escapeValues", () => {
  it("escapes substituted values for HTML when enabled", () => {
    const out = renderTemplate('{{first-name}}', { "first-name": '<a>&"x' }, { escapeValues: true });
    expect(out).toBe("&lt;a&gt;&amp;&quot;x");
  });
  it("leaves values raw when not enabled (legacy plain path)", () => {
    expect(renderTemplate("{{first-name}}", { "first-name": "<x>" })).toBe("<x>");
  });
});

describe("looksLikeHtmlBody", () => {
  it("detects real tags", () => {
    expect(looksLikeHtmlBody("<p>hi</p>")).toBe(true);
    expect(looksLikeHtmlBody('<a href="x">y</a>')).toBe(true);
    expect(looksLikeHtmlBody("<strong>x</strong>")).toBe(true);
  });
  it("treats marker/plain text (incl. stray <) as NOT html", () => {
    expect(looksLikeHtmlBody("Hi {{first-name}}")).toBe(false);
    expect(looksLikeHtmlBody("<3 you")).toBe(false);
    expect(looksLikeHtmlBody("")).toBe(false);
  });
});

describe("sanitizeEmailHtml", () => {
  it("strips script/style, on* handlers (quoted + unquoted), and js: in hrefs", () => {
    const dirty = `<p onclick="bad()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>`;
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain("hi");
  });
  it("neutralizes data:/vbscript: inside href/src", () => {
    expect(sanitizeEmailHtml('<a href="data:text/html,x">y</a>')).not.toMatch(/data:/i);
    expect(sanitizeEmailHtml('<a href="vbscript:msgbox">y</a>')).not.toMatch(/vbscript:/i);
  });
  it("preserves a literal 'javascript:' written in body TEXT", () => {
    const clean = sanitizeEmailHtml("<p>Use the javascript: URL scheme carefully.</p>");
    expect(clean).toContain("javascript: URL scheme");
  });
});

describe("linkifyOutsideAnchors", () => {
  it("linkifies bare URLs but leaves existing anchors alone", () => {
    const out = linkifyOutsideAnchors('see https://a.com and <a href="https://b.com">b</a>');
    // bare URL got wrapped
    expect(out).toContain('<a href="https://a.com"');
    // existing anchor not double-wrapped
    expect(out.match(/href="https:\/\/b\.com"/g)?.length).toBe(1);
    expect(out).not.toContain('href="https://b.com"></a><a');
  });
  it("does not swallow trailing punctuation into the href", () => {
    const out = linkifyOutsideAnchors("visit https://a.com/x. ok");
    expect(out).toContain('href="https://a.com/x"');
    expect(out).not.toContain('href="https://a.com/x."');
    expect(out).toContain("</a>. ok");
  });
  it("keeps a balanced closing paren inside the URL", () => {
    const out = linkifyOutsideAnchors("see https://en.wikipedia.org/wiki/Foo_(bar) now");
    expect(out).toContain('href="https://en.wikipedia.org/wiki/Foo_(bar)"');
  });
  it("still strips an unbalanced trailing paren", () => {
    const out = linkifyOutsideAnchors("(see https://a.com/x) ok");
    expect(out).toContain('href="https://a.com/x"');
    expect(out).not.toContain('href="https://a.com/x)"');
  });
});

describe("unwrapPillSpans", () => {
  it("unwraps pill scaffolding to its inner value", () => {
    expect(unwrapPillSpans('<span data-var-pill data-key="nickname" class="var-pill">Jane</span>')).toBe("Jane");
  });
  it("leaves ordinary spans/markup untouched", () => {
    expect(unwrapPillSpans("<strong>x</strong><span>y</span>")).toBe("<strong>x</strong><span>y</span>");
  });
});

describe("normalizeEmailBlocks", () => {
  it("turns an empty paragraph into a visible blank line and pins p margins", () => {
    const out = normalizeEmailBlocks("<p>A</p><p></p><p>B</p>");
    expect(out).toBe('<p style="margin:0">A</p><p style="margin:0">&nbsp;</p><p style="margin:0">B</p>');
  });
  it("treats <p><br></p> and whitespace-only paragraphs as blank lines", () => {
    expect(normalizeEmailBlocks("<p><br></p>")).toBe('<p style="margin:0">&nbsp;</p>');
    expect(normalizeEmailBlocks("<p>  </p>")).toBe('<p style="margin:0">&nbsp;</p>');
  });
  it("applies to paragraphs that carry attributes", () => {
    expect(normalizeEmailBlocks('<p class="x">A</p>')).toBe('<p class="x" style="margin:0">A</p>');
    expect(normalizeEmailBlocks('<p class="x"></p>')).toBe('<p class="x" style="margin:0">&nbsp;</p>');
  });
  it("merges into an existing style without duplicating it, idempotently", () => {
    expect(normalizeEmailBlocks('<p style="color:red">A</p>')).toBe('<p style="color:red;margin:0">A</p>');
    // already has margin:0 → unchanged (no double margin, no second style attr)
    expect(normalizeEmailBlocks('<p style="margin:0">A</p>')).toBe('<p style="margin:0">A</p>');
  });
  it("handles single-quoted styles without producing a second style attr", () => {
    expect(normalizeEmailBlocks("<p style='color:red'>A</p>")).toBe("<p style='color:red;margin:0'>A</p>");
  });
  it("does not clobber an existing longhand margin (margin-top)", () => {
    expect(normalizeEmailBlocks('<p style="margin-top:10px">A</p>')).toBe('<p style="margin-top:10px">A</p>');
  });
  it("preserves a single-quoted pre-existing margin without a duplicate style attr", () => {
    expect(normalizeEmailBlocks("<p style='margin:2px'>A</p>")).toBe("<p style='margin:2px'>A</p>");
  });
});

describe("renderForRecipient — rich HTML body", () => {
  it("preserves a deliberate blank line (empty paragraph) in the output", () => {
    const out = render("<p>One.</p><p></p><p>Two.</p>");
    expect(out.html).toContain('<p style="margin:0">One.</p>');
    expect(out.html).toContain('<p style="margin:0">&nbsp;</p>'); // the blank line survives
    expect(out.html).toContain('<p style="margin:0">Two.</p>');
  });

  it("keeps bold and substitutes a pill value (nickname → first-name fallback)", () => {
    const out = render("<p>Hi <strong>{{nickname}}</strong></p>");
    expect(out.html).toContain("<strong>Jane</strong>");
  });

  it("HTML-escapes substituted values so they can't break markup", () => {
    const out = render("<p>{{company-name}}</p>");
    expect(out.html).toContain("&lt;b&gt;Acme&lt;/b&gt; &amp; Co");
    expect(out.html).not.toContain("<b>Acme</b>"); // not injected as real markup
  });

  it("substitutes a variable used as a link href ({{profile-url}})", () => {
    const out = render('<p><a href="{{profile-url}}">my profile</a></p>');
    expect(out.html).toContain('href="https://festival.so/profile/jane"');
    expect(out.html).toContain(">my profile</a>");
  });

  it("preserves a member-mention link verbatim (single anchor, no double-linkify)", () => {
    const out = render('<p>thanks <a href="https://festival.so/profile/john">John</a></p>');
    expect(out.html.match(/href="https:\/\/festival\.so\/profile\/john"/g)?.length).toBe(1);
    expect(out.html).toContain(">John</a>");
  });

  it("linkifies a bare URL typed in the body", () => {
    const out = render("<p>see https://festival.so/events/x here</p>");
    expect(out.html).toContain('<a href="https://festival.so/events/x"');
  });

  it("sanitizes dangerous content in the body", () => {
    const out = render('<p>hi</p><script>alert(1)</script>');
    expect(out.html).not.toMatch(/<script/i);
  });

  it("produces a plain-text copy for the message log", () => {
    const out = render("<p>Hi <strong>{{nickname}}</strong>, welcome.</p>");
    expect(out.bodyText).toContain("Hi Jane, welcome.");
    expect(out.bodyText).not.toMatch(/<strong>/);
  });

  it("strips pill scaffolding from the outgoing email (no data-var-pill leak)", () => {
    const out = render('<p>Hi <span data-var-pill data-key="nickname" class="var-pill">{{nickname}}</span></p>');
    expect(out.html).toContain("Hi Jane");
    expect(out.html).not.toMatch(/data-var-pill/);
    expect(out.html).not.toMatch(/var-pill/);
  });

  it("renders an {{event-url}} pill followed directly by ?section= as one URL", () => {
    // Pill is adjacent to the query string (no space) — the deep link must stay intact.
    const out = render(
      '<p>See <span data-var-pill data-key="event-url">{{event-url}}</span>?section=Attendee+Insights</p>',
    );
    expect(out.html).toContain(
      '<a href="https://festival.so/events/founder-summit?section=Attendee+Insights"',
    );
    expect(out.html).not.toMatch(/data-var-pill/);
  });

  it("also works as a link href ({{event-url}}?section=…)", () => {
    const out = render('<p><a href="{{event-url}}?section=Attendee+Insights">the recap</a></p>');
    expect(out.html).toContain('href="https://festival.so/events/founder-summit?section=Attendee+Insights"');
    expect(out.html).toContain(">the recap</a>");
  });

  it("a pill directly followed by punctuation renders with no spurious space", () => {
    const out = render('<p>Hi <span data-var-pill data-key="first-name">{{first-name}}</span>, welcome.</p>');
    expect(out.html).toContain("Hi Jane, welcome.");
  });

  it("a pill followed by a normal space + word still renders sensibly (URL not over-captured)", () => {
    const out = render('<p>Visit <span data-var-pill data-key="event-url">{{event-url}}</span> today.</p>');
    // The space stays a separator: the link is just the URL, then " today."
    expect(out.html).toContain('<a href="https://festival.so/events/founder-summit"');
    expect(out.html).toContain("</a> today.");
  });

  it("a profile-url pill becomes a clickable link after unwrap", () => {
    const out = render('<p><span data-var-pill data-key="profile-url">{{profile-url}}</span></p>');
    expect(out.html).toContain('<a href="https://festival.so/profile/jane"');
    expect(out.html).not.toMatch(/data-var-pill/);
  });

  it("still uses the legacy plain-text path for non-HTML templates", () => {
    const out = render("Hi {{nickname}},\n\nwelcome");
    // plain path nl2br + escapes; no <p> wrapper from rich path
    expect(out.html).toContain("Hi Jane,<br>");
  });
});
