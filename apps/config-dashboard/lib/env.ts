import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SETTINGS_ENCRYPTION_KEY: z.string().min(40),
  SETUP_TOKEN: z.string().min(32),
  OWNER_DISCORD_IDS: z
    .string()
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^\d{17,20}$/)).min(1)),
  DISCORD_APP_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_CLIENT_SECRET: z.string().min(16),
  DISCORD_BOT_TOKEN: z.string().min(50),
  PUBLIC_ORIGIN: z.string().url(),
  WEBAUTHN_RP_ID: z.string().min(1),
});

let cached: z.infer<typeof schema> | undefined;
export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return (cached = parsed.data);
}

export const isOwner = (discordId: string) => env().OWNER_DISCORD_IDS.includes(discordId);
