const PROXY = "/__api";

/** NWS place lookup via Next — avoids 404 on hosts without FastAPI /geo route. */
const VIEWPORT_PLACE_PATH = "/api/geo/viewport-place";

/**
 * When Next’s `/__api` rewrite cannot reach FastAPI, the browser often sees HTTP 500 with body
 * "Internal Server Error" — not a bug inside the forecast route. Map that to a clear hint.
 */
export function messageForApiFetchFailure(status: number, bodyText: string): string {
  const raw = (bodyText || "").trim();
  const generic =
    raw === "" ||
    /^Internal Server Error$/i.test(raw) ||
    /^Bad Gateway$/i.test(raw) ||
    /ECONNREFUSED/i.test(raw) ||
    /socket hang up/i.test(raw) ||
    /Failed to proxy/i.test(raw);
  if (status >= 500 && generic) {
    return (
      "Weather API is not reachable from Next.js (nothing on port 8000, or it crashed). " +
      "In frontend/: run npm run dev — that starts FastAPI then Next. " +
      "If the API is already running elsewhere, set BACKEND_URL in frontend/.env.local and restart next dev."
    );
  }
  if (status === 502 || status === 503 || status === 504) {
    return raw.slice(0, 400) || `Upstream error (${status})`;
  }
  return raw.slice(0, 400) || `Request failed (${status})`;
}

/**
 * When `NEXT_PUBLIC_API_BASE` is set, use it (direct fetches, e.g. API on another host in prod).
 * Otherwise: same-origin `/__api/...` → Next rewrites to FastAPI (see `next.config.js` + `BACKEND_URL`).
 * This avoids CORS/NetworkError when the UI is e.g. http://127.0.0.1:3000 and the default was `localhost:8000`.
 */
export function getApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE;
  if (fromEnv && fromEnv.trim() !== "") {
    return fromEnv.replace(/\/$/, "");
  }
  if (typeof window === "undefined") {
    // SSR: point at the backend (server-side; no rewrites in RSC)
    return process.env.BACKEND_URL || "http://127.0.0.1:8000";
  }
  return "";
}

/**
 * Full URL to an API path (no leading slash in `path` optional).
 * Examples: `apiUrl("alerts/active")` → `http://host:8000/alerts/active` or `/__api/alerts/active`
 */
