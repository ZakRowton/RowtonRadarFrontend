"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type Product,
  type ActiveAlertsResponse,
  type RadarFrame
} from "@/lib/api";
import { getNwsFeatureId } from "@/lib/alertDisplay";
import type { MapBounds } from "@/lib/alertsInView";
import { readHomeFromStorage, writeHomeToStorage } from "@/lib/homeLocationStorage";

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
  const [selectedFeature, setSelectedFeature] = useState<Feature<Geometry, Record<string, unknown> | null> | null>(
    null
  );
  const mapRef = useRef<RadarMapHandle | null>(null);

  useEffect(() => {
    const s = readHomeFromStorage();
    if (s) setHomeLocation({ lat: s.lat, lon: s.lon });
  }, []);

  const onUserDeviceLocation = useCallback((p: { lat: number; lon: number }) => {
    setHomeLocation(p);
    writeHomeToStorage(p.lat, p.lon);
  }, []);

  useEffect(() => {
    void fetchActiveAlerts()
      .then((d) => {
        setAlerts(d);
        setAlertsFetchError(null);
      })
      .catch((e: unknown) => {
        setAlerts({ type: "FeatureCollection", features: [] });
        setAlertsFetchError(e instanceof Error ? e.message : "Could not load alerts.");
      });
  }, []);

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
