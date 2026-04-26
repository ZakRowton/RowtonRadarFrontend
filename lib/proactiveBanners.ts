import type { Feature, Geometry } from "geojson";
import centroid from "@turf/centroid";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import { getNwsFeatureId, nwsEventLabel } from "@/lib/alertDisplay";
import type { ForecastPanel } from "@/lib/forecastApi";

export type BannerLevel = "critical" | "warning" | "info";

export type ProactiveBanner = {
  id: string;
  text: string;
  level: BannerLevel;
  sound: "urgent" | "warning" | "info";
  /** Shown for home-related (always-on policy) */
  homeRelated: boolean;
};

const CLOSE_KM = 35;

function eventUrgency(ev: string): "urgent" | "warning" | "info" {
  const e = ev.toLowerCase();
  if (e.includes("tornado") && e.includes("warning")) return "urgent";
  if (e.includes("tornado") && e.includes("watch")) return "warning";
  if (e.includes("extreme wind")) return "urgent";
  if (e.includes("flash flood") && e.includes("warning")) return "urgent";
  if (e.includes("severe thunderstorm") && e.includes("warning")) return "warning";
  if (e.includes("warning")) return "warning";
  return "info";
}

function soundForUrgency(u: "urgent" | "warning" | "info"): "urgent" | "warning" | "info" {
  return u;
}

function distHomeToFeatureKm(lat: number, lon: number, f: Feature<Geometry, Record<string, unknown> | null>): number {
  try {
    const c = centroid(f as Feature<Geometry>);
    const [clon, clat] = c.geometry.coordinates;
    return distance(point([lon, lat]), point([clon, clat]), { units: "kilometers" });
  } catch {
    return 9999;
  }
}

/**
 * Build top-of-map proactive messages for home + map center. Home NWS polygons are always considered.
 */
export function buildProactiveBanners(params: {
  homeLat: number | null;
  homeLon: number | null;
  atHomeFeatures: Feature<Geometry, Record<string, unknown> | null>[];
  atMapCenterFeatures: Feature<Geometry, Record<string, unknown> | null>[];
  mapCenterLat: number;
  mapCenterLon: number;
  homeForecast: ForecastPanel | null;
  mapCenterForecast: ForecastPanel | null;
}): ProactiveBanner[] {
  const out: ProactiveBanner[] = [];
  const seen = new Set<string>();

  const push = (b: ProactiveBanner) => {
    if (seen.has(b.id)) return;
    seen.add(b.id);
    out.push(b);
  };

  for (const f of params.atHomeFeatures) {
    const id = getNwsFeatureId(f);
    const ev = nwsEventLabel(f);
    const u = eventUrgency(ev);
    if (u === "info") continue;
    const snd = soundForUrgency(u);
    if (u === "urgent") {
      const d =
        params.homeLat != null && params.homeLon != null
          ? distHomeToFeatureKm(params.homeLat, params.homeLon, f)
          : 9999;
      const near = d < CLOSE_KM;
      if (ev.toLowerCase().includes("tornado")) {
        const text = near
          ? `Tornado warning at your location — a storm is very close. Take cover now.`
          : `Tornado warning: your home is in the warning polygon. Take cover now.`;
        push({ id: `h-${id}`, text, level: "critical", sound: "urgent", homeRelated: true });
      } else {
        const text = `${ev} in effect for your home area — stay informed.`;
        push({ id: `h-${id}`, text, level: u === "urgent" ? "critical" : "warning", sound: snd, homeRelated: true });
      }
    } else {
      const d =
        params.homeLat != null && params.homeLon != null
          ? distHomeToFeatureKm(params.homeLat, params.homeLon, f)
          : 9999;
      const text =
        d < CLOSE_KM
          ? `${ev} in your area; storm in close range — use caution.`
          : `${ev} for your home location.`;
      push({ id: `h-${id}`, text, level: u === "warning" ? "warning" : "info", sound: snd, homeRelated: true });
    }
  }

  for (const f of params.atMapCenterFeatures) {
    const id = getNwsFeatureId(f);
    const ev = nwsEventLabel(f);
    const inHome = params.atHomeFeatures.some((g) => getNwsFeatureId(g) === id);
    if (inHome) continue;
    const u = eventUrgency(ev);
    if (u === "urgent" || u === "warning") {
      const d = distHomeToFeatureKm(params.mapCenterLat, params.mapCenterLon, f);
      const text =
        d < CLOSE_KM && (ev.toLowerCase().includes("tornado") || ev.toLowerCase().includes("severe"))
          ? `${ev} for map center — take cover.`
          : `${ev} currently covers the map center.`;
      push({
        id: `m-${id}`,
        text,
        level: u === "urgent" ? "critical" : "warning",
        sound: soundForUrgency(u),
        homeRelated: false
      });
    }
  }

  const pHome = params.homeForecast?.precip_soon;
  if (pHome?.summary && pHome.minutes < 60 && params.homeLat != null) {
    push({
      id: "precip-home",
      text: `Home: ${pHome.summary.replace(/\s+/g, " ")}`,
      level: "info",
      sound: "info",
      homeRelated: true
    });
  }

  const pMap = params.mapCenterForecast?.precip_soon;
  if (pMap?.summary && pMap.minutes < 60) {
    const id = "precip-map";
    if (!pHome || pHome.minutes !== pMap.minutes || pMap.summary !== pHome.summary) {
      push({
        id,
        text: pMap.summary.replace(/\s+/g, " "),
        level: "info",
        sound: "info",
        homeRelated: false
      });
    }
  }

  return out;
}
