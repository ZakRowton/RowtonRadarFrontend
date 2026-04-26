"use client";

import { useCallback, useRef } from "react";
import Draggable from "react-draggable";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { nwsHeadline, nwsEventLabel, eventIconClass, getNwsFeatureId, eventAlertEmoji } from "@/lib/alertDisplay";
import { filterFeaturesForPoint, filterFeaturesInBounds, type MapBounds } from "@/lib/alertsInView";
import type { ActiveAlertsResponse } from "@/lib/api";
import { usePanelResize } from "@/lib/usePanelResize";

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
  const { heightPx, onResizeDown, onResizeMove, onResizeUp } = usePanelResize("alerts", nodeRef, {
    min: 96,
    max: 700
  });
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

  return (
    <div className="view-alerts-anchor" aria-label="In-view alerts">
    <Draggable
      nodeRef={nodeRef}
      handle=".view-alerts-drag"
      cancel=".view-alerts-list,button,a,.view-alerts-resize"
      onStart={clearTextSelection}
    >
      <div
        className={`view-alerts-floating ${heightPx != null ? "is-sized" : ""}`}
        ref={nodeRef}
        style={heightPx != null ? { height: heightPx, maxHeight: "min(85dvh, 800px)" } : undefined}
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
          className="view-alerts-resize"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          title="Drag to resize height"
          aria-label="Resize alerts panel"
          role="slider"
          aria-orientation="vertical"
          tabIndex={0}
        />
      </div>
    </Draggable>
    </div>
  );
}
