import type { NextConfig } from "next";
import { APP_CSP_SOURCES, appCsp, AUTH_HELPER_HEADERS, firebaseHostOf, PUBLIC_CSP_SOURCE, publicCsp } from "./src/lib/server/csp";

const dev = process.env.NODE_ENV !== "production";

// The Firebase project behind Google sign-in (public web config, inlined at build time).
const firebaseHost = firebaseHostOf(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Google profile photos in the account menu and Settings.
  images: { remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Firebase's auth helper (`/__/auth/*`) is proxied from the app's own origin by src/proxy.ts, so
  // redirect sign-in works in browsers that block third-party storage (spec 9.1). A rewrite here
  // would lose every security header on the proxied response (SEC-02).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      // Content Security Policy by route group (spec 9.1; see src/lib/server/csp.ts for why there is no nonce).
      { source: PUBLIC_CSP_SOURCE, headers: [{ key: "Content-Security-Policy", value: publicCsp({ dev }) }] },
      ...APP_CSP_SOURCES.map((source) => ({ source, headers: [{ key: "Content-Security-Policy", value: appCsp({ dev, firebaseHost }) }] })),
      // Firebase's own auth helper pages (proxied by src/proxy.ts) run Google's scripts and are
      // framed by this app, so they get Firebase's needs instead of the app's policy (the later match wins).
      {
        source: "/__/:path*",
        // The proxied helper responses get these from src/proxy.ts (SEC-02); this covers the rest.
        headers: AUTH_HELPER_HEADERS.map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
