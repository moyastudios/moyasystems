import { defineConfig } from "prisma/config";

// Migrations run as the schema owner. Apps connect with their own restricted roles at runtime.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.MIGRATE_DATABASE_URL ?? "postgresql://localhost/westbridge" },
});
