// Decoder for latamRO Catálogo de Vendas search packets.
//
// Three opcodes are interesting:
//   0x0835  client -> server   search_store_request   (we don't need to decode)
//   0x0838  client -> server   next-page request      (we don't need to decode)
//   0x0836  server -> client   search_store_info      <-- decode this
//
// Record layout inside a 0x0836 packet (141 bytes each):
//   byte 0          : leading flag
//   bytes 1-4       : shopID (u32 LE)
//   bytes 5-8       : accountID (u32 LE)
//   bytes 9-88      : shopName (Z80, latin-1, space+null padded)
//   bytes 89-92     : itemID (u32 LE)
//   byte 93         : item subtype
//   bytes 94-97     : price (u32 LE)
//   byte 98         : amount
//   byte 99         : pad
//   byte 100        : refine
//   bytes 101-116   : 4 cards (u32 LE each)
//   bytes 117-140   : up to 4 random options (5 bytes each: u16 idx, u16 val, i8 param)

import { i8, u16le, u32le } from "../lib/bytes";
import { decodeOption, DecodedOption } from "./randomOptions";

export type ShopRecord = {
  shopID: number;
  accountID: number;
  shopName: string;
  itemID: number;
  itemSubtype: number;
  price: number;
  amount: number;
  refine: number;
  cards: number[];
  options: DecodedOption[];
  rawLeadingByte: number;
};

export type SearchPage = {
  moreResults: boolean;
  page: number;
  records: ShopRecord[];
};

const RECORD_SIZE = 141;

function latin1(bytes: Uint8Array): string {
  let zeroAt = bytes.indexOf(0);
  if (zeroAt < 0) zeroAt = bytes.length;
  let end = zeroAt;
  while (end > 0 && bytes[end - 1] === 0x20) end--;
  let s = "";
  for (let i = 0; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export function decodeRecord(rec: Uint8Array): ShopRecord {
  if (rec.length < RECORD_SIZE) {
    throw new Error(`record too short: ${rec.length} (need ${RECORD_SIZE})`);
  }
  const shopName = latin1(rec.subarray(9, 89));
  const cards = [
    u32le(rec, 101),
    u32le(rec, 105),
    u32le(rec, 109),
    u32le(rec, 113),
  ];
  const options: DecodedOption[] = [];
  for (let k = 0; k < 4; k++) {
    const off = 117 + k * 5;
    const idx = u16le(rec, off);
    const val = u16le(rec, off + 2);
    const param = i8(rec, off + 4);
    if (idx !== 0 || val !== 0) {
      options.push(decodeOption(idx, val, param));
    }
  }
  return {
    shopID: u32le(rec, 1),
    accountID: u32le(rec, 5),
    shopName,
    itemID: u32le(rec, 89),
    itemSubtype: rec[93],
    price: u32le(rec, 94),
    amount: rec[98],
    refine: rec[100],
    cards,
    options,
    rawLeadingByte: rec[0],
  };
}

export function decodePage(packet: Uint8Array): SearchPage {
  // packet starts with: u16 opcode (0x0836), u16 length, u8 moreResults, u8 page
  if (packet.length < 6) {
    throw new Error("packet too short for header");
  }
  const opcode = u16le(packet, 0);
  if (opcode !== 0x0836) {
    throw new Error(`unexpected opcode 0x${opcode.toString(16)}`);
  }
  const length = u16le(packet, 2);
  const moreResults = packet[4] !== 0;
  const page = packet[5];
  // body is bytes 6 .. length-1, the byte at length-1 is the trailing MAC
  const body = packet.subarray(6, length - 1);
  const records: ShopRecord[] = [];
  for (let i = 0; i + RECORD_SIZE <= body.length; i += RECORD_SIZE) {
    records.push(decodeRecord(body.subarray(i, i + RECORD_SIZE)));
  }
  return { moreResults, page, records };
}

/**
 * Walks a reassembled per-stream byte buffer and yields any 0x0836 packets it
 * finds. Caller owns the buffer; returns the unconsumed tail.
 */
export function extract0836Packets(
  buffer: Uint8Array,
): { pages: SearchPage[]; tail: Uint8Array } {
  const pages: SearchPage[] = [];
  let i = 0;
  while (i + 4 <= buffer.length) {
    const opcode = u16le(buffer, i);
    if (opcode === 0x0836) {
      const length = u16le(buffer, i + 2);
      if (length < 7 || length > 4000) {
        i += 1;
        continue;
      }
      if (i + length > buffer.length) break; // incomplete
      try {
        pages.push(decodePage(buffer.subarray(i, i + length)));
        i += length;
        continue;
      } catch {
        i += 1;
        continue;
      }
    }
    i += 1;
  }
  return { pages, tail: buffer.subarray(i) };
}
