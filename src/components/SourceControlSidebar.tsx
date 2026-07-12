import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { openDiffInIde } from "../lib/api.ipc";
import { buildFileTree, type TreeNode } from "../lib/fileTree";
import * as git from "../lib/git.ipc";
import { isNotGitRepoError } from "../lib/git.ipc";
import type { FileChangeKind, GitFileEntry, GitStatus, Project } from "../lib/types";
import {
  ChevronRightIcon,
  DiscardIcon,
  FileIcon,
  MinusIcon,
  PlusIcon,
  SourceControlIcon,
} from "./Icons";
import { RevertFileModal } from "./RevertFileModal";

interface SourceControlSidebarProps {
  project: Project | null;
  onOpenIde: () => void;
}

/** How long to retry `openDiffInIde` after `onOpenIde` — the IDE server and
 *  this project's webview (and the extension inside it) may still be
 *  starting up if this is the first time the project's IDE tab is opened. */
const OPEN_DIFF_RETRY_MS = 10_000;
const OPEN_DIFF_RETRY_INTERVAL_MS = 300;

const MIN_WIDTH = 200;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 280;
const COLLAPSED_WIDTH = 56;
const LS_KEY = "git-sidebar-width";
const LS_COLLAPSED_KEY = "git-sidebar-collapsed";

function readPersistedWidth(): number {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch {}
  return DEFAULT_WIDTH;
}

function readPersistedCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

const STATUS_COLOR: Record<FileChangeKind, string> = {
  added: "text-emerald-500",
  modified: "text-amber-400",
  deleted: "text-destructive",
};

const STATUS_LETTER: Record<FileChangeKind, string> = {
  added: "U",
  modified: "M",
  deleted: "D",
};

/** Merge staged + unstaged into unique per-path counts, for the collapsed
 *  rail's quick-glance added/modified/deleted summary. */
function summarizeCounts(status: GitStatus | null): Record<FileChangeKind, number> {
  const counts: Record<FileChangeKind, number> = { added: 0, modified: 0, deleted: 0 };
  if (!status) return counts;
  const kindByPath = new Map<string, FileChangeKind>();
  for (const entry of status.staged) kindByPath.set(entry.path, entry.kind);
  for (const entry of status.unstaged) kindByPath.set(entry.path, entry.kind);
  for (const kind of kindByPath.values()) counts[kind]++;
  return counts;
}

