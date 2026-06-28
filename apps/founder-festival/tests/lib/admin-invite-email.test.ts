import { describe, it, expect } from "vitest";
import { renderAdminInviteEmail } from "@/lib/admin-invite-email";

describe("renderAdminInviteEmail", () => {
  it("uses the user-specified copy and link structure", () => {
    const { subject, html } = renderAdminInviteEmail({
      acceptUrl: "https://festival.so/admin/accept-invite?token=abc",
      inviterName: "DROdio",
    });
    expect(subject).toBe("DROdio has invited you to be a Festival admin");
    expect(html).toContain('href="https://festival.so"');
    expect(html).toContain('href="https://festival.so/admin/accept-invite?token=abc"');
    expect(html).toContain('href="http://go.drod.io/book-me"');
    expect(html).toContain("DROdio</p>");
  });

  it("escapes HTML in the inviter name", () => {
    const { subject, html } = renderAdminInviteEmail({
      acceptUrl: "https://festival.so/admin/accept-invite?token=x",
      inviterName: "<script>",
    });
    expect(subject).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("escapes HTML in the URL too (just in case)", () => {
    const { html } = renderAdminInviteEmail({
      acceptUrl: 'https://festival.so/x?q="><script>',
      inviterName: "X",
    });
    expect(html).toContain("&quot;");
    expect(html).not.toContain('"><script>');
  });
});
