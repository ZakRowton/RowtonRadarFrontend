"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Draggable from "react-draggable";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { nwsHeadline, nwsEventLabel, eventIconClass, getNwsFeatureId, eventAlertEmoji } from "@/lib/alertDisplay";
import { filterFeaturesForPoint, filterFeaturesInBounds, type MapBounds } from "@/lib/alertsInView";
import type { ActiveAlertsResponse } from "@/lib/api";

type Props = {
  alerts: ActiveAlertsResponse | null;
  mapBounds: MapBounds | null;
  /** Device / saved “home” — warnings here are always listed, even if the map is elsewhere. */
  homePoint: { lat: number; lon: number } | null;
  onSelectFeature: (f: Feature<Geometry, Record<string, unknown> | null>) => void;
  /** When set, alerts request failed; show this message. */
  fetchError?: string | null;
  selectedId?: string | null;
};

export default function ViewAlertsDraggablePanel({
  alerts,
  mapBounds,
  homePoint,
  onSelectFeature,
  fetchError = null,
  selectedId
}: Props) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const [widthPx, setWidthPx] = useState<number | null>(null);
  const dragResizeRef = useRef({ on: false, startX: 0, startY: 0, startW: 0, startH: 0 });
  useEffect(() => {
    try {
      const h = Number(localStorage.getItem("rowton.panel.alerts.height"));
      const w = Number(localStorage.getItem("rowton.panel.alerts.width"));
      if (Number.isFinite(h)) setHeightPx(Math.max(140, Math.min(720, h)));
      if (Number.isFinite(w)) setWidthPx(Math.max(210, Math.min(620, w)));
    } catch {
      // no-op
    }
  }, []);
  const clearTextSelection = useCallback(() => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && sel.rangeCount > 0) {
      sel.removeAllRanges();
    }
  }, []);
  const fc = alerts?.type === "FeatureCollection" ? (alerts as FeatureCollection) : null;
  const inView = fc && mapBounds ? filterFeaturesInBounds(fc, mapBounds) : [];
  const atHome =
    fc && homePoint ? filterFeaturesForPoint(fc, homePoint.lat, homePoint.lon) : [];
  const homeIdSet = new Set(atHome.map((f) => getNwsFeatureId(f as Feature<Geometry, unknown>)));
  const inViewNotHome = inView.filter(
    (f) => !homeIdSet.has(getNwsFeatureId(f as Feature<Geometry, unknown>))
  );
  const nTotal = atHome.length + inViewNotHome.length;
  const onCornerResizeDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = nodeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragResizeRef.current = {
      on: true,
      startX: e.clientX,
      startY: e.clientY,
      startW: widthPx ?? rect.width,
      startH: heightPx ?? rect.height
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [heightPx, widthPx]);
  const onCornerResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragResizeRef.current.on) return;
    const dx = e.clientX - dragResizeRef.current.startX;
    const dy = e.clientY - dragResizeRef.current.startY;
    setWidthPx(Math.max(210, Math.min(620, dragResizeRef.current.startW + dx)));
    setHeightPx(Math.max(140, Math.min(720, dragResizeRef.current.startH + dy)));
  }, []);
  const onCornerResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragResizeRef.current.on) return;
    dragResizeRef.current.on = false;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
    if (heightPx != null) localStorage.setItem("rowton.panel.alerts.height", String(Math.round(heightPx)));
    if (widthPx != null) localStorage.setItem("rowton.panel.alerts.width", String(Math.round(widthPx)));
  }, [heightPx, widthPx]);

  return (
    <div className="view-alerts-anchor" aria-label="In-view alerts">
    <Draggable
      nodeRef={nodeRef}
      handle=".view-alerts-drag"
      cancel=".view-alerts-list,button,a,.view-alerts-corner-resize"
      onStart={clearTextSelection}
    >
      <div
        className={`view-alerts-floating ${heightPx != null ? "is-sized" : ""}`}
        ref={nodeRef}
        style={{
          ...(heightPx != null ? { height: heightPx, maxHeight: "min(85dvh, 800px)" } : {}),
          ...(widthPx != null ? { width: widthPx, maxWidth: "min(90vw, 620px)" } : {})
        }}
      >
        <div className="view-alerts-drag" title="Drag">
          <span>Active alerts{homePoint ? " — home & view" : " — map view"}</span>
          <span className="view-alerts-n">{nTotal}</span>
        </div>
        {alerts === null && <div className="view-alerts-hint">Loading…</div>}
        {alerts && fetchError && (
          <div className="view-alerts-hint view-alerts-err">{fetchError}</div>
        )}
        {alerts && !fetchError && mapBounds === null && inView.length === 0 && (
          <div className="view-alerts-hint">Map view is loading…</div>
        )}
        {alerts && !fetchError && mapBounds !== null && nTotal === 0 && (
          <div className="view-alerts-hint">No NWS warnings for this view{homePoint ? " or your location" : ""}.</div>
        )}
        {nTotal > 0 && (
          <ul className="view-alerts-list" role="list">
            {atHome.map((f) => {
              const id = getNwsFeatureId(f as Feature<Geometry, unknown>);
              const ev = nwsEventLabel(f);
              const em = eventAlertEmoji(ev);
              return (
                <li key={`h-${id}`} className={selectedId === id ? "is-selected" : ""}>
                  <button
                    type="button"
                    className="view-alerts-item"
                    onClick={() => onSelectFeature(f as Feature<Geometry, Record<string, unknown> | null>)}
                  >
                    <span className={`view-alerts-ico ${eventIconClass(ev)}`} title={ev} aria-hidden="true">
                      {em}
                    </span>
                    <span className="view-alerts-text">
                      <span className="view-alerts-scope">Your location</span>
                      <strong>{ev}</strong>
                      <small>{nwsHeadline(f)}</small>
                    </span>
                  </button>
                </li>
              );
            })}
            {inViewNotHome.map((f) => {
              const id = getNwsFeatureId(f as Feature<Geometry, unknown>);
              const ev = nwsEventLabel(f);
              const em = eventAlertEmoji(ev);
              return (
                <li key={`m-${id}`} className={selectedId === id ? "is-selected" : ""}>
                  <button
                    type="button"
                    className="view-alerts-item"
                    onClick={() => onSelectFeature(f as Feature<Geometry, Record<string, unknown> | null>)}
                  >
                    <span className={`view-alerts-ico ${eventIconClass(ev)}`} title={ev} aria-hidden="true">
                      {em}
                    </span>
                    <span className="view-alerts-text">
                      <span className="view-alerts-scope">Map view</span>
                      <strong>{ev}</strong>
                      <small>{nwsHeadline(f)}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div
          className="view-alerts-corner-resize"
          onPointerDown={onCornerResizeDown}
          onPointerMove={onCornerResizeMove}
          onPointerUp={onCornerResizeUp}
          onPointerCancel={onCornerResizeUp}
          title="Resize panel"
          aria-label="Resize alerts panel from corner"
        />
      </div>
    </Draggable>
    </div>
  );
}
