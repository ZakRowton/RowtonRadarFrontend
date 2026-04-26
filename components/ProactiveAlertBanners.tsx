"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { playInfoPing, playUrgentChime, playWarningChime } from "@/lib/alertSound";
import { buildProactiveBanners, type ProactiveBanner } from "@/lib/proactiveBanners";
import { filterFeaturesForPoint } from "@/lib/alertsInView";
import { fetchForecastPanel, type ForecastPanel } from "@/lib/forecastApi";
import type { ActiveAlertsResponse } from "@/lib/api";
import type { Feature, FeatureCollection, Geometry } from "geojson";

const SOUND_COOLDOWN_MS = 100_000;
const PRECIP_HOME_ID = "precip-home";

type Props = {
  alerts: ActiveAlertsResponse | null;
  homeLat: number | null;
  homeLon: number | null;
  mapCenterLat: number;
  mapCenterLon: number;
};

function playForSound(s: ProactiveBanner["sound"]): void {
  if (s === "urgent") void playUrgentChime();
  else if (s === "warning") void playWarningChime();
  else void playInfoPing();
}

function canPlayNow(id: string): boolean {
  try {
    const raw = sessionStorage.getItem(`rowton.bsnd.${id}`);
    if (!raw) return true;
    const t = parseInt(raw, 10);
    if (!Number.isFinite(t)) return true;
    return Date.now() - t > SOUND_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markPlayed(id: string): void {
  try {
    sessionStorage.setItem(`rowton.bsnd.${id}`, String(Date.now()));
  } catch {
    /* */
  }
}

function shouldAutoplay(b: ProactiveBanner): boolean {
  if (b.homeRelated && b.sound !== "info") return true;
  if (b.id === PRECIP_HOME_ID) return true;
  return b.sound === "urgent" || b.sound === "warning";
}

export default function ProactiveAlertBanners({
  alerts,
  homeLat,
  homeLon,
  mapCenterLat,
  mapCenterLon
}: Props) {
  const [mapFc, setMapFc] = useState<ForecastPanel | null>(null);
  const [homeFc, setHomeFc] = useState<ForecastPanel | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const fc: FeatureCollection | null = useMemo(
    () => (alerts?.type === "FeatureCollection" ? (alerts as FeatureCollection) : null),
    [alerts]
  );

  const atHome: Feature<Geometry, Record<string, unknown> | null>[] = useMemo(
    () => (fc && homeLat != null && homeLon != null ? filterFeaturesForPoint(fc, homeLat, homeLon) : []),
    [fc, homeLat, homeLon]
  );

  const atMap: Feature<Geometry, Record<string, unknown> | null>[] = useMemo(
    () => (fc ? filterFeaturesForPoint(fc, mapCenterLat, mapCenterLon) : []),
    [fc, mapCenterLat, mapCenterLon]
  );

  useEffect(() => {
    let c = false;
    void (async () => {
      try {
        const p = await fetchForecastPanel(mapCenterLat, mapCenterLon);
        if (!c) setMapFc(p);
      } catch {
        if (!c) setMapFc(null);
      }
    })();
    return () => {
      c = true;
    };
  }, [mapCenterLat, mapCenterLon]);

  useEffect(() => {
    if (homeLat == null || homeLon == null) {
      setHomeFc(null);
      return;
    }
    let c = false;
    void (async () => {
      try {
        const p = await fetchForecastPanel(homeLat, homeLon);
        if (!c) setHomeFc(p);
      } catch {
        if (!c) setHomeFc(null);
      }
    })();
    return () => {
      c = true;
    };
  }, [homeLat, homeLon]);

  const list = useMemo(
    () =>
      buildProactiveBanners({
        homeLat,
        homeLon,
        atHomeFeatures: atHome,
        atMapCenterFeatures: atMap,
        mapCenterLat,
        mapCenterLon,
        homeForecast: homeFc,
        mapCenterForecast: mapFc
      }),
    [homeLat, homeLon, atHome, atMap, mapCenterLat, mapCenterLon, homeFc, mapFc]
  );

  useEffect(() => {
    const pr = (x: ProactiveBanner) => (x.sound === "urgent" ? 0 : x.sound === "warning" ? 1 : 2);
    const next = new Set(list.map((b) => b.id));
    const newcomers = list
      .filter((b) => !seenIds.current.has(b.id))
      .sort((a, b) => {
        const d = pr(a) - pr(b);
        if (d !== 0) return d;
        if (a.homeRelated && !b.homeRelated) return -1;
        if (!a.homeRelated && b.homeRelated) return 1;
        return 0;
      });
    seenIds.current = next;

    const pick = newcomers.find((b) => shouldAutoplay(b) && canPlayNow(b.id));
    if (pick) {
      playForSound(pick.sound);
      markPlayed(pick.id);
    }
  }, [list]);

  if (list.length === 0) return null;

  return (
    <div className="proactive-banner-stack" role="status" aria-live="polite">
      {list.map((b) => (
        <div
          key={b.id}
          className={
            b.level === "critical"
              ? "proactive-banner proactive-banner--critical"
              : b.level === "warning"
                ? "proactive-banner proactive-banner--warning"
                : "proactive-banner proactive-banner--info"
          }
        >
          {b.homeRelated && <span className="proactive-banner__tag">Home</span>}
          <p className="proactive-banner__text">{b.text}</p>
        </div>
      ))}
    </div>
  );
}
