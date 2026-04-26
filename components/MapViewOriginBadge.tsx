"use client";

import { useEffect, useState } from "react";
import { fetchViewportPlace, type ViewportPlaceResult } from "@/lib/api";

type Props = {
  centerLat: number;
  centerLon: number;
};

export default function MapViewOriginBadge({ centerLat, centerLon }: Props) {
  const [data, setData] = useState<ViewportPlaceResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
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

  const line1 =
    data?.ok && (data.city || data.state)
      ? [data.city, data.state].filter(Boolean).join(", ")
      : `${centerLat.toFixed(3)}°, ${centerLon.toFixed(3)}°`;

  const countyLine = data?.ok && data.county ? data.county : null;

  const countyBlock =
    data?.ok === true ? (
      countyLine ? (
        <div className="map-view-origin-badge__county">
          <span className="map-view-origin-badge__county-tag">County</span>
          <span className="map-view-origin-badge__county-name">{countyLine}</span>
        </div>
      ) : (
        <div className="map-view-origin-badge__county map-view-origin-badge__county--muted">
          <span className="map-view-origin-badge__county-tag">County</span>
          <span>—</span>
        </div>
      )
    ) : (
      <div className="map-view-origin-badge__county map-view-origin-badge__county--muted">
        {loading ? "…" : data?.ok === false ? "Outside NWS coverage" : "—"}
      </div>
    );

  return (
    <div className="map-view-origin-badge" aria-live="polite">
      <div className="map-view-origin-badge__label">Viewport center</div>
      <div className="map-view-origin-badge__line">{line1}</div>
      {countyBlock}
    </div>
  );
}
