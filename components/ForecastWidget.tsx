"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Draggable from "react-draggable";
import { fetchForecastPanel, type ForecastPanel } from "@/lib/forecastApi";
import { usePanelResize } from "@/lib/usePanelResize";

type Props = {
  centerLat: number;
  centerLon: number;
  /** Your location — enables the Home tab. */
  home: { lat: number; lon: number } | null;
};

type Tab = "current" | "home" | "conditions" | "hourly" | "daily";

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

export default function ForecastWidget({ centerLat, centerLon, home }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("current");
  const [data, setData] = useState<ForecastPanel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const { heightPx, onResizeDown, onResizeMove, onResizeUp } = usePanelResize("forecast", nodeRef, {
    min: 120,
    max: 780
  });

  const load = useCallback(async () => {
    if (tab === "home" && !home) {
      setData(null);
      setErr("Your location is not set yet. Allow location in the browser or use the app until GPS works.");
      setLoading(false);
      return;
    }
    const lat = tab === "home" && home ? home.lat : centerLat;
    const lon = tab === "home" && home ? home.lon : centerLon;
    setLoading(true);
    setErr(null);
    try {
      setData(await fetchForecastPanel(lat, lon));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [centerLat, centerLon, home, tab]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (tab === "home" && !home) setTab("current");
  }, [tab, home]);

  const tz = data?.time_zone || undefined;
  const quads = data?.conditions_quadrants ?? [];
  const tabs: { id: Tab; label: string }[] = [
    { id: "current", label: "Current" },
    ...(home ? ([{ id: "home" as const, label: "Home" }] as const) : []),
    { id: "conditions", label: "Conditions" },
    { id: "hourly", label: "Hourly" },
    { id: "daily", label: "10-day" }
  ];
  const dataLat = tab === "home" && home ? home.lat : centerLat;
  const dataLon = tab === "home" && home ? home.lon : centerLon;

  return (
    <>
      <button
        type="button"
        className="forecast-fab"
        title="Forecast: NWS grid, hourly, Open-Meteo pressure and pollen, optional OpenWeatherMap"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Forecast</span>
      </button>
      {open && (
        <Draggable
          nodeRef={nodeRef}
          handle=".fc-drag"
          cancel="button,table,.fc-scroll,.fc-resize,input"
          onStart={() => {
            const sel = typeof window !== "undefined" ? window.getSelection() : null;
            if (sel && sel.rangeCount > 0) {
              sel.removeAllRanges();
            }
          }}
        >
          <div
            className={`forecast-floating ${heightPx != null ? "is-sized" : ""}`}
            ref={nodeRef}
            style={heightPx != null ? { height: heightPx, maxHeight: "min(90dvh, 820px)" } : undefined}
          >
            <div className="fc-drag" title="Drag">
              Forecast
              <button type="button" className="fc-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="fc-tabs" role="tablist" aria-label="Forecast sections">
              {tabs.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`fc-tab ${tab === id ? "is-on" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="fc-body">
              {loading && <p className="fc-hint">Loading…</p>}
              {err && <p className="fc-err">{err}</p>}
              {data && !loading && (
                <>
                  <p className="fc-loc">
                    {tab === "home" && <span className="fc-loc--tag">Home</span>}{" "}
                    {data.place ? `${data.place} · ` : ""}
                    {dataLat.toFixed(3)}°, {dataLon.toFixed(3)}°
                    {data.time_zone ? ` · ${data.time_zone}` : ""}
                  </p>

                  {tab === "current" && (
                    <>
                      {data.precip_soon && (
                        <p className="fc-precip-soon" role="status">
                          {data.precip_soon.summary}
                        </p>
                      )}

                      <p className="fc-headline">{data.short_description || "—"}</p>
                      {data.narrative_detail && <p className="fc-narrative-detail">{data.narrative_detail}</p>}

                      <ul className="fc-stats">
                        <li>
                          <span>Temp</span>
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
                          <span>Humidity</span>
                          <b>{data.humidity != null ? `${Math.round(data.humidity)}%` : "—"}</b>
                        </li>
                        <li>
                          <span>Dew point</span>
                          <b>{data.dewpoint_f != null ? `${data.dewpoint_f}°F` : "—"}</b>
                        </li>
                        <li>
                          <span>Pollen (outdoor)</span>
                          <b>{data.pollen_summary != null && data.pollen_summary !== "" ? data.pollen_summary : "—"}</b>
                        </li>
                        <li>
                          <span>Wind</span>
                          <b>{data.wind || "—"}</b>
                        </li>
                        <li>
                          <span>Sunrise</span>
                          <b>{formatLocalTime(data.sunrise, tz, { hour: "numeric", minute: "2-digit" })}</b>
                        </li>
                        <li>
                          <span>Sunset</span>
                          <b>{formatLocalTime(data.sunset, tz, { hour: "numeric", minute: "2-digit" })}</b>
                        </li>
                      </ul>
                    </>
                  )}

                  {tab === "home" && (
                    <>
                      {data.precip_soon && (
                        <p className="fc-precip-soon" role="status">
                          {data.precip_soon.summary}
                        </p>
                      )}

                      <p className="fc-headline">{data.short_description || "—"}</p>
                      {data.narrative_detail && <p className="fc-narrative-detail">{data.narrative_detail}</p>}

                      <ul className="fc-stats">
                        <li>
                          <span>Temp</span>
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
                          <span>Humidity</span>
                          <b>{data.humidity != null ? `${Math.round(data.humidity)}%` : "—"}</b>
                        </li>
                        <li>
                          <span>Wind</span>
                          <b>{data.wind || "—"}</b>
                        </li>
                      </ul>
                    </>
                  )}

                  {tab === "conditions" && (
                    <ul className="fc-conditions">
                      {quads.length === 0 && <li className="fc-conditions__empty">No time-of-day data.</li>}
                      {quads.map((q) => (
                        <li key={q.label} className="fc-conditions__row">
                          <div className="fc-conditions__top">
                            <span className="fc-conditions__name">{q.label}</span>
                            {q.temp_f != null && <span className="fc-conditions__temp">~{Math.round(q.temp_f)}°F</span>}
                          </div>
                          <p className="fc-conditions__desc">{q.description || "—"}</p>
                        </li>
                      ))}
                    </ul>
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
                    Grid and hourly:{" "}
                    <a href="https://www.weather.gov/documentation/services-web-api" target="_blank" rel="noreferrer">
                      NWS
                    </a>
                    . Surface pressure (when NWS+OWM not used):{" "}
                    <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                      Open-Meteo
                    </a>
                    . Pollen where available: Open-Meteo air-quality. Add{" "}
                    <code>OPENWEATHERMAP_API_KEY</code> on the server for OWM (pressure/wind can refine).
                  </p>
                </>
              )}
            </div>
            <div
              className="fc-resize"
              onPointerDown={onResizeDown}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              onPointerCancel={onResizeUp}
              title="Drag to resize height"
              aria-label="Resize forecast panel"
              role="slider"
              aria-orientation="vertical"
              tabIndex={0}
            />
          </div>
        </Draggable>
      )}
    </>
  );
}
