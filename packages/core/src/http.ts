/** Client IP as seen by Vercel's edge (x-real-ip is set by Vercel and can't be spoofed by the client). */
export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip");
  if (real) return real.slice(0, 64);
  const fwd = headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0]!.trim().slice(0, 64) : null;
}

export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/** For JSON-only services: nothing may load or embed. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
