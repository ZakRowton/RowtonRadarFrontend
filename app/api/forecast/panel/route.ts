import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NWS_UA =
  process.env.NWS_USER_AGENT?.trim() ||
  "WeatherRadar/1.0 (https://github.com/weather; contact: weather@localhost)";

const NWS_HEADERS: HeadersInit = {
  "User-Agent": NWS_UA,
  Accept: "application/geo+json, application/ld+json"
};

const OWM_KEY = process.env.OPENWEATHERMAP_API_KEY || "";

type Dict = Record<string, unknown>;

function tempF(period: Dict | undefined): number | null {
  if (!period) return null;
  const t = period.temperature;
  if (t == null) return null;
  const unit = String(period.temperatureUnit || "F").toUpperCase();
  const val = typeof t === "number" ? t : Number(t);
  if (Number.isNaN(val)) return null;
  if (unit === "C") {
    return (val * 9) / 5 + 32;
  }
  return val;
}

function humidityVal(h: unknown): number | null {
  if (h == null) return null;
  if (typeof h === "object" && h !== null && "value" in h) {
    const v = (h as { value?: unknown }).value;
    if (v == null) return null;
    return typeof v === "number" ? v : Number(v) || null;
  }
  if (typeof h === "number" && !Number.isNaN(h)) return h;
  return null;
}

export async function GET(req: NextRequest) {
  const latS = req.nextUrl.searchParams.get("lat");
  const lonS = req.nextUrl.searchParams.get("lon");
  if (!latS || !lonS) {
    return NextResponse.json({ detail: "lat and lon required" }, { status: 400 });
  }
  const lat = Number(latS);
  const lon = Number(lonS);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ detail: "Invalid coordinates" }, { status: 400 });
  }

  try {
    const panel = await buildForecastPanel(lat, lon);
    return NextResponse.json(panel);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forecast failed";
    return NextResponse.json({ detail: msg }, { status: 502 });
  }
}

