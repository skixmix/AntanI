import { PROJECT_COLORS } from "../lib/constants";

interface ColorPickerProps {
  selected: string;
  onPick: (color: string) => void;
  onClose: () => void;
}

/** Small fixed-palette popover. Reused for projects (Phase 1) and tabs (Phase 2). */
export function ColorPicker({ selected, onPick, onClose }: ColorPickerProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 z-50 mt-1 grid grid-cols-5 gap-1.5 rounded-lg border border-border bg-popover p-2 shadow-xl">
        {PROJECT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Set color ${color}`}
            onClick={(e) => {
              e.stopPropagation();
              onPick(color);
              onClose();
            }}
            className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${
              selected === color ? "ring-2 ring-primary" : "ring-1 ring-border"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </>
  );
}
