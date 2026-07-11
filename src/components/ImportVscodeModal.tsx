import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { importFromVscode } from "../lib/api.ipc";

interface ImportVscodeModalProps {
  onClose: () => void;
}

type Phase = "confirm" | "importing" | "done" | "error";

export function ImportVscodeModal({ onClose }: ImportVscodeModalProps) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [result, setResult] = useState<string>("");

  // Park native webviews while modal is open.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("antani:picker-open"));
    return () => {
      window.dispatchEvent(new CustomEvent("antani:picker-close"));
    };
  }, []);

  async function runImport() {
    setPhase("importing");
    try {
      const summary = await importFromVscode();
      setResult(summary);
      setPhase("done");
    } catch (e) {
      setResult(String(e));
      setPhase("error");
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={phase === "importing" ? undefined : onClose}
    >
      <div
        className="flex w-[420px] flex-col gap-5 rounded-xl border border-border bg-popover p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === "confirm" && (
          <>
            <div className="flex flex-col gap-2.5">
              <h2 className="text-base font-semibold text-foreground">Import from VS Code</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                This will copy your extensions and settings from the desktop VS Code installation
                into AntanI's own storage.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Extensions already imported won't be duplicated. Your settings will override
                AntanI's defaults where they conflict.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runImport}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Import
              </button>
            </div>
          </>
        )}

        {phase === "importing" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p className="text-sm text-muted-foreground">Copying extensions…</p>
          </div>
        )}

        {(phase === "done" || phase === "error") && (
          <>
            <div className="flex flex-col gap-2.5">
              <h2 className="text-base font-semibold text-foreground">
                {phase === "done" ? "Import complete" : "Import failed"}
              </h2>
              <p
                className={`text-sm leading-relaxed ${phase === "error" ? "text-destructive" : "text-muted-foreground"}`}
              >
                {result}
              </p>
              {phase === "done" && (
                <p className="text-sm text-muted-foreground">
                  Reopen VS Code in AntanI to pick up the imported extensions.
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
