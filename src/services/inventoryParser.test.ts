import { describe, expect, it } from "vitest";
import {
  extractAllPackets,
  InvType,
} from "./inventoryParser";

// Fixtures pin the byte layout. Any future layout tweak is a one-place
// change in inventoryParser.ts + matching builders below.

function buildHeader(opcode: number, totalLen: number, invType: number): Uint8Array {
  const h = new Uint8Array(5);
  const dv = new DataView(h.buffer);
  dv.setUint16(0, opcode, true);
  dv.setUint16(2, totalLen, true);
  h[4] = invType;
  return h;
}

function buildNormalRecord(opts: {
  index: number;
  itemID: number;
  type: number;
  count: number;
  wearState: number;
  cards: [number, number, number, number];
  hireExpire: number;
  flag: number;
}): Uint8Array {
  const rec = new Uint8Array(34);
  const dv = new DataView(rec.buffer);
  dv.setUint16(0, opts.index, true);
  dv.setUint32(2, opts.itemID, true);
  rec[6] = opts.type;
  dv.setInt16(7, opts.count, true);
  dv.setUint32(9, opts.wearState, true);
  dv.setUint32(13, opts.cards[0], true);
  dv.setUint32(17, opts.cards[1], true);
  dv.setUint32(21, opts.cards[2], true);
  dv.setUint32(25, opts.cards[3], true);
  dv.setInt32(29, opts.hireExpire, true);
  rec[33] = opts.flag;
  return rec;
}

