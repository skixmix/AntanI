import type React from "react";

interface SplitDividerProps {
  direction: "vertical" | "horizontal";
  ratio: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onRatioChange: (r: number) => void;
  /** Clips the divider to less than the full container edge-to-edge — used
   *  for the vertical divider in a 3-member split, where it only separates
   *  the top row (the bottom row is a single full-width pane). */
  bounds?: { top?: string; bottom?: string; left?: string; right?: string };
}

export function SplitDivider({
  direction,
  ratio,
  containerRef,
  onRatioChange,
  bounds,
}: SplitDividerProps) {
  const isVertical = direction === "vertical";

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    document.body.style.userSelect = "none";
    document.body.style.cursor = isVertical ? "col-resize" : "row-resize";

    function onMove(ev: PointerEvent) {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return;
      if (isVertical) {
        if (box.width <= 0) return;
        onRatioChange((ev.clientX - box.left) / box.width);
      } else {
        if (box.height <= 0) return;
        onRatioChange((ev.clientY - box.top) / box.height);
      }
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const style: React.CSSProperties = isVertical
    ? {
        left: `calc(${ratio * 100}% - 3px)`,
        width: 6,
        top: bounds?.top ?? 0,
        bottom: bounds?.bottom ?? 0,
      }
    : {
        top: `calc(${ratio * 100}% - 3px)`,
        height: 6,
        left: bounds?.left ?? 0,
        right: bounds?.right ?? 0,
      };

  return (
    <div
      className={`absolute z-10 flex items-stretch ${isVertical ? "cursor-col-resize" : "flex-col cursor-row-resize"}`}
      style={style}
      onPointerDown={handlePointerDown}
    >
      <div
        className={
          isVertical
            ? "mx-auto w-px bg-border transition-colors hover:bg-primary/60"
            : "my-auto h-px bg-border transition-colors hover:bg-primary/60"
        }
      />
    </div>
  );
}
