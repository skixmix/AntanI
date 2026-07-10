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

  // Park native webviews (VS Code) while the picker is open — they paint above
  // all web content and would clip this overlay.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("antani:picker-open"));
    return () => { window.dispatchEvent(new CustomEvent("antani:picker-close")); };
  }, []);

  function commitHex(value: string) {
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      onPick(trimmed);
      onClose();
    }
  }

  // Position above or below the anchor depending on available space.
  // The picker is ~130px tall; if less than that remains below, open upward.
  const PICKER_HEIGHT = 135;
  const rect = anchorEl?.getBoundingClientRect();
  const spaceBelow = rect ? window.innerHeight - rect.bottom : 0;
  const style: React.CSSProperties = rect
    ? spaceBelow >= PICKER_HEIGHT
      ? { position: "fixed", top: rect.bottom + 6, left: rect.left }
      : { position: "fixed", bottom: window.innerHeight - rect.top + 6, left: rect.left }
    : { position: "fixed", top: 60, left: 60 };

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="z-50 w-44 rounded-lg border border-border bg-popover p-2.5 shadow-xl"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 grid grid-cols-5 gap-1.5">
          {PROJECT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Set color ${color}`}
              onClick={() => { onPick(color); onClose(); }}
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
            onClick={() => nativeRef.current?.click()}
            className="h-6 w-6 shrink-0 rounded-full ring-1 ring-border transition-transform hover:scale-110"
            style={{ backgroundColor: hex || selected || "#888" }}
          />
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
      </div>
    </>,
    document.body,
  );
}
