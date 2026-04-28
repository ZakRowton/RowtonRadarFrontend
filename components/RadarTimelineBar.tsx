"use client";

import { useCallback, useMemo, useState } from "react";
import type { RadarFrame, RadarFrameCategory } from "@/lib/api";

type Props = {
  frames: RadarFrame[];
  frameIndex: number;
  onScrub: (index: number) => void;
  onScrubStart?: () => void;
  onTogglePlay?: () => void;
  playing?: boolean;
  /** IANA time zone for map view; falls back to local. */
  areaTimeZone: string | null;
  /** When frames are empty, show this instead of “Loading frames…” (e.g. API unreachable). */
  fetchErrorText?: string | null;
};

function labelForCategory(c: RadarFrameCategory): string {
  if (c === "nowcast") return "Est. future";
  if (c === "now") return "Now";
  return "Past";
}

function formatFrameTime(utcSec: number, iana: string | null): string {
  const d = new Date(utcSec * 1000);
  const tz = iana && iana.length > 0 ? iana : undefined;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(d);
  }
}

function segmentLayout(frames: RadarFrame[]) {
  let pastW = 0;
  let nowW = 0;
  let nowcastW = 0;
  for (const f of frames) {
    if (f.category === "nowcast") nowcastW += 1;
    else if (f.category === "now") nowW += 1;
    else pastW += 1;
  }
  const total = pastW + nowW + nowcastW || 1;
  return {
    pastPct: (pastW / total) * 100,
    nowPct: (nowW / total) * 100,
    nowcastPct: (nowcastW / total) * 100,
    hasNowcast: nowcastW > 0
  };
}

export default function RadarTimelineBar({
  frames,
  frameIndex,
  onScrub,
  onScrubStart,
  onTogglePlay,
  playing = true,
  areaTimeZone,
  fetchErrorText = null
}: Props) {
  const n = frames.length;
  const safeIndex = n > 0 ? ((frameIndex % n) + n) % n : 0;
  const current = n > 0 ? frames[safeIndex]! : null;
  const { pastPct, nowPct, hasNowcast } = useMemo(() => segmentLayout(frames), [frames]);
  const playheadPct = n > 1 ? (safeIndex / (n - 1)) * 100 : 50;
  const [isDragging, setIsDragging] = useState(false);

  const onRangeInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (!Number.isFinite(v) || n <= 0) return;
      onScrub(Math.min(n - 1, Math.max(0, Math.round(v))));
    },
    [n, onScrub]
  );

  const onPointerDown = useCallback(() => {
    setIsDragging(true);
    onScrubStart?.();
  }, [onScrubStart]);

  const onPointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (n === 0) {
    const hasErr = Boolean(fetchErrorText && fetchErrorText.length > 0);
    const msg = hasErr ? fetchErrorText! : "Loading frames…";
    return (
      <div className="rowton-timeline" role="status" aria-live="polite">
        <div className="rowton-timeline__head">
          <span className="rowton-timeline__label">Radar time</span>
          <span
            className={
              hasErr ? "rowton-timeline__time rowton-timeline__time--err" : "rowton-timeline__time rowton-timeline__time--mute"
            }
          >
            {msg}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rowton-timeline" data-dragging={isDragging ? "1" : undefined}>
      <div className="rowton-timeline__head">
        <div className="rowton-timeline__meta">
          <span className="rowton-timeline__label">Frame time (map area)</span>
          {current && (
            <span
              className={
                "rowton-timeline__tag " +
                (current.category === "nowcast"
                  ? "rowton-timeline__tag--nowcast"
                  : current.category === "now"
                    ? "rowton-timeline__tag--now"
                    : "rowton-timeline__tag--past")
              }
            >
              {labelForCategory(current.category)}
            </span>
          )}
        </div>
        {current && (
          <time className="rowton-timeline__time" dateTime={current.timestamp} title="RainViewer frame generation (UTC) shown in local map-area time.">
            {formatFrameTime(current.timeUnix, areaTimeZone)}
          </time>
        )}
        <button
          type="button"
          className={`rowton-timeline__play ${playing ? "is-playing" : "is-paused"}`}
          onClick={onTogglePlay}
          aria-pressed={playing}
          title={playing ? "Pause radar animation" : "Resume radar animation"}
        >
          {playing ? "Pause" : "Play"}
        </button>
      </div>
      <div
        className="rowton-timeline__track"
        style={{
          background: `linear-gradient(90deg,
            var(--r-tl-past) 0%,
            var(--r-tl-past) ${pastPct}%,
            var(--r-tl-now) ${pastPct}%,
            var(--r-tl-now) ${pastPct + nowPct}%,
            var(--r-tl-future) ${pastPct + nowPct}%,
            var(--r-tl-future) 100%)`
        }}
        aria-hidden
      >
        <div className="rowton-timeline__playhead" style={{ left: `${playheadPct}%` }} />
      </div>
      <div className="rowton-timeline__slider-wrap">
        <label htmlFor="rowton-radar-scrub" className="rowton-sr">
          Scrub radar animation frame
        </label>
        <input
          id="rowton-radar-scrub"
          type="range"
          className="rowton-timeline__range"
          min={0}
          max={Math.max(0, n - 1)}
          step={1}
          value={safeIndex}
          onChange={onRangeInput}
          onInput={onRangeInput}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, n - 1)}
          aria-valuenow={safeIndex}
          aria-label="Scrub through radar time frames"
        />
      </div>
      <div className="rowton-timeline__legends" aria-hidden>
        <span>Past</span>
        <span>Now</span>
        {hasNowcast ? <span>Est. future</span> : <span className="rowton-timeline__no-nowcast">No nowcast</span>}
      </div>
    </div>
  );
}
