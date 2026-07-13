import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ConfirmPopoverProps {
  x: number;
  y: number;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const VIEWPORT_MARGIN = 8;

export function ConfirmPopover({
  x,
  y,
  message,
  confirmLabel = "Discard changes",
  onConfirm,
  onCancel,
}: ConfirmPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, visible: false });

  // Park native webviews (VS Code) while the popover is open — they paint
  // above all web content and would clip this overlay.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("antani:picker-open"));
    return () => {
      window.dispatchEvent(new CustomEvent("antani:picker-close"));
    };
  }, []);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const { width, height } = card.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN),
      top: Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN),
      visible: true,
    });
  }, [x, y]);

  useLayoutEffect(() => {
    window.addEventListener("click", onCancel);
    window.addEventListener("contextmenu", onCancel);
    window.addEventListener("antani:close-ctx-menus", onCancel);
    return () => {
      window.removeEventListener("click", onCancel);
      window.removeEventListener("contextmenu", onCancel);
      window.removeEventListener("antani:close-ctx-menus", onCancel);
    };
  }, [onCancel]);

  return createPortal(
    <div
      ref={cardRef}
      className="fixed z-50 flex w-72 flex-col gap-3 rounded-lg border border-border bg-popover p-4 shadow-xl"
      style={{ left: pos.left, top: pos.top, visibility: pos.visible ? "visible" : "hidden" }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <p className="text-xs leading-relaxed text-foreground">{message}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors"
        >
          {confirmLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