async function buildForecastPanel(lat: number, lon: number) {
  const pr = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: NWS_HEADERS,
    cache: "no-store"
  });
  if (pr.status === 404) {
    throw new Error("Outside NWS coverage (US locations only).");
  }
  if (!pr.ok) {
    throw new Error(`NWS points HTTP ${pr.status}`);
  }
  const pdata = (await pr.json()) as { properties?: Dict };
  const props = pdata.properties || {};

  const fUrl = props.forecast;
  const fhUrl = props.forecastHourly;
  if (typeof fUrl !== "string" || typeof fhUrl !== "string") {
    throw new Error("NWS response missing forecast URLs");
  }

  const rel = props.relativeLocation;
  const relProps = rel && typeof rel === "object" && (rel as Dict).properties && typeof (rel as Dict).properties === "object"
    ? ((rel as { properties: Dict }).properties)
    : {};
  const city = relProps.city;
  const state = relProps.state;
  const place = [typeof city === "string" ? city : null, typeof state === "string" ? state : null].filter(Boolean).join(", ") || null;

  const timeZone = (typeof props.timeZone === "string" ? props.timeZone : null) || "UTC";
  const astro =
    props.astronomicalData && typeof props.astronomicalData === "object"
      ? (props.astronomicalData as Dict)
      : ({} as Dict);
  const sunrise = astro.sunrise == null ? null : String(astro.sunrise);
  const sunset = astro.sunset == null ? null : String(astro.sunset);

  const [fr, fh] = await Promise.all([
    fetch(fUrl, { headers: NWS_HEADERS, cache: "no-store" }),
    fetch(fhUrl, { headers: NWS_HEADERS, cache: "no-store" })
  ]);

  if (!fr.ok) {
    throw new Error(`NWS forecast HTTP ${fr.status}`);
  }
  if (!fh.ok) {
    throw new Error(`NWS hourly HTTP ${fh.status}`);
  }

  const fd = (await fr.json()) as { properties?: { periods?: unknown[] } };
  const hd = (await fh.json()) as { properties?: { periods?: unknown[] } };
  const fPeriods = (fd.properties?.periods || []).filter((p): p is Dict => p != null && typeof p === "object");
  const hPeriods = (hd.properties?.periods || []).filter((p): p is Dict => p != null && typeof p === "object");

  const daily: Array<{
    name?: string | null;
    date?: string | null;
    high_f?: number | null;
    low_f?: number | null;
    short_forecast?: string | null;
    wind?: string | null;
  }> = [];

  for (let i = 0; i < fPeriods.length; i++) {
    const p = fPeriods[i]!;
    if (p.isDaytime !== true) continue;
    const high = tempF(p);
    let low: number | null = null;
    const nxt = fPeriods[i + 1];
    if (nxt && nxt.isDaytime === false) {
      low = tempF(nxt);
    }
    const st = String(p.startTime || "");
    daily.push({
      name: (typeof p.name === "string" ? p.name : null) as string | null,
      date: st.length >= 10 ? st.slice(0, 10) : null,
      high_f: high,
      low_f: low,
      short_forecast: (typeof p.shortForecast === "string" ? p.shortForecast : null) as string | null,
      wind: (typeof p.windSpeed === "string" || typeof p.windSpeed === "number" ? String(p.windSpeed) : null) as string | null
    });
    if (daily.length >= 10) break;
  }

  const hourly: Array<{
    start_time?: string | null;
    temp_f?: number | null;
    humidity?: number | null;
    wind?: string | null;
    short_forecast?: string | null;
  }> = [];
  for (const p of hPeriods.slice(0, 48)) {
    hourly.push({
      start_time: (typeof p.startTime === "string" ? p.startTime : null) as string | null,
      temp_f: tempF(p),
      humidity: humidityVal(p.relativeHumidity as unknown) ?? null,
      wind: (typeof p.windSpeed === "string" || typeof p.windSpeed === "number" ? String(p.windSpeed) : null) as string | null,
      short_forecast: (typeof p.shortForecast === "string" ? p.shortForecast : null) as string | null
    });
  }

  const h0 = hPeriods[0] || ({} as Dict);
  let currentTemp = tempF(h0) ?? null;
  let currentHumidity = humidityVal(h0?.relativeHumidity) ?? null;
  let currentWind: string | null = (h0 && typeof h0.windSpeed === "string" ? h0.windSpeed : null) as string | null;

  let todayHigh: number | null = null;
  let todayLow: number | null = null;
  if (hPeriods.length) {
    const st0 = String(hPeriods[0]!.startTime || "");
    if (st0.length >= 10) {
      const dayKey = st0.slice(0, 10);
      const slotTemps: number[] = [];
      for (const p of hPeriods) {
        const st = String(p.startTime || "");
        if (st.length >= 10 && st.slice(0, 10) === dayKey) {
          const tv = tempF(p);
          if (tv != null) slotTemps.push(tv);
        }
      }
      if (slotTemps.length) {
        todayHigh = Math.max(...slotTemps);
        todayLow = Math.min(...slotTemps);
      }
    }
  }
  if (todayHigh == null && daily.length) {
    todayHigh = (daily[0]!.high_f as number) ?? null;
    todayLow = (daily[0]!.low_f as number) ?? null;
  }

  let pressureMb: number | null = null;
  let pressureInhg: number | null = null;
  let owmDesc: string | null = null;

  if (OWM_KEY) {
    try {
      const ow = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${encodeURIComponent(OWM_KEY)}&units=imperial`,
        { cache: "no-store" }
      );
      if (ow.ok) {
        const d = (await ow.json()) as { main?: Dict; wind?: Dict; weather?: Array<Dict> };
        const main = d.main || {};
        const prs = main.pressure;
        if (typeof prs === "number" && !Number.isNaN(prs)) {
          pressureMb = prs;
          pressureInhg = Math.round(prs * 0.029529983071445 * 100) / 100;
        }
        if (currentTemp == null && main.temp != null) {
          currentTemp = Number(main.temp) || null;
        }
        if (currentHumidity == null && main.humidity != null) {
          currentHumidity = Number(main.humidity) || null;
        }
        if (currentWind == null) {
          const wspd = d.wind?.speed;
          if (wspd != null) currentWind = `${wspd} mph`;
        }
        const wx = d.weather;
        if (Array.isArray(wx) && wx[0] && typeof wx[0].description === "string") {
          owmDesc = wx[0].description;
        }
      }
    } catch {
      /* OWM optional */
    }
  }

  const f0 = fPeriods[0] || ({} as Dict);
  const narrative = String(
    f0 && typeof f0.shortForecast === "string" ? f0.shortForecast
    : f0 && typeof f0.detailedForecast === "string" ? f0.detailedForecast
    : ""
  ).trim() || null;

  return {
    place,
    time_zone: timeZone,
    sunrise: sunrise,
    sunset: sunset,
    current_temp_f: currentTemp != null ? Math.round(currentTemp * 10) / 10 : null,
    today_high_f: todayHigh != null ? Math.round(todayHigh * 10) / 10 : null,
    today_low_f: todayLow != null ? Math.round(todayLow * 10) / 10 : null,
    humidity: currentHumidity != null ? Math.round(currentHumidity) : null,
    wind: currentWind,
    pressure_mb: pressureMb,
    pressure_inhg: pressureInhg,
    short_description: narrative || owmDesc || "—",
    daily,
    hourly
  };
}
