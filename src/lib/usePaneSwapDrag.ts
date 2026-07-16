import type React from "react";
import { type RefObject, useRef, useState } from "react";
import { paneIndexAt } from "./splitLayout";
import { PANE_IDS, type PaneId } from "./tabs";

const DRAG_THRESHOLD_PX = 5;

export interface SplitGeometry {
  colRatio: number;
  rowRatio: number;
  memberCount: number;
}

/**
 * Pointer-events based drag to swap any two split panes (Tauri/WKWebView has
 * no reliable HTML5 drag API). A press that never crosses the threshold is
 * treated as a plain click and focuses the pressed pane; a press that drags
 * onto a different pane and releases there swaps the two.
 */
export function usePaneSwapDrag(
  contentRef: RefObject<HTMLDivElement | null>,
  geometryRef: RefObject<SplitGeometry>,
  onSwap: (a: PaneId, b: PaneId) => void,
  onFocusPane: (pane: PaneId) => void,
) {
  const [draggingPane, setDraggingPane] = useState<PaneId | null>(null);
  const [dropOver, setDropOver] = useState<PaneId | null>(null);
  const stateRef = useRef<{
    source: PaneId;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  function paneAt(clientX: number, clientY: number): PaneId | null {
    const box = contentRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    const { colRatio, rowRatio, memberCount } = geometryRef.current;
    const index = paneIndexAt(
      (clientX - box.left) / box.width,
      (clientY - box.top) / box.height,
      memberCount,
      colRatio,
      rowRatio,
    );
    return index < memberCount ? PANE_IDS[index] : null;
  }

  function startDrag(pane: PaneId, e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("button, input")) return;
    stateRef.current = { source: pane, startX: e.clientX, startY: e.clientY, moved: false };

    function onMove(ev: PointerEvent) {
      const st = stateRef.current;
      if (!st) return;
      if (
        !st.moved &&
        Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      if (!st.moved) {
        st.moved = true;
        setDraggingPane(st.source);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
      setDropOver(paneAt(ev.clientX, ev.clientY));
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const st = stateRef.current;
      stateRef.current = null;
      setDraggingPane(null);
      setDropOver(null);
      if (!st) return;
      if (!st.moved) {
        onFocusPane(st.source);
        return;
      }
      const over = paneAt(ev.clientX, ev.clientY);
      if (over && over !== st.source) onSwap(st.source, over);
      else onFocusPane(st.source);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return { startDrag, draggingPane, dropOver };
}
