import type React from "react";
import { type RefObject, useRef, useState } from "react";
import type { PaneRect } from "./splitLayout";

/**
 * A content area a dragged item can be dropped into for an action other than
 * reordering (e.g. dropping a tab onto the workspace body to start/grow a
 * split). A release inside `zoneRef`'s rect fires `onDrop` instead of a
 * reorder; while hovering it, a highlight overlay is shown and the reorder
 * insertion bar is suppressed. `previewRect` optionally narrows that overlay
 * to just the sub-region the drop will land in (e.g. the new bottom row).
 */
export interface SplitDropTarget {
  zoneRef: RefObject<HTMLDivElement | null>;
  canDrop: (fromId: string) => boolean;
  onDrop: (fromId: string) => void;
  previewRect?: (fromId: string) => PaneRect | null;
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
 *   insertBeforeId — id of item the dragged item will be inserted *before*;
 *                    null means "append to end"; undefined means "not a
 *                    reorder target" (no active drag, or the pointer is off
 *                    the list's cross-axis) — callers must treat this as
 *                    distinct from null, not fall back to end-of-list
 *   startDrag
 */
const DRAG_THRESHOLD_PX = 4;

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

  function findInsertBefore(x: number, y: number): string | null | undefined {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-drag-scope="${scope}"]`),
    );
    if (nodes.length === 0) return undefined;

    // Off the list's cross-axis (a project row dragged sideways onto a
    // terminal) is not a reorder, so report no target. That hides the
    // insertion bar and skips the release-time reorder, leaving the
    // terminal's own path-drop as the only action.
    let bandStart = Number.POSITIVE_INFINITY;
    let bandEnd = Number.NEGATIVE_INFINITY;
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      bandStart = Math.min(bandStart, isVertical ? rect.left : rect.top);
      bandEnd = Math.max(bandEnd, isVertical ? rect.right : rect.bottom);
    }
    const cross = isVertical ? x : y;
    if (cross < bandStart || cross > bandEnd) return undefined;

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
      const id = dragIdRef.current;
      if (highlightRef.current || !zone || !id) return;
      const rect = splitDrop?.previewRect?.(id) ?? null;
      const el = document.createElement("div");
      el.className =
        "pointer-events-none absolute z-30 rounded-sm bg-primary/10 ring-2 ring-inset ring-primary transition-all";
      if (rect) {
        el.style.top = rect.top;
        el.style.left = rect.left;
        el.style.width = rect.width;
        el.style.bottom = rect.bottom;
      } else {
        el.style.inset = "0";
      }
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
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    dragIdRef.current = id;
    insertRef.current = undefined;
    overDropRef.current = false;

    function beginDrag() {
      moved = true;
      setDraggingId(id);
      setInsertBeforeId(undefined);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
    }

    function onMove(ev: PointerEvent) {
      if (!moved) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= DRAG_THRESHOLD_PX) return;
        beginDrag();
      }
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
      if (!moved) {
        dragIdRef.current = null;
        return;
      }
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
      // undefined means "not a valid reorder target" (off cross-axis): skip
      // the reorder rather than treating it as null's "append to end".
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
