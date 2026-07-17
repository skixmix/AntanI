import type React from "react";
import { type RefObject, useRef, useState } from "react";

/**
 * A content area a dragged item can be dropped into for an action other than
 * reordering (e.g. dropping a tab onto the workspace body to start/grow a
 * split). A release inside `zoneRef`'s rect fires `onDrop` instead of a
 * reorder; while hovering it, a highlight overlay is shown and the reorder
 * insertion bar is suppressed.
 */
export interface SplitDropTarget {
  zoneRef: RefObject<HTMLDivElement | null>;
  canDrop: (fromId: string) => boolean;
  onDrop: (fromId: string) => void;
}

/**
 * Pointer-events based drag-to-reorder for Tauri/WKWebView.
 *
 * Each draggable item must have:
 *   data-drag-scope="<scope>"
 *   data-drag-id="<id>"
 *
 * Call startDrag(e, id) from onPointerDown.
 *
 * Returns:
 *   draggingId    — id of item being dragged (for lift styling)
 *   insertBeforeId — id of item the dragged item will be inserted *before*,
 *                    or null meaning "append to end"
 *   startDrag
 */
export function useDragReorder(
  scope: string,
  isVertical: boolean,
  onReorder: (fromId: string, insertBeforeId: string | null) => void,
  splitDrop?: SplitDropTarget,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null | undefined>(undefined);
  const dragIdRef = useRef<string | null>(null);
  const insertRef = useRef<string | null | undefined>(undefined);
  const overDropRef = useRef(false);
  const highlightRef = useRef<HTMLElement | null>(null);

  function findInsertBefore(x: number, y: number): string | null {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-drag-scope="${scope}"]`),
    );
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      const mid = isVertical ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2;
      const pos = isVertical ? y : x;
      if (pos < mid) return node.getAttribute("data-drag-id");
    }
    return null;
  }

  function pointerInDropZone(ev: PointerEvent): boolean {
    if (!splitDrop) return false;
    const zone = splitDrop.zoneRef.current;
    const id = dragIdRef.current;
    if (!zone || !id || !splitDrop.canDrop(id)) return false;
    const r = zone.getBoundingClientRect();
    return (
      ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom
    );
  }

  function setHighlight(on: boolean) {
    if (on) {
      const zone = splitDrop?.zoneRef.current;
      if (highlightRef.current || !zone) return;
      const el = document.createElement("div");
      el.className =
        "pointer-events-none absolute inset-0 z-30 rounded-sm bg-primary/10 ring-2 ring-inset ring-primary";
      zone.appendChild(el);
      highlightRef.current = el;
    } else {
      highlightRef.current?.remove();
      highlightRef.current = null;
    }
  }

  function startDrag(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest("button, input")) return;
    e.preventDefault();

    dragIdRef.current = id;
    insertRef.current = undefined;
    overDropRef.current = false;
    setDraggingId(id);
    setInsertBeforeId(undefined);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    function onMove(ev: PointerEvent) {
      if (pointerInDropZone(ev)) {
        if (!overDropRef.current) {
          overDropRef.current = true;
          setHighlight(true);
        }
        if (insertRef.current !== undefined) {
          insertRef.current = undefined;
          setInsertBeforeId(undefined);
        }
        return;
      }
      if (overDropRef.current) {
        overDropRef.current = false;
        setHighlight(false);
      }
      const next = findInsertBefore(ev.clientX, ev.clientY);
      if (next !== insertRef.current) {
        insertRef.current = next;
        setInsertBeforeId(next);
      }
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const droppedInZone = pointerInDropZone(ev);
      setHighlight(false);
      overDropRef.current = false;
      const fromId = dragIdRef.current;
      const before = insertRef.current;
      dragIdRef.current = null;
      insertRef.current = undefined;
      setDraggingId(null);
      setInsertBeforeId(undefined);
      if (fromId && droppedInZone && splitDrop) {
        splitDrop.onDrop(fromId);
        return;
      }
      if (fromId && before !== undefined && before !== fromId) {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(`[data-drag-scope="${scope}"]`),
        );
        const ids = nodes.map((n) => n.getAttribute("data-drag-id") as string);
        const filtered = ids.filter((id) => id !== fromId);
        if (before === null) {
          filtered.push(fromId);
        } else {
          const idx = filtered.indexOf(before);
          if (idx !== -1) filtered.splice(idx, 0, fromId);
        }
        const newOrder = filtered;
        const insertBefore = before;
        onReorder(fromId, insertBefore);
        void newOrder;
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return { draggingId, insertBeforeId, startDrag };
}
