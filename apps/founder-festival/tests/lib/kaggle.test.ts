import { describe, it, expect } from "vitest";
import { handleFromKaggleUrls } from "@/lib/enrichers/kaggle";

describe("handleFromKaggleUrls", () => {
  it("extracts a username from a bare profile URL", () => {
    expect(handleFromKaggleUrls(["https://www.kaggle.com/datanaut"])).toBe("datanaut");
    expect(handleFromKaggleUrls(["https://kaggle.com/danielodio/"])).toBe("danielodio");
  });
  it("ignores dataset / notebook / reserved-namespace URLs (≥2 segments or reserved)", () => {
    expect(handleFromKaggleUrls(["https://www.kaggle.com/datasets/datanaut/demo-set"])).toBeNull();
    expect(handleFromKaggleUrls(["https://www.kaggle.com/code/datanaut/demo-book"])).toBeNull();
    expect(handleFromKaggleUrls(["https://www.kaggle.com/competitions"])).toBeNull();
    expect(handleFromKaggleUrls(["https://www.kaggle.com/models"])).toBeNull();
  });
  it("returns null for non-Kaggle URLs or empty input", () => {
    expect(handleFromKaggleUrls(["https://github.com/datanaut"])).toBeNull();
    expect(handleFromKaggleUrls([])).toBeNull();
  });
});
