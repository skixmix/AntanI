import { SPLIT_HEADER_H } from "./constants";

export interface PaneRect {
  top: string;
  left: string;
  width: string;
  bottom: string;
}

interface Quadrant {
  row: 0 | 1;
  col: 0 | 1;
  fullWidthRow: boolean;
}

/** Quadrant order: 0=primary/top-left, 1=secondary/top-right,
 *  2=tertiary/bottom-left (or full-width bottom row when there's no 4th
 *  member), 3=quaternary/bottom-right. */
function quadrant(index: number, memberCount: number): Quadrant {
  const hasBottomRow = memberCount >= 3;
  const row = hasBottomRow && index >= 2 ? 1 : 0;
  const fullWidthRow = row === 1 && memberCount === 3;
  const col = fullWidthRow ? 0 : ((index % 2) as 0 | 1);
  return { row, col, fullWidthRow };
}

function rowBounds(row: 0 | 1, memberCount: number, rowRatio: number, headerOffset: boolean) {
  const hasBottomRow = memberCount >= 3;
  if (row === 0) {
    return {
      top: headerOffset ? `${SPLIT_HEADER_H}px` : "0%",
      bottom: hasBottomRow ? `calc(${(1 - rowRatio) * 100}%)` : "0",
    };
  }
  return {
    top: headerOffset ? `calc(${rowRatio * 100}% + ${SPLIT_HEADER_H}px)` : `${rowRatio * 100}%`,
    bottom: "0",
  };
}

function colBounds(col: 0 | 1, fullWidthRow: boolean, colRatio: number) {
  if (fullWidthRow) return { left: "0%", width: "100%" };
  return col === 0
    ? { left: "0%", width: `${colRatio * 100}%` }
    : { left: `${colRatio * 100}%`, width: `${(1 - colRatio) * 100}%` };
}

/** CSS rect for split member `index`'s content, given how many members are
 *  in the split and the two independent divider ratios. Offset from the
 *  quadrant's top edge by SPLIT_HEADER_H, since content sits below its own
 *  pane header. 2 members -> single column split, full height (today's
 *  exact layout). 3 members -> top row of 2 plus a full-width row below.
 *  4 members -> full 2x2 grid, one vertical line and one horizontal line. */
export function paneRect(
  index: number,
  memberCount: number,
  colRatio: number,
  rowRatio: number,
): PaneRect {
  const { row, col, fullWidthRow } = quadrant(index, memberCount);
  return {
    ...rowBounds(row, memberCount, rowRatio, true),
    ...colBounds(col, fullWidthRow, colRatio),
  };
}

/** CSS rect for split member `index`'s whole quadrant cell (header +
 *  content) — used to position the pane header itself and to draw the
 *  focus-ring / drag-drop-target overlays around a full pane. */
export function paneCellRect(
  index: number,
  memberCount: number,
  colRatio: number,
  rowRatio: number,
): PaneRect {
  const { row, col, fullWidthRow } = quadrant(index, memberCount);
  return {
    ...rowBounds(row, memberCount, rowRatio, false),
    ...colBounds(col, fullWidthRow, colRatio),
  };
}

/** Inverse of `quadrant`: which member index a fractional point
 *  (0..1 across the split container's width/height) falls into, for
 *  drag-to-swap hit-testing. `xFrac`/`yFrac` are not clamped by the caller,
 *  so this always returns a valid index even for a point outside 0..1. */
export function paneIndexAt(
  xFrac: number,
  yFrac: number,
  memberCount: number,
  colRatio: number,
  rowRatio: number,
): number {
  const hasBottomRow = memberCount >= 3;
  const row = hasBottomRow && yFrac >= rowRatio ? 1 : 0;
  if (row === 1 && memberCount === 3) return 2;
  const col = xFrac >= colRatio ? 1 : 0;
  return row * 2 + col;
}
