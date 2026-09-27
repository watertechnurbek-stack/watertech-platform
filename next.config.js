// Duplicated from lib/security/csp.ts (kept as the tested source of truth) because
// this file is CommonJS and runs outside the Next.js TS pipeline, so it cannot
// `require` a TS module. Update both together — tests/unit/security/csp-parity.test.ts
// fails if they drift.
function buildCsp(opts) {
  const { supabaseUrl, isDev } = opts;
  const supabaseWs = supabaseUrl.replace(/^https:/, "wss:");
  const productImages = supabaseUrl
    ? ` ${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/product-images/`
    : "";

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${productImages}`,
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl} ${supabaseWs}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

/** The image optimizer may fetch uploaded catalog photos — the public object
 * path of the product-images bucket (0018) on this project's Supabase host,
 * and nothing else there. Derived from NEXT_PUBLIC_SUPABASE_URL, the same
 * variable lib/env.ts validates; unset or unparsable means no remote images
 * (legacy /products files still work). Mirrors PRODUCT_IMAGES_PUBLIC_PATH in
 * lib/content/products.ts — tests/unit/security/csp-parity.test.ts checks. */
function productImageRemotePatterns(supabaseUrl) {
  if (!supabaseUrl) return [];
  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return [];
  }
  return [
    {
      protocol: url.protocol.replace(/:$/, ""),
      hostname: url.hostname,
      port: url.port,
      pathname: "/storage/v1/object/public/product-images/**",
    },
  ];
}

/** The retired /dashboard monitoring tabs (S03 monitoring IA) and the admin
 * page that took each one's content; the #ids are the knowledge page's
 * sections (KNOWLEDGE_SECTIONS in lib/admin/knowledge.ts). Query strings pass
 * through, so /dashboard/quality?op=… keeps its person filter.
 * tests/unit/security/monitoring-redirects.test.ts checks this list against
 * the sections, the locales and the admin areas. */
const RETIRED_DASHBOARD_PAGES = [
  ["/dashboard", "/admin"],
  ["/dashboard/content", "/admin/knowledge#health"],
  ["/dashboard/quality", "/admin/knowledge#gaps"],
  ["/dashboard/copilot", "/admin/knowledge#copilot"],
];

/** Each retired page in every form middleware accepts: unprefixed and /uz
 * (the default locale, served unprefixed — i18n/routing.ts, localePrefix
 * "as-needed") go to the unprefixed page, /ru to the /ru page — one hop.
 *
 * Config redirects run before middleware, so these answer without a session.
 * That is safe: every destination is an /admin URL, which middleware and
 * requireAdminPage gate on the next request, and the redirect itself carries
 * no data. /dashboard stays in ADMIN_AREAS (lib/auth/claims.ts) anyway, as
 * defence in depth should one of these ever be removed. Temporary (307), so
 * the paths stay free to reuse. */
function retiredDashboardRedirects() {
  return RETIRED_DASHBOARD_PAGES.flatMap(([from, to]) => [
    { source: from, destination: to, permanent: false },
    { source: `/uz${from}`, destination: to, permanent: false },
    { source: `/ru${from}`, destination: `/ru${to}`, permanent: false },
  ]);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: productImageRemotePatterns(process.env.NEXT_PUBLIC_SUPABASE_URL),
  },
  experimental: {
    staleTimes: { dynamic: 30, static: 300 },
    // The product photo upload (lib/admin/actions/product-image.ts) sends up
    // to 2 MB of file inside a multipart Server Action body; Next's default
    // cap is 1 MB. A larger body is refused before any action runs.
    serverActions: { bodySizeLimit: "3mb" },
  },
  // No CSP nonce here on purpose: a nonce needs `headers()` in the root layout to
  // read the per-request value, which would force every operator page to render
  // dynamically and defeat static prerendering (CLAUDE.md #4). 'unsafe-inline'
  // for script/style is the accepted trade-off until that constraint changes.
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: buildCsp({ supabaseUrl, isDev }),
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
      },
      { key: "X-DNS-Prefetch-Control", value: "on" },
    ];

    if (!isDev) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/company/onboarding/call-operator",
        destination: "/company/onboarding",
        permanent: true,
      },
      ...retiredDashboardRedirects(),
    ];
  },
};

// Windows has no bare `VAR=value cmd` syntax like the "analyze" script uses —
// run `set ANALYZE=true&& next build` instead when analyzing locally there.
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// The offline fallback is an app route, not a file in /public, so it isn't
// picked up by the glob that builds the precache manifest — it has to be
// listed explicitly, and `fallbacks` in app/sw.ts requires it to be precached.
// The revision is derived from the sources that decide what that page looks
// like, so a build that changes any of them re-precaches it (and a build that
// doesn't, doesn't). next.config.js is evaluated once per compilation within a
// single build, so this must stay deterministic — no timestamps or randomness.
const { createHash } = require("crypto");
const { readFileSync } = require("fs");

const OFFLINE_PAGE_SOURCES = [
  "./app/[locale]/offline/page.tsx",
  "./app/[locale]/offline/RetryButton.tsx",
  "./app/[locale]/layout.tsx",
  "./app/globals.css",
];

function offlinePageRevision() {
  const hash = createHash("sha256");
  for (const file of OFFLINE_PAGE_SOURCES) {
    hash.update(readFileSync(file));
  }
  return hash.digest("hex").slice(0, 16);
}

const withSerwist = require("@serwist/next").default({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Off, against the library default: it reloads the page on every "online"
  // event, and a connection flapping mid-call would reload the script an
  // operator is reading. OfflineBanner reports the state instead, and the
  // offline page's "Qayta urinish" button makes reloading the operator's call.
  reloadOnOnline: false,
  // Passing this also replaces @serwist/next's default "precache everything in
  // /public" glob, which is what we want: that would ship ~5 MB of catalog
  // images and certificates on install. They are cached on demand instead, by
  // the product-images rule in app/sw.ts. The build output (/_next/static) is
  // globbed from the webpack compilation separately and is unaffected.
  additionalPrecacheEntries: [{ url: "/offline", revision: offlinePageRevision() }],
});

let exportedConfig = withSerwist(withNextIntl(withBundleAnalyzer(nextConfig)));

// Wraps whenever Sentry is in use at all: the DSN alone needs tunnelRoute
// (see below), the auth token additionally enables source-map upload — unset
// in local dev, so local builds are unaffected when neither is set.
if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_AUTH_TOKEN) {
  const { withSentryConfig } = require("@sentry/nextjs");
  exportedConfig = withSentryConfig(exportedConfig, {
    silent: true,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
    widenClientFileUpload: true,
    disableLogger: true,
    // The browser SDK posts to this same-origin path and a Sentry-added
    // rewrite forwards it to the ingest host, so connect-src stays 'self'
    // (no ingest host to derive from the DSN and keep in sync across both CSP
    // builders) and ad-blockers that block *.sentry.io don't drop reports.
    // Excluded from the middleware matcher (middleware.ts).
    tunnelRoute: "/monitoring",
  });
}

module.exports = exportedConfig;

// For tests/unit/security/csp-parity.test.ts only. Non-enumerable so Next's
// config validation (which walks the object's keys) doesn't flag it as an
// unknown option.
Object.defineProperty(module.exports, "buildCsp", { value: buildCsp, enumerable: false });
Object.defineProperty(module.exports, "productImageRemotePatterns", {
  value: productImageRemotePatterns,
  enumerable: false,
});
