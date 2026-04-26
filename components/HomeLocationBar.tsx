"use client";

import { useEffect, useState } from "react";
import { fetchViewportPlace, type ViewportPlaceResult } from "@/lib/api";
type Props = {
  /** Live GPS / saved home; when null, bar is hidden. */
  home: { lat: number; lon: number } | null;
  onGoHome: () => void;
};

function fmtCoords(lat: number, lon: number) {
  return `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
}

export default function HomeLocationBar({ home, onGoHome }: Props) {
  const [data, setData] = useState<ViewportPlaceResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!home) {
      setData(null);
      return;
    }
    let c = false;
    setLoading(true);
    setData(null);
    const t = window.setTimeout(() => {
      void fetchViewportPlace(home.lat, home.lon)
        .then((d) => {
          if (!c) setData(d);
        })
        .catch(() => {
          if (!c) setData({ ok: false, error: "lookup_failed", lat: home.lat, lon: home.lon });
        })
        .finally(() => {
          if (!c) setLoading(false);
        });
    }, 400);
    return () => {
      c = true;
      window.clearTimeout(t);
    };
  }, [home]);

  if (!home) {
    return null;
  }

  const line1 = data?.ok
    ? [data.city, data.state].filter(Boolean).join(", ") || fmtCoords(home.lat, home.lon)
    : null;

  return (
    <button
      type="button"
      className="map-home-loc"
      onClick={onGoHome}
      title="Center map on your location"
    >
      <div className="map-home-loc__label">Your location</div>
      <div className="map-home-loc__line1">{loading && !line1 ? "Resolving place…" : (line1 ?? "…")}</div>
      <div className="map-home-loc__line2" title="Your saved location (tap to center)">
        {data?.ok && data.county
          ? `${/county|parish|borough/i.test(String(data.county)) ? data.county : `${data.county} County`} — `
          : null}
        <span className="map-home-loc__coords">{fmtCoords(home.lat, home.lon)}</span>
      </div>
      <div className="map-home-loc__hint" aria-hidden>
        Tap to center on map
      </div>
    </button>
  );
}
