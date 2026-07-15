import { useState } from "react";
import { exportBackup, importBackup } from "../lib/api.ipc";
import type { BackupSelection } from "../lib/types";
import { SettingsSection } from "./SettingsSection";

type Operation = "idle" | "exporting" | "importing";

const BACKUP_CATEGORIES = [
  {
    key: "projects",
    label: "Projects & customizations",
    description: "Projects, colors, quick actions, and custom prompts",
  },
  {
    key: "preferences",
    label: "App preferences",
    description: "Font, agents, notifications, sounds, and future app settings",
  },
  {
    key: "vscodeProfile",
    label: "VS Code profile",
    description: "Settings, keybindings, snippets, and workspace state",
  },
  {
    key: "vscodeExtensions",
    label: "VS Code extensions",
    description: "Extensions installed in AntanI's embedded VS Code",
  },
] as const satisfies readonly {
  readonly key: keyof BackupSelection;
  readonly label: string;
  readonly description: string;
}[];

const DEFAULT_SELECTION: BackupSelection = {
  projects: true,
  preferences: true,
  vscodeProfile: true,
  vscodeExtensions: true,
};

export function BackupSettings() {
  const [operation, setOperation] = useState<Operation>("idle");
  const [selection, setSelection] = useState<BackupSelection>(DEFAULT_SELECTION);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportCurrentBackup = async () => {
    setOperation("exporting");
    setStatus(null);
    setError(null);
    try {
      if (await exportBackup(selection)) setStatus("Backup saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOperation("idle");
    }
  };

  const restoreBackup = async () => {
    const confirmed = window.confirm(
      "Importing a backup replaces the categories included in that backup and restarts the app. Continue?",
    );
    if (!confirmed) return;

    setOperation("importing");
    setStatus(null);
    setError(null);
    try {
      const selected = await importBackup();
      if (!selected) setOperation("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setOperation("idle");
    }
  };

  const busy = operation !== "idle";
  const hasSelection = Object.values(selection).some(Boolean);

  return (
    <SettingsSection
      title="Backup"
      description="Export or restore projects, commands, prompts, preferences, colors, and the embedded VS Code profile. Backup files can contain private paths and settings."
    >
      <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-xs font-medium text-foreground">Include in export</legend>
        {BACKUP_CATEGORIES.map((category) => (
          <label
            key={category.key}
            className="flex cursor-pointer items-start gap-2 rounded-md bg-tertiary p-3"
          >
            <input
              type="checkbox"
              checked={selection[category.key]}
              onChange={() =>
                setSelection((current) => ({
                  ...current,
                  [category.key]: !current[category.key],
                }))
              }
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">{category.label}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {category.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !hasSelection}
          onClick={exportCurrentBackup}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-default disabled:opacity-50"
        >
          {operation === "exporting" ? "Exporting…" : "Export backup"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={restoreBackup}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-default disabled:opacity-50"
        >
          {operation === "importing" ? "Importing…" : "Import backup"}
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
