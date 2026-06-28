import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  htmlToText,
  buildRecipientValues,
  formatEventDate,
  isVariableKey,
  EMAIL_VARIABLES,
} from "@/lib/email-variables";

describe("renderTemplate", () => {
  const vals = {
    "first-name": "Jane",
    "event-name": "Founder Summit",
    "personalized-learnings": "A".repeat(120),
  } as const;

  it("substitutes known variables and drops unknown ones", () => {
    expect(renderTemplate("Hi {{first-name}}, see you at {{event-name}}!", vals)).toBe(
      "Hi Jane, see you at Founder Summit!",
    );
    expect(renderTemplate("x {{not-a-var}} y", vals)).toBe("x  y");
  });

  it("empty value → empty string", () => {
    expect(renderTemplate("[{{last-name}}]", vals)).toBe("[]");
  });

  it("applies a per-pill :max=N truncation with an ellipsis", () => {
    const out = renderTemplate("{{personalized-learnings:max=10}}", vals);
    expect(out).toBe("AAAAAAAAAA…");
    expect(out.length).toBe(11); // 10 chars + ellipsis
  });

  it("does not truncate when the value is under the cap", () => {
    expect(renderTemplate("{{first-name:max=50}}", vals)).toBe("Jane");
  });

  it("tolerates whitespace inside the marker", () => {
    expect(renderTemplate("{{ first-name }}", vals)).toBe("Jane");
  });

  it("formats event-date via :fmt= using the supplied start date", () => {
    const eventStartsAt = new Date("2026-06-12T01:00:00Z"); // Jun 11 PT (Thursday)
    expect(renderTemplate("{{event-date:fmt=numeric}}", {}, { eventStartsAt })).toBe("6/11/26");
    expect(renderTemplate("{{event-date:fmt=monthday}}", {}, { eventStartsAt })).toBe("June 11th");
    expect(renderTemplate("{{event-date:fmt=weekday}}", {}, { eventStartsAt })).toBe("Thursday, June 11th");
  });

  it("falls back to the resolved value when :fmt= is given without a start date", () => {
    expect(renderTemplate("{{event-date:fmt=numeric}}", { "event-date": "June 11th" })).toBe("June 11th");
  });
});

describe("htmlToText", () => {
  it("turns block tags into newlines and decodes entities", () => {
    expect(htmlToText("<p>Hello</p><p>World &amp; more</p>")).toBe("Hello\nWorld & more");
    expect(htmlToText("a<br>b")).toBe("a\nb");
    expect(htmlToText(null)).toBe("");
  });

  it("strips inline tags and collapses blank-line runs", () => {
    expect(htmlToText("<p><strong>Hi</strong></p>\n\n\n<p>x</p>")).toBe("Hi\n\nx");
  });
});

describe("buildRecipientValues", () => {
  const event = {
    title: "Founder Summit",
    descriptionHtml: "<p>An evening for founders</p>",
    slug: "founder-summit-2026",
    startsAt: new Date("2026-06-12T01:00:00Z"), // = Jun 11 6pm PT
    venue: "SF",
    attendeeCount: 42,
  };

  it("splits names, builds URLs, and strips HTML values", () => {
    const v = buildRecipientValues({
      attendee: { fullName: "Jane Q Public", nickname: null, profileHref: "/profile/jane", companyName: "Acme" },
      event,
      personalizedHtml: "<p>You should raise.</p>",
      baseUrl: "https://festival.so/",
    });
    expect(v["first-name"]).toBe("Jane");
    expect(v["last-name"]).toBe("Q Public");
    expect(v["full-name"]).toBe("Jane Q Public");
    expect(v["profile-url"]).toBe("https://festival.so/profile/jane");
    expect(v["company-name"]).toBe("Acme");
    expect(v["personalized-learnings"]).toBe("You should raise.");
    expect(v["event-name"]).toBe("Founder Summit");
    expect(v["event-description"]).toBe("An evening for founders");
    expect(v["event-url"]).toBe("https://festival.so/events/founder-summit-2026");
    expect(v["venue"]).toBe("SF");
    expect(v["attendee-count"]).toBe("42");
    expect(v["event-date"]).toBe("Thursday, June 11th"); // default format, no time
    expect(v["nickname"]).toBe("Jane"); // no nickname set → first-name fallback
  });

  it("falls back to the home page with find open when there's no profile", () => {
    const v = buildRecipientValues({
      attendee: { fullName: "No Profile", nickname: null, profileHref: null, companyName: null },
      event,
      personalizedHtml: null,
      baseUrl: "https://festival.so",
    });
    expect(v["profile-url"]).toBe("https://festival.so/?find=1");
    expect(v["personalized-learnings"]).toBe("");
    expect(v["company-name"]).toBe("");
  });

  it("uses the nickname when set, and trims it", () => {
    const v = buildRecipientValues({
      attendee: { fullName: "Robert Smith", nickname: "  Bob  ", profileHref: null, companyName: null },
      event,
      personalizedHtml: null,
      baseUrl: "https://festival.so",
    });
    expect(v["nickname"]).toBe("Bob");
    expect(v["first-name"]).toBe("Robert"); // first-name is unaffected
  });

  it("nickname falls back to first name when blank/whitespace", () => {
    const v = buildRecipientValues({
      attendee: { fullName: "Alice Walker", nickname: "   ", profileHref: null, companyName: null },
      event,
      personalizedHtml: null,
      baseUrl: "https://festival.so",
    });
    expect(v["nickname"]).toBe("Alice");
  });
});

describe("catalog + helpers", () => {
  it("formatEventDate renders date-only Pacific formats (no time)", () => {
    const d = new Date("2026-06-12T01:00:00Z"); // Jun 11 6pm PT (a Thursday)
    expect(formatEventDate(d)).toBe("Thursday, June 11th"); // default = weekday
    expect(formatEventDate(d, "weekday")).toBe("Thursday, June 11th");
    expect(formatEventDate(d, "monthday")).toBe("June 11th");
    expect(formatEventDate(d, "numeric")).toBe("6/11/26");
    expect(formatEventDate(d)).not.toMatch(/PT|PM|AM|:/); // never includes a time
  });
  it("isVariableKey recognizes catalog keys only", () => {
    expect(isVariableKey("first-name")).toBe(true);
    expect(isVariableKey("nope")).toBe(false);
    expect(EMAIL_VARIABLES.every((v) => isVariableKey(v.key))).toBe(true);
  });
});
