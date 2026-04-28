import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SuggestHit = {
  display_name?: string;
  lat?: string;
  lon?: string;
  addresstype?: string;
  type?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    county?: string;
  };
};

function mapKind(hit: SuggestHit): "city" | "state" | "county" | "other" {
  const t = String(hit.addresstype || hit.type || "").toLowerCase();
  if (t.includes("state")) return "state";
  if (t.includes("county")) return "county";
  if (t.includes("city") || t.includes("town") || t.includes("village") || t.includes("municipality")) return "city";
  return "other";
}

function labelForHit(hit: SuggestHit): string {
  const address = hit.address || {};
  const city = address.city || address.town || address.village;
  const state = address.state;
  const county = address.county;
  const kind = mapKind(hit);
  if (kind === "city" && city) return state ? `${city}, ${state}` : city;
  if (kind === "state" && state) return state;
  if (kind === "county" && county) return county;
  return String(hit.display_name || "").split(",").slice(0, 3).join(",").trim();
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 3) return NextResponse.json({ ok: true, query: q, suggestions: [] });
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "8");

    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        "User-Agent": "WeatherRadar/1.0",
        Accept: "application/json"
      }
    });
    if (!res.ok) return NextResponse.json({ ok: false, query: q, error: `suggest_http_${res.status}` }, { status: 502 });
    const data = (await res.json()) as SuggestHit[];
    const suggestions = data
      .map((hit) => {
        const lat = Number(hit.lat);
        const lon = Number(hit.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return {
          label: labelForHit(hit),
          kind: mapKind(hit),
          lat,
          lon
        };
      })
      .filter((x): x is { label: string; kind: "city" | "state" | "county" | "other"; lat: number; lon: number } => Boolean(x))
      .slice(0, 6);

    return NextResponse.json({ ok: true, query: q, suggestions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, query: q, error: error instanceof Error ? error.message : "suggest_failed" },
      { status: 502 }
    );
  }
}
