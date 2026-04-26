import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NWS_UA =
  process.env.NWS_USER_AGENT?.trim() ||
  "WeatherRadar/1.0 (https://github.com/weather; contact: weather@localhost)";

const NWS_HEADERS: HeadersInit = {
  "User-Agent": NWS_UA,
  Accept: "application/geo+json, application/ld+json"
};

type Dict = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const latS = req.nextUrl.searchParams.get("lat");
  const lonS = req.nextUrl.searchParams.get("lon");
  if (!latS || !lonS) {
    return NextResponse.json({ detail: "lat and lon required" }, { status: 400 });
  }
  const lat = Number(latS);
  const lon = Number(lonS);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ detail: "Invalid coordinates" }, { status: 400 });
  }

  try {
    const pr = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
      headers: NWS_HEADERS,
      cache: "no-store"
    });
    if (pr.status === 404) {
      return NextResponse.json({ ok: false, error: "outside_nws", lat, lon });
    }
    if (!pr.ok) {
      return NextResponse.json({ detail: `NWS points HTTP ${pr.status}` }, { status: 502 });
    }
    const pdata = (await pr.json()) as { properties?: Dict };
    const props = pdata.properties || {};
    const rel = props.relativeLocation;
    const rp = rel && typeof rel === "object" && (rel as Dict).properties && typeof (rel as Dict).properties === "object"
      ? (rel as { properties: Dict }).properties
      : ({} as Dict);
    const city = typeof rp.city === "string" ? rp.city : null;
    const state = typeof rp.state === "string" ? rp.state : null;
    const cUrl = props.county;
    let county: string | null = null;
    if (typeof cUrl === "string" && cUrl.startsWith("http")) {
      const cr = await fetch(cUrl, { headers: NWS_HEADERS, cache: "no-store" });
      if (cr.ok) {
        const cj = (await cr.json()) as { properties?: { name?: unknown } };
        const raw = cj.properties?.name;
        if (typeof raw === "string") county = raw;
      }
    }
    return NextResponse.json({ ok: true, city, state, county, lat, lon });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "place lookup failed";
    return NextResponse.json({ detail: msg }, { status: 502 });
  }
}
