// Vercel entry: bundled to dist/vercel.mjs by `pnpm build`, re-exported from api/index.mjs.
import { handle } from "hono/vercel";
import { app } from "./app";

const handler = handle(app);
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
