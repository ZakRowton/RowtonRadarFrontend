"use client";

import { useEffect, useState } from "react";
import type { Feature, Geometry } from "geojson";
import AlertDetailsSidePanel from "@/components/AlertDetailsSidePanel";
import ForecastWidget from "@/components/ForecastWidget";
import MapViewOriginBadge from "@/components/MapViewOriginBadge";
import RadarMap from "@/components/RadarMap";
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
  const [frameDurationMs, setFrameDurationMs] = useState(700);
  const [radarOpacity, setRadarOpacity] = useState(0.88);
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [mapAreaTz, setMapAreaTz] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ActiveAlertsResponse | null>(null);
  const [alertsFetchError, setAlertsFetchError] = useState<string | null>(null);
  const [radarFetchError, setRadarFetchError] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 38, lon: -97 });
  const [selectedFeature, setSelectedFeature] = useState<Feature<Geometry, Record<string, unknown> | null> | null>(
    null
  );

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

  useEffect(() => {
    if (!playing || radarFrames.length < 2) return;
    const t = window.setInterval(() => {
      setFrameIndex((i) => (i + 1) % radarFrames.length);
    }, frameDurationMs);
    return () => window.clearInterval(t);
  }, [playing, frameDurationMs, radarFrames.length]);

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
        <MapViewOriginBadge centerLat={mapCenter.lat} centerLon={mapCenter.lon} />
        <RadarMap
          radarFrames={radarFrames}
          frameIndex={frameIndex}
          radarOpacity={radarOpacity}
          activeAlerts={alerts}
          onViewChange={({ bounds, center }) => {
            setMapBounds(bounds);
            setMapCenter(center);
          }}
          onSelectAlert={setSelectedFeature}
        />
        <ViewAlertsDraggablePanel
          alerts={alerts}
          mapBounds={mapBounds}
          onSelectFeature={setSelectedFeature}
          fetchError={alertsFetchError}
          selectedId={selectedFeature ? getNwsFeatureId(selectedFeature) : null}
        />
        <ForecastWidget centerLat={mapCenter.lat} centerLon={mapCenter.lon} />
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
                      <label className="rowton-sr" htmlFor="rowton-frame-dur">
                        Time between frames
                      </label>
                      <input
                        id="rowton-frame-dur"
                        className="rowton-range"
                        type="range"
                        min={250}
                        max={1400}
                        step={50}
                        value={frameDurationMs}
                        onChange={(e) => setFrameDurationMs(Number(e.target.value))}
                        aria-label="Time between each radar frame in the loop"
                      />
                      <span className="rowton-value">{frameDurationMs}ms</span>
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
