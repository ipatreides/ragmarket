// Native Windows toast notifications via tauri-plugin-notification.
//
// Symmetric to ntfy.ts: a single sendWindowsNotification(title, body)
// that resolves to true on success and false on permission denial or
// failure.

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

// The plugin reports permission per-webview, so the answer may still
// be "ungranted" right after the user clicked Permitir in a different
// dialog. Once we observe a granted state, skip re-asking on each send.
let permissionCache: boolean | null = null;

async function resolvePermission(): Promise<boolean> {
  if (permissionCache === true) return true;
  let granted = await isPermissionGranted();
  if (!granted) {
    const r = await requestPermission();
    granted = r === "granted";
  }
  permissionCache = granted;
  return granted;
}

export async function sendWindowsNotification(
  title: string,
  body: string,
): Promise<boolean> {
  try {
    if (!(await resolvePermission())) {
      console.warn("[win-notify] permission not granted, skipping", { title });
      return false;
    }
    await sendNotification({ title, body });
    if (import.meta.env.DEV) console.info("[win-notify] sent", { title });
    return true;
  } catch (e) {
    // Wipe the cache on failure so the next send re-probes — the
    // permission may have been revoked in Windows Settings while the
    // app was running.
    permissionCache = null;
    console.warn("[win-notify] threw:", e, { title });
    return false;
  }
}

export async function ensureWinPermission(): Promise<boolean> {
  try {
    return await resolvePermission();
  } catch (e) {
    console.warn("[win-notify] permission check threw:", e);
    return false;
  }
}
