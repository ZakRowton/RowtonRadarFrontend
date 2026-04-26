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

function dewpointF(period: Dict | undefined): number | null {
  if (!period) return null;
  const d = period.dewpoint;
  if (!d || typeof d !== "object") return null;
  const o = d as { value?: unknown; unitCode?: unknown };
  if (o.value == null) return null;
  const v = typeof o.value === "number" ? o.value : Number(o.value);
  if (Number.isNaN(v)) return null;
  const u = String(o.unitCode || "");
  if (u.includes("degC") || u.includes("Cel")) {
    return (v * 9) / 5 + 32;
  }
  return v;
}

function popPercent(period: Dict | undefined): number | null {
  if (!period) return null;
  const p = period.probabilityOfPrecipitation;
  if (p == null) return null;
  if (typeof p === "object" && p !== null && "value" in p) {
    const v = (p as { value: unknown }).value;
    if (v == null) return null;
    return typeof v === "number" ? v : Number(v) || null;
  }
  return null;
}

function windDirection(period: Dict | undefined): string | null {
  if (!period) return null;
  const w = period.windDirection;
  if (typeof w === "string" && w.trim()) return w.trim();
  if (typeof w === "number" && !Number.isNaN(w)) return `${Math.round(w)}°`;
  return null;
}

const PRECIP_RE =
  /rain|shower|drizzle|thunder|storm|tornado|snow|sleet|hail|precip|sprinkle|flood|funnel|fog|freez/i;

function isLikelyPrecip(period: Dict, pop: number | null): boolean {
  const sf = String(period.shortForecast || "");
  if (PRECIP_RE.test(sf)) return true;
  if (pop != null && pop >= 28) return true;
  return false;
}

type DayQuadrant = { label: string; startHour: number; endHour: number };
const DAY_QUADRANTS: DayQuadrant[] = [
  { label: "Morning", startHour: 5, endHour: 12 },
  { label: "Midday", startHour: 12, endHour: 15 },
  { label: "Afternoon", startHour: 15, endHour: 18 },
  { label: "Evening", startHour: 18, endHour: 23 }
];

function localWallHour(utc: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false
  }).formatToParts(utc);
  const h = parts.find((p) => p.type === "hour")?.value;
  if (!h) return utc.getUTCHours();
  return Math.min(23, Math.max(0, parseInt(h, 10) || 0));
}

function localYmd(utc: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(utc);
}

type QuadrantOut = { label: string; description: string; temp_f: number | null; representative_time?: string | null };

function buildQuadrantConditions(
  hPeriods: Dict[],
  timeZone: string,
  now: Date
): QuadrantOut[] {
  const todayYmd = localYmd(now, timeZone);
  const slot: Record<string, { fore: string[]; temps: number[]; times: string[] }> = {
    Morning: { fore: [], temps: [], times: [] },
    Midday: { fore: [], temps: [], times: [] },
    Afternoon: { fore: [], temps: [], times: [] },
    Evening: { fore: [], temps: [], times: [] }
  };
  for (const p of hPeriods) {
    const st = p.startTime;
    if (typeof st !== "string" || st.length < 4) continue;
    const t = new Date(st);
    if (Number.isNaN(t.getTime())) continue;
    if (localYmd(t, timeZone) !== todayYmd) continue;
    const hr = localWallHour(t, timeZone);
    let key: keyof typeof slot | null = null;
    for (const q of DAY_QUADRANTS) {
      if (hr >= q.startHour && hr < q.endHour) {
        key = q.label as keyof typeof slot;
        break;
      }
    }
    if (!key) continue;
    const tv = tempF(p);
    const s = p.shortForecast;
    if (typeof s === "string" && s.trim()) slot[key].fore.push(s);
    if (tv != null) slot[key].temps.push(tv);
    slot[key].times.push(st);
  }
  const out: QuadrantOut[] = [];
  for (const q of DAY_QUADRANTS) {
    const a = slot[q.label as keyof typeof slot];
    if (a.fore.length === 0 && a.temps.length === 0) {
      out.push({ label: q.label, description: "—", temp_f: null, representative_time: null });
    } else {
      const bestFore = a.fore[Math.floor(a.fore.length / 2)] || a.fore[0] || "—";
      const tavg =
        a.temps.length > 0
          ? Math.round((a.temps.reduce((s, n) => s + n, 0) / a.temps.length) * 10) / 10
          : null;
      const repT = a.times[Math.floor(a.times.length / 2)] || a.times[0] || null;
      out.push({
        label: q.label,
        description: bestFore,
        temp_f: tavg,
        representative_time: repT
      });
    }
  }
  return out;
}

