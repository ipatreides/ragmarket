// Decoder for "container dump" packets — inventory, merchant cart, Kafra
// storage, and clan/guild storage. All four containers share the same five
// opcodes, distinguished by the 1-byte `invType` field set by ZC_INVENTORY_START.
//
//   0x0B08  ZC_INVENTORY_START                       u16 op, u16 len, u8 invType, name(Z*)
//   0x0B09  ZC_INVENTORY_ITEMLIST_NORMAL_V6          u16 op, u16 len, u8 invType, N × 34-byte records
//   0x0B0A  ZC_INVENTORY_ITEMLIST_EQUIP_V6 (pre-grade)
//   0x0B39  ZC_INVENTORY_ITEMLIST_EQUIP_V6 (with grade)
//   0x0B0B  ZC_INVENTORY_END                         4 bytes (u16 op, u8 invType, u8 result)
//
// Field offsets reverse-engineered from rAthena master, then trimmed against
// a real latamRO capture: equip records are 67 bytes (no trailing Flag byte).

import { i16le, i8, u16le, u32le } from "../lib/bytes";
import { SearchPage, decodePage as decodeSearchPage } from "./parser";
import { decodeOption, DecodedOption } from "./randomOptions";

export enum InvType {
  Inventory = 0,
  Cart = 1,
  KafraStorage = 2,
  ClanStorage = 3,
}

export const ALL_INV_TYPES: InvType[] = [
  InvType.Inventory,
  InvType.Cart,
  InvType.KafraStorage,
  InvType.ClanStorage,
];

export function invTypeLabel(t: InvType): string {
  switch (t) {
    case InvType.Inventory:
      return "Inventário";
    case InvType.Cart:
      return "Carrinho";
    case InvType.KafraStorage:
      return "Armazém Kafra";
    case InvType.ClanStorage:
      return "Clã";
  }
}

export type InventoryItem = {
  index: number;
  itemID: number;
  itemType: number;
  amount: number;
  refine: number;
  cards: number[];
  options: DecodedOption[];
  identified: boolean;
  equipped: boolean;
  isEquipKind: boolean;
  source: InvType;
};

export type InventoryEvent =
  | { kind: "start"; invType: InvType }
  | { kind: "items"; invType: InvType; items: InventoryItem[] }
  | { kind: "end"; invType: InvType };

export type CombinedEvent = { kind: "search"; page: SearchPage } | InventoryEvent;

// Even a huge inventory (~200 equip items) only hits ~13 KB. Anything beyond
// 16 KB is a spurious 2-byte match in random data; we skip-1 in that case
// instead of waiting "for more data" that never arrives in matching form.
const MAX_INV_PACKET_LEN = 16384;
// START packets are tiny — 5 byte header plus an optional NAME_LENGTH=24
// name. Beyond 64 is definitely spurious.
const MAX_START_PACKET_LEN = 64;

const NORMAL_RECORD_SIZE = 34;
// latamRO drops the trailing Flag byte: 0x0B0A is 67 bytes, 0x0B39 adds the
// `grade` byte for 68. Verified against a real capture (a 273-byte EQUIP
// packet holding exactly 4 records: (273 − 5) / 4 = 67).
const EQUIP_RECORD_SIZE_NO_GRADE = 67;
const EQUIP_RECORD_SIZE_WITH_GRADE = 68;

// NORMALITEM_INFO layout (34 bytes):
//   0   u16   index
//   2   u32   itemID
//   6   u8    type
//   7   i16   count
//   9   u32   wearState           (slot flags; 0 for stackable usables)
//   13  4×u32 cards (slot)
//   29  i32   hireExpireDate
//   33  u8    flag                (bit0=Identified)
function decodeNormalRecord(
  buf: Uint8Array,
  off: number,
  invType: InvType,
): InventoryItem {
  const flag = buf[off + 33];
  const wearState = u32le(buf, off + 9);
  return {
    index: u16le(buf, off + 0),
    itemID: u32le(buf, off + 2),
    itemType: buf[off + 6],
    amount: i16le(buf, off + 7),
    refine: 0,
    cards: [
      u32le(buf, off + 13),
      u32le(buf, off + 17),
      u32le(buf, off + 21),
      u32le(buf, off + 25),
    ],
    options: [],
    identified: (flag & 0x01) !== 0,
    equipped: wearState !== 0,
    isEquipKind: false,
    source: invType,
  };
}

