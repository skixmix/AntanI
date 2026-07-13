import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PROJECT_COLORS } from "../lib/constants";
import { playSystemSound, SYSTEM_SOUNDS } from "../lib/sound.ipc";
import type { CustomCommand, Project, Settings } from "../lib/types";
import { ColorPicker } from "./ColorPicker";
import { CloseIcon, TerminalIcon, VSCodeIcon } from "./Icons";

interface SettingsPageProps {
  settings: Settings;
  project: Project | null;
  initialTab?: TabId;
  onClose: () => void;
  onImportVscode: () => void;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onAddCustomCommand: (projectId: string, name: string, command: string, color: string) => void;
  onRemoveCustomCommand: (projectId: string, commandId: string) => void;
  onUpdateCustomCommand: (
    projectId: string,
    commandId: string,
    name: string,
    command: string,
    color: string,
  ) => void;
}

export type TabId = "general" | "commands" | "vscode";

const TABS: { id: TabId; label: string; icon: (className: string) => ReactNode }[] = [
  {
    id: "general",
    label: "General",
    icon: (className) => (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <path
          d="M8 1.8c-.4 0-.7.3-.8.6L6.9 3.6a4.8 4.8 0 0 0-1.2.5l-1.2-.6a.8.8 0 0 0-1 .2l-.7.7a.8.8 0 0 0-.2 1l.6 1.2c-.2.4-.4.8-.5 1.2l-1.2.3a.8.8 0 0 0-.6.8v1c0 .4.3.7.6.8l1.2.3c.1.4.3.8.5 1.2l-.6 1.2a.8.8 0 0 0 .2 1l.7.7c.3.3.7.3 1 .2l1.2-.6c.4.2.8.4 1.2.5l.3 1.2c.1.3.4.6.8.6h1c.4 0 .7-.3.8-.6l.3-1.2c.4-.1.8-.3 1.2-.5l1.2.6a.8.8 0 0 0 1-.2l.7-.7a.8.8 0 0 0 .2-1l-.6-1.2c.2-.4.4-.8.5-1.2l1.2-.3c.3-.1.6-.4.6-.8v-1a.8.8 0 0 0-.6-.8l-1.2-.3a4.8 4.8 0 0 0-.5-1.2l.6-1.2a.8.8 0 0 0-.2-1l-.7-.7a.8.8 0 0 0-1-.2l-1.2.6a4.8 4.8 0 0 0-1.2-.5l-.3-1.2a.8.8 0 0 0-.8-.6h-1Z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    id: "commands",
    label: "Commands",
    icon: (className) => <TerminalIcon size={14} className={className} />,
  },
  {
    id: "vscode",
    label: "VS Code",
    icon: (className) => <VSCodeIcon size={14} className={className} />,
  },
];

function SectionCard({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {badge}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Color dot + name — makes which project a per-project section applies to
 *  unmissable, since Settings is a full-screen overlay with no project sidebar. */
function ProjectBadge({ project }: { project: Project }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-tertiary px-2.5 py-1 text-[11px] font-medium text-foreground">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
      {project.name}
    </span>
  );
}

function SoundPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="rounded-md bg-tertiary px-2.5 py-1.5 text-xs text-foreground outline-none ring-1 ring-border transition-shadow focus:ring-primary/60"
        >
          {SYSTEM_SOUNDS.map((sound) => (
            <option key={sound} value={sound}>
              {sound}
            </option>
          ))}
        </select>
        <button
          type="button"
          title={`Preview ${value}`}
          onClick={() => void playSystemSound(value)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M4 2.5v11l10-5.5-10-5.5Z" />
          </svg>
        </button>
      </div>
    </label>
  );
}

function CommandField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  function commit() {
    const trimmed = draft.trim();
    setDraft(trimmed || placeholder);
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else if (!trimmed && value !== placeholder) onCommit(placeholder);
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(value);
        }}
        spellCheck={false}
        className="w-full rounded-md bg-tertiary px-2.5 py-1.5 font-mono text-xs text-foreground outline-none ring-1 ring-border transition-shadow focus:ring-primary/60"
      />
    </label>
  );
}

function CustomCommandRow({
  cmd,
  onEdit,
  onRemove,
}: {
  cmd: CustomCommand;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-tertiary px-2.5 py-1.5">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: cmd.color }}
        />
        <span className="shrink-0 text-xs font-medium text-foreground">{cmd.name}</span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{cmd.command}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive transition-colors"
      >
        <CloseIcon size={11} />
      </button>
    </div>
  );
}

