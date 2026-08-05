export function taskDurationMs(startedAt: number | null, doneAt: number | null): number | null {
  if (startedAt === null || doneAt === null) return null;
  return doneAt - startedAt;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

export function formatTimestamp(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysBetween(fromMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - fromMs) / 86_400_000));
}

export type AgeLevel = "fresh" | "aging" | "stale";

export function columnAgeLevel(days: number): AgeLevel {
  if (days >= 7) return "stale";
  if (days >= 3) return "aging";
  return "fresh";
}
