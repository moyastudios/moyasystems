import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

export * from "./generated/client";

const globalForPrisma = globalThis as unknown as { __wbPrisma?: PrismaClient };

export const createDb = (url: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 3 }) });

/** One client per warm serverless instance. `url` must be the app's restricted-role connection string. */
export function getDb(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error("DATABASE_URL is not set");
  globalForPrisma.__wbPrisma ??= createDb(url);
  return globalForPrisma.__wbPrisma;
}

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
