import { describe, it, expect } from "vitest";
import { humanizeLinkedinHandle } from "@/lib/display-name";

describe("humanizeLinkedinHandle", () => {
  it("drops a trailing hash id and title-cases", () => {
    expect(humanizeLinkedinHandle("https://linkedin.com/in/john-smith-8bb1a6143")).toBe("John Smith");
    expect(humanizeLinkedinHandle("https://linkedin.com/in/alex-kim-8394252b2")).toBe("Alex Kim");
  });
  it("keeps a clean name handle", () => {
    expect(humanizeLinkedinHandle("https://linkedin.com/in/jordan-lee")).toBe("Jordan Lee");
  });
  it("drops a trailing numeric suffix", () => {
    expect(humanizeLinkedinHandle("https://linkedin.com/in/john-smith-3")).toBe("John Smith");
  });
  it("title-cases a single-token handle", () => {
    expect(humanizeLinkedinHandle("https://linkedin.com/in/ijordan")).toBe("Ijordan");
  });
  it("returns null when there's no usable handle", () => {
    expect(humanizeLinkedinHandle("https://example.com/x")).toBeNull();
    expect(humanizeLinkedinHandle("")).toBeNull();
  });
});
