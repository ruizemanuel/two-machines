export const runtime = "nodejs";
// On demand, not at build time. Prerendering this would run Dawn inside `next
// build` — which the spike already saw hang the compilation — and would freeze
// the card into the build output. Warm it costs ~1,3 s and the CDN caches it.
export const dynamic = "force-dynamic";
// Same render as /api/mint, so the same ceiling: without this the card inherits
// Vercel's short default and a cold function times out on the one request the
// piece is judged by.
export const maxDuration = 60;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Reuse the route handler directly instead of fetching VERCEL_URL: on a
  // protected preview that fetch comes back 401 and the card breaks.
  const { GET } = await import("./api/mint/route");
  return GET(new Request("http://internal/api/mint?spin=0&melt=0&w=1200&h=630"));
}
