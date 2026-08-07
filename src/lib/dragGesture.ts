/**
 * Shared pointer-drag primitives for `useDragReorder` and `useCardDrag` (both
 * exist because WKWebView has no working HTML5 drag API, see `src/CLAUDE.md`).
 * Keeping the press-vs-drag threshold and the body cursor/userSelect toggling
 * in one place stops the two hooks from silently drifting apart.
 */
const DRAG_THRESHOLD_PX = 4;

/** Some external displays (observed with DisplayLink adapters, fullscreen on
 *  a secondary monitor) occasionally deliver a single pointermove with a
 *  wildly wrong clientX/clientY right after pointerdown, which alone clears
 *  DRAG_THRESHOLD_PX and turns a plain click into a phantom drag. Requiring
 *  the threshold to still hold once this much time has passed filters out
 *  that one-frame spike, since a real press hasn't moved back yet while a
 *  glitch already self-corrected on the next frame. */
const DRAG_MIN_DELAY_MS = 100;

export function pastDragThreshold(dx: number, dy: number, elapsedMs: number): boolean {
  return elapsedMs >= DRAG_MIN_DELAY_MS && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
}

export function setBodyDragCursor(active: boolean) {
  document.body.style.userSelect = active ? "none" : "";
  document.body.style.cursor = active ? "grabbing" : "";
}
