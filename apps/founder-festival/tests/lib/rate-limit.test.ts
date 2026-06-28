import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { rateLimit } from "@/db/schema";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";

describe("rate-limit", () => {
  const testIp = "test-ip-127.0.0.1";

  beforeEach(async () => {
    await db.delete(rateLimit).where(eq(rateLimit.ip, testIp));
  });

  it("allows up to N and blocks N+1", async () => {
    expect(await checkAndIncrementRateLimit(testIp, 3)).toBe(true);
    expect(await checkAndIncrementRateLimit(testIp, 3)).toBe(true);
    expect(await checkAndIncrementRateLimit(testIp, 3)).toBe(true);
    expect(await checkAndIncrementRateLimit(testIp, 3)).toBe(false);
  });
});
