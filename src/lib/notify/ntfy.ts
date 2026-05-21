// ntfy.sh push notification helper.
//
// ntfy is a single-HTTP-POST pub/sub: anyone subscribed to a topic on
// the official ntfy mobile app receives the messages we publish. No
// auth, no API key — the topic name itself is the secret.
//
// We publish via the JSON API rather than the simpler "POST to
// /<topic> with body" form because (1) ntfy's binary-detection
// heuristic treats raw multi-byte UTF-8 bodies (em-dash, accents,
// emoji) as file attachments, defeating inline pt-BR notifications,
// and (2) the JSON title field avoids the Latin-1-only HTTP-header
// path entirely.

const NTFY_BASE = "https://ntfy.sh";

export type NtfyPriority = "default" | "high" | "max";

export type NtfyMessage = {
  title: string;
  body: string;
  priority?: NtfyPriority;
  tags?: string[];
};

const PRIORITY_VALUE: Record<NtfyPriority, number> = {
  default: 3,
  high: 4,
  max: 5,
};

export async function sendNtfyPush(
  topic: string,
  msg: NtfyMessage,
): Promise<boolean> {
  const t = topic.trim();
  if (!t) return false;
  try {
    const body = JSON.stringify({
      topic: t,
      title: msg.title,
      message: msg.body,
      priority: PRIORITY_VALUE[msg.priority ?? "default"],
      tags: msg.tags ?? [],
    });
    const res = await fetch(`${NTFY_BASE}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // Cap each send at 8s so the "Testar" button can't hang on a
      // stuck ntfy.sh, and the scheduler path doesn't leak pending
      // Promises if the service is unreachable.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(
        `[ntfy] push to topic "${t}" failed:`,
        res.status,
        await res.text().catch(() => ""),
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[ntfy] push to topic "${topic}" threw:`, e);
    return false;
  }
}
