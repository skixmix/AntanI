const LATEST_RELEASE_URL = "https://api.github.com/repos/skixmix/AntanI/releases/latest";
export const RELEASES_PAGE_URL = "https://github.com/skixmix/AntanI/releases/latest";

/** Returns the latest published release's version tag (e.g. "0.10.0"), or
 *  null if the check fails for any reason — this is a best-effort background
 *  check, never worth surfacing an error for. */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(LATEST_RELEASE_URL);
    if (!response.ok) return null;
    const body = (await response.json()) as { tag_name?: string };
    return body.tag_name?.replace(/^v/i, "") ?? null;
  } catch {
    return null;
  }
}