function CustomCommandForm({
  editing,
  onSave,
  onCancel,
}: {
  editing: CustomCommand | null;
  onSave: (name: string, command: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [command, setCommand] = useState(editing?.command ?? "");
  const [color, setColor] = useState(editing?.color ?? PROJECT_COLORS[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const swatchRef = useRef<HTMLButtonElement>(null);

  function submit() {
    const trimmedName = name.trim();
    const trimmedCommand = command.trim();
    if (!trimmedName || !trimmedCommand) return;
    onSave(trimmedName, trimmedCommand, color);
    if (!editing) {
      setName("");
      setCommand("");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2.5">
      <div className="flex items-center gap-2">
        <button
          ref={swatchRef}
          type="button"
          title="Color"
          onClick={() => setPickerOpen(true)}
          className="h-6 w-6 shrink-0 rounded-full ring-1 ring-border transition-transform hover:scale-110"
          style={{ backgroundColor: color }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Name"
          className="w-28 min-w-0 rounded-md bg-tertiary px-2 py-1.5 text-xs text-foreground outline-none ring-1 ring-border transition-shadow focus:ring-primary/60"
        />
        <input
          value={command}
          onChange={(e) => setCommand(e.currentTarget.value)}
          placeholder="Shell command"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md bg-tertiary px-2 py-1.5 font-mono text-xs text-foreground outline-none ring-1 ring-border transition-shadow focus:ring-primary/60"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        {editing && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || !command.trim()}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {editing ? "Save" : "Add command"}
        </button>
      </div>
      {pickerOpen && (
        <ColorPicker
          anchorEl={swatchRef.current}
          selected={color}
          onPick={setColor}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

export function SettingsPage({
  settings,
  project,
  initialTab,
  onClose,
  onImportVscode,
  onUpdateSettings,
  onAddCustomCommand,
  onRemoveCustomCommand,
  onUpdateCustomCommand,
}: SettingsPageProps) {
  const [tab, setTab] = useState<TabId>(initialTab ?? "general");
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);

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
        <div className="flex w-full max-w-2xl gap-8 px-6 py-10">
          {/* Vertical tab rail */}
          <nav className="flex w-40 shrink-0 flex-col gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  tab === t.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {t.icon("shrink-0 opacity-80")}
                {t.label}
              </button>
            ))}
          </nav>

          {/* Tab content */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {tab === "general" && (
              <>
                <SectionCard title="Terminal" description="Appearance settings for terminal tabs.">
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-xs font-medium text-foreground">Font size</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={8}
                        max={32}
                        value={settings.terminalFontSize}
                        onChange={(e) => {
                          const v = parseInt(e.currentTarget.value, 10);
                          if (v >= 8 && v <= 32) onUpdateSettings({ terminalFontSize: v });
                        }}
                        className="w-16 rounded-md bg-tertiary px-2.5 py-1.5 text-xs text-foreground outline-none ring-1 ring-border transition-shadow focus:ring-primary/60 text-center tabular-nums"
                      />
                      {settings.terminalFontSize !== 14 && (
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ terminalFontSize: 14 })}
                          className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </label>
                </SectionCard>
                <SectionCard
                  title="Notifications"
                  description="Notify when an agent tab becomes ready or needs input, while it isn't the focused tab."
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">
                      {settings.notificationsEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.notificationsEnabled}
                      onClick={() =>
                        onUpdateSettings({ notificationsEnabled: !settings.notificationsEnabled })
                      }
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
                  </div>

                  <div className="flex flex-col gap-3 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs font-medium text-foreground">Sound</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.soundEnabled}
                        onClick={() => onUpdateSettings({ soundEnabled: !settings.soundEnabled })}
                        className={`relative h-5 w-9 shrink-0 appearance-none rounded-full border-0 p-0 outline-none transition-colors ${
                          settings.soundEnabled ? "bg-primary" : "bg-secondary"
                        }`}
                      >
                        <span
                          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                            settings.soundEnabled ? "translate-x-[18px]" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                    {settings.soundEnabled && (
                      <div className="flex flex-col gap-2.5">
                        <SoundPicker
                          label="Agent ready sound"
                          value={settings.soundReady}
                          onChange={(soundReady) => onUpdateSettings({ soundReady })}
                        />
                        <SoundPicker
                          label="Agent waiting sound"
                          value={settings.soundWaiting}
                          onChange={(soundWaiting) => onUpdateSettings({ soundWaiting })}
                        />
                      </div>
                    )}
                  </div>
                </SectionCard>
              </>
            )}

            {tab === "commands" && (
              <>
                <SectionCard
                  title="Launch commands"
                  description="Override the shell command run when opening a Claude or opencode tab — useful for aliases, wrappers, or extra flags."
                >
                  <div className="flex flex-col gap-4">
                    <CommandField
                      label="Claude command"
                      value={settings.claudeCommand}
                      placeholder="claude"
                      onCommit={(claudeCommand) => onUpdateSettings({ claudeCommand })}
                    />
                    <CommandField
                      label="opencode command"
                      value={settings.opencodeCommand}
                      placeholder="opencode"
                      onCommit={(opencodeCommand) => onUpdateSettings({ opencodeCommand })}
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Custom commands"
                  description="Per-project quick-access commands. Each opens a new tab that runs its shell command."
                  badge={project && <ProjectBadge project={project} />}
                >
                  {!project && (
                    <p className="text-xs text-muted-foreground">
                      Open a project to manage its custom commands.
                    </p>
                  )}
                  {project && (
                    <div className="flex flex-col gap-2">
                      {project.customCommands.map((cmd) => (
                        <CustomCommandRow
                          key={cmd.id}
                          cmd={cmd}
                          onEdit={() => setEditingCommandId(cmd.id)}
                          onRemove={() => {
                            if (editingCommandId === cmd.id) setEditingCommandId(null);
                            onRemoveCustomCommand(project.id, cmd.id);
                          }}
                        />
                      ))}
                      <CustomCommandForm
                        key={editingCommandId ?? "new"}
                        editing={
                          project.customCommands.find((c) => c.id === editingCommandId) ?? null
                        }
                        onSave={(name, command, color) => {
                          if (editingCommandId) {
                            onUpdateCustomCommand(
                              project.id,
                              editingCommandId,
                              name,
                              command,
                              color,
                            );
                            setEditingCommandId(null);
                          } else {
                            onAddCustomCommand(project.id, name, command, color);
                          }
                        }}
                        onCancel={() => setEditingCommandId(null)}
                      />
                    </div>
                  )}
                </SectionCard>
              </>
            )}

            {tab === "vscode" && (
              <SectionCard
                title="Import from VS Code"
                description="Copy extensions and settings from your desktop VS Code installation into AntanI's own storage. Safe to run again — already-imported extensions won't be duplicated."
              >
                <div>
                  <button
                    type="button"
                    onClick={onImportVscode}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    Import now
                  </button>
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
