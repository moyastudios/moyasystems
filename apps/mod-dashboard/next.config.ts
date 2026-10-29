import type { NextConfig } from "next";
import { API_CSP, SECURITY_HEADERS } from "@westbridge/core/http";

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@westbridge/core"],
  async headers() {
    return [{ source: "/:path*", headers: [...Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })), { key: "Content-Security-Policy", value: API_CSP }] }];
  },
};

export default config;
