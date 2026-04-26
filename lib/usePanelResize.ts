import { useCallback, useEffect, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react";

const key = (id: "alerts" | "forecast") => `rowton.panel.${id}Height`;

type Opts = { min: number; max: number };

/**
 * Vertical drag-to-resize on the bottom edge. Persists height to localStorage.
 */
export function usePanelResize(
  id: "alerts" | "forecast",
  panelRef: RefObject<HTMLElement | null>,
  { min, max }: Opts
) {
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const drag = useRef({ on: false, startY: 0, startH: 0, nextH: 0 });

  useEffect(() => {
    try {
      const s = localStorage.getItem(key(id));
      if (s) {
        const n = parseInt(s, 10);
        if (Number.isFinite(n)) {
          setHeightPx(Math.min(max, Math.max(min, n)));
        }
      }
    } catch {
      /* */
    }
  }, [id, min, max]);

  const onResizeDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const startH = heightPx ?? rect.height;
      drag.current = { on: true, startY: e.clientY, startH, nextH: startH };
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [panelRef, heightPx]
  );

  const onResizeMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag.current.on) return;
      const dy = e.clientY - drag.current.startY;
      const h = Math.min(max, Math.max(min, drag.current.startH + dy));
      drag.current.nextH = h;
      setHeightPx(h);
    },
    [min, max]
  );

  const onResizeUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag.current.on) return;
      drag.current.on = false;
      const h = drag.current.nextH;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
      if (h >= min && h <= max) {
        setHeightPx(Math.round(h));
        try {
          localStorage.setItem(key(id), String(Math.round(h)));
        } catch {
          /* */
        }
      }
    },
    [id, min, max]
  );

  return { heightPx, onResizeDown, onResizeMove, onResizeUp };
}
