import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { importFromVscode } from "../lib/api.ipc";

interface FirstRunVscodeModalProps {
  /** Called once the user has answered — after a completed/failed import, or
   *  immediately on "No" — so the caller can proceed to open the IDE. */
  onFinish: () => void;
}

type Phase = "confirm" | "importing" | "done" | "error";

/** Shown exactly once, the first time the user ever opens the embedded VS
 *  Code, before the code-server actually starts. Unlike ImportVscodeModal
 *  (manual re-import from the Settings page), every path here ends in
 *  `onFinish` — there is no "just close it" outcome. */
export function FirstRunVscodeModal({ onFinish }: FirstRunVscodeModalProps) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [result, setResult] = useState<string>("");

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
      onClick={phase === "importing" ? undefined : onFinish}
    >
      <div
        className="flex w-[420px] flex-col gap-5 rounded-xl border border-border bg-popover p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === "confirm" && (
          <>
            <div className="flex flex-col gap-2.5">
              <h2 className="text-base font-semibold text-foreground">
                Import your VS Code setup?
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Before opening the embedded VS Code for the first time, AntanI can copy your
                extensions and settings from your desktop VS Code installation.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                You can always do this later from Settings.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onFinish}
                className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                No, start fresh
              </button>
              <button
                type="button"
                onClick={runImport}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Yes, import
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
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onFinish}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Open VS Code
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
