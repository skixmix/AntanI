import type { TabKind } from "../lib/tabs";
import type { Project } from "../lib/types";
import { AnthropicIcon, OpenCodeIcon, TerminalIcon, VSCodeIcon } from "./Icons";

interface EmptyPaneProps {
  project: Project;
  onOpen: (kind: TabKind) => void;
  onToggleIde: () => void;
}

interface Action {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

export function EmptyPane({ project, onOpen, onToggleIde }: EmptyPaneProps) {
  const actions: Action[] = [
    { label: "Open Terminal",  icon: <TerminalIcon size={15} className="text-muted-foreground" />,                onClick: () => onOpen("terminal") },
    { label: "Open Claude",    icon: <AnthropicIcon size={15} />,                                                 onClick: () => onOpen("claude") },
    { label: "Open OpenCode",  icon: <OpenCodeIcon size={15} />,                                                  onClick: () => onOpen("opencode") },
    { label: "Open VS Code",   icon: <VSCodeIcon size={15} className="text-[#007ACC]" />,                         onClick: onToggleIde },
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 no-select">
      {/* Project avatar */}
      <div
        className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-bold text-black/80"
        style={{ backgroundColor: project.color }}
      >
        {project.name.charAt(0).toUpperCase()}
      </div>

      {/* Action list — fixed width, centered */}
      <div className="flex w-64 flex-col">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="flex items-center gap-3 rounded px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              {action.icon}
            </span>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
