"use client";

import { useCallback, useRef } from "react";
import Draggable from "react-draggable";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { nwsHeadline, nwsEventLabel, eventIconClass, getNwsFeatureId, eventAlertEmoji } from "@/lib/alertDisplay";
import { filterFeaturesInBounds, type MapBounds } from "@/lib/alertsInView";
import type { ActiveAlertsResponse } from "@/lib/api";

type Props = {
  alerts: ActiveAlertsResponse | null;
  mapBounds: MapBounds | null;
  onSelectFeature: (f: Feature<Geometry, Record<string, unknown> | null>) => void;
  /** When set, alerts request failed; show this message. */
  fetchError?: string | null;
  selectedId?: string | null;
};

export default function ViewAlertsDraggablePanel({
  alerts,
  mapBounds,
  onSelectFeature,
  fetchError = null,
  selectedId
}: Props) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const clearTextSelection = useCallback(() => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && sel.rangeCount > 0) {
      sel.removeAllRanges();
    }
  }, []);
  const fc = alerts?.type === "FeatureCollection" ? (alerts as FeatureCollection) : null;
  const inView =
    fc && mapBounds ? filterFeaturesInBounds(fc, mapBounds) : [];

  return (
    <div className="view-alerts-anchor" aria-label="In-view alerts">
    <Draggable
      nodeRef={nodeRef}
      handle=".view-alerts-drag"
      cancel=".view-alerts-list,button,a"
      onStart={clearTextSelection}
    >
      <div className="view-alerts-floating" ref={nodeRef}>
        <div className="view-alerts-drag" title="Drag">
          <span>Active alerts — map view</span>
          <span className="view-alerts-n">{inView.length}</span>
        </div>
        {alerts === null && <div className="view-alerts-hint">Loading…</div>}
        {alerts && fetchError && (
          <div className="view-alerts-hint view-alerts-err">{fetchError}</div>
        )}
        {alerts && !fetchError && mapBounds === null && inView.length === 0 && (
          <div className="view-alerts-hint">Map view is loading…</div>
        )}
        {alerts && !fetchError && mapBounds !== null && inView.length === 0 && (
          <div className="view-alerts-hint">No NWS warnings intersect this view.</div>
        )}
        {inView.length > 0 && (
          <ul className="view-alerts-list" role="list">
            {inView.map((f) => {
              const id = getNwsFeatureId(f as Feature<Geometry, unknown>);
              const ev = nwsEventLabel(f);
              const em = eventAlertEmoji(ev);
              return (
                <li key={id} className={selectedId === id ? "is-selected" : ""}>
                  <button
                    type="button"
                    className="view-alerts-item"
                    onClick={() => onSelectFeature(f as Feature<Geometry, Record<string, unknown> | null>)}
                  >
                    <span className={`view-alerts-ico ${eventIconClass(ev)}`} title={ev} aria-hidden="true">
                      {em}
                    </span>
                    <span className="view-alerts-text">
                      <strong>{ev}</strong>
                      <small>{nwsHeadline(f)}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Draggable>
    </div>
  );
}
