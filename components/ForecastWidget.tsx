"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Draggable from "react-draggable";
import { fetchForecastPanel, type ForecastPanel } from "@/lib/forecastApi";

type Props = {
  centerLat: number;
  centerLon: number;
};

type Tab = "today" | "hourly" | "daily";

function formatLocalTime(
  iso: string | null | undefined,
  timeZone: string | undefined,
  opts: Intl.DateTimeFormatOptions
): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, { timeZone: timeZone || undefined, ...opts }).format(d);
  } catch {
    return iso;
  }
}

function hourLabel(iso: string | null | undefined, timeZone: string | undefined): string {
  return formatLocalTime(iso, timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ForecastWidget({ centerLat, centerLon }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [data, setData] = useState<ForecastPanel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await fetchForecastPanel(centerLat, centerLon));
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

  const tz = data?.time_zone || undefined;

  return (
    <>
      <button
        type="button"
        className="forecast-fab"
        title="Forecast: NWS grid + hourly (US). Pressure from OpenWeatherMap if configured."
        onClick={() => setOpen((v) => !v)}
      >
        <span>Forecast</span>
      </button>
      {open && (
        <Draggable
          nodeRef={nodeRef}
          handle=".fc-drag"
          cancel="button,table,.fc-scroll"
          onStart={() => {
            const sel = typeof window !== "undefined" ? window.getSelection() : null;
            if (sel && sel.rangeCount > 0) {
              sel.removeAllRanges();
            }
          }}
        >
          <div className="forecast-floating" ref={nodeRef}>
            <div className="fc-drag" title="Drag">
              Forecast
              <button type="button" className="fc-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="fc-tabs" role="tablist" aria-label="Forecast sections">
              {(["today", "hourly", "daily"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`fc-tab ${tab === t ? "is-on" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t === "today" ? "Now" : t === "hourly" ? "Hourly" : "10-day"}
                </button>
              ))}
            </div>
            <div className="fc-body">
              {loading && <p className="fc-hint">Loading…</p>}
              {err && <p className="fc-err">{err}</p>}
              {data && !loading && (
                <>
                  <p className="fc-loc">
                    {data.place ? `${data.place} · ` : ""}
                    {centerLat.toFixed(3)}°, {centerLon.toFixed(3)}°
                    {data.time_zone ? ` · ${data.time_zone}` : ""}
                  </p>

                  {tab === "today" && (
                    <>
                      <ul className="fc-stats">
                        <li>
                          <span>Sunrise</span>
                          <b>{formatLocalTime(data.sunrise, tz, { hour: "numeric", minute: "2-digit" })}</b>
                        </li>
                        <li>
                          <span>Sunset</span>
                          <b>{formatLocalTime(data.sunset, tz, { hour: "numeric", minute: "2-digit" })}</b>
                        </li>
                        <li>
                          <span>Temp now</span>
                          <b>{data.current_temp_f != null ? `${data.current_temp_f}°F` : "—"}</b>
                        </li>
                        <li>
                          <span>High / low today</span>
                          <b>
                            {data.today_high_f != null ? `${data.today_high_f}°` : "—"} /{" "}
                            {data.today_low_f != null ? `${data.today_low_f}°` : "—"}F
                          </b>
                        </li>
                        <li>
                          <span>Humidity</span>
                          <b>{data.humidity != null ? `${Math.round(data.humidity)}%` : "—"}</b>
                        </li>
                        <li>
                          <span>Pressure</span>
                          <b>
                            {data.pressure_inhg != null
                              ? `${data.pressure_inhg} inHg`
                              : data.pressure_mb != null
                                ? `${data.pressure_mb} mb`
                                : "—"}
                          </b>
                        </li>
                        <li>
                          <span>Wind</span>
                          <b>{data.wind || "—"}</b>
                        </li>
                      </ul>
                      <p className="fc-narrative">{data.short_description || "—"}</p>
                    </>
                  )}

                  {tab === "hourly" && (
                    <div className="fc-scroll">
                      <table className="fc-table fc-table--hourly">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>°F</th>
                            <th>RH%</th>
                            <th>Wind</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.hourly.map((h, i) => (
                            <tr key={`${h.start_time}-${i}`}>
                              <td>{hourLabel(h.start_time ?? null, tz)}</td>
                              <td>{h.temp_f != null ? Math.round(h.temp_f) : "—"}</td>
                              <td>{h.humidity != null ? Math.round(h.humidity) : "—"}</td>
                              <td className="fc-wind">{h.wind || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {tab === "daily" && (
                    <div className="fc-scroll">
                      <table className="fc-table fc-table--daily">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>Hi</th>
                            <th>Lo</th>
                            <th>Forecast</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.daily.map((d, i) => (
                            <tr key={`${d.date}-${i}`}>
                              <td>{d.name || d.date || "—"}</td>
                              <td>{d.high_f != null ? Math.round(d.high_f) : "—"}</td>
                              <td>{d.low_f != null ? Math.round(d.low_f) : "—"}</td>
                              <td className="fc-day-desc">{d.short_forecast || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <p className="fc-attr">
                    Data from{" "}
                    <a href="https://www.weather.gov/documentation/services-web-api" target="_blank" rel="noreferrer">
                      api.weather.gov
                    </a>
                    . Barometric pressure from{" "}
                    <a href="https://openweathermap.org/api" target="_blank" rel="noreferrer">
                      OpenWeatherMap
                    </a>{" "}
                    when <code>OPENWEATHERMAP_API_KEY</code> is set on the API server.
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