export function apiUrl(path: string): string {
  const p = path.replace(/^\//, "");
  const base = getApiBase();
  if (base) {
    return `${base}/${p}`;
  }
  return `${PROXY}/${p}`;
}

export type Product = "reflectivity" | "velocity";

/** Observed / analysis vs nowcast; "now" = past frame closest to current time. */
export type RadarFrameCategory = "past" | "now" | "nowcast";

export type RadarFrame = {
  product: Product;
  /** ISO-8601 UTC, from RainViewer `time` */
  timestamp: string;
  timeUnix: number;
  category: RadarFrameCategory;
  tile_url_template: string;
};

/** RainViewer tile color scheme: 2 = default composite; 6 = blue/red style (closer to velocity). */
const RAINVIEWER_COLOR: Record<Product, number> = {
  reflectivity: 2,
  velocity: 6
};
const RAINVIEWER_TILE_SIZE = 512;
const RV_OPTIONS = "1_1";
const RV_FRAMES_TTL_MS = 45_000;

type RainViewerItem = { time_unix: number; path: string; source: "past" | "nowcast" };
type RainViewerListResponse = {
  frame_count: number;
  frames: RainViewerItem[];
};

function toIsoUtc(timeUnix: number): string {
  return new Date(timeUnix * 1000).toISOString();
}

/**
 * Same-origin tile URL via Next route `/api/rv/*` → tilecache (avoids ORB + canvas taint when
 * Leaflet draws cross-origin images). Does not require the Python API.
 */
function buildRainViewerTileUrlDirect(product: Product, relPath: string): string {
  const color = RAINVIEWER_COLOR[product];
  const clean = relPath.replace(/^\/+/, "");
  return `/api/rv/${clean}/${RAINVIEWER_TILE_SIZE}/{z}/{x}/{y}/${color}/${RV_OPTIONS}.png`;
}

const RAINVIEWER_PUBLIC_MAPS = "https://api.rainviewer.com/public/weather-maps.json";
const NWS_ALERTS_ACTIVE = "https://api.weather.gov/alerts/active";

function mergeRainViewerMapsJson(j: unknown): RainViewerItem[] {
  const root = j && typeof j === "object" ? (j as Record<string, unknown>) : {};
  const radar =
    root.radar && typeof root.radar === "object" ? (root.radar as Record<string, unknown>) : {};
  const past = Array.isArray(radar.past) ? radar.past : [];
  const nowcast = Array.isArray(radar.nowcast) ? radar.nowcast : [];
  const merged: RainViewerItem[] = [];

  for (const item of past) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.path !== "string") continue;
    const tu = typeof o.time === "number" ? o.time : Number(o.time);
    if (!Number.isFinite(tu)) continue;
    merged.push({
      time_unix: tu,
      path: String(o.path).replace(/^\/+/, ""),
      source: "past"
    });
  }
  for (const item of nowcast) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.path !== "string") continue;
    const tu = typeof o.time === "number" ? o.time : Number(o.time);
    if (!Number.isFinite(tu)) continue;
    merged.push({
      time_unix: tu,
      path: String(o.path).replace(/^\/+/, ""),
      source: "nowcast"
    });
  }

  merged.sort((a, b) => a.time_unix - b.time_unix);
  const seen = new Set<string>();
  const unique: RainViewerItem[] = [];
  for (const f of merged) {
    const k = `${f.time_unix}|${f.path}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(f);
  }
  return unique;
}

let rvDirectFramesCache: { at: number; frames: RainViewerItem[] } | null = null;

async function getRainViewerFramesDirect(): Promise<RainViewerItem[]> {
  const now = Date.now();
  if (rvDirectFramesCache && now - rvDirectFramesCache.at < RV_FRAMES_TTL_MS) {
    return rvDirectFramesCache.frames;
  }
  const res = await fetch(RAINVIEWER_PUBLIC_MAPS, { cache: "default" });
  if (!res.ok) {
    throw new Error(`RainViewer maps HTTP ${res.status}`);
  }
  const frames = mergeRainViewerMapsJson(await res.json());
  if (frames.length === 0) {
    throw new Error("RainViewer maps had no frames");
  }
  rvDirectFramesCache = { at: now, frames };
  return frames;
}

function assignCategories(frames: RainViewerItem[], nowSec: number): RadarFrameCategory[] {
  const categories: RadarFrameCategory[] = frames.map((f) => (f.source === "nowcast" ? "nowcast" : "past"));
  const pastIndices = frames.map((f, i) => (f.source === "past" ? i : -1)).filter((i) => i >= 0);
  if (pastIndices.length) {
    let bestI = pastIndices[0]!;
    let bestD = Math.abs(frames[bestI]!.time_unix - nowSec);
    for (const j of pastIndices) {
      const d = Math.abs(frames[j]!.time_unix - nowSec);
      if (d < bestD) {
        bestD = d;
        bestI = j;
      }
    }
    for (const j of pastIndices) {
      categories[j] = j === bestI ? "now" : "past";
    }
  }
  return categories;
}

type MesonetTmsPayload = {
  services: Array<{ id: string; layername: string; utc_valid: string }>;
  generated_at?: string;
};

export type ActiveAlertsResponse = {
  type: string;
  features: Array<{
    type: string;
    geometry: GeoJSON.Geometry | null;
    properties: Record<string, unknown>;
  }>;
};

async function fetchNwsAlertsDirect(): Promise<ActiveAlertsResponse | null> {
  try {
    const r = await fetch(NWS_ALERTS_ACTIVE, {
      cache: "no-store",
      headers: { Accept: "application/geo+json, application/json" }
    });
    if (!r.ok) return null;
    return (await r.json()) as ActiveAlertsResponse;
  } catch {
    return null;
  }
}

let tmsClientCache: { at: number; data: MesonetTmsPayload } | null = null;
const CLIENT_TMS_MS = 60_000;

export async function fetchTmsData(): Promise<MesonetTmsPayload> {
  const now = Date.now();
  if (tmsClientCache && now - tmsClientCache.at < CLIENT_TMS_MS) {
    return tmsClientCache.data;
  }
  const tmsRes = await fetch(apiUrl("radar/mesonet-tms"), { cache: "default" });
  if (!tmsRes.ok) {
    const t = await tmsRes.text();
    throw new Error(messageForApiFetchFailure(tmsRes.status, t));
  }
  const data = (await tmsRes.json()) as MesonetTmsPayload;
  tmsClientCache = { at: now, data };
  return data;
}

let rainViewerFramesCache: { at: number; data: RainViewerListResponse } | null = null;

async function getRainViewerFrameList(): Promise<RainViewerListResponse> {
  const now = Date.now();
  if (rainViewerFramesCache && now - rainViewerFramesCache.at < RV_FRAMES_TTL_MS) {
    return rainViewerFramesCache.data;
  }
  const res = await fetch(apiUrl("radar/rainviewer-frames"), { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(messageForApiFetchFailure(res.status, t));
  }
  const data = (await res.json()) as RainViewerListResponse;
  rainViewerFramesCache = { at: now, data };
  return data;
}

/**
 * RainViewer: frame list from API if up, else public JSON; tiles always from tilecache (CORS).
 * Mesonet fallback still uses the API proxy only.
 */
export async function fetchFrames(product: Product): Promise<RadarFrame[]> {
  const nowSec = Math.floor(Date.now() / 1000);

  let raw: RainViewerItem[] = [];

  try {
    raw = await Promise.any([
      getRainViewerFrameList().then((r) => {
        if (!r.frames.length) throw new Error("empty-api");
        return r.frames;
      }),
      getRainViewerFramesDirect()
    ]);
  } catch {
    try {
      const { frames } = await getRainViewerFrameList();
      if (frames.length > 0) raw = frames;
    } catch {
      raw = [];
    }
    if (raw.length === 0) {
      try {
        raw = await getRainViewerFramesDirect();
      } catch {
        raw = [];
      }
    }
  }

  if (raw.length > 0) {
    const categories = assignCategories(raw, nowSec);
    return raw.map((item, i) => ({
      product,
      timestamp: toIsoUtc(item.time_unix),
      timeUnix: item.time_unix,
      category: categories[i]!,
      tile_url_template: buildRainViewerTileUrlDirect(product, item.path)
    }));
  }

  const tmsData = await fetchTmsData();
  const serviceId = product === "reflectivity" ? "ridge_uscomp_n0q" : "ridge_uscomp_n0r";
  const svc = tmsData.services.find((s) => s.id === serviceId) ?? tmsData.services[0];
  if (!svc) throw new Error("No radar data available");
  return [
    {
      product,
      timestamp: svc.utc_valid,
      timeUnix: Math.floor(Date.parse(svc.utc_valid) / 1000) || nowSec,
      category: "now" as const,
      tile_url_template: `${apiUrl(
        `proxy/mesonet/layer/${encodeURIComponent(svc.layername)}/{z}/{x}/{y}.png`
      )}`
    }
  ];
}

/**
 * IANA time zone for map center (Open-Meteo). For display of frame time in the viewed area.
 */
export type ViewportPlaceResult =
  | {
      ok: true;
      city?: string | null;
      state?: string | null;
      county?: string | null;
      lat: number;
      lon: number;
    }
  | { ok: false; error?: string | null; lat: number; lon: number };

export async function fetchViewportPlace(lat: number, lon: number): Promise<ViewportPlaceResult> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const r = await fetch(`${VIEWPORT_PLACE_PATH}?${q.toString()}`, { cache: "no-store" });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(messageForApiFetchFailure(r.status, t));
  }
  return (await r.json()) as ViewportPlaceResult;
}

export async function fetchMapAreaTimeZone(
  lat: number,
  lon: number
): Promise<{ iana: string; utcOffsetSeconds: number } | null> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current_weather: "true",
    timezone: "auto"
  });
  const url = `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      utc_offset_seconds?: number;
      timezone?: string;
    };
    if (!j.timezone) return null;
    return {
      iana: j.timezone,
      utcOffsetSeconds: typeof j.utc_offset_seconds === "number" ? j.utc_offset_seconds : 0
    };
  } catch {
    return null;
  }
}

export async function fetchActiveAlerts(): Promise<ActiveAlertsResponse> {
  let status = 0;
  let body = "";
  try {
    const res = await fetch(apiUrl("alerts/active"), { cache: "no-store" });
    if (res.ok) {
      return (await res.json()) as ActiveAlertsResponse;
    }
    status = res.status;
    body = await res.text();
  } catch {
    status = 0;
    body = "";
  }

  const direct = await fetchNwsAlertsDirect();
  if (direct) return direct;

  if (status) {
    throw new Error(messageForApiFetchFailure(status, body));
  }
  throw new Error(
    "Could not load NWS alerts. Start the API (cd frontend && npm run dev) or check your network."
  );
}

export async function fetchWisScore(
  severity: "tornado" | "severe_thunderstorm" | "flash_flood" | "special_weather",
  geometry: GeoJSON.Geometry
): Promise<{ wis_score: number }> {
  const res = await fetch(apiUrl("wis/score"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ severity, geometry })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(messageForApiFetchFailure(res.status, t));
  }
  return (await res.json()) as { wis_score: number };
}
