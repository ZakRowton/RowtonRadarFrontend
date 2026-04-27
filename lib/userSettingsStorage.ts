const KEY_PREFIX = "rowton.settings.v1";

export type UserSettings = {
  homeLat: number | null;
  homeLon: number | null;
  emailEnabled: boolean;
  alertEmail: string;
  updatedAt: number;
};

export function settingsStorageKey(deviceId: string | null): string {
  return deviceId ? `${KEY_PREFIX}.${deviceId}` : `${KEY_PREFIX}.default`;
}

export function readSettings(deviceId: string | null): UserSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(settingsStorageKey(deviceId));
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<UserSettings>;
    const homeLat = obj.homeLat == null ? null : Number(obj.homeLat);
    const homeLon = obj.homeLon == null ? null : Number(obj.homeLon);
    return {
      homeLat: Number.isFinite(homeLat) ? homeLat : null,
      homeLon: Number.isFinite(homeLon) ? homeLon : null,
      emailEnabled: Boolean(obj.emailEnabled),
      alertEmail: typeof obj.alertEmail === "string" ? obj.alertEmail.trim() : "",
      updatedAt: Number.isFinite(Number(obj.updatedAt)) ? Number(obj.updatedAt) : Date.now()
    };
  } catch {
    return null;
  }
}

export function writeSettings(deviceId: string | null, settings: UserSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(settingsStorageKey(deviceId), JSON.stringify(settings));
  } catch {
    // intentionally ignored
  }
}
