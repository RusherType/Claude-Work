import type { NextConfig } from "next";

// Baseline security headers (docs/03-security.md). The full nonce-based CSP lands with CD-104;
// embedded Shopify routes (CD-020) will allow frame-ancestors for the Shopify admin only.
// Google sign-in posts a form that redirects to Supabase Auth and then Google, so those origins
// must be allowed as form targets when Google is enabled.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const formAction = [
  "'self'",
  ...(process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true" && supabaseOrigin
    ? [supabaseOrigin, "https://accounts.google.com"]
    : []),
].join(" ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: `frame-ancestors 'none'; base-uri 'self'; form-action ${formAction}`,
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
