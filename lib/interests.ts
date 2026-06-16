import { sql } from "drizzle-orm";
import { db } from "./db";

// Distinct union of all interests entered so far (parents + children),
// used to seed the pill picker. Degrades to [] if the table doesn't exist yet.
export async function getInterestPool(): Promise<string[]> {
  try {
    const result = await db.execute(sql`
      SELECT DISTINCT t.i AS interest
      FROM (
        SELECT unnest(parent_interests) AS i FROM signups
        UNION ALL
        SELECT unnest(interests) AS i FROM children
      ) t
      WHERE t.i IS NOT NULL AND t.i <> ''
      ORDER BY interest
    `);
    const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
    return rows
      .map((r) => (typeof r.interest === "string" ? r.interest : ""))
      .filter(Boolean);
  } catch (err) {
    console.error("getInterestPool failed:", err);
    return [];
  }
}
