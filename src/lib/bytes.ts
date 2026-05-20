export function u16le(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8);
}

export function i16le(buf: Uint8Array, off: number): number {
  const v = u16le(buf, off);
  return v > 0x7fff ? v - 0x10000 : v;
}

export function u32le(buf: Uint8Array, off: number): number {
  return (
    buf[off] |
    (buf[off + 1] << 8) |
    (buf[off + 2] << 16) |
    (buf[off + 3] << 24)
  ) >>> 0;
}

export function i8(buf: Uint8Array, off: number): number {
  const v = buf[off];
  return v > 127 ? v - 256 : v;
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return out;
}

export function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
