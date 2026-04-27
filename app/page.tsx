"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Feature, Geometry } from "geojson";
import AlertDetailsSidePanel from "@/components/AlertDetailsSidePanel";
import ForecastWidget from "@/components/ForecastWidget";
import HomeLocationBar from "@/components/HomeLocationBar";
import MapViewOriginBadge from "@/components/MapViewOriginBadge";
import ProactiveAlertBanners from "@/components/ProactiveAlertBanners";
import RadarMap, { type RadarMapHandle } from "@/components/RadarMap";
import RadarTimelineBar from "@/components/RadarTimelineBar";
import ViewAlertsDraggablePanel from "@/components/ViewAlertsDraggablePanel";
import {
  fetchActiveAlerts,
  fetchFrames,
  fetchMapAreaTimeZone,
  searchPlace,
  type Product,
  type ActiveAlertsResponse,
  type RadarFrame
} from "@/lib/api";
import { getNwsFeatureId } from "@/lib/alertDisplay";
import { filterFeaturesForPoint, type MapBounds } from "@/lib/alertsInView";
import { readHomeFromStorage, writeHomeToStorage } from "@/lib/homeLocationStorage";
import { readSettings, writeSettings } from "@/lib/userSettingsStorage";

const PRODUCT_COPY: Record<
  Product,
  { title: string; desc: string; abbr: string; hint: string }
> = {
  reflectivity: {
    title: "Rain & ice",
    desc: "Heavier colors = more intense precip & hail",
    abbr: "PRECIP",
    hint: "Classical “reflectivity” radar: how strong the echo is from rain, ice, and hail in the air."
  },
  velocity: {
    title: "How wind moves",
    desc: "Greens: toward the radar. Reds: away. Storm rotation shows here.",
    abbr: "WIND",
    hint: "Radial velocity: wind along the beam — useful to spot rotation and inflow / outflow."
  }
};

