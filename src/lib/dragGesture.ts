/**
 * Shared pointer-drag primitives for `useDragReorder` and `useCardDrag` (both
 * exist because WKWebView has no working HTML5 drag API, see `src/CLAUDE.md`).
 * Keeping the press-vs-drag threshold and the body cursor/userSelect toggling
 * in one place stops the two hooks from silently drifting apart.
 */
const DRAG_THRESHOLD_PX = 4;

export function pastDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
}

export function setBodyDragCursor(active: boolean) {
  document.body.style.userSelect = active ? "none" : "";
  document.body.style.cursor = active ? "grabbing" : "";
}
