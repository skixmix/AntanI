import type React from "react";
import { type RefObject, useRef, useState } from "react";
import type { PaneId } from "./tabs";

const DRAG_THRESHOLD_PX = 5;

/**
 * Pointer-events based drag to swap the two split panes (Tauri/WKWebView has no
 * reliable HTML5 drag API). A press that never crosses the threshold is treated
 * as a plain click and focuses the pressed pane; a press that drags onto the
 * opposite pane and releases there swaps the panes.
 */
export function usePaneSwapDrag(
  contentRef: RefObject<HTMLDivElement | null>,
  splitRatioRef: RefObject<number>,
  onSwap: () => void,
  onFocusPane: (pane: PaneId) => void,
) {
  const [draggingPane, setDraggingPane] = useState<PaneId | null>(null);
  const [dropOver, setDropOver] = useState<PaneId | null>(null);
  const stateRef = useRef<{ source: PaneId; startX: number; moved: boolean } | null>(null);

  function paneAt(clientX: number): PaneId | null {
    const box = contentRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return null;
    return (clientX - box.left) / box.width < splitRatioRef.current ? "primary" : "secondary";
  }

  function startDrag(pane: PaneId, e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("button, input")) return;
    stateRef.current = { source: pane, startX: e.clientX, moved: false };

    function onMove(ev: PointerEvent) {
      const st = stateRef.current;
      if (!st) return;
      if (!st.moved && Math.abs(ev.clientX - st.startX) < DRAG_THRESHOLD_PX) return;
      if (!st.moved) {
        st.moved = true;
        setDraggingPane(st.source);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
      setDropOver(paneAt(ev.clientX));
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
      const over = paneAt(ev.clientX);
      if (over && over !== st.source) onSwap();
      else onFocusPane(st.source);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return { startDrag, draggingPane, dropOver };
}
