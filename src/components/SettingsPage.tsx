import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Settings } from "../lib/types";

interface SettingsPageProps {
  settings: Settings;
  onClose: () => void;
  onImportVscode: () => void;
  onToggleNotifications: (enabled: boolean) => void;
}

export function SettingsPage({
  settings,
  onClose,
  onImportVscode,
  onToggleNotifications,
}: SettingsPageProps) {
  // Park native webviews while the page is open — same reason as every other
  // full-screen/modal surface: they always paint on top of web content.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("antani:picker-open"));
    return () => {
      window.dispatchEvent(new CustomEvent("antani:picker-close"));
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div
        className="flex h-[53px] shrink-0 items-center justify-between px-5"
        style={{ borderBottom: "1px solid var(--color-panel-divider)" }}
      >
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 justify-center overflow-y-auto">
        <div className="flex w-full max-w-lg flex-col gap-6 px-6 py-10">
          <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-medium text-foreground">Import from VS Code</h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Copy extensions and settings from your desktop VS Code installation into AntanI's
                own storage. Safe to run again — already-imported extensions won't be duplicated.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={onImportVscode}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Import now
              </button>
            </div>
          </section>

          <section className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-medium text-foreground">Notifications</h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Notify when an agent tab becomes ready or needs input, while it isn't the focused
                tab.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.notificationsEnabled}
              onClick={() => onToggleNotifications(!settings.notificationsEnabled)}
              className={`relative h-5 w-9 shrink-0 appearance-none rounded-full border-0 p-0 outline-none transition-colors ${
                settings.notificationsEnabled ? "bg-primary" : "bg-secondary"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  settings.notificationsEnabled ? "translate-x-[18px]" : "translate-x-0"
                }`}
              />
            </button>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
