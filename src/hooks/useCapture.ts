import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { concat, hexToBytes } from "../lib/bytes";
import { ShopRecord } from "../services/parser";
import {
  ALL_INV_TYPES,
  extractAllPackets,
  InventoryItem,
  InvType,
  newWalkerState,
  WalkerState,
} from "../services/inventoryParser";

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

export type InventorySnapshots = Record<InvType, InventoryItem[]>;

function emptySnapshots(): InventorySnapshots {
  const r = {} as InventorySnapshots;
  for (const t of ALL_INV_TYPES) r[t] = [];
  return r;
}

function streamKey(p: PacketEvent): string {
  return `${p.src_ip}:${p.src_port}->${p.dst_ip}:${p.dst_port}`;
}

const FLUSH_INTERVAL_MS = 100;

// Server frames every container with a START / items+ / END sequence; we
// accumulate records into `builders[invType]` between START and END, then on
// END atomically replace that invType's snapshot in React state.
type StreamBuilders = Map<InvType, InventoryItem[]>;

export function useCapture() {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [stats, setStats] = useState<CaptureStats>({ packets_seen: 0, matched: 0 });
  const [records, setRecords] = useState<ShopRecord[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [inventory, setInventory] = useState<InventorySnapshots>(() =>
    emptySnapshots(),
  );
  const [error, setError] = useState<string | null>(null);

  const streams = useRef<Map<string, Uint8Array>>(new Map());
  const walkers = useRef<Map<string, WalkerState>>(new Map());
  const builders = useRef<Map<string, StreamBuilders>>(new Map());
  // Batched updates — flushed every FLUSH_INTERVAL_MS to keep React
  // re-renders bounded under heavy packet load.
  const pendingRecords = useRef<ShopRecord[]>([]);
  const pendingPages = useRef(0);
  const pendingInventory = useRef<Map<InvType, InventoryItem[]>>(new Map());
  const flushTimer = useRef<number | null>(null);

  const flushPending = useCallback(() => {
    flushTimer.current = null;
    const batch = pendingRecords.current;
    const pages = pendingPages.current;
    const invBatch = pendingInventory.current;
    if (batch.length === 0 && pages === 0 && invBatch.size === 0) return;
    pendingRecords.current = [];
    pendingPages.current = 0;
    pendingInventory.current = new Map();
    if (batch.length > 0) {
      setRecords((rs) => rs.concat(batch));
    }
    if (pages > 0) {
      setPageCount((c) => c + pages);
    }
    if (invBatch.size > 0) {
      setInventory((prev) => {
        const next = { ...prev };
        for (const [t, items] of invBatch) next[t] = items;
        return next;
      });
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current != null) return;
    flushTimer.current = window.setTimeout(flushPending, FLUSH_INTERVAL_MS);
  }, [flushPending]);

  const refreshInterfaces = useCallback(async () => {
    try {
      const ifs = (await invoke("list_interfaces")) as NetworkInterface[];
      setInterfaces(ifs);
      const def = ifs.find((i) => !i.is_loopback);
      if (def) setSelectedIp(def.ipv4);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refreshInterfaces();
  }, [refreshInterfaces]);

  useEffect(() => {
    if (status !== "recording") return;
    const aborted = { current: false };
    const unsubscribers: UnlistenFn[] = [];

    // Helper: subscribe, and if the effect already aborted between awaits,
    // immediately unsubscribe and stop registering more.
    async function subscribe<T>(
      event: string,
      handler: (e: { payload: T }) => void,
    ): Promise<boolean> {
      const u = await listen<T>(event, handler as never);
      if (aborted.current) {
        u();
        return false;
      }
      unsubscribers.push(u);
      return true;
    }

    (async () => {
      if (
        !(await subscribe<PacketEvent>("packet-bytes", (e) => {
          const key = streamKey(e.payload);
          const payload = hexToBytes(e.payload.payload_hex);
          const prev = streams.current.get(key) ?? new Uint8Array();
          const merged = concat(prev, payload);
          let walker = walkers.current.get(key);
          if (!walker) {
            walker = newWalkerState();
            walkers.current.set(key, walker);
          }
          const { events, tail } = extractAllPackets(merged, walker);
          streams.current.set(key, tail);
          if (events.length === 0) {
            scheduleFlush();
            return;
          }

          let streamBuilders = builders.current.get(key);
          for (const ev of events) {
            if (ev.kind === "search") {
              for (const r of ev.page.records) pendingRecords.current.push(r);
              pendingPages.current += 1;
              continue;
            }
            if (!streamBuilders) {
              streamBuilders = new Map();
              builders.current.set(key, streamBuilders);
            }
            if (ev.kind === "start") {
              streamBuilders.set(ev.invType, []);
            } else if (ev.kind === "items") {
              // If items arrive without a preceding START (e.g. we joined
              // the stream mid-dump), still accumulate so the user sees
              // what we can.
              const cur = streamBuilders.get(ev.invType) ?? [];
              for (const item of ev.items) cur.push(item);
              streamBuilders.set(ev.invType, cur);
            } else if (ev.kind === "end") {
              const built = streamBuilders.get(ev.invType);
              if (built !== undefined) {
                pendingInventory.current.set(ev.invType, built);
                streamBuilders.delete(ev.invType);
              }
            }
          }
          scheduleFlush();
        }))
      )
        return;
      if (
        !(await subscribe<CaptureStats>("capture-stats", (e) =>
          setStats(e.payload),
        ))
      )
        return;
      if (
        !(await subscribe<string>("capture-error", (e) => {
          console.error("[useCapture] capture-error:", e.payload);
          setError(String(e.payload));
        }))
      )
        return;
      await subscribe("capture-stopped", () =>
        setStatus((s) => (s === "recording" ? "stopped" : s)),
      );
    })();

    return () => {
      aborted.current = true;
      unsubscribers.forEach((u) => u());
      // Flush any pending records so the user sees them on stop.
      if (flushTimer.current != null) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      flushPending();
    };
  }, [status, scheduleFlush, flushPending]);

  const resetBuffers = useCallback(() => {
    streams.current.clear();
    walkers.current.clear();
    builders.current.clear();
    pendingRecords.current = [];
    pendingPages.current = 0;
    pendingInventory.current = new Map();
  }, []);

  const start = useCallback(async () => {
    if (!selectedIp) {
      setError("No interface selected");
      return;
    }
    setRecords([]);
    setPageCount(0);
    setInventory(emptySnapshots());
    setStats({ packets_seen: 0, matched: 0 });
    resetBuffers();
    setError(null);
    try {
      await invoke("start_capture", { ipv4: selectedIp });
      setStatus("recording");
    } catch (e) {
      setError(String(e));
    }
  }, [selectedIp, resetBuffers]);

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
    setInventory(emptySnapshots());
    resetBuffers();
    setError(null);
  }, [resetBuffers]);

  /** Wipe captured records without changing recording state. */
  const clearRecords = useCallback(() => {
    setRecords([]);
    setPageCount(0);
    setInventory(emptySnapshots());
    resetBuffers();
  }, [resetBuffers]);

  return {
    interfaces,
    selectedIp,
    setSelectedIp,
    status,
    stats,
    records,
    pageCount,
    inventory,
    error,
    start,
    stop,
    reset,
    clearRecords,
    refreshInterfaces,
  };
}
