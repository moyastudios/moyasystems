"use server";

import { z } from "zod";
import { rollbackConfig } from "@westbridge/core";
import { ownerAction } from "@/lib/action";
import { db } from "@/lib/db";

export async function rollback(csrf: string, version: unknown) {
  return ownerAction({ name: "rollback", csrf, input: version, schema: z.number().int().positive(), stepUp: true }, async (v, s) =>
    rollbackConfig(db(), s.discordId, v),
  );
}
