import { describe, it, expect } from "vitest";
// Import from the DB-free render module (event-email-send re-exports these, but
// going direct keeps this unit test free of the DB module).
import { buildEmailHtml, renderForRecipient } from "@/lib/email-render";

describe("buildEmailHtml", () => {
  it("escapes the body, linkifies URLs, nl2br, and appends signature + unsubscribe", () => {
    const html = buildEmailHtml({
      bodyText: "Hi <b>there</b>\nSee https://festival.so/events/x",
      signatureText: "DROdio\nDROdio@festival.so",
      unsubscribeUrl: "https://festival.so/account#event-notifications",
    });
    // body HTML-escaped (no raw <b>)
    expect(html).toContain("Hi &lt;b&gt;there&lt;/b&gt;");
    // newline → <br>
    expect(html).toContain("<br>");
    // URL linkified
    expect(html).toContain('href="https://festival.so/events/x"');
    // signature rendered (email linkified by renderSignatureHtml)
    expect(html).toContain("mailto:DROdio@festival.so");
    // unsubscribe footer present + correct target
    expect(html).toContain("Change your preferences here");
    expect(html).toContain("https://festival.so/account#event-notifications");
  });

  it("omits the signature block when signature text is blank", () => {
    const html = buildEmailHtml({ bodyText: "x", signatureText: "  ", unsubscribeUrl: "u" });
    expect(html).not.toContain("margin-top:22px");
  });
});

describe("renderForRecipient", () => {
  const event = {
    title: "Founder Summit",
    descriptionHtml: "<p>Evening for founders</p>",
    slug: "founder-summit",
    startsAt: new Date("2026-06-12T01:00:00Z"),
    venue: "SF",
    attendeeCount: 12,
  };

  it("substitutes per-recipient variables into subject + body", () => {
    const out = renderForRecipient({
      subjectTemplate: "{{first-name}}, you're invited to {{event-name}}",
      bodyTemplate: "Hi {{first-name}},\n\nJoin us. Your profile: {{profile-url}}",
      signatureText: "DROdio",
      recipient: {
        toEmail: "jane@x.com",
        clerkUserId: "u1",
        evaluationId: "e1",
        fullName: "Jane Public",
        nickname: null,
        profileHref: "/profile/jane",
        companyName: "Acme",
      },
      event,
      personalizedHtml: null,
      baseUrl: "https://festival.so",
    });
    expect(out.subject).toBe("Jane, you're invited to Founder Summit");
    expect(out.bodyText).toContain("Hi Jane,");
    expect(out.bodyText).toContain("https://festival.so/profile/jane");
    // html carries the rendered body + signature + unsubscribe footer
    expect(out.html).toContain("Hi Jane,");
    expect(out.html).toContain("Change your preferences here");
  });

  it("uses the home-page find fallback for an attendee with no profile", () => {
    const out = renderForRecipient({
      subjectTemplate: "x",
      bodyTemplate: "{{profile-url}}",
      signatureText: "",
      recipient: {
        toEmail: "no@x.com",
        clerkUserId: null,
        evaluationId: null,
        fullName: "No Profile",
        nickname: null,
        profileHref: null,
        companyName: null,
      },
      event,
      personalizedHtml: null,
      baseUrl: "https://festival.so",
    });
    expect(out.bodyText).toBe("https://festival.so/?find=1");
  });
});
