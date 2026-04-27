"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import centroid from "@turf/centroid";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { type RadarFrame } from "@/lib/api";
import { eventIconClass, eventAlertEmoji, nwsShortTooltip } from "@/lib/alertDisplay";
import type { ActiveAlertsResponse } from "@/lib/api";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap, TileLayer } from "leaflet";
import type { MapBounds } from "@/lib/alertsInView";

/** RainViewer 512px global composite only serves z=0..7; higher z must be scaled from z=7. */
const RAINVIEWER_MAX_NATIVE_ZOOM = 7;
/** Mesonet CONUS tiles typically stop around z8; scale above that instead of 404s. */
const MESONET_MAX_NATIVE_ZOOM = 8;

export type RadarMapHandle = {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  fitToBounds: (bounds: { south: number; west: number; north: number; east: number }) => void;
};

type Props = {
  radarFrames: RadarFrame[];
  frameIndex: number;
  radarOpacity: number;
  activeAlerts: ActiveAlertsResponse | null;
  onViewChange: (p: { bounds: MapBounds; center: { lat: number; lon: number } }) => void;
  onSelectAlert: (feature: Feature<Geometry, Record<string, unknown> | null>) => void;
  /** Fires when the visible frame’s tile grid has finished loading (or fallback timeout). Drives time-loop advance. */
  onRadarFrameTilesSettled?: () => void;
  /** Fires once when the browser’s geolocation succeeds; parent can persist as “home”. */
  onUserLocation?: (p: { lat: number; lon: number }) => void;
};

function alertColor(eventName: string): string {
  const e = eventName.toLowerCase();
  if (e.includes("tornado")) return "#ff2f2f";
  if (e.includes("severe thunderstorm")) return "#ffcf40";
  if (e.includes("flash flood")) return "#3fd07c";
  return "#76a9ff";
}

const TILE_SETTLE_FALLBACK_MS = 10_000;

function attachTileLayerSettled(layer: TileLayer, onSettled: () => void, cancelled: () => boolean) {
  let done = false;
  const fire = () => {
    if (done || cancelled()) return;
    done = true;
    onSettled();
  };
  const t = window.setTimeout(fire, TILE_SETTLE_FALLBACK_MS);
  layer.once("load", () => {
    window.clearTimeout(t);
    fire();
  });
}

