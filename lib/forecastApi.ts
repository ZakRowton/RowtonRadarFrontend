import { apiUrl, messageForApiFetchFailure } from "./api";

/** Same-origin Next route (NWS + optional OWM). Avoids 404 when `__api` rewrites to an old backend. */
const FORECAST_PANEL_PATH = "/api/forecast/panel";

export type AggregatedForecast = {
  temperature_f: number | null;
  wind_mph: number | null;
  relative_humidity: number | null;
  short_description: string;
  provider_count: number;
  sources: Array<{
    name: string;
    temperature_f?: number | null;
    wind_mph?: number | null;
    relative_humidity?: number | null;
    short_description?: string | null;
    ok: boolean;
    error?: string | null;
  }>;
};

export type ForecastDailyRow = {
  name?: string | null;
  date?: string | null;
  high_f?: number | null;
  low_f?: number | null;
  short_forecast?: string | null;
  wind?: string | null;
};

export type ForecastHourlyRow = {
  start_time?: string | null;
  temp_f?: number | null;
  humidity?: number | null;
  wind?: string | null;
  short_forecast?: string | null;
};

export type ConditionsQuadrant = {
  label: string;
  description: string;
  temp_f?: number | null;
  representative_time?: string | null;
};

export type ForecastPanel = {
  place?: string | null;
  time_zone?: string | null;
  sunrise?: string | null;
  sunset?: string | null;
  current_temp_f?: number | null;
  dewpoint_f?: number | null;
  today_high_f?: number | null;
  today_low_f?: number | null;
  humidity?: number | null;
  wind?: string | null;
  pressure_mb?: number | null;
  pressure_inhg?: number | null;
  short_description?: string | null;
  /** NWS first-period detailed narrative (outlook) */
  narrative_detail?: string | null;
  conditions_quadrants?: ConditionsQuadrant[];
  /** Next hour with precip signal within ~60 min */
  precip_soon?: { minutes: number; summary: string } | null;
  /** e.g. Low/Moderate from Open-Meteo air-quality pollen when available */
  pollen_summary?: string | null;
  daily: ForecastDailyRow[];
  hourly: ForecastHourlyRow[];
};

export async function fetchForecastPanel(lat: number, lon: number): Promise<ForecastPanel> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const r = await fetch(`${FORECAST_PANEL_PATH}?${q.toString()}`, { cache: "no-store" });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(messageForApiFetchFailure(r.status, t));
  }
  return (await r.json()) as ForecastPanel;
}

/** Legacy averaged snapshot (NWS + OWM). Prefer {@link fetchForecastPanel} for the UI. */
export async function fetchAggregatedForecast(lat: number, lon: number): Promise<AggregatedForecast> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const r = await fetch(`${apiUrl("forecast/aggregated")}?${q.toString()}`, { cache: "no-store" });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(messageForApiFetchFailure(r.status, t));
  }
  return (await r.json()) as AggregatedForecast;
}
