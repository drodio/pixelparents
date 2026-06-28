import { describe, it, expect, beforeEach } from "vitest";
import { isAuthorizedCron } from "@/lib/cron-auth";

function req(headers: Record<string, string>) {
  return new Request("http://x/api/cron/x", { headers });
}

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_ENV;
});

describe("isAuthorizedCron", () => {
  it("accepts the bearer secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCron(req({ authorization: "Bearer s3cret" }))).toBe(true);
    expect(isAuthorizedCron(req({ authorization: "Bearer wrong" }))).toBe(false);
  });

  it("rejects when no secret is configured", () => {
    expect(isAuthorizedCron(req({}))).toBe(false);
  });

  it("allows localhost ONLY off-production", () => {
    process.env.VERCEL_ENV = "production";
    expect(isAuthorizedCron(req({ host: "localhost:3000" }))).toBe(false);
    process.env.VERCEL_ENV = "development";
    expect(isAuthorizedCron(req({ host: "localhost:3000" }))).toBe(true);
  });
});
