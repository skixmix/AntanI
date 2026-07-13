import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PROJECT_COLORS } from "../lib/constants";

interface ColorPickerProps {
  anchorEl: HTMLElement | null;
  selected: string;
  onPick: (color: string) => void;
  onClose: () => void;
}

export function ColorPicker({ anchorEl, selected, onPick, onClose }: ColorPickerProps) {
  const [hex, setHex] = useState(selected.startsWith("#") ? selected : "");
  const nativeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("antani:picker-open"));
    return () => {
      window.dispatchEvent(new CustomEvent("antani:picker-close"));
    };
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest(".color-picker-panel")) onClose();
    };
    const closeOnMenu = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("antani:close-ctx-menus", closeOnMenu);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("antani:close-ctx-menus", closeOnMenu);
    };
  }, [onClose]);

  function commitHex(value: string) {
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      onPick(trimmed);
      onClose();
    }
  }

  const PICKER_HEIGHT = 135;
  const rect = anchorEl?.getBoundingClientRect();
  const spaceBelow = rect ? window.innerHeight - rect.bottom : 0;
  const style: React.CSSProperties = rect
    ? spaceBelow >= PICKER_HEIGHT
      ? { position: "fixed", top: rect.bottom + 6, left: rect.left }
      : { position: "fixed", bottom: window.innerHeight - rect.top + 6, left: rect.left }
    : { position: "fixed", top: 60, left: 60 };

  return createPortal(
    <div
      className="color-picker-panel z-[60] w-44 rounded-lg border border-border bg-popover p-2.5 shadow-xl"
      style={style}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className="mb-2 grid grid-cols-5 gap-1.5">
        {PROJECT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Set color ${color}`}
            onClick={() => {
              onPick(color);
              onClose();
            }}
            className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
              selected === color
                ? "ring-2 ring-primary ring-offset-1 ring-offset-popover"
                : "ring-1 ring-border"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Open color picker"
          title="Custom color"
          onClick={() => nativeRef.current?.click()}
          className="group relative h-6 w-6 shrink-0 rounded-full ring-1 ring-border transition-transform hover:scale-110"
          style={{ backgroundColor: hex || selected || "#888" }}
        >
          <span className="absolute inset-0 flex items-center justify-center rounded-full opacity-60 transition-opacity group-hover:opacity-100 bg-black/40">
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="text-white"
              aria-hidden="true"
            >
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 12.25A5.25 5.25 0 1 1 8 2.75a5.25 5.25 0 0 1 0 10.5Zm0-8.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-2.5 1.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-4 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm3 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
            </svg>
          </span>
        </button>
        <input
          ref={nativeRef}
          type="color"
          value={hex || selected || "#888888"}
          onChange={(e) => {
            setHex(e.currentTarget.value);
            onPick(e.currentTarget.value);
          }}
          onBlur={() => onClose()}
          className="sr-only"
        />
        <input
          type="text"
          value={hex}
          placeholder="#rrggbb"
          maxLength={7}
          onChange={(e) => setHex(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitHex(hex);
            if (e.key === "Escape") onClose();
          }}
          onBlur={() => commitHex(hex)}
          className="min-w-0 flex-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none ring-1 ring-border focus:ring-primary"
        />
      </div>
    </div>,
    document.body,
  );
}
