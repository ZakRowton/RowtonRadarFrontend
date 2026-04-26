import { apiUrl, messageForApiFetchFailure } from "./api";

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

/** When FastAPI is down, Open-Meteo allows browser CORS — single-source snapshot. */
async function fetchOpenMeteoClientFallback(lat: number, lon: number): Promise<AggregatedForecast> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
    wind_speed_unit: "mph",
    temperature_unit: "fahrenheit"
  });
  const url = `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`Open-Meteo HTTP ${r.status}`);
  }
  const d = (await r.json()) as {
    current?: Record<string, number | string | null | undefined>;
  };
  const cur = d.current || {};
  const t = cur.temperature_2m;
  const rh = cur.relative_humidity_2m;
  const w = cur.wind_speed_10m;
  const wc = cur.weather_code;
  const ok = typeof t === "number";
  return {
    temperature_f: ok ? t : null,
    wind_mph: typeof w === "number" ? w : null,
    relative_humidity: typeof rh === "number" ? rh : null,
    short_description:
      typeof wc === "number"
        ? `Code ${wc} (Open-Meteo in browser — Python API offline)`
        : "Open-Meteo in browser (Python API offline)",
    provider_count: ok ? 1 : 0,
    sources: [
      {
        name: "open-meteo",
        temperature_f: typeof t === "number" ? t : null,
        wind_mph: typeof w === "number" ? w : null,
        relative_humidity: typeof rh === "number" ? rh : null,
        short_description: typeof wc === "number" ? `Code ${wc}` : null,
        ok,
        error: ok ? null : "No temperature in Open-Meteo response"
      }
    ]
  };
}

export async function fetchAggregatedForecast(lat: number, lon: number): Promise<AggregatedForecast> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const u = `${apiUrl("forecast/aggregated")}?${q.toString()}`;

  let status = 0;
  let body = "";
  try {
    const r = await fetch(u, { cache: "no-store" });
    if (r.ok) {
      return (await r.json()) as AggregatedForecast;
    }
    status = r.status;
    body = await r.text();
  } catch {
    status = 0;
    body = "";
  }

  try {
    return await fetchOpenMeteoClientFallback(lat, lon);
  } catch {
    if (status) {
      throw new Error(messageForApiFetchFailure(status, body));
    }
    throw new Error(
      "Forecast unavailable (Python API offline and Open-Meteo request failed). Check network."
    );
  }
}
