import { describe, expect, it } from "vitest";
import { decodePage, decodeRecord, extract0836Packets } from "./parser";

// Build a synthetic 0x0836 packet with a single record where every interesting
// field has a distinct value, so the test pins down the exact byte layout we
// reverse-engineered from the captures.

function buildRecord(opts: {
  leadingByte: number;
  shopID: number;
  accountID: number;
  shopName: string;
  itemID: number;
  itemSubtype: number;
  price: number;
  amount: number;
  refine: number;
  cards: [number, number, number, number];
  options: Array<{ idx: number; val: number; param?: number }>;
}): Uint8Array {
  const rec = new Uint8Array(141);
  const dv = new DataView(rec.buffer);
  rec[0] = opts.leadingByte;
  dv.setUint32(1, opts.shopID, true);
  dv.setUint32(5, opts.accountID, true);
  // shopName: latin-1, space+null padded into bytes 9-88 (80 bytes)
  for (let i = 0; i < opts.shopName.length; i++) {
    rec[9 + i] = opts.shopName.charCodeAt(i) & 0xff;
  }
  dv.setUint32(89, opts.itemID, true);
  rec[93] = opts.itemSubtype;
  dv.setUint32(94, opts.price, true);
  rec[98] = opts.amount;
  rec[100] = opts.refine;
  dv.setUint32(101, opts.cards[0], true);
  dv.setUint32(105, opts.cards[1], true);
  dv.setUint32(109, opts.cards[2], true);
  dv.setUint32(113, opts.cards[3], true);
  opts.options.slice(0, 4).forEach((o, k) => {
    const off = 117 + k * 5;
    dv.setUint16(off, o.idx, true);
    dv.setUint16(off + 2, o.val, true);
    dv.setInt8(off + 4, o.param ?? 0);
  });
  return rec;
}

function buildPacket(records: Uint8Array[]): Uint8Array {
  // header(6) + records*141 + tail(1)
  const totalLen = 6 + records.length * 141 + 1;
  const pkt = new Uint8Array(totalLen);
  const dv = new DataView(pkt.buffer);
  dv.setUint16(0, 0x0836, true); // opcode
  dv.setUint16(2, totalLen, true); // length (incl. tail)
  pkt[4] = 0; // more_results = false
  pkt[5] = 1; // page = 1
  let off = 6;
  for (const r of records) {
    pkt.set(r, off);
    off += 141;
  }
  pkt[totalLen - 1] = 0x7e; // tail MAC, decoder ignores
  return pkt;
}

describe("decodeRecord", () => {
  it("decodes every field from a synthetic record matching our ground truth", () => {
    const rec = buildRecord({
      leadingByte: 0x09,
      shopID: 0x000c22fb,
      accountID: 0x00176c94,
      shopName: "S$ coisa boa PM",
      itemID: 22004,
      itemSubtype: 4,
      price: 200_000,
      amount: 1,
      refine: 7,
      cards: [4807, 0, 0, 0],
      options: [
        { idx: 16, val: 4 }, // ASPD +4%
        { idx: 9, val: 1 }, // HP max +1%
      ],
    });

    const decoded = decodeRecord(rec);
    expect(decoded.shopID).toBe(0x000c22fb);
    expect(decoded.accountID).toBe(0x00176c94);
    expect(decoded.shopName).toBe("S$ coisa boa PM");
    expect(decoded.itemID).toBe(22004);
    expect(decoded.itemSubtype).toBe(4);
    expect(decoded.price).toBe(200_000);
    expect(decoded.amount).toBe(1);
    expect(decoded.refine).toBe(7);
    expect(decoded.cards).toEqual([4807, 0, 0, 0]);
    expect(decoded.options).toHaveLength(2);
    expect(decoded.options[0].text).toBe("Velocidade de ataque +4%");
    expect(decoded.options[1].text).toBe("HP máx. +1%");
    expect(decoded.rawLeadingByte).toBe(0x09);
  });

  it("treats latin-1 bytes correctly (Portuguese accents)", () => {
    // "Promoção" — note ç=0xE7, ã=0xE3
    const name = "Promoç" + String.fromCharCode(0xe3) + "o";
    const rec = buildRecord({
      leadingByte: 0,
      shopID: 1,
      accountID: 1,
      shopName: name,
      itemID: 1,
      itemSubtype: 0,
      price: 0,
      amount: 0,
      refine: 0,
      cards: [0, 0, 0, 0],
      options: [],
    });
    // shopName bytes start at offset 9; check ç=0xE7 is preserved
    expect(rec[9 + 5]).toBe(0xe7);
    expect(rec[9 + 6]).toBe(0xe3);
    expect(decodeRecord(rec).shopName).toBe(name);
  });

  it("trims trailing spaces and stops at null in shopName", () => {
    const rec = buildRecord({
      leadingByte: 0,
      shopID: 1,
      accountID: 1,
      shopName: "ABC   ", // explicit trailing spaces
      itemID: 1,
      itemSubtype: 0,
      price: 0,
      amount: 0,
      refine: 0,
      cards: [0, 0, 0, 0],
      options: [],
    });
    expect(decodeRecord(rec).shopName).toBe("ABC");
  });

  it("emits empty options array when bytes 117-140 are all zero", () => {
    const rec = buildRecord({
      leadingByte: 0,
      shopID: 1,
      accountID: 1,
      shopName: "",
      itemID: 1,
      itemSubtype: 0,
      price: 0,
      amount: 0,
      refine: 0,
      cards: [0, 0, 0, 0],
      options: [],
    });
    expect(decodeRecord(rec).options).toEqual([]);
  });
});