// EQUIPITEM_INFO layout (67 bytes, 68 with grade):
//   0   u16   index
//   2   u32   itemID
//   6   u8    type
//   7   u32   location
//   11  u32   wearState
//   15  i8    refiningLevel
//   16  4×u32 cards
//   32  i32   hireExpireDate
//   36  u32   bindOnEquipType
//   40  u16   wItemSpriteNumber
//   42  5×{u16 idx, i16 val, i8 param}  random options
//   67  u8    grade               (only 0x0B39)
function decodeEquipRecord(
  buf: Uint8Array,
  off: number,
  invType: InvType,
): InventoryItem {
  const optionsBase = off + 42;
  const options: DecodedOption[] = [];
  for (let k = 0; k < 5; k++) {
    const o = optionsBase + k * 5;
    const idx = u16le(buf, o);
    const val = i16le(buf, o + 2);
    const param = i8(buf, o + 4);
    if (idx !== 0 || val !== 0) {
      options.push(decodeOption(idx, val, param));
    }
  }
  const wearState = u32le(buf, off + 11);
  return {
    index: u16le(buf, off + 0),
    itemID: u32le(buf, off + 2),
    itemType: buf[off + 6],
    amount: 1,
    refine: i8(buf, off + 15),
    cards: [
      u32le(buf, off + 16),
      u32le(buf, off + 20),
      u32le(buf, off + 24),
      u32le(buf, off + 28),
    ],
    options,
    identified: true,
    equipped: wearState !== 0,
    isEquipKind: true,
    source: invType,
  };
}

function isValidInvType(b: number): boolean {
  return b === 0 || b === 1 || b === 2 || b === 3;
}

function decodeNormalListPacket(packet: Uint8Array): InventoryEvent | null {
  if (packet.length < 5) return null;
  const length = u16le(packet, 2);
  if (length > packet.length) return null;
  if (!isValidInvType(packet[4])) return null;
  const invType = packet[4] as InvType;
  const body = packet.subarray(5, length);
  if (body.length % NORMAL_RECORD_SIZE !== 0) return null;
  const items: InventoryItem[] = [];
  for (let i = 0; i + NORMAL_RECORD_SIZE <= body.length; i += NORMAL_RECORD_SIZE) {
    items.push(decodeNormalRecord(body, i, invType));
  }
  // Spurious matches whose body bytes are mostly zero would decode
  // "successfully" with junk all-zero records; reject those.
  if (items.length > 0 && items.every((it) => it.itemID === 0)) return null;
  return { kind: "items", invType, items };
}

function decodeEquipListPacket(
  packet: Uint8Array,
  withGrade: boolean,
): InventoryEvent | null {
  if (packet.length < 5) return null;
  const length = u16le(packet, 2);
  if (length > packet.length) return null;
  if (!isValidInvType(packet[4])) return null;
  const invType = packet[4] as InvType;
  const body = packet.subarray(5, length);
  const recordSize = withGrade
    ? EQUIP_RECORD_SIZE_WITH_GRADE
    : EQUIP_RECORD_SIZE_NO_GRADE;
  if (body.length % recordSize !== 0) return null;
  const items: InventoryItem[] = [];
  for (let i = 0; i + recordSize <= body.length; i += recordSize) {
    items.push(decodeEquipRecord(body, i, invType));
  }
  if (items.length > 0 && items.every((it) => it.itemID === 0)) return null;
  return { kind: "items", invType, items };
}

