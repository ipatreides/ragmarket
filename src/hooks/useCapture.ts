import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { extract0836Packets, ShopRecord } from "../services/parser";

export type NetworkInterface = {
  index: number;
  name: string;
  ipv4: string;
  is_loopback: boolean;
};

export type CaptureStatus = "idle" | "recording" | "stopped";

export type PacketEvent = {
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  payload_hex: string;
};

export type CaptureStats = {
  packets_seen: number;
  matched: number;
};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function streamKey(p: PacketEvent): string {
  // The "stream" we care about is the server-to-client direction on a given 4-tuple.
  return `${p.src_ip}:${p.src_port}->${p.dst_ip}:${p.dst_port}`;
}

export function useCapture() {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [stats, setStats] = useState<CaptureStats>({ packets_seen: 0, matched: 0 });
  const [records, setRecords] = useState<ShopRecord[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Per-stream byte buffers (re-assembled in order of arrival).
  // Out-of-order TCP segments would still bite us, but on a healthy
  // local network they're rare for a single connection.
  const streams = useRef<Map<string, Uint8Array>>(new Map());

  const refreshInterfaces = useCallback(async () => {
    try {
      const ifs = (await invoke("list_interfaces")) as NetworkInterface[];
      setInterfaces(ifs);
      // Default to the first non-loopback interface that has an IP.
      const def = ifs.find((i) => !i.is_loopback);
      if (def) setSelectedIp(def.ipv4);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refreshInterfaces();
  }, [refreshInterfaces]);

  // Listen for backend events whenever we're recording.
  useEffect(() => {
    if (status !== "recording") return;
    let unlistens: UnlistenFn[] = [];
    let active = true;

    const setup = async () => {
      console.log("[useCapture] setting up listeners");
      let totalPacketEvents = 0;
      let totalPagesFound = 0;
      const u1 = await listen<PacketEvent>("packet-bytes", (e) => {
        if (!active) return;
        totalPacketEvents += 1;
        if (totalPacketEvents <= 5 || totalPacketEvents % 20 === 0) {
          console.log(
            `[useCapture] packet-bytes #${totalPacketEvents}:`,
            e.payload,
          );
        }
        const key = streamKey(e.payload);
        const prev = streams.current.get(key) ?? new Uint8Array();
        const merged = concat(prev, hexToBytes(e.payload.payload_hex));
        const { pages, tail } = extract0836Packets(merged);
        streams.current.set(key, tail);
        if (pages.length > 0) {
          totalPagesFound += pages.length;
          console.log(
            `[useCapture] decoded ${pages.length} page(s) from stream ${key} (total pages so far: ${totalPagesFound})`,
            pages.map((p) => ({
              page: p.page,
              moreResults: p.moreResults,
              records: p.records.length,
            })),
          );
          setRecords((rs) => rs.concat(pages.flatMap((p) => p.records)));
          setPageCount((c) => c + pages.length);
        }
      });
      const u2 = await listen<CaptureStats>("capture-stats", (e) => {
        if (!active) return;
        setStats(e.payload);
      });
      const u3 = await listen<string>("capture-error", (e) => {
        if (!active) return;
        console.error("[useCapture] capture-error:", e.payload);
        setError(String(e.payload));
      });
      const u4 = await listen("capture-stopped", () => {
        if (!active) return;
        console.log("[useCapture] capture-stopped");
        setStatus((s) => (s === "recording" ? "stopped" : s));
      });
      console.log("[useCapture] listeners registered");
      if (active) {
        unlistens.push(u1, u2, u3, u4);
      } else {
        [u1, u2, u3, u4].forEach((u) => u());
      }
    };
    setup();

    return () => {
      active = false;
      unlistens.forEach((u) => u());
    };
  }, [status]);

  const start = useCallback(async () => {
    if (!selectedIp) {
      setError("No interface selected");
      return;
    }
    setRecords([]);
    setPageCount(0);
    setStats({ packets_seen: 0, matched: 0 });
    streams.current.clear();
    setError(null);
    try {
      await invoke("start_capture", { ipv4: selectedIp });
      setStatus("recording");
    } catch (e) {
      setError(String(e));
    }
  }, [selectedIp]);

  const stop = useCallback(async () => {
    try {
      await invoke("stop_capture");
    } catch (e) {
      setError(String(e));
    }
    setStatus("stopped");
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setRecords([]);
    setPageCount(0);
    streams.current.clear();
    setError(null);
  }, []);

  /** Wipe captured records without changing recording state. */
  const clearRecords = useCallback(() => {
    setRecords([]);
    setPageCount(0);
    streams.current.clear();
  }, []);

  return {
    interfaces,
    selectedIp,
    setSelectedIp,
    status,
    stats,
    records,
    pageCount,
    error,
    start,
    stop,
    reset,
    clearRecords,
    refreshInterfaces,
  };
}
