const KEY = "rowton.home.v1";

export type StoredHome = { lat: number; lon: number; updatedAt: number };

export function readHomeFromStorage(): StoredHome | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { lat?: unknown; lon?: unknown; updatedAt?: unknown };
    const lat = Number(o.lat);
    const lon = Number(o.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon, updatedAt: Number.isFinite(Number(o.updatedAt)) ? Number(o.updatedAt) : Date.now() };
  } catch {
    return null;
  }
}

export function writeHomeToStorage(lat: number, lon: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ lat, lon, updatedAt: Date.now() } satisfies StoredHome));
  } catch {
    /* */
  }
}