function decodeStartPacket(packet: Uint8Array): InventoryEvent | null {
  if (packet.length < 5) return null;
  const length = u16le(packet, 2);
  if (length > packet.length || length < 5) return null;
  if (length > MAX_START_PACKET_LEN) return null;
  if (!isValidInvType(packet[4])) return null;
  const invType = packet[4] as InvType;
  return { kind: "start", invType };
}

function decodeEndPacket(packet: Uint8Array): InventoryEvent | null {
  if (packet.length < 4) return null;
  if (!isValidInvType(packet[2])) return null;
  const invType = packet[2] as InvType;
  return { kind: "end", invType };
}

// Tracks which invTypes are "open" (saw a START with no matching END yet).
// Without this gate, random `0a 0b` / `0b 0b` matches in another packet's
// body get accepted as real items/end and corrupt downstream parsing.
export type WalkerState = {
  openContainers: Set<InvType>;
};

export function newWalkerState(): WalkerState {
  return { openContainers: new Set() };
}

/**
 * Walks a per-stream reassembled byte buffer and yields every recognized
 * packet — search-store pages (0x0836) and inventory START / items / END
 * frames. Unrecognized bytes advance 1; the returned tail is whatever
 * couldn't be fully decoded yet.
 */
export function extractAllPackets(
  buffer: Uint8Array,
  state: WalkerState = newWalkerState(),
): { events: CombinedEvent[]; tail: Uint8Array } {
  const events: CombinedEvent[] = [];
  let i = 0;
  while (i + 4 <= buffer.length) {
    const opcode = u16le(buffer, i);
    const length = u16le(buffer, i + 2);

    if (opcode === 0x0836) {
      if (length < 7 || length > 4000) {
        i += 1;
        continue;
      }
      if (i + length > buffer.length) break;
      try {
        const page = decodeSearchPage(buffer.subarray(i, i + length));
        events.push({ kind: "search", page });
      } catch {
        i += 1;
        continue;
      }
      i += length;
      continue;
    }

    if (
      opcode === 0x0b08 ||
      opcode === 0x0b09 ||
      opcode === 0x0b0a ||
      opcode === 0x0b39
    ) {
      if (length < 5 || length > MAX_INV_PACKET_LEN) {
        i += 1;
        continue;
      }
      // Peek the invType byte BEFORE the length-fits check. A spurious
      // opcode match whose "length" field happens to be smaller than the
      // upper bound but bigger than the buffer would wedge the walker
      // (waiting for bytes that never arrive); rejecting on invType
      // first lets us recover immediately.
      if (i + 5 > buffer.length) break;
      if (!isValidInvType(buffer[i + 4])) {
        i += 1;
        continue;
      }
      if (i + length > buffer.length) break;
      const packet = buffer.subarray(i, i + length);
      let ev: InventoryEvent | null = null;
      if (opcode === 0x0b08) ev = decodeStartPacket(packet);
      else if (opcode === 0x0b09) ev = decodeNormalListPacket(packet);
      else if (opcode === 0x0b0a) ev = decodeEquipListPacket(packet, false);
      else if (opcode === 0x0b39) ev = decodeEquipListPacket(packet, true);
      if (ev) {
        // Items packets are only valid between a matching START and END.
        if (ev.kind === "items" && !state.openContainers.has(ev.invType)) {
          i += 1;
          continue;
        }
        if (ev.kind === "start") {
          state.openContainers.add(ev.invType);
        }
        events.push(ev);
        i += length;
        continue;
      }
      i += 1;
      continue;
    }

    if (opcode === 0x0b0b) {
      if (i + 4 > buffer.length) break;
      const packet = buffer.subarray(i, i + 4);
      const ev = decodeEndPacket(packet);
      if (ev && ev.kind === "end" && state.openContainers.has(ev.invType)) {
        state.openContainers.delete(ev.invType);
        events.push(ev);
        i += 4;
        continue;
      }
      i += 1;
      continue;
    }

    i += 1;
  }
  return { events, tail: buffer.subarray(i) };
}