const RadarMap = forwardRef<RadarMapHandle, Props>(function RadarMap(
  { radarFrames, frameIndex, radarOpacity, activeAlerts, onViewChange, onSelectAlert, onRadarFrameTilesSettled, onUserLocation },
  ref
) {
  const mapRef = useRef<LeafletMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const radarLayerRef = useRef<TileLayer | null>(null);
  const labelsOnTopRef = useRef<TileLayer | null>(null);
  const alertsLayerRef = useRef<LeafletGeoJSON | null>(null);
  const markersGroupRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectAlert);
  onSelectRef.current = onSelectAlert;
  const onViewRef = useRef(onViewChange);
  onViewRef.current = onViewChange;
  const radarOpacityRef = useRef(radarOpacity);
  radarOpacityRef.current = radarOpacity;
  const onTilesSettledRef = useRef(onRadarFrameTilesSettled);
  onTilesSettledRef.current = onRadarFrameTilesSettled;
  const onUserLocationRef = useRef(onUserLocation);
  onUserLocationRef.current = onUserLocation;

  const [mapReady, setMapReady] = useState(false);
  const [radarAttached, setRadarAttached] = useState(false);

  const n = radarFrames.length;
  const currentTileUrl = useMemo(
    () => (n > 0 ? radarFrames[((frameIndex % n) + n) % n]!.tile_url_template : null),
    [frameIndex, radarFrames, n]
  );

  const fireView = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const b = m.getBounds();
    const c = m.getCenter();
    onViewRef.current({
      bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
      center: { lat: c.lat, lon: c.lng }
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      flyTo(lat, lon, zoom = 9) {
        const m = mapRef.current;
        if (!m) return;
        m.setView([lat, lon], zoom, { animate: true });
        window.setTimeout(fireView, 0);
      },
      fitToBounds(bounds) {
        const m = mapRef.current;
        if (!m) return;
        m.fitBounds(
          [
            [bounds.south, bounds.west],
            [bounds.north, bounds.east]
          ],
          {
            animate: true,
            paddingTopLeft: [22, 84],
            paddingBottomRight: [22, 132]
          }
        );
        window.setTimeout(fireView, 0);
      }
    }),
    [fireView]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let map: LeafletMap | null = null;

    void import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = leaflet.default;
      map = L.map(containerRef.current, {
        center: [38, -97],
        zoom: 5,
        zoomControl: true,
        // preferCanvas + cross-origin tiles triggers OpaqueResponseBlocking / canvas issues; default raster is fine.
        preferCanvas: false
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OSM</a> &copy; CARTO",
        opacity: 0.9,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 1
      }).addTo(map);

      const emptyFc: FeatureCollection = { type: "FeatureCollection", features: [] };
      alertsLayerRef.current = L.geoJSON(emptyFc, {
        interactive: true,
        style: (f) => ({
          color: String(
            (f?.properties as { color?: string } | undefined)?.color || alertColor(String(f?.properties?.event || ""))
          ),
          weight: 2,
          fillOpacity: 0.08
        }),
        onEachFeature: (feature, layer) => {
          if (!feature || !layer) return;
          const f = feature as Feature<Geometry, Record<string, unknown> | null>;
          layer.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectRef.current(f);
          });
          layer.bindTooltip(nwsShortTooltip(f), { sticky: true, direction: "top", className: "nws-hover-tip" });
        }
      }).addTo(map);

      markersGroupRef.current = L.layerGroup();
      map.addLayer(markersGroupRef.current);
      map.createPane("alertMarkers");
      const alertMp = map.getPane("alertMarkers");
      if (alertMp) (alertMp as HTMLElement).style.zIndex = "600";

      map.on("moveend", fireView);
      map.on("zoomend", fireView);
      setTimeout(fireView, 0);
      map.whenReady(fireView);

      setMapReady(true);

      // Geolocation requires a secure context (HTTPS/localhost); skip on plain HTTP to avoid noisy console errors.
      if (navigator.geolocation && (window.isSecureContext || window.location.hostname === "localhost")) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!map) return;
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            onUserLocationRef.current?.({ lat, lon });
            map.setView([lat, lon], 8, { animate: false });
            map.setMinZoom(2);
            map.setMaxZoom(20);
            setTimeout(fireView, 0);
          },
          () => {
            if (!map) return;
            map.setView([38, -97], 6, { animate: false });
            map.setMinZoom(2);
            map.setMaxZoom(20);
            setTimeout(fireView, 0);
          },
          { enableHighAccuracy: false, timeout: 3000, maximumAge: 600_000 }
        );
      } else {
        if (map) {
          map.setMinZoom(2);
          map.setMaxZoom(20);
        }
        setTimeout(fireView, 0);
      }
    });

    return () => {
      cancelled = true;
      setMapReady(false);
      setRadarAttached(false);
      radarLayerRef.current = null;
      labelsOnTopRef.current = null;
      markersGroupRef.current = null;
      if (mapRef.current === map && map) {
        mapRef.current = null;
      }
      if (map) map.remove();
    };
  }, [fireView]);

  useEffect(() => {
    if (!mapReady || !currentTileUrl || !mapRef.current) {
      if (mapReady && !currentTileUrl && radarLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(radarLayerRef.current);
        radarLayerRef.current = null;
        setRadarAttached(false);
      }
      return;
    }
    let cancelled = false;
    void import("leaflet").then((leaflet) => {
      if (cancelled) return;
      const L = leaflet.default;
      const m = mapRef.current;
      if (!m) return;

      const urlIsRainViewer = (u: string) =>
        u.includes("tilecache.rainviewer.com") || u.includes("/api/rv/");

      if (radarLayerRef.current) {
        const prevUrl = (radarLayerRef.current as unknown as { _url: string })._url;
        if (urlIsRainViewer(prevUrl) !== urlIsRainViewer(currentTileUrl)) {
          m.removeLayer(radarLayerRef.current);
          radarLayerRef.current = null;
        }
      }

      if (!radarLayerRef.current) {
        const isRainViewer = urlIsRainViewer(currentTileUrl);
        const layer = L.tileLayer(currentTileUrl, {
          className: "rowton-radar-tiles",
          zIndex: 250,
          opacity: Math.min(1, Math.max(0, radarOpacityRef.current)),
          noWrap: true,
          maxZoom: 20,
          ...(isRainViewer ? { maxNativeZoom: RAINVIEWER_MAX_NATIVE_ZOOM } : { maxNativeZoom: MESONET_MAX_NATIVE_ZOOM }),
          updateWhenIdle: false,
          updateWhenZooming: true,
          keepBuffer: 6
        });
        layer.addTo(m);
        layer.bringToFront();
        radarLayerRef.current = layer;
        if (!cancelled) {
          attachTileLayerSettled(
            layer,
            () => onTilesSettledRef.current?.(),
            () => cancelled
          );
        }

        if (!labelsOnTopRef.current) {
          m.createPane("mapLabelOverlay");
          const p = m.getPane("mapLabelOverlay");
          if (p) {
            p.style.zIndex = "550";
            p.style.pointerEvents = "none";
          }
          labelsOnTopRef.current = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
            subdomains: "abcd",
            maxZoom: 20,
            pane: "mapLabelOverlay",
            opacity: 0.95,
            className: "map-label-tiles",
            updateWhenIdle: true,
            updateWhenZooming: false
          });
          labelsOnTopRef.current.addTo(m);
        }

        setRadarAttached(true);
        return;
      }
      const rLayer = radarLayerRef.current;
      rLayer.setUrl(currentTileUrl);
      rLayer.bringToFront();
      if (!cancelled) {
        attachTileLayerSettled(rLayer, () => onTilesSettledRef.current?.(), () => cancelled);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mapReady, currentTileUrl]);

  useEffect(() => {
    if (!mapReady || !activeAlerts) return;
    const fc = activeAlerts;
    if (fc.type !== "FeatureCollection" || !alertsLayerRef.current) return;
    const colored: FeatureCollection = {
      type: "FeatureCollection",
      features: fc.features.map(
        (feature) =>
          ({
            ...feature,
            type: "Feature" as const,
            properties: {
              ...(feature.properties as object),
              color: (feature.properties as { event?: string })?.event
                ? alertColor(String((feature.properties as { event: string }).event))
                : "#76a9ff"
            }
          }) as Feature<Geometry, GeoJsonProperties>
      )
    };
    void import("leaflet").then((leaflet) => {
      const L = leaflet.default;
      const layer = alertsLayerRef.current;
      const m = mapRef.current;
      const g = markersGroupRef.current;
      if (!layer || !m) return;
      layer.clearLayers();
      layer.addData(colored);
      g?.clearLayers();
      for (const f of colored.features) {
        if (!f.geometry) continue;
        const ev = String((f.properties as { event?: string })?.event || "Alert");
        const c = centroid(f);
        const [clon, clat] = c.geometry.coordinates;
        const em = eventAlertEmoji(ev);
        const icon = L.divIcon({
          className: "alert-pin-wrap",
          html: `<div class="alert-map-pin ${eventIconClass(ev)}" title=""><span class="alert-map-pin-emoji" aria-hidden="true">${em}</span></div>`,
          iconSize: [32, 40],
          iconAnchor: [16, 40]
        });
        const mk = L.marker([clat, clon], { icon, pane: "alertMarkers" });
        mk.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current(f as Feature<Geometry, Record<string, unknown> | null>);
        });
        mk.bindTooltip(nwsShortTooltip(f as Feature<Geometry, Record<string, unknown> | null>), {
          sticky: true,
          direction: "top",
          className: "nws-hover-tip"
        });
        g?.addLayer(mk);
      }
    });
  }, [mapReady, activeAlerts]);

  useEffect(() => {
    const radarLayer = radarLayerRef.current;
    if (!radarLayer || !radarAttached) return;
    radarLayer.setOpacity(Math.min(1, Math.max(0, radarOpacity)));
  }, [radarOpacity, radarAttached]);

  return (
    <div className="map-canvas-wrap">
      <div ref={containerRef} className="map-canvas" />
    </div>
  );
});

export default RadarMap;
