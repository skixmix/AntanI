import type { TaskStatus } from "../lib/types";

export const COLUMN_ACCENT: Record<
  TaskStatus,
  { dot: string; header: string; column: string; card: string }
> = {
  todo: {
    dot: "bg-slate-400",
    header: "text-slate-300",
    column: "border-slate-500/30 bg-slate-500/5",
    card: "border-l-slate-400/70",
  },
  inProgress: {
    dot: "bg-blue-400",
    header: "text-blue-300",
    column: "border-blue-500/30 bg-blue-500/5",
    card: "border-l-blue-400/70",
  },
  done: {
    dot: "bg-emerald-400",
    header: "text-emerald-300",
    column: "border-emerald-500/30 bg-emerald-500/5",
    card: "border-l-emerald-400/70",
  },
};