type PrecipSoon = { minutes: number; summary: string } | null;

function nextPrecipWithin60(hPeriods: Dict[], _timeZone: string, now: Date): PrecipSoon {
  const nowT = now.getTime();
  const winEnd = nowT + 60 * 60 * 1000;
  const candidates: { start: number; p: Dict }[] = [];
  for (const p of hPeriods) {
    const st = p.startTime;
    if (typeof st !== "string") continue;
    const t = new Date(st).getTime();
    if (Number.isNaN(t) || t > winEnd) break;
    if (t < nowT - 90 * 60 * 1000) continue;
    const pop = popPercent(p);
    if (!isLikelyPrecip(p, pop)) continue;
    if (t < nowT - 50 * 60 * 1000) continue;
    if (t <= winEnd) candidates.push({ start: t, p });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.start - b.start);
  const first = candidates[0]!;
  const m = Math.max(0, Math.round((first.start - now.getTime()) / 60_000));
  const sf = String(first.p.shortForecast || "Precipitation");
  const sum =
    m === 0
      ? `Precipitation in progress or very soon — ${sf}.`
      : `Precipitation in the next ~${m} min — ${sf}.`;
  return { minutes: m, summary: sum };
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

async function fetchOpenMeteoSupplement(
  lat: number,
  lon: number
): Promise<{
  surface_pressure_hpa: number | null;
  grass_pollen: number | null;
  tree_pollen: number | null;
  weed_pollen: number | null;
}> {
  let surface_pressure_hpa: number | null = null;
  let grass_pollen: number | null = null;
  let tree_pollen: number | null = null;
  let weed_pollen: number | null = null;
  try {
    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=surface_pressure&temperature_unit=fahrenheit&windspeed_unit=mph`,
      { cache: "no-store" }
    );
    if (w.ok) {
      const j = (await w.json()) as { current?: { surface_pressure?: number; surfacePressure?: number } };
      const cur = j.current;
      if (cur) {
        const p = (cur.surface_pressure ?? cur.surfacePressure) as number | undefined;
        if (typeof p === "number" && !Number.isNaN(p)) {
          surface_pressure_hpa = p;
        }
      }
    }
  } catch {
    /* */
  }
  try {
    const a = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=grass_pollen,alder_pollen,birch_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=auto`,
      { cache: "no-store" }
    );
    if (a.ok) {
      const j = (await a.json()) as { current?: Record<string, number | null> };
      const c = j.current || {};
      const pick = (k: string) => (typeof c[k] === "number" && !Number.isNaN(c[k] as number) ? (c[k] as number) : null);
      grass_pollen = pick("grass_pollen");
      const treeMax = [pick("alder_pollen"), pick("birch_pollen"), pick("olive_pollen")].filter((v): v is number => v != null);
      tree_pollen = treeMax.length ? Math.max(...treeMax) : null;
      const mw = pick("mugwort_pollen");
      const rw = pick("ragweed_pollen");
      if (mw != null || rw != null) {
        weed_pollen = Math.max(mw || 0, rw || 0) || null;
      }
    }
  } catch {
    /* */
  }
  return { surface_pressure_hpa, grass_pollen, tree_pollen, weed_pollen };
}

function pollenSummary(g: number | null, t: number | null, w: number | null): string | null {
  const max = [g, t, w].filter((x): x is number => x != null && !Number.isNaN(x));
  if (max.length === 0) return null;
  const v = Math.max(...max);
  if (v <= 0) return "None";
  if (v < 20) return "Low";
  if (v < 60) return "Moderate";
  if (v < 120) return "High";
  return "Very high";
}

