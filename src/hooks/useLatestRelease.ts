// Compares GitHub's latest release tag against the running version;
// remembers dismissals per-tag in localStorage so the banner only
// reappears when something even newer ships.

import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { fetchLatestRelease, isNewer, type ReleaseInfo } from "../lib/updates";

const DISMISSED_KEY = "ragmarket.dismissedUpdateVersion";

function getDismissedUpdateVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function setDismissedUpdateVersion(v: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, v);
  } catch {
    // localStorage can be disabled in private browsing contexts; if so,
    // the user will just see the banner again next launch — acceptable.
  }
}

export type UpdateState = {
  available: ReleaseInfo | null;
  dismiss: () => void;
};

export function useLatestRelease(): UpdateState {
  const [available, setAvailable] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [current, latest] = await Promise.all([
        getVersion(),
        fetchLatestRelease(),
      ]);
      const dismissed = getDismissedUpdateVersion();
      if (cancelled || !latest) return;
      if (!isNewer(latest.tagName, current)) return;
      if (dismissed && !isNewer(latest.tagName, dismissed)) return;
      setAvailable(latest);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    setAvailable((cur) => {
      if (cur) setDismissedUpdateVersion(cur.tagName);
      return null;
    });
  }, []);

  return { available, dismiss };
}
