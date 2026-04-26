"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Draggable from "react-draggable";
import { fetchAggregatedForecast, type AggregatedForecast } from "@/lib/forecastApi";

type Props = {
  centerLat: number;
  centerLon: number;
};

export default function ForecastWidget({ centerLat, centerLon }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AggregatedForecast | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await fetchAggregatedForecast(centerLat, centerLon));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [centerLat, centerLon]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <>
      <button
        type="button"
        ref={fabRef}
        className="forecast-fab"
        title="Averaged forecast (Open-Meteo + OpenWeatherMap + NWS where available)"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Forecast</span>
      </button>
      {open && (
        <Draggable
          nodeRef={nodeRef}
          handle=".fc-drag"
          cancel="button,table"
          onStart={() => {
            const sel = typeof window !== "undefined" ? window.getSelection() : null;
            if (sel && sel.rangeCount > 0) {
              sel.removeAllRanges();
            }
          }}
        >
          <div className="forecast-floating" ref={nodeRef}>
            <div className="fc-drag" title="Drag">
              Averaged forecast
              <button type="button" className="fc-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="fc-body">
              {loading && <p className="fc-hint">Loading…</p>}
              {err && <p className="fc-err">{err}</p>}
              {data && !loading && (
                <>
                  <p className="fc-loc">
                    {centerLat.toFixed(3)}°, {centerLon.toFixed(3)}° · {data.provider_count} provider
                    {data.provider_count === 1 ? "" : "s"} responded
                  </p>
                  <ul className="fc-stats">
                    <li>
                      <span>Temp (avg)</span>
                      <b>{data.temperature_f != null ? `${data.temperature_f}°F` : "—"}</b>
                    </li>
                    <li>
                      <span>Wind (avg)</span>
                      <b>{data.wind_mph != null ? `${data.wind_mph} mph` : "—"}</b>
                    </li>
                    <li>
                      <span>Humidity (avg)</span>
                      <b>{data.relative_humidity != null ? `${data.relative_humidity}%` : "—"}</b>
                    </li>
                  </ul>
                  <p className="fc-narrative">{data.short_description}</p>
                  <div className="fc-sources">
                    {data.sources.map((s) => (
                      <div key={s.name} className={`fc-src ${s.ok ? "ok" : "err"}`}>
                        <span>{s.name}</span>
                        {s.error ? <em>{s.error}</em> : s.temperature_f != null ? <em>{s.temperature_f}°F</em> : null}
                      </div>
                    ))}
                  </div>
                  <p className="fc-attr">
                    Includes{" "}
                    <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                      Open-Meteo
                    </a>{" "}
                    (no key). NWS via api.weather.gov (US). OWM if API key is set.
                  </p>
                </>
              )}
            </div>
          </div>
        </Draggable>
      )}
    </>
  );
}