describe("decodePage", () => {
  it("parses a single-record packet", () => {
    const rec = buildRecord({
      leadingByte: 0,
      shopID: 42,
      accountID: 1,
      shopName: "x",
      itemID: 22004,
      itemSubtype: 4,
      price: 100_000,
      amount: 1,
      refine: 0,
      cards: [0, 0, 0, 0],
      options: [],
    });
    const pkt = buildPacket([rec]);
    const page = decodePage(pkt);
    expect(page.moreResults).toBe(false);
    expect(page.page).toBe(1);
    expect(page.records).toHaveLength(1);
    expect(page.records[0].shopID).toBe(42);
  });

  it("parses 10 records in one packet", () => {
    const recs = Array.from({ length: 10 }, (_, i) =>
      buildRecord({
        leadingByte: i === 0 ? 0x09 : 0,
        shopID: 100 + i,
        accountID: 1,
        shopName: `Shop ${i}`,
        itemID: 22004,
        itemSubtype: 4,
        price: 100_000 * (i + 1),
        amount: 1,
        refine: 0,
        cards: [0, 0, 0, 0],
        options: [],
      }),
    );
    const page = decodePage(buildPacket(recs));
    expect(page.records).toHaveLength(10);
    expect(page.records[0].shopID).toBe(100);
    expect(page.records[9].price).toBe(1_000_000);
  });
});

describe("extract0836Packets", () => {
  it("finds packets surrounded by junk bytes", () => {
    const rec = buildRecord({
      leadingByte: 0,
      shopID: 7,
      accountID: 7,
      shopName: "",
      itemID: 7,
      itemSubtype: 0,
      price: 7,
      amount: 0,
      refine: 0,
      cards: [0, 0, 0, 0],
      options: [],
    });
    const pkt = buildPacket([rec]);
    const junk = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const buf = new Uint8Array(junk.length + pkt.length + 2);
    buf.set(junk, 0);
    buf.set(pkt, junk.length);
    buf[buf.length - 2] = 0xee;
    buf[buf.length - 1] = 0xff;
    const { pages, tail } = extract0836Packets(buf);
    expect(pages).toHaveLength(1);
    expect(pages[0].records).toHaveLength(1);
    expect(tail.length).toBeGreaterThanOrEqual(0);
  });

  it("returns the unconsumed tail when a packet is incomplete", () => {
    const rec = buildRecord({
      leadingByte: 0,
      shopID: 1,
      accountID: 1,
      shopName: "",
      itemID: 1,
      itemSubtype: 0,
      price: 0,
      amount: 0,
      refine: 0,
      cards: [0, 0, 0, 0],
      options: [],
    });
    const pkt = buildPacket([rec]);
    // truncate
    const partial = pkt.subarray(0, pkt.length - 10);
    const { pages, tail } = extract0836Packets(partial);
    expect(pages).toHaveLength(0);
    expect(tail.length).toBe(partial.length);
  });
});