export default function HomePage() {
  const [product, setProduct] = useState<Product>("reflectivity");
  const [playing, setPlaying] = useState(true);
  const [frameDurationMs, setFrameDurationMs] = useState(1400);
  const [radarOpacity, setRadarOpacity] = useState(0.88);
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [mapAreaTz, setMapAreaTz] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ActiveAlertsResponse | null>(null);
  const [alertsFetchError, setAlertsFetchError] = useState<string | null>(null);
  const [radarFetchError, setRadarFetchError] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 38, lon: -97 });
  const [homeLocation, setHomeLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [alertEmail, setAlertEmail] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<Feature<Geometry, Record<string, unknown> | null> | null>(
    null
  );
  const mapRef = useRef<RadarMapHandle | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const seenHomeAlertsRef = useRef<Set<string>>(new Set());

  const persistUserSettings = useCallback(
    (next: {
      homeLocation: { lat: number; lon: number } | null;
      emailEnabled: boolean;
      alertEmail: string;
    }) => {
      writeSettings(deviceId, {
        homeLat: next.homeLocation?.lat ?? null,
        homeLon: next.homeLocation?.lon ?? null,
        emailEnabled: next.emailEnabled,
        alertEmail: next.alertEmail.trim(),
        updatedAt: Date.now()
      });
    },
    [deviceId]
  );

  const saveHomeLocation = useCallback(
    (p: { lat: number; lon: number }) => {
      setHomeLocation(p);
      writeHomeToStorage(p.lat, p.lon);
      persistUserSettings({ homeLocation: p, emailEnabled, alertEmail });
    },
    [alertEmail, emailEnabled, persistUserSettings]
  );

  useEffect(() => {
    void fetch("/api/device/id", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok?: boolean; deviceId?: string }>)
      .then((d) => {
        if (!d.ok || !d.deviceId) return;
        setDeviceId(d.deviceId);
      })
      .catch(() => {
        setDeviceId("local-device");
      });
  }, []);

  useEffect(() => {
    if (deviceId === null) return;
    const settings = readSettings(deviceId);
    if (settings?.homeLat != null && settings.homeLon != null) {
      setHomeLocation({ lat: settings.homeLat, lon: settings.homeLon });
    } else {
      const legacy = readHomeFromStorage();
      if (legacy) setHomeLocation({ lat: legacy.lat, lon: legacy.lon });
    }
    if (settings) {
      setEmailEnabled(settings.emailEnabled);
      setAlertEmail(settings.alertEmail);
    }
  }, [deviceId]);

  const onUserDeviceLocation = useCallback((p: { lat: number; lon: number }) => {
    saveHomeLocation(p);
  }, [saveHomeLocation]);

  useEffect(() => {
    let cancelled = false;
    const refreshAlerts = async () => {
      try {
        const d = await fetchActiveAlerts();
        if (cancelled) return;
        setAlerts(d);
        setAlertsFetchError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        setAlerts({ type: "FeatureCollection", features: [] });
        setAlertsFetchError(e instanceof Error ? e.message : "Could not load alerts.");
      }
    };
    void refreshAlerts();
    const timer = window.setInterval(() => {
      void refreshAlerts();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onDocDown = (evt: MouseEvent) => {
      if (!settingsOpen) return;
      const target = evt.target as Node | null;
      if (target && settingsRef.current && !settingsRef.current.contains(target)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("mousedown", onDocDown);
    return () => window.removeEventListener("mousedown", onDocDown);
  }, [settingsOpen]);

  const homeAlertIds = useMemo(() => {
    if (!alerts || alerts.type !== "FeatureCollection" || !homeLocation) return [];
    const atHome = filterFeaturesForPoint(alerts, homeLocation.lat, homeLocation.lon);
    return atHome.map((f) => getNwsFeatureId(f));
  }, [alerts, homeLocation]);

  useEffect(() => {
    if (!emailEnabled || !alertEmail || !homeLocation || homeAlertIds.length === 0) return;
    const newIds = homeAlertIds.filter((id) => !seenHomeAlertsRef.current.has(id));
    if (newIds.length === 0) return;
    for (const id of homeAlertIds) seenHomeAlertsRef.current.add(id);
    const subject = `WeatherRadar: ${newIds.length} new home alert${newIds.length > 1 ? "s" : ""}`;
    const text = `New home-location weather alert(s):\n${newIds.join("\n")}\n\nMap center: ${homeLocation.lat.toFixed(3)}, ${homeLocation.lon.toFixed(3)}\nTime: ${new Date().toLocaleString()}`;
    void fetch("/api/alerts/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: alertEmail.trim(), subject, text })
    }).catch(() => {
      // ignore background delivery errors in UI loop
    });
  }, [alertEmail, emailEnabled, homeAlertIds, homeLocation]);

  const onSearchSubmit = useCallback(
    async (evt: FormEvent<HTMLFormElement>) => {
      evt.preventDefault();
      const q = searchQuery.trim();
      if (!q) return;
      setSearchStatus("Searching…");
      try {
        const hit = await searchPlace(q);
        if (!hit.ok) {
          setSearchStatus("No location found.");
          return;
        }
        mapRef.current?.fitToBounds(hit.bounds);
        setSearchStatus(hit.displayName);
      } catch {
        setSearchStatus("Search failed.");
      }
    },
    [searchQuery]
  );

  useEffect(() => {
    let cancel = false;
    setRadarFetchError(null);
    void fetchFrames(product)
      .then((frames) => {
        if (cancel) return;
        setRadarFrames(frames);
        const nowI = frames.findIndex((x) => x.category === "now");
        setFrameIndex(nowI >= 0 ? nowI : Math.max(0, frames.length - 1));
      })
      .catch((e: unknown) => {
        if (cancel) return;
        setRadarFrames([]);
        setFrameIndex(0);
        setRadarFetchError(e instanceof Error ? e.message : "Could not load radar frames.");
      });
    return () => {
      cancel = true;
    };
  }, [product]);

  const playingRef = useRef(playing);
  const frameDurationRef = useRef(frameDurationMs);
  const radarCountRef = useRef(radarFrames.length);
  const advanceTimerRef = useRef<number | null>(null);
  const didMountRef = useRef(false);
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    frameDurationRef.current = frameDurationMs;
  }, [frameDurationMs]);
  useEffect(() => {
    radarCountRef.current = radarFrames.length;
  }, [radarFrames.length]);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current != null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const onRadarFrameTilesSettled = useCallback(() => {
    if (!playingRef.current) return;
    const n = radarCountRef.current;
    if (n < 2) return;
    clearAdvanceTimer();
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      if (!playingRef.current) return;
      setFrameIndex((i) => (i + 1) % radarCountRef.current);
    }, frameDurationRef.current);
  }, [clearAdvanceTimer]);

  useEffect(() => {
    if (!playing) {
      clearAdvanceTimer();
    }
  }, [playing, clearAdvanceTimer]);

  useEffect(() => {
    clearAdvanceTimer();
  }, [product, clearAdvanceTimer]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      wasPlayingRef.current = playing;
      return;
    }
    if (playing && !wasPlayingRef.current && radarFrames.length >= 2) {
      window.setTimeout(() => onRadarFrameTilesSettled(), 0);
    }
    wasPlayingRef.current = playing;
  }, [playing, radarFrames.length, onRadarFrameTilesSettled]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetchMapAreaTimeZone(mapCenter.lat, mapCenter.lon).then((z) => {
        if (z) setMapAreaTz(z.iana);
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [mapCenter.lat, mapCenter.lon]);

  return (
    <main className="app-shell">
      <section className="map-host">
        <div className="map-top-hud" aria-label="Map info and location">
          <form className="map-search-bar" onSubmit={onSearchSubmit} aria-label="Search location and zoom map">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city, state, county, or lat,long"
              aria-label="Search city, state, county, or latitude longitude"
            />
            <button type="submit">Go</button>
            {searchStatus ? <span className="map-search-bar__status">{searchStatus}</span> : null}
          </form>
          <ProactiveAlertBanners
            alerts={alerts}
            homeLat={homeLocation?.lat ?? null}
            homeLon={homeLocation?.lon ?? null}
            mapCenterLat={mapCenter.lat}
            mapCenterLon={mapCenter.lon}
          />
          <div className="map-geo-stack">
            <HomeLocationBar
              home={homeLocation}
              onGoHome={() => {
                if (!homeLocation) return;
                mapRef.current?.flyTo(homeLocation.lat, homeLocation.lon, 10);
              }}
            />
            <MapViewOriginBadge centerLat={mapCenter.lat} centerLon={mapCenter.lon} />
          </div>
        </div>
        <RadarMap
          ref={mapRef}
          radarFrames={radarFrames}
          frameIndex={frameIndex}
          radarOpacity={radarOpacity}
          activeAlerts={alerts}
          onViewChange={({ bounds, center }) => {
            setMapBounds(bounds);
            setMapCenter(center);
          }}
          onSelectAlert={setSelectedFeature}
          onRadarFrameTilesSettled={onRadarFrameTilesSettled}
          onUserLocation={onUserDeviceLocation}
        />
        <div className="map-viewport-crosshair" aria-hidden>
          <span className="map-viewport-crosshair__reticle" />
        </div>
        <ViewAlertsDraggablePanel
          alerts={alerts}
          mapBounds={mapBounds}
          homePoint={homeLocation}
          onSelectFeature={setSelectedFeature}
          fetchError={alertsFetchError}
          selectedId={selectedFeature ? getNwsFeatureId(selectedFeature) : null}
        />
        <ForecastWidget
          centerLat={mapCenter.lat}
          centerLon={mapCenter.lon}
          home={homeLocation}
        />
        <AlertDetailsSidePanel feature={selectedFeature} onClose={() => setSelectedFeature(null)} />
        <div className="settings-widget" ref={settingsRef}>
          <button
            type="button"
            className="settings-widget__fab"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            aria-controls="settings-widget-panel"
            title="Settings"
          >
            SET
          </button>
          {settingsOpen && (
            <div className="settings-widget__panel" id="settings-widget-panel">
              <h3>Settings</h3>
              <button
                type="button"
                className="settings-widget__action"
                onClick={() => {
                  saveHomeLocation(mapCenter);
                }}
              >
                Save current map center as home
              </button>
              <label className="settings-widget__check">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setEmailEnabled(next);
                    persistUserSettings({ homeLocation, emailEnabled: next, alertEmail });
                  }}
                />
                Email new home alerts
              </label>
              <label className="settings-widget__field">
                Alert email
                <input
                  type="email"
                  value={alertEmail}
                  placeholder="you@example.com"
                  onChange={(e) => {
                    const next = e.target.value;
                    setAlertEmail(next);
                    persistUserSettings({ homeLocation, emailEnabled, alertEmail: next });
                  }}
                />
              </label>
              <p className="settings-widget__hint">
                Settings are saved per device IP and home alerts always stay prioritized.
              </p>
            </div>
          )}
        </div>

        <div className="rowton-floating-stack" aria-label="Map area and map controls">
          <div className="rowton-chrome" role="toolbar" aria-label="Map controls">
            <div className="rowton-chrome__glow" aria-hidden />
            <div className="rowton-chrome__inner">
              <div
                className="rr-logo"
                title="RowtonRadar — live NEXRAD over your map"
              >
                <div className="rr-logo__mark" aria-hidden>
                  <span className="rr-logo__line" />
                </div>
                <div className="rr-logo__type">
                  <div className="rr-logo__rowton">
                    <span className="rr-logo__row">Row</span>
                    <span className="rr-logo__ton">ton</span>
                  </div>
                  <span className="rr-logo__radar">Radar</span>
                </div>
              </div>

              <div className="rowton-panels">
                <div className="rowton-section" role="group" aria-label="What the colors mean">
                  <div className="rowton-metric">
                    <div className="rowton-metric__label">View mode</div>
                    <div className="rowton-mode-toggle">
                      <button
                        type="button"
                        className={`rowton-pill ${product === "reflectivity" ? "is-on" : ""}`}
                        onClick={() => setProduct("reflectivity")}
                        title={PRODUCT_COPY.reflectivity.hint}
                        aria-pressed={product === "reflectivity"}
                      >
                        <span className="rowton-pill__tag">
                          {PRODUCT_COPY.reflectivity.abbr}
                        </span>
                        <span className="rowton-pill__main">{PRODUCT_COPY.reflectivity.title}</span>
                        <span className="rowton-pill__sub">{PRODUCT_COPY.reflectivity.desc}</span>
                      </button>
                      <button
                        type="button"
                        className={`rowton-pill ${product === "velocity" ? "is-on" : ""}`}
                        onClick={() => setProduct("velocity")}
                        title={PRODUCT_COPY.velocity.hint}
                        aria-pressed={product === "velocity"}
                      >
                        <span className="rowton-pill__tag">{PRODUCT_COPY.velocity.abbr}</span>
                        <span className="rowton-pill__main">{PRODUCT_COPY.velocity.title}</span>
                        <span className="rowton-pill__sub">{PRODUCT_COPY.velocity.desc}</span>
                      </button>
                    </div>
                  </div>

                  <div className="rowton-metric rowton-metric--loop">
                    <div className="rowton-metric__row">
                      <div className="rowton-metric__label">Animation</div>
                      <button
                        type="button"
                        className={`rowton-btn-play ${playing ? "is-live" : "is-paused"}`}
                        onClick={() => setPlaying((v) => !v)}
                        aria-pressed={playing}
                        title={playing ? "Pause the radar time loop" : "Resume the radar time loop"}
                      >
                        {playing ? (
                          <>
                            <span className="rowton-btn-play__pulse" aria-hidden />
                            <span className="rowton-btn-play__text">
                              <strong>Auto-playing</strong>
                              <small>Tap to pause</small>
                            </span>
                          </>
                        ) : (
                          <span className="rowton-btn-play__text">
                            <strong>Paused</strong>
                            <small>Tap to play</small>
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="rowton-metric__slider">
                      <label className="rowton-sr" htmlFor="rowton-frame-dur">Animation speed</label>
                      <div className="rowton-metric__speed">
                        <span className="rowton-metric__label">Speed</span>
                        <input
                          id="rowton-frame-dur"
                          className="rowton-range rowton-range--long"
                          type="range"
                          min={300}
                          max={2500}
                          step={50}
                          value={frameDurationMs}
                          onChange={(e) => setFrameDurationMs(Number(e.target.value))}
                          aria-label="Animation speed, faster to the left, slower to the right"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rowton-metric">
                    <div className="rowton-metric__label">Radar on map</div>
                    <div className="rowton-metric__slider">
                      <label className="rowton-sr" htmlFor="rowton-opacity">
                        Radar layer opacity
                      </label>
                      <input
                        id="rowton-opacity"
                        className="rowton-range rowton-range--long"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(radarOpacity * 100)}
                        onChange={(e) => setRadarOpacity(Number(e.target.value) / 100)}
                        aria-label="Radar layer opacity on the map"
                      />
                      <span className="rowton-value">{Math.round(radarOpacity * 100)}%</span>
                    </div>
                  </div>
                </div>

                <div
                  className="rowton-legend"
                  title="Greens, yellows, reds, and magentas: stronger (reflectivity) or Doppler in/out (velocity) depending on the mode you chose."
                >
                  <div className="rowton-legend__title">Map colors</div>
                  <p className="rowton-legend__cue">
                    {product === "reflectivity"
                      ? "Brighter = more intense hydrometeors. Dark = light or none."
                      : "Cool vs warm tones = movement toward or away from the site."}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <RadarTimelineBar
            frames={radarFrames}
            frameIndex={frameIndex}
            onScrub={(i) => setFrameIndex(i)}
            onScrubStart={() => setPlaying(false)}
            areaTimeZone={mapAreaTz}
            fetchErrorText={radarFetchError}
          />
        </div>
      </section>
    </main>
  );
}
