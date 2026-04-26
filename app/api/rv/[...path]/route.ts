import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TILE_BASE = "https://tilecache.rainviewer.com/";

/**
 * Same-origin RainViewer tile proxy — avoids OpaqueResponseBlocking / canvas issues when
 * Leaflet uses canvas rendering for cross-origin tilecache URLs.
 */
export async function GET(_req: NextRequest, ctx: { params: { path: string[] } }) {
  const parts = ctx.params?.path;
  if (!Array.isArray(parts) || parts.length === 0) {
    return new NextResponse("Missing path", { status: 400 });
  }
  const rel = parts.join("/");
  if (rel.includes("..") || !rel.startsWith("v2/radar/") || !rel.endsWith(".png")) {
    return new NextResponse("Invalid path", { status: 400 });
  }

  let upstream: string;
  try {
    upstream = new URL(rel, TILE_BASE).toString();
  } catch {
    return new NextResponse("Bad URL", { status: 400 });
  }

  const res = await fetch(upstream, { cache: "no-store" });
  if (!res.ok || !res.body) {
    return new NextResponse(null, { status: res.status >= 400 && res.status < 600 ? res.status : 502 });
  }

  const headers = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  headers.set("Cache-Control", res.headers.get("cache-control") || "public, max-age=60");

  return new NextResponse(res.body, { status: 200, headers });
}
