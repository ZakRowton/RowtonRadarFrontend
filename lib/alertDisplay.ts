import type { Feature, Geometry } from "geojson";

export function getNwsFeatureId(feature: Feature<Geometry, unknown>): string {
  const p = (feature.properties || {}) as Record<string, unknown>;
  return String(p.id || p["@id"] || JSON.stringify(feature.geometry).slice(0, 64));
}

export function nwsEventLabel(feature: Feature<Geometry, Record<string, unknown> | null>): string {
  const p = (feature.properties || {}) as Record<string, unknown>;
  return String(p.event || p.Event || "Weather alert");
}

export function nwsHeadline(feature: Feature<Geometry, Record<string, unknown> | null>): string {
  const p = (feature.properties || {}) as Record<string, unknown>;
  return String(p.headline || p.title || nwsEventLabel(feature));
}

export function nwsShortTooltip(feature: Feature<Geometry, Record<string, unknown> | null>): string {
  const p = (feature.properties || {}) as Record<string, unknown>;
  /* Single horizontal flow ( · ) so the tooltip stays wide and short; CSS wraps only when needed. */
  const parts = [
    nwsEventLabel(feature),
    p.headline ? String(p.headline) : null,
    p.areaDesc ? `Area: ${p.areaDesc}` : null
  ].filter(Boolean) as string[];
  return parts.join(" · ").slice(0, 2000);
}

/** Human-readable local date/time; falls back to raw if unparsable. */
export function formatNwsTime(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "—";
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(t));
  } catch {
    return s;
  }
}

export type AlertDetailSection = {
  id: string;
  kind: "kv" | "prose" | "callout";
  label: string;
  rawValue: string;
  /** Prose: split on blank lines; callout: single block */
  paragraphs: string[] | null;
  icon: string;
};

const SECTION_META: Record<
  string,
  { label: string; kind: "kv" | "prose" | "callout"; icon: string; timeField?: boolean }
> = {
  event: { label: "Event", kind: "kv", icon: "▸" },
  status: { label: "Status", kind: "kv", icon: "◉" },
  effective: { label: "Effective", kind: "kv", icon: "🕐", timeField: true },
  expires: { label: "Expires", kind: "kv", icon: "⏱", timeField: true },
  sender: { label: "Sender", kind: "kv", icon: "📡" },
  headline: { label: "Headline", kind: "kv", icon: "📌" },
  area: { label: "Area", kind: "prose", icon: "🗺" },
  description: { label: "Description", kind: "prose", icon: "📄" },
  instruction: { label: "What to do", kind: "callout", icon: "✦" },
  urgency: { label: "Urgency", kind: "kv", icon: "⚡" },
  severity: { label: "Severity", kind: "kv", icon: "⚠" }
};

function splitProseToParagraphs(text: string): string[] {
  return text.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
}

/** Structured sections for the side panel: icons, prose blocks, callouts. */
export function getAlertDetailSections(feature: Feature<Geometry, Record<string, unknown> | null>): AlertDetailSection[] {
  if (!feature) return [];
  const p = (feature.properties || {}) as Record<string, unknown>;

  const raw: [string, unknown][] = [
    ["event", p.event],
    ["status", p.status],
    ["effective", p.effective || p.onset],
    ["expires", p.expires || p.ends],
    ["sender", p.senderName],
    ["headline", p.headline],
    ["urgency", p.urgency],
    ["severity", p.severity],
    ["area", p.areaDesc],
    ["description", p.description],
    ["instruction", p.instruction]
  ];

  const out: AlertDetailSection[] = [];
  for (const [id, v] of raw) {
    if (v == null || String(v).trim() === "") continue;
    const meta = SECTION_META[id];
    if (!meta) continue;
    const rawValue = String(v);
    if (meta.timeField) {
      out.push({
        id,
        kind: "kv",
        label: meta.label,
        rawValue: formatNwsTime(rawValue),
        paragraphs: null,
        icon: meta.icon
      });
      continue;
    }
    if (meta.kind === "prose") {
      out.push({
        id,
        kind: "prose",
        label: meta.label,
        rawValue: rawValue.trim(),
        paragraphs: splitProseToParagraphs(rawValue),
        icon: meta.icon
      });
      continue;
    }
    if (meta.kind === "callout") {
      out.push({
        id,
        kind: "callout",
        label: meta.label,
        rawValue: rawValue.trim(),
        paragraphs: null,
        icon: meta.icon
      });
      continue;
    }
    out.push({
      id,
      kind: "kv",
      label: meta.label,
      rawValue: rawValue.trim(),
      paragraphs: null,
      icon: meta.icon
    });
  }
  return out;
}

export function eventIconClass(eventName: string): string {
  const e = eventName.toLowerCase();
  if (e.includes("tornado")) return "alert-ico-tornado";
  if (e.includes("thunderstorm")) return "alert-ico-tstorm";
  if (e.includes("flood")) return "alert-ico-flood";
  if (e.includes("winter") || e.includes("snow") || e.includes("blizzard")) return "alert-ico-winter";
  return "alert-ico-default";
}

export function eventAlertEmoji(eventName: string): string {
  const e = eventName.toLowerCase();
  if (e.includes("tornado")) return "🌪";
  if (e.includes("thunderstorm")) return "⛈";
  if (e.includes("flood")) return "💧";
  if (e.includes("winter") || e.includes("snow")) return "❄️";
  return "⚠️";
}