export function SourceControlSidebar({ project, onOpenIde }: SourceControlSidebarProps) {
  const [width, setWidth] = useState(readPersistedWidth);
  const [collapsed, setCollapsed] = useState(readPersistedCollapsed);
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
    };
  }, []);

  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Folders default to expanded, except staged folders which default to
  // collapsed. This set tracks keys the user has toggled *away* from that
  // default, so an empty set means every section is in its default state.
  const [toggledFolders, setToggledFolders] = useState<Set<string>>(new Set());
  const [revertTarget, setRevertTarget] = useState<GitFileEntry | null>(null);
  const [revertAllPending, setRevertAllPending] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, String(width));
    } catch {}
  }, [width]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : width;

  // Exposed as a CSS var so the bottom status bar can mirror this width to
  // keep its centered content in sync as this sidebar is resized.
  useEffect(() => {
    document.documentElement.style.setProperty("--git-sidebar-width", `${effectiveWidth}px`);
  }, [effectiveWidth]);

  const onResizeStart = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWRef.current = width;

      function onMove(ev: globalThis.MouseEvent) {
        if (!resizingRef.current) return;
        // This handle sits on the sidebar's left edge, so dragging left (negative
        // delta) must grow the panel — the sign is flipped vs. a left-side sidebar.
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWRef.current - (ev.clientX - startXRef.current)),
        );
        setWidth(next);
      }
      function onUp() {
        resizingRef.current = false;
        setIsResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        resizeCleanupRef.current = null;
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      resizeCleanupRef.current = () => {
        resizingRef.current = false;
        setIsResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
    },
    [width],
  );

  const refresh = useCallback(() => {
    if (!project) return;
    git
      .gitStatus(project.path)
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [project]);

  useEffect(() => {
    setStatus(null);
    setError(null);
    setToggledFolders(new Set());
    if (!project) return;
    refresh();
    void git.gitWatchStart(project.id, project.path);
    return () => {
      void git.gitWatchStop(project.id);
    };
    // `refresh` is memoized on `project`, so it only changes identity when
    // `project` does — including it here doesn't cause extra watcher restarts.
  }, [project, refresh]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void git
      .onGitStatusChanged((event) => {
        if (project && event.projectId === project.id) {
          setStatus(event.status);
          setError(null);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [project]);

  const toggleFolder = useCallback((key: string) => {
    setToggledFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const stageOne = useCallback(
    (path: string) => {
      if (!project) return;
      void git.gitStage(project.path, [path]).then(refresh);
    },
    [project, refresh],
  );
  const unstageOne = useCallback(
    (path: string) => {
      if (!project) return;
      void git.gitUnstage(project.path, [path]).then(refresh);
    },
    [project, refresh],
  );
  const stageAll = useCallback(() => {
    if (!project) return;
    void git.gitStageAll(project.path).then(refresh);
  }, [project, refresh]);
  const unstageAll = useCallback(() => {
    if (!project) return;
    void git.gitUnstageAll(project.path).then(refresh);
  }, [project, refresh]);
  const confirmRevert = useCallback(() => {
    if (!project || !revertTarget) return;
    void git.gitRevertFile(project.path, revertTarget.path, revertTarget.kind).then(() => {
      setRevertTarget(null);
      refresh();
    });
  }, [project, revertTarget, refresh]);
  const confirmRevertAll = useCallback(() => {
    if (!project) return;
    void git.gitRevertAll(project.path).then(() => {
      setRevertAllPending(false);
      refresh();
    });
  }, [project, refresh]);
  const openDiff = useCallback(
    (path: string) => {
      if (!project) return;
      onOpenIde();
      const projectPath = project.path;
      const filePath = `${projectPath}/${path}`;
      const deadline = Date.now() + OPEN_DIFF_RETRY_MS;
      const attempt = () => {
        openDiffInIde(projectPath, filePath).catch(() => {
          if (Date.now() < deadline) setTimeout(attempt, OPEN_DIFF_RETRY_INTERVAL_MS);
        });
      };
      attempt();
    },
    [project, onOpenIde],
  );

  if (!project) {
    return (
      <aside
        className="relative flex h-full shrink-0 flex-col items-center justify-center px-4 text-center text-xs text-muted-foreground no-select"
        style={{
          width: effectiveWidth,
          borderLeft: "1px solid var(--color-panel-divider)",
          transition: isResizing ? undefined : "width 180ms ease",
        }}
      >
        <button
          type="button"
          title={collapsed ? "Expand source control panel" : "Collapse source control panel"}
          onClick={() => setCollapsed((c) => !c)}
          className="absolute z-30 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          style={{ left: -12, top: 20 }}
        >
          <ChevronRightIcon size={11} className={collapsed ? "rotate-180" : ""} />
        </button>
        {!collapsed && "Select a project to see its source control status."}
      </aside>
    );
  }

  const staged = status ? buildFileTree(status.staged) : [];
  const unstaged = status ? buildFileTree(status.unstaged) : [];
  const hasChanges = status && (status.staged.length > 0 || status.unstaged.length > 0);

  const counts = summarizeCounts(status);
  const totalChanges = counts.added + counts.modified + counts.deleted;

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col"
      style={{
        width: effectiveWidth,
        background: "var(--color-sidebar)",
        borderLeft: "1px solid var(--color-panel-divider)",
        transition: isResizing ? undefined : "width 180ms ease",
      }}
    >
      {!collapsed && (
        <div
          className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-10"
          onMouseDown={onResizeStart}
        />
      )}

      {/* Active-project accent, matching the stripe in the projects sidebar,
          so which project this panel belongs to is visible at a glance —
          shown whether expanded or collapsed */}
      <div
        className="absolute left-0 top-0 z-20 pointer-events-none"
        style={{ height: 53, width: 2, backgroundColor: project.color }}
      />

      {/* Header height matches the top tab row (color line + tab strip) in
          the center view, so the bottom border lines up there */}
      <div
        className={`flex shrink-0 items-center justify-center text-xs font-semibold uppercase tracking-widest text-white/40 no-select ${
          collapsed ? "" : "gap-1.5"
        }`}
        style={{ height: 53, borderBottom: "1px solid var(--color-sidebar-border)" }}
      >
        <SourceControlIcon size={13} className="shrink-0" />
        {!collapsed && "Source Control"}
      </div>

      {/* Collapse toggle — anchored to the sidebar's outer edge so it stays
          in the same spot whether expanded or collapsed, instead of
          competing for space in the (very narrow, when collapsed) header. */}
      <button
        type="button"
        title={collapsed ? "Expand source control panel" : "Collapse source control panel"}
        onClick={() => setCollapsed((c) => !c)}
        className="absolute z-30 flex h-6 w-6 items-center justify-center rounded-full border bg-sidebar text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
        style={{ left: -12, top: 20, borderColor: project.color }}
      >
        <ChevronRightIcon size={11} className={collapsed ? "rotate-180" : ""} />
      </button>

      {collapsed && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[11px] font-semibold no-select">
          {counts.added > 0 && <span className="text-emerald-500">+{counts.added}</span>}
          {counts.modified > 0 && <span className="text-amber-400">~{counts.modified}</span>}
          {counts.deleted > 0 && <span className="text-destructive">-{counts.deleted}</span>}
          {!error && totalChanges === 0 && <span className="text-muted-foreground">—</span>}
          {error && <span className="px-1 text-center text-muted-foreground">!</span>}
        </div>
      )}

      {!collapsed && (
        <div className="flex flex-1 flex-col overflow-y-auto">
          {error && isNotGitRepoError(error) && (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-xs leading-relaxed text-muted-foreground no-select">
              Not a git repository
            </div>
          )}

          {error && !isNotGitRepoError(error) && (
            <div className="mx-3 mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] leading-relaxed text-destructive">
              {error}
            </div>
          )}

          {!error && status && !hasChanges && (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-xs leading-relaxed text-muted-foreground no-select">
              No changes.
            </div>
          )}

          {!error && status && status.staged.length > 0 && (
            <Section
              title="Staged"
              count={status.staged.length}
              actions={[
                { icon: <MinusIcon size={11} />, title: "Unstage all", onAction: unstageAll },
              ]}
            >
              <Tree
                nodes={staged}
                depth={0}
                staged
                toggledFolders={toggledFolders}
                onToggleFolder={toggleFolder}
                onStage={stageOne}
                onUnstage={unstageOne}
                onRevert={setRevertTarget}
                onOpenDiff={openDiff}
              />
            </Section>
          )}

          {!error && status && status.unstaged.length > 0 && (
            <Section
              title="Unstaged"
              count={status.unstaged.length}
              actions={[
                {
                  icon: <DiscardIcon size={11} />,
                  title: "Revert all",
                  onAction: () => setRevertAllPending(true),
                },
                { icon: <PlusIcon size={11} />, title: "Stage all", onAction: stageAll },
              ]}
            >
              <Tree
                nodes={unstaged}
                depth={0}
                staged={false}
                toggledFolders={toggledFolders}
                onToggleFolder={toggleFolder}
                onStage={stageOne}
                onUnstage={unstageOne}
                onRevert={setRevertTarget}
                onOpenDiff={openDiff}
              />
            </Section>
          )}
        </div>
      )}

      {revertTarget && (
        <RevertFileModal
          message={
            <>
              This will permanently discard changes to{" "}
              <span className="text-foreground">
                {revertTarget.path.split("/").pop() ?? revertTarget.path}
              </span>
              . This action cannot be undone.
            </>
          }
          onConfirm={confirmRevert}
          onCancel={() => setRevertTarget(null)}
        />
      )}

      {revertAllPending && (
        <RevertFileModal
          message={
            <>
              This will permanently discard all{" "}
              <span className="text-foreground">{status?.unstaged.length ?? 0}</span> unstaged
              change{status?.unstaged.length === 1 ? "" : "s"}. This action cannot be undone.
            </>
          }
          onConfirm={confirmRevertAll}
          onCancel={() => setRevertAllPending(false)}
        />
      )}
    </aside>
  );
}

function Section({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count: number;
  actions: { icon: ReactNode; title: string; onAction: () => void }[];
  children: ReactNode;
}) {
  return (
    <div className="mb-1">
      <div className="group flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground no-select">
        <div className="flex items-center gap-2">
          <span className="text-white/30">{count}</span>
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {actions.map((a) => (
            <button
              key={a.title}
              type="button"
              title={a.title}
              onClick={a.onAction}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-foreground group-hover:opacity-100 transition-opacity"
            >
              {a.icon}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

function Tree({
  nodes,
  depth,
  staged,
  toggledFolders,
  onToggleFolder,
  onStage,
  onUnstage,
  onRevert,
  onOpenDiff,
}: {
  nodes: TreeNode[];
  depth: number;
  staged: boolean;
  toggledFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onRevert: (entry: GitFileEntry) => void;
  onOpenDiff: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const expandKey = `${staged ? "staged" : "unstaged"}:${node.path}`;
        // Staged folders default to collapsed, unstaged to expanded; a
        // toggle flips away from that default.
        const isExpanded = toggledFolders.has(expandKey) ? staged : !staged;
        return node.type === "folder" ? (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => onToggleFolder(expandKey)}
              className="flex w-full items-center gap-1 px-3 py-1 text-xs text-foreground hover:bg-sidebar-accent transition-colors no-select"
              style={{ paddingLeft: 12 + depth * 14 }}
            >
              <ChevronRightIcon
                size={11}
                className={`shrink-0 text-muted-foreground transition-transform ${
                  isExpanded ? "rotate-90" : ""
                }`}
              />
              <span className="truncate">{node.name}</span>
            </button>
            {isExpanded && (
              <Tree
                nodes={node.children}
                depth={depth + 1}
                staged={staged}
                toggledFolders={toggledFolders}
                onToggleFolder={onToggleFolder}
                onStage={onStage}
                onUnstage={onUnstage}
                onRevert={onRevert}
                onOpenDiff={onOpenDiff}
              />
            )}
          </div>
        ) : (
          <div
            key={node.path}
            onClick={() => onOpenDiff(node.path)}
            className="group flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-sidebar-accent transition-colors cursor-pointer"
            style={{ paddingLeft: 12 + (depth + 1) * 14 }}
            title={`${node.path} — click to view diff`}
          >
            <FileIcon size={12} className={`shrink-0 ${STATUS_COLOR[node.kind]}`} />
            <span
              className={`truncate ${STATUS_COLOR[node.kind]} ${
                node.kind === "deleted" ? "line-through" : ""
              }`}
            >
              {node.name}
            </span>
            <span className="flex-1" />
            <div
              className="relative flex h-5 shrink-0 items-center justify-end"
              style={{ width: staged ? 20 : 42 }}
            >
              <span
                className={`pointer-events-none absolute right-0 w-3 text-center text-[10px] font-semibold opacity-70 transition-opacity group-hover:opacity-0 ${STATUS_COLOR[node.kind]}`}
              >
                {STATUS_LETTER[node.kind]}
              </span>
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {staged ? (
                  <button
                    type="button"
                    title="Unstage"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnstage(node.path);
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  >
                    <MinusIcon size={11} />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      title="Discard changes"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRevert({ path: node.path, kind: node.kind });
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                    >
                      <DiscardIcon size={11} />
                    </button>
                    <button
                      type="button"
                      title="Stage"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStage(node.path);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                    >
                      <PlusIcon size={11} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
