"use client";

import { Fragment, useEffect, useMemo, type ReactNode } from "react";
import type { Feature, Geometry } from "geojson";
import type { AlertDetailSection } from "@/lib/alertDisplay";
import { eventAlertEmoji, getAlertDetailSections, nwsEventLabel, nwsHeadline } from "@/lib/alertDisplay";

type Props = {
  feature: Feature<Geometry, Record<string, unknown> | null> | null;
  onClose: () => void;
};

function KvGroup({ items }: { items: AlertDetailSection[] }) {
  if (!items.length) return null;
  return (
    <div className="alert-meta-card">
      <div className="alert-meta-card__glow" aria-hidden />
      <h3 className="alert-meta-card__title">
        <span className="alert-meta-card__title-ico" aria-hidden>
          ◫
        </span>
        Details
      </h3>
      <ul className="alert-meta-list" role="list">
        {items.map((s) => (
          <li key={s.id} className="alert-meta-list__row">
            <span className="alert-meta-list__icon" title={s.label} aria-hidden>
              {s.icon}
            </span>
            <div className="alert-meta-list__body">
              <span className="alert-meta-list__label">{s.label}</span>
              <span className="alert-meta-list__value">{s.rawValue}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProseBlock({ s }: { s: AlertDetailSection }) {
  const parts = s.paragraphs && s.paragraphs.length > 0 ? s.paragraphs : [s.rawValue];
  return (
    <section className="alert-prose-block" aria-labelledby={`alert-sec-${s.id}`}>
      <h3 id={`alert-sec-${s.id}`} className="alert-prose-block__title">
        <span className="alert-prose-block__ico" aria-hidden>
          {s.icon}
        </span>
        {s.label}
      </h3>
      <div className="alert-prose-block__text">
        {parts.map((para, i) => (
          <p key={i} className="alert-prose-para">
            {para}
          </p>
        ))}
      </div>
    </section>
  );
}

function CalloutBlock({ s }: { s: AlertDetailSection }) {
  return (
    <div className="alert-callout" role="note">
      <div className="alert-callout__glow" aria-hidden />
      <div className="alert-callout__head">
        <span className="alert-callout__icon" aria-hidden>
          {s.icon}
        </span>
        <span className="alert-callout__label">{s.label}</span>
      </div>
      <p className="alert-callout__text">{s.rawValue}</p>
    </div>
  );
}

function renderSectionBlocks(sections: AlertDetailSection[]) {
  const out: ReactNode[] = [];
  let kvRun: AlertDetailSection[] = [];
  const flush = () => {
    if (kvRun.length) {
      out.push(<KvGroup key={`kv-block-${out.length}`} items={kvRun} />);
      kvRun = [];
    }
  };
  for (const s of sections) {
    if (s.kind === "kv") {
      kvRun.push(s);
    } else {
      flush();
      if (s.kind === "prose") {
        out.push(<ProseBlock key={s.id} s={s} />);
      } else {
        out.push(<CalloutBlock key={s.id} s={s} />);
      }
    }
  }
  flush();
  return out;
}

export default function AlertDetailsSidePanel({ feature, onClose }: Props) {
  useEffect(() => {
    if (!feature) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [feature, onClose]);

  const sections = useMemo(() => (feature ? getAlertDetailSections(feature) : []), [feature]);

  if (!feature) return null;

  const title = nwsEventLabel(feature);
  const sub = nwsHeadline(feature);
  const heroIcon = eventAlertEmoji(title);
  const blocks = renderSectionBlocks(sections);

  return (
    <div className="alert-side-scrim" role="dialog" aria-modal="true" aria-label="Alert details">
      <button type="button" className="alert-side-scrim_hit" onClick={onClose} aria-label="Close" />
      <aside className="alert-side-panel">
        <div className="alert-side-hero">
          <div className="alert-side-hero__glow" aria-hidden />
          <div className="alert-side-hero__row">
            <div className="alert-side-hero-ico" aria-hidden>
              {heroIcon}
            </div>
            <div className="alert-side-hero__text">
              <h2 className="alert-side-title" id="alert-side-heading">
                {title}
              </h2>
              <p className="alert-side-sub">{sub}</p>
            </div>
          </div>
          <button type="button" className="alert-side-close" onClick={onClose}>
            <span className="alert-side-close__x" aria-hidden>
              ×
            </span>
            <span>Close</span>
          </button>
        </div>
        <div className="alert-side-body">
          {blocks.length ? <Fragment>{blocks}</Fragment> : <p className="alert-side-empty">No text details for this alert.</p>}
        </div>
      </aside>
    </div>
  );
}