function windFromDegMph(deg: number, mph: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
  const c = dirs[Math.round(deg / 45) % 8] || "";
  return `${c} ${Math.round(mph)} mph`;
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
    ? (rel as { properties: Dict }).properties
    : ({} as Dict);
  const city = relProps.city;
  const state = relProps.state;
  const place = [typeof city === "string" ? city : null, typeof state === "string" ? state : null]
    .filter(Boolean)
    .join(", ") || null;

  const timeZone = (typeof props.timeZone === "string" ? props.timeZone : null) || "America/New_York";
  const astro =
    props.astronomicalData && typeof props.astronomicalData === "object" ? (props.astronomicalData as Dict) : ({} as Dict);
  const sunrise = astro.sunrise == null ? null : String(astro.sunrise);
  const sunset = astro.sunset == null ? null : String(astro.sunset);

  const [fr, fh, om] = await Promise.all([
    fetch(fUrl, { headers: NWS_HEADERS, cache: "no-store" }),
    fetch(fhUrl, { headers: NWS_HEADERS, cache: "no-store" }),
    fetchOpenMeteoSupplement(lat, lon)
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
  const dewPointF = dewpointF(h0);
  let currentHumidity = humidityVal(h0?.relativeHumidity) ?? null;
  const wDir = windDirection(h0);
  let currentWind: string | null = (h0 && typeof h0.windSpeed === "string" ? h0.windSpeed : null) as string | null;
  if (wDir && currentWind) {
    currentWind = `${wDir} ${currentWind}`.replace(/\s+from\s+/i, " ");
  } else if (wDir && !currentWind) {
    currentWind = wDir;
  }

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
  let owmDeg: number | null = null;
  let owmMph: number | null = null;
  if (om.surface_pressure_hpa != null) {
    pressureMb = Math.round(om.surface_pressure_hpa * 10) / 10;
    pressureInhg = Math.round(om.surface_pressure_hpa * 0.029529983071445 * 100) / 100;
  }

  if (OWM_KEY) {
    try {
      const ow = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${encodeURIComponent(OWM_KEY)}&units=imperial`,
        { cache: "no-store" }
      );
      if (ow.ok) {
        const d = (await ow.json()) as { main?: Dict; wind?: { speed?: number; deg?: number }; weather?: Array<Dict> };
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
        const w = d.wind;
        if (w) {
          if (typeof w.deg === "number" && !Number.isNaN(w.deg)) owmDeg = w.deg;
          if (typeof w.speed === "number" && !Number.isNaN(w.speed)) owmMph = w.speed;
        }
        const wspd = w?.speed;
        if (currentWind == null && wspd != null) {
          currentWind = owmDeg != null && owmMph != null ? windFromDegMph(owmDeg, owmMph) : `${wspd} mph`;
        }
        const wx = d.weather;
        if (Array.isArray(wx) && wx[0] && typeof wx[0].description === "string") {
          owmDesc = wx[0].description;
        }
      }
    } catch {
      /* */
    }
  }

  if (OWM_KEY && owmDeg != null && owmMph != null) {
    currentWind = windFromDegMph(owmDeg, owmMph);
  }

  const f0 = fPeriods[0] || ({} as Dict);
  const shortFromNws =
    f0 && typeof f0.shortForecast === "string" ? String(f0.shortForecast).trim() || null : null;
  const detailParagraph =
    f0 && typeof f0.detailedForecast === "string" ? String(f0.detailedForecast).trim() || null : null;

  const now = new Date();
  const quad = buildQuadrantConditions(hPeriods, timeZone, now);
  const soon = nextPrecipWithin60(hPeriods, timeZone, now);

  const pSum = pollenSummary(om.grass_pollen, om.tree_pollen, om.weed_pollen);
  return {
    place,
    time_zone: timeZone,
    sunrise: sunrise,
    sunset: sunset,
    current_temp_f: currentTemp != null ? Math.round(currentTemp * 10) / 10 : null,
    dewpoint_f: dewPointF != null ? Math.round(dewPointF * 10) / 10 : null,
    today_high_f: todayHigh != null ? Math.round(todayHigh * 10) / 10 : null,
    today_low_f: todayLow != null ? Math.round(todayLow * 10) / 10 : null,
    humidity: currentHumidity != null ? Math.round(currentHumidity) : null,
    wind: currentWind,
    pressure_mb: pressureMb,
    pressure_inhg: pressureInhg,
    short_description: shortFromNws || owmDesc || "—",
    narrative_detail: detailParagraph,
    conditions_quadrants: quad,
    precip_soon: soon,
    pollen_summary: pSum,
    daily,
    hourly
  };
}
