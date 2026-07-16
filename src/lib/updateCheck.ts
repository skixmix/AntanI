/** Compares two `x.y.z` version strings (leading "v" tolerated). Missing or
 *  non-numeric parts are treated as 0, so "1.2" and "1.2.0" compare equal. */
export function isNewerVersion(current: string, candidate: string): boolean {
  const currentParts = versionParts(current);
  const candidateParts = versionParts(candidate);
  for (let i = 0; i < Math.max(currentParts.length, candidateParts.length); i++) {
    const currentPart = currentParts[i] ?? 0;
    const candidatePart = candidateParts[i] ?? 0;
    if (candidatePart !== currentPart) return candidatePart > currentPart;
  }
  return false;
}

function versionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}
