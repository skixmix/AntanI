import type React from "react";
import type { RefObject } from "react";
import { SPLIT_HEADER_H } from "../lib/constants";
import { type PaneRect, paneCellRect } from "../lib/splitLayout";
import { PANE_IDS, type PaneId, type Tab, type TabStatus } from "../lib/tabs";
import { PaneHeader } from "./PaneHeader";
import { SplitDivider } from "./SplitDivider";

interface SplitGridProps {
  members: Tab[];
  colRatio: number;
  rowRatio: number;
  focusedPane: PaneId;
  tabStatuses: Record<string, TabStatus>;
  runningTabs: Record<string, true>;
  containerRef: RefObject<HTMLDivElement | null>;
  draggingPane: PaneId | null;
  dropOver: PaneId | null;
  onStartDrag: (pane: PaneId, e: React.PointerEvent) => void;
  onSetColRatio: (ratio: number) => void;
  onSetRowRatio: (ratio: number) => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, title: string) => void;
  onRecolorTab: (tabId: string, color: string) => void;
  onUnsplit?: () => void;
}

function overlayStyle(cell: PaneRect): React.CSSProperties {
  return { top: cell.top, left: cell.left, width: cell.width, bottom: cell.bottom };
}

/** Renders the 2-4 pane headers, resize dividers, focus ring, and drag-drop
 *  overlay for an active split. Every header is drag-to-swap capable via
 *  `onStartDrag`, so any pane can be dragged onto any other to rearrange
 *  the grid; a press that doesn't cross the drag threshold just focuses it. */
export function SplitGrid({
  members,
  colRatio,
  rowRatio,
  focusedPane,
  tabStatuses,
  runningTabs,
  containerRef,
  draggingPane,
  dropOver,
  onStartDrag,
  onSetColRatio,
  onSetRowRatio,
  onCloseTab,
  onRenameTab,
  onRecolorTab,
  onUnsplit,
}: SplitGridProps) {
  const count = members.length;
  const hasBottomRow = count >= 3;
  const focusedIndex = PANE_IDS.indexOf(focusedPane);
  const draggingIndex = draggingPane ? PANE_IDS.indexOf(draggingPane) : -1;
  const dropIndex = dropOver ? PANE_IDS.indexOf(dropOver) : -1;

  return (
    <>
      {members.map((tab, index) => {
        const paneId = PANE_IDS[index];
        const cell = paneCellRect(index, count, colRatio, rowRatio);
        return (
          <div
            key={tab.id}
            style={{
              position: "absolute",
              top: cell.top,
              left: cell.left,
              width: cell.width,
              height: SPLIT_HEADER_H,
              zIndex: 10,
            }}
          >
            <PaneHeader
              tab={tab}
              focused={focusedPane === paneId}
              status={tabStatuses[tab.id]}
              running={!!runningTabs[tab.id]}
              dragging={draggingPane === paneId}
              onHeaderPointerDown={(e) => onStartDrag(paneId, e)}
              onClose={() => onCloseTab(tab.id)}
              onRename={(t) => onRenameTab(tab.id, t)}
              onRecolor={(c) => onRecolorTab(tab.id, c)}
              onUnsplit={() => onUnsplit?.()}
            />
          </div>
        );
      })}

      <SplitDivider
        direction="vertical"
        ratio={colRatio}
        containerRef={containerRef}
        onRatioChange={onSetColRatio}
        bounds={count === 3 ? { bottom: `${(1 - rowRatio) * 100}%` } : undefined}
      />

      {hasBottomRow && (
        <SplitDivider
          direction="horizontal"
          ratio={rowRatio}
          containerRef={containerRef}
          onRatioChange={onSetRowRatio}
        />
      )}

      {focusedIndex !== -1 && (
        <div
          className="pointer-events-none absolute rounded-sm ring-2 ring-primary/40"
          style={overlayStyle(paneCellRect(focusedIndex, count, colRatio, rowRatio))}
        />
      )}

      {draggingIndex !== -1 && dropIndex !== -1 && dropIndex !== draggingIndex && (
        <div
          className="pointer-events-none absolute z-20 rounded-sm bg-primary/10 ring-2 ring-primary"
          style={overlayStyle(paneCellRect(dropIndex, count, colRatio, rowRatio))}
        />
      )}
    </>
  );
}
