import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SearchHit = {
  lat?: string;
  lon?: string;
  display_name?: string;
  boundingbox?: string[];
};

function parseLatLon(q: string): { lat: number; lon: number } | null {
  const m = q.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/
  );
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export async function GET(req: NextRequest) {
  const rawQuery = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!rawQuery) {
    return NextResponse.json({ ok: false, query: "", error: "query_required" }, { status: 400 });
  }

  const asCoords = parseLatLon(rawQuery);
  if (asCoords) {
    return NextResponse.json({
      ok: true,
      query: rawQuery,
      displayName: `${asCoords.lat.toFixed(4)}, ${asCoords.lon.toFixed(4)}`,
      lat: asCoords.lat,
      lon: asCoords.lon,
      bounds: {
        south: asCoords.lat - 0.2,
        west: asCoords.lon - 0.2,
        north: asCoords.lat + 0.2,
        east: asCoords.lon + 0.2
      }
    });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", rawQuery);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        "User-Agent": "WeatherRadar/1.0",
        Accept: "application/json"
      }
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, query: rawQuery, error: `search_http_${res.status}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as SearchHit[];
    const first = data[0];
    if (!first) {
      return NextResponse.json({ ok: false, query: rawQuery, error: "not_found" });
    }
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    const bb = Array.isArray(first.boundingbox) ? first.boundingbox : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !bb || bb.length < 4) {
      return NextResponse.json({ ok: false, query: rawQuery, error: "invalid_result" });
    }
    const south = Number(bb[0]);
    const north = Number(bb[1]);
    const west = Number(bb[2]);
    const east = Number(bb[3]);
    if (![south, west, north, east].every((x) => Number.isFinite(x))) {
      return NextResponse.json({ ok: false, query: rawQuery, error: "invalid_bounds" });
    }

    return NextResponse.json({
      ok: true,
      query: rawQuery,
      displayName: first.display_name || rawQuery,
      lat,
      lon,
      bounds: { south, west, north, east }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "search_failed";
    return NextResponse.json({ ok: false, query: rawQuery, error: msg }, { status: 502 });
  }
}
