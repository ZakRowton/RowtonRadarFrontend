"use client";

import { useEffect, useState } from "react";
import { fetchViewportPlace, type ViewportPlaceResult } from "@/lib/api";

type Props = {
  centerLat: number;
  centerLon: number;
};

function formatCountyLabel(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "";
  const t = raw.trim();
  if (/\b(county|parish|borough|municipio|planning region)\b/i.test(t)) return t;
  return `${t} County`;
}

const coordsPrecise = (lat: number, lon: number) => `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;

export default function MapViewOriginBadge({ centerLat, centerLon }: Props) {
  const [data, setData] = useState<ViewportPlaceResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setLoading(true);
    const t = window.setTimeout(() => {
      void fetchViewportPlace(centerLat, centerLon)
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          if (!cancelled) setData({ ok: false, error: "lookup_failed", lat: centerLat, lon: centerLon });
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [centerLat, centerLon]);

  const cityState =
    data?.ok && (data.city || data.state) ? [data.city, data.state].filter(Boolean).join(", ") : null;

  const countyDisplay = data?.ok && data.county ? formatCountyLabel(data.county) : null;

  if (data == null) {
    return (
      <div className="map-view-origin-badge" aria-live="polite">
        <div className="map-view-origin-badge__label">Map center</div>
        <div className="map-view-origin-badge__line">
          {loading ? "Resolving place…" : "—"}
        </div>
        <div className="map-view-origin-badge__line map-view-origin-badge__line--place2 map-view-origin-badge--muted">
          {coordsPrecise(centerLat, centerLon)}
        </div>
      </div>
    );
  }

  return (
    <div className="map-view-origin-badge" aria-live="polite">
      <div className="map-view-origin-badge__label">Map center</div>
      {data.ok ? (
        <>
          <div className="map-view-origin-badge__line">
            {cityState || "—"}
          </div>
          <div className="map-view-origin-badge__line map-view-origin-badge__line--place2">
            {countyDisplay ? <span className="map-view-origin-badge__countyline">{countyDisplay}</span> : "—"}
          </div>
          <div className="map-view-origin-badge__coords" title="Center latitude / longitude (viewport)">
            {coordsPrecise(centerLat, centerLon)}
          </div>
        </>
      ) : (
        <>
          <div className="map-view-origin-badge__line">{coordsPrecise(centerLat, centerLon)}</div>
          <div className="map-view-origin-badge__line map-view-origin-badge__line--place2 map-view-origin-badge--muted">
            Outside NWS (US) coverage — city and county are unavailable
          </div>
        </>
      )}
    </div>
  );
}
