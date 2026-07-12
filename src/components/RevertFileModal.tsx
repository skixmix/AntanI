import { useEffect } from "react";
import { createPortal } from "react-dom";

interface RevertFileModalProps {
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RevertFileModal({ message, onConfirm, onCancel }: RevertFileModalProps) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("antani:picker-open"));
    return () => {
      window.dispatchEvent(new CustomEvent("antani:picker-close"));
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="flex w-80 flex-col gap-4 rounded-xl border border-border bg-popover p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-semibold text-foreground">Discard changes?</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">{message}</p>
        </div>

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
            Discard changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
