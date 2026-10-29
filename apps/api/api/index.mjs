// Single Vercel Function serving every route (see the rewrite in vercel.json).
// The handler is built from src/ into one file so workspace TypeScript packages need no runtime compilation.
export { GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD } from "../dist/vercel.mjs";
