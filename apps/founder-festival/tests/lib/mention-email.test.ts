import { describe, it, expect } from "vitest";
import { buildMentionEmail } from "@/lib/event-chat-email";

const base = {
  firstName: "Patricia",
  authorName: "Daniel R. Odio",
  eventTitle: "SF Founder Dinner",
  eventUrl: "https://festival.so/events/sf-founder-dinner",
  threadTitle: "Thank you @[Patricia Jiahui Liu](e1) for the pitch sessions!",
  chatBody: "Seriously @[Patricia Jiahui Liu](e1), the founders loved it.",
  permalinkUrl: "https://festival.so/events/sf-founder-dinner/chat/t1",
};

describe("buildMentionEmail", () => {
  it("uses the poster name + thread title (markers stripped) in the subject", () => {
    const { subject } = buildMentionEmail(base);
    expect(subject).toBe("Daniel R. Odio just mentioned you on Thank you Patricia Jiahui Liu for the pitch sessions!");
    expect(subject).not.toContain("@[");
  });

  it("greets by first name and links the event title to the event page", () => {
    const { html } = buildMentionEmail(base);
    expect(html).toContain("<p>Patricia,</p>");
    expect(html).toContain('<a href="https://festival.so/events/sf-founder-dinner">SF Founder Dinner</a>');
  });

  it("shows the thread title + body with mention markers reduced to names", () => {
    const { html } = buildMentionEmail(base);
    expect(html).toContain("<strong>Thank you Patricia Jiahui Liu for the pitch sessions!</strong>");
    expect(html).toContain("Seriously Patricia Jiahui Liu, the founders loved it.");
    expect(html).not.toContain("@[");
    expect(html).not.toContain("](e1)");
  });

  it("links 'reply or upvote the thread here' to the permalink", () => {
    const { html } = buildMentionEmail(base);
    expect(html).toContain('You can <a href="https://festival.so/events/sf-founder-dinner/chat/t1">reply or upvote the thread here</a>.');
  });

  it("escapes HTML in user-supplied names", () => {
    const { html } = buildMentionEmail({ ...base, authorName: "A <b>& co" });
    expect(html).toContain("A &lt;b&gt;&amp; co");
    expect(html).not.toContain("<b>&");
  });
});
