import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionGranted = false;

/**
 * Deterministic string -> 32-bit int, used as the OS notification id so a
 * repeat notification for the same tab replaces the previous one instead of
 * stacking as a new, independently undismissed notification.
 */
export function hashTabId(tabId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < tabId.length; i++) {
    hash ^= tabId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash & 0x7fffffff;
}

/** Request notification permission and wire up click-to-focus. Call once on app mount. */
export async function initNotifications(onClick: (projectId: string, tabId: string) => void) {
  permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    permissionGranted = (await requestPermission()) === "granted";
  }
  await onAction((notification) => {
    const extra = notification.extra as { projectId?: string; tabId?: string } | undefined;
    if (!extra?.projectId || !extra?.tabId) return;
    const win = getCurrentWindow();
    void win.show();
    void win.setFocus();
    onClick(extra.projectId, extra.tabId);
  });
}

function notify(
  title: string,
  projectName: string,
  tabTitle: string,
  projectId: string,
  tabId: string,
) {
  if (!permissionGranted) return;
  sendNotification({
    id: hashTabId(tabId),
    title,
    body: `${projectName}: ${tabTitle}`,
    extra: { projectId, tabId },
  });
}

export function notifyAgentReady(
  projectName: string,
  tabTitle: string,
  projectId: string,
  tabId: string,
) {
  notify("Agent is ready", projectName, tabTitle, projectId, tabId);
}

export function notifyAgentWaiting(
  projectName: string,
  tabTitle: string,
  projectId: string,
  tabId: string,
) {
  notify("Agent needs input", projectName, tabTitle, projectId, tabId);
}
