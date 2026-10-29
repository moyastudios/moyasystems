import type { Db } from "@westbridge/db";

/**
 * Fixed-window rate limit stored in Postgres (atomic upsert), shared across serverless instances.
 * Returns true if the call is allowed.
 */
export async function rateLimit(db: Db, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_buckets (key, count, window_start) VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets.window_start < now() - (${windowSeconds} * interval '1 second') THEN 1 ELSE rate_limit_buckets.count + 1 END,
      window_start = CASE WHEN rate_limit_buckets.window_start < now() - (${windowSeconds} * interval '1 second') THEN now() ELSE rate_limit_buckets.window_start END
    RETURNING count`;
  return (rows[0]?.count ?? Infinity) <= limit;
}
