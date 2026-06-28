import { describe, it, expect } from "vitest";
import { renderSignatureHtml, DEFAULT_EMAIL_SIGNATURE } from "@/lib/email-signature";

describe("renderSignatureHtml", () => {
  it("converts newlines to <br>", () => {
    const html = renderSignatureHtml("line one\nline two");
    expect(html).toContain("line one<br>line two");
  });

  it("linkifies a bare email address", () => {
    const html = renderSignatureHtml("Reach me at DROdio@Festival.so anytime");
    expect(html).toContain('<a href="mailto:DROdio@Festival.so" style="color:#888;">DROdio@Festival.so</a>');
  });

  it("escapes HTML in the text", () => {
    const html = renderSignatureHtml("a <b> & 'c'");
    expect(html).toContain("a &lt;b&gt; &amp; &#39;c&#39;");
    expect(html).not.toContain("<b>");
  });

  it("renders the default signature with the key lines", () => {
    const html = renderSignatureHtml(DEFAULT_EMAIL_SIGNATURE);
    expect(html).toContain("#Velocity,");
    expect(html).toContain("DROdio");
    expect(html).toContain("Your Festival Ringmaster");
    expect(html).toContain("+1.202.250.3846 (text me anytime)");
    expect(html).toContain('href="mailto:DROdio@Festival.so"');
  });
});