function buildEquipRecord(opts: {
  index: number;
  itemID: number;
  type: number;
  location: number;
  wearState: number;
  refine: number;
  cards: [number, number, number, number];
  hireExpire: number;
  bindOnEquipType: number;
  spriteNumber: number;
  options: Array<{ idx: number; val: number; param?: number }>;
  grade?: number;
  withGrade: boolean;
}): Uint8Array {
  // latamRO record size: 67 (no grade) or 68 (with grade). NO trailing
  // Flag byte — confirmed against real captures.
  const size = opts.withGrade ? 68 : 67;
  const rec = new Uint8Array(size);
  const dv = new DataView(rec.buffer);
  dv.setUint16(0, opts.index, true);
  dv.setUint32(2, opts.itemID, true);
  rec[6] = opts.type;
  dv.setUint32(7, opts.location, true);
  dv.setUint32(11, opts.wearState, true);
  dv.setInt8(15, opts.refine);
  dv.setUint32(16, opts.cards[0], true);
  dv.setUint32(20, opts.cards[1], true);
  dv.setUint32(24, opts.cards[2], true);
  dv.setUint32(28, opts.cards[3], true);
  dv.setInt32(32, opts.hireExpire, true);
  dv.setUint32(36, opts.bindOnEquipType, true);
  dv.setUint16(40, opts.spriteNumber, true);
  // 5 option slots, 5 bytes each, starts at offset 42, ends at offset 66.
  for (let k = 0; k < 5; k++) {
    const o = opts.options[k];
    const off = 42 + k * 5;
    if (o) {
      dv.setUint16(off, o.idx, true);
      dv.setInt16(off + 2, o.val, true);
      dv.setInt8(off + 4, o.param ?? 0);
    }
  }
  if (opts.withGrade) {
    rec[67] = opts.grade ?? 0;
  }
  return rec;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe("extractAllPackets — inventory framing", () => {
  it("decodes a START / NORMAL items / END round-trip for INVENTORY", () => {
    const rec = buildNormalRecord({
      index: 100,
      itemID: 501, // Red Potion
      type: 0,
      count: 42,
      wearState: 0,
      cards: [0, 0, 0, 0],
      hireExpire: 0,
      flag: 0x01, // identified
    });
    const startPkt = concat([buildHeader(0x0b08, 5, InvType.Inventory)]);
    const itemsPkt = concat([
      buildHeader(0x0b09, 5 + 34, InvType.Inventory),
      rec,
    ]);
    // END is a fixed 4-byte packet: u16 op, u8 invType, u8 result. No length.
    const endPkt = new Uint8Array(4);
    new DataView(endPkt.buffer).setUint16(0, 0x0b0b, true);
    endPkt[2] = InvType.Inventory;
    endPkt[3] = 0;

    const { events, tail } = extractAllPackets(
      concat([startPkt, itemsPkt, endPkt]),
    );
    expect(tail.length).toBe(0);
    expect(events).toHaveLength(3);

    expect(events[0]).toEqual({ kind: "start", invType: InvType.Inventory });

    expect(events[1].kind).toBe("items");
    if (events[1].kind === "items") {
      expect(events[1].items).toHaveLength(1);
      const it = events[1].items[0];
      expect(it.itemID).toBe(501);
      expect(it.amount).toBe(42);
      expect(it.identified).toBe(true);
      expect(it.equipped).toBe(false);
      expect(it.isEquipKind).toBe(false);
      expect(it.cards).toEqual([0, 0, 0, 0]);
      expect(it.refine).toBe(0);
    }

    expect(events[2]).toEqual({ kind: "end", invType: InvType.Inventory });
  });

  it("decodes an EQUIP list with grade (0x0B39) including refine, cards, and 2 options", () => {
    const rec = buildEquipRecord({
      index: 200,
      itemID: 1101, // Sword
      type: 4, // weapon
      location: 0x02,
      wearState: 0x02,
      refine: 7,
      cards: [4807, 0, 0, 0],
      hireExpire: 0,
      bindOnEquipType: 0,
      spriteNumber: 0,
      options: [
        { idx: 16, val: 4 }, // ASPD +4%
        { idx: 25, val: 30 },
      ],
      grade: 0,
      withGrade: true,
    });
    const startPkt = buildHeader(0x0b08, 5, InvType.KafraStorage);
    const itemsPkt = concat([
      buildHeader(0x0b39, 5 + 68, InvType.KafraStorage),
      rec,
    ]);

    const { events, tail } = extractAllPackets(concat([startPkt, itemsPkt]));
    expect(tail.length).toBe(0);
    expect(events).toHaveLength(2);
    if (events[1].kind === "items") {
      const it = events[1].items[0];
      expect(it.itemID).toBe(1101);
      expect(it.refine).toBe(7);
      expect(it.cards[0]).toBe(4807);
      expect(it.options).toHaveLength(2);
      expect(it.options[0].index).toBe(16);
      expect(it.options[0].value).toBe(4);
      expect(it.options[1].index).toBe(25);
      expect(it.options[1].value).toBe(30);
      expect(it.source).toBe(InvType.KafraStorage);
      expect(it.equipped).toBe(true);
      expect(it.isEquipKind).toBe(true);
      // latamRO records have no trailing Flag byte — decoder defaults to true
      expect(it.identified).toBe(true);
    } else {
      throw new Error("expected items event");
    }
  });

  it("decodes an EQUIP list without grade (0x0B0A) at the 67-byte size", () => {
    const rec = buildEquipRecord({
      index: 300,
      itemID: 2102, // Buckler
      type: 5,
      location: 0x20,
      wearState: 0,
      refine: 0,
      cards: [0, 0, 0, 0],
      hireExpire: 0,
      bindOnEquipType: 0,
      spriteNumber: 0,
      options: [],
      withGrade: false,
    });
    // Walker requires a prior START for items to be accepted — gate against
    // spurious matches. Prepend the matching START packet.
    const startPkt = buildHeader(0x0b08, 5, InvType.ClanStorage);
    const itemsPkt = concat([
      buildHeader(0x0b0a, 5 + 67, InvType.ClanStorage),
      rec,
    ]);
    const { events, tail } = extractAllPackets(concat([startPkt, itemsPkt]));
    expect(tail.length).toBe(0);
    expect(events).toHaveLength(2);
    if (events[1].kind === "items") {
      expect(events[1].items[0].itemID).toBe(2102);
      expect(events[1].items[0].source).toBe(InvType.ClanStorage);
    } else {
      throw new Error("expected items event");
    }
  });

  it("returns an incomplete trailing packet as tail without crashing", () => {
    // First a valid START, then half of an items packet header.
    const full = buildHeader(0x0b08, 5, InvType.Cart);
    const truncated = new Uint8Array(3);
    new DataView(truncated.buffer).setUint16(0, 0x0b09, true);
    truncated[2] = 0x10; // partial length field

    const { events, tail } = extractAllPackets(concat([full, truncated]));
    expect(events).toHaveLength(1);
    expect(tail.length).toBeGreaterThan(0);
  });

  it("multiple records in one items packet decode in order", () => {
    const r1 = buildNormalRecord({
      index: 1,
      itemID: 501,
      type: 0,
      count: 10,
      wearState: 0,
      cards: [0, 0, 0, 0],
      hireExpire: 0,
      flag: 1,
    });
    const r2 = buildNormalRecord({
      index: 2,
      itemID: 503, // White Potion
      type: 0,
      count: 5,
      wearState: 0,
      cards: [0, 0, 0, 0],
      hireExpire: 0,
      flag: 1,
    });
    const startPkt = buildHeader(0x0b08, 5, InvType.Inventory);
    const pkt = concat([
      startPkt,
      buildHeader(0x0b09, 5 + 34 * 2, InvType.Inventory),
      r1,
      r2,
    ]);
    const { events } = extractAllPackets(pkt);
    const itemsEvent = events.find((e) => e.kind === "items");
    if (itemsEvent && itemsEvent.kind === "items") {
      expect(itemsEvent.items.map((i) => i.itemID)).toEqual([501, 503]);
      expect(itemsEvent.items.map((i) => i.amount)).toEqual([10, 5]);
    } else {
      throw new Error("expected items event");
    }
  });
});
