import { describe, it, expect } from "vitest";
import { githubLoginsFromUrls } from "@/lib/enrichers/crates";

describe("githubLoginsFromUrls", () => {
  it("extracts the bare login from profile and repo URLs", () => {
    expect(githubLoginsFromUrls(["https://github.com/octocat"])).toEqual(["octocat"]);
    expect(githubLoginsFromUrls(["https://github.com/acme-rs/acme-lib"])).toEqual(["acme-rs"]);
  });
  it("dedupes and skips reserved namespaces", () => {
    expect(githubLoginsFromUrls(["https://github.com/sponsors/x", "https://github.com/orgs/y"])).toEqual([]);
    expect(githubLoginsFromUrls(["https://github.com/a", "https://github.com/a/repo"])).toEqual(["a"]);
  });
  it("returns empty for non-GitHub or empty input", () => {
    expect(githubLoginsFromUrls(["https://gitlab.com/a"])).toEqual([]);
    expect(githubLoginsFromUrls([])).toEqual([]);
  });
});
