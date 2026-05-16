"""Find where coords 193, 197 appear in position.pcapng."""
import struct, subprocess, sys

TSHARK = "C:/Program Files/Wireshark/tshark.exe"
PCAP = "C:/Users/adson/dev/wireshark/position.pcapng"

# Known coords: x=193, y=197
X, Y = 193, 197

# Reassemble both directions
def stream_bytes(direction_filter):
    out = subprocess.run(
        [TSHARK, "-r", PCAP, "-Y", f"tcp.len > 0 and ({direction_filter})",
         "-T", "fields", "-e", "tcp.stream", "-e", "tcp.seq", "-e", "tcp.payload"],
        capture_output=True, text=True, check=True
    )
    streams = {}
    for line in out.stdout.splitlines():
        parts = line.strip().split("\t")
        if len(parts) != 3: continue
        sid, seq = int(parts[0]), int(parts[1])
        payload = bytes.fromhex(parts[2].replace(":", "").replace(" ", ""))
        streams.setdefault(sid, []).append((seq, payload))
    result = {}
    for sid, pkts in streams.items():
        pkts.sort()
        result[sid] = b"".join(p for _, p in pkts)
    return result

s2c = stream_bytes("tcp.srcport == 22008")
c2s = stream_bytes("tcp.dstport == 22008")

print(f"server-to-client streams: {[(sid, len(b)) for sid, b in s2c.items()]}")
print(f"client-to-server streams: {[(sid, len(b)) for sid, b in c2s.items()]}")

# Search both for the byte patterns
patterns = [
    (f"x={X} as u16 LE then y={Y} as u16 LE",     bytes([X, 0, Y, 0])),
    (f"y={Y} as u16 LE then x={X} as u16 LE",     bytes([Y, 0, X, 0])),
    (f"x={X} byte then y={Y} byte",                bytes([X, Y])),
    (f"y={Y} byte then x={X} byte",                bytes([Y, X])),
    (f"x={X} as u16 BE then y={Y} as u16 BE",     bytes([0, X, 0, Y])),
]

print("\n=== Pattern hunt across all streams ===")
for label, pat in patterns:
    found = []
    for sid, buf in s2c.items():
        idx = 0
        while True:
            p = buf.find(pat, idx)
            if p < 0: break
            found.append(("s2c", sid, p))
            idx = p + 1
    for sid, buf in c2s.items():
        idx = 0
        while True:
            p = buf.find(pat, idx)
            if p < 0: break
            found.append(("c2s", sid, p))
            idx = p + 1
    if found:
        print(f"\n  '{label}': {len(found)} hits")
        for direction, sid, offset in found[:8]:
            # Find the opcode that contains this offset
            buf = s2c[sid] if direction == "s2c" else c2s[sid]
            # Walk packets in stream to find which one this offset is in
            i = 0
            while i < len(buf) - 4:
                opcode = struct.unpack_from("<H", buf, i)[0]
                length = struct.unpack_from("<H", buf, i+2)[0]
                if length < 4 or length > 4000:
                    i += 1; continue
                if i <= offset < i + length:
                    print(f"    {direction} stream {sid}  buf_off=0x{offset:04X}  inside opcode=0x{opcode:04X} at 0x{i:04X} (pkt len {length})")
                    # Show the bytes around the hit
                    rel = offset - i
                    print(f"      packet bytes (around match): ...{buf[max(i, offset-4):offset].hex(' ')} [{pat.hex(' ')}] {buf[offset+len(pat):offset+len(pat)+4].hex(' ')}...")
                    break
                i += length
    else:
        print(f"  '{label}': 0 hits")
