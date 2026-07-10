/**
 * Fixed project color palette (Phase 1 requirement: ~10 colors, no color wheel).
 * This is the single source of truth for colors; the Rust backend just stores
 * whatever hex string the frontend sends.
 */
export const PROJECT_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#22c55e", // green
  "#14b8a6", // teal
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
] as const;

/** Default color for a newly added project: cycle through the palette by index. */
export function defaultColorForIndex(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

/** Derive a fallback project name from a folder path (its basename). */
export function basename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed || "Untitled";
}

/** Number of projects reachable via Cmd+1..9. */
export const MAX_QUICK_SWITCH = 9;

/** xterm scrollback buffer in lines. */
export const TERMINAL_SCROLLBACK = 10_000;

/** Debounce before pushing a resize to the PTY; fit() itself runs immediately. */
export const PTY_RESIZE_DEBOUNCE_MS = 150;
