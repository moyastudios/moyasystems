import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SETTINGS_ENCRYPTION_KEY: z.string().min(40),
  DISCORD_APP_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_PUBLIC_KEY: z.string().regex(/^[0-9a-f]{64}$/i),
  DISCORD_BOT_TOKEN: z.string().min(50),
});

let cached: z.infer<typeof schema> | undefined;
/** Validated on first use so a missing variable fails loudly (names only, never values). */
export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return (cached = parsed.data);
}
