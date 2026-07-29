import { useState } from "react";
import { installOpencodeTheme } from "../lib/api.ipc";
import { SettingsSection } from "./SettingsSection";

export function OpencodeThemeSettings() {
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const install = async () => {
    setInstalling(true);
    setStatus(null);
    setError(null);
    try {
      await installOpencodeTheme();
      setStatus('Installed. Select "antani" as your theme in OpenCode.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <SettingsSection
      title="OpenCode theme"
      description='Install the Antani color theme for the OpenCode CLI into ~/.config/opencode/themes/. After installing, select "antani" from OpenCode’s theme list to apply it.'
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={installing}
          onClick={install}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-default disabled:opacity-50"
        >
          {installing ? "Installing…" : "Install Antani theme"}
        </button>
        {status && (
          <span role="status" className="text-xs text-muted-foreground">
            {status}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}
