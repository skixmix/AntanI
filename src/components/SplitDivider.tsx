import type React from "react";

interface SplitDividerProps {
  ratio: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onRatioChange: (r: number) => void;
}

export function SplitDivider({ ratio, containerRef, onRatioChange }: SplitDividerProps) {
  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    function onMove(ev: PointerEvent) {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0) return;
      onRatioChange((ev.clientX - box.left) / box.width);
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

  return (
    <div
      className="absolute top-0 bottom-0 z-10 flex cursor-col-resize items-stretch"
      style={{ left: `calc(${ratio * 100}% - 3px)`, width: 6 }}
      onPointerDown={handlePointerDown}
    >
      <div className="mx-auto w-px bg-border transition-colors hover:bg-primary/60" />
    </div>
  );
}
