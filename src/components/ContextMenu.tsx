import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ContextMenuItem {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const VIEWPORT_MARGIN = 8;

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, visible: false });

  // Park native webviews (VS Code) while the menu is open — they paint above
  // all web content and would clip this overlay.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("antani:picker-open"));
    return () => {
      window.dispatchEvent(new CustomEvent("antani:picker-close"));
    };
  }, []);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN),
      top: Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN),
      visible: true,
    });
  }, [x, y]);

  useLayoutEffect(() => {
    window.addEventListener("click", onClose);
    window.addEventListener("contextmenu", onClose);
    return () => {
      window.removeEventListener("click", onClose);
      window.removeEventListener("contextmenu", onClose);
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed z-50 min-w-36 rounded-lg border border-border bg-popover p-1 shadow-xl text-sm"
        style={{ left: pos.left, top: pos.top, visibility: pos.visible ? "visible" : "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <div key={item.label}>
            {item.separatorBefore && <div className="my-1 border-t border-border" />}
            <button
              type="button"
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-secondary ${
                item.destructive ? "text-destructive" : "text-foreground"
              }`}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {item.icon}
              </span>
              {item.label}
            </button>
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
