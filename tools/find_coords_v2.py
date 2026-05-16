"""Find which RO packet contains coords 193,197 in position.pcapng."""
import struct, subprocess

TSHARK = "C:/Program Files/Wireshark/tshark.exe"
PCAP = "C:/Users/adson/dev/wireshark/position.pcapng"
PAT = bytes([193, 0, 197, 0])  # x=193 u16 LE, y=197 u16 LE

# Dump per-packet payloads with frame numbers and direction
result = subprocess.run(
    [TSHARK, "-r", PCAP, "-Y", "tcp.len > 0",
     "-T", "fields", "-e", "frame.number", "-e", "ip.src", "-e", "tcp.srcport",
     "-e", "ip.dst", "-e", "tcp.dstport", "-e", "tcp.payload"],
    capture_output=True, text=True, check=True
)

# Identify the server side (port 22008)
SERVER_PORT = 22008

# Group consecutive same-direction packets into one logical RO message stream
# Actually simpler: print every packet that contains the pattern
print("=== Per-packet hits for bytes c1 00 c5 00 ===\n")
for line in result.stdout.splitlines():
    parts = line.strip().split("\t")
    if len(parts) < 6: continue
    frame, src, sport, dst, dport, payload_hex = parts
    payload = bytes.fromhex(payload_hex.replace(":", "").replace(" ", ""))
    if PAT in payload:
        direction = "s2c" if int(sport) == SERVER_PORT else "c2s"
        offset = payload.find(PAT)
        opcode = struct.unpack_from("<H", payload, 0)[0] if len(payload) >= 2 else 0
        print(f"frame {frame:>4}  {direction}  len={len(payload):>4}  "
              f"first opcode=0x{opcode:04X}  pattern at offset {offset}")
        # Show context
        start = max(0, offset - 16)
        end = min(len(payload), offset + len(PAT) + 16)
        ctx_hex = ' '.join(f'{b:02x}' for b in payload[start:end])
        marker = '   ' * (offset - start) + '[' + ('-- ' * len(PAT))[:-1] + ']'
        print(f"         ...{ctx_hex}...")

# Also dump every client-to-server packet (likely small) to find what triggered the response
print("\n=== All client-to-server packets in this capture ===")
for line in result.stdout.splitlines():
    parts = line.strip().split("\t")
    if len(parts) < 6: continue
    frame, src, sport, dst, dport, payload_hex = parts
    if int(sport) == SERVER_PORT: continue
    payload = bytes.fromhex(payload_hex.replace(":", "").replace(" ", ""))
    if len(payload) < 2: continue
    opcode = struct.unpack_from("<H", payload, 0)[0]
    print(f"  frame {frame:>4}  c2s  len={len(payload):>3}  op=0x{opcode:04X}  data={payload.hex(' ')[:60]}")

# Get all unique server-to-client opcodes
print("\n=== Server-to-client opcodes (first 2 bytes of each TCP payload) ===")
opcodes_seen = {}
for line in result.stdout.splitlines():
    parts = line.strip().split("\t")
    if len(parts) < 6: continue
    frame, src, sport, dst, dport, payload_hex = parts
    if int(sport) != SERVER_PORT: continue
    payload = bytes.fromhex(payload_hex.replace(":", "").replace(" ", ""))
    if len(payload) < 2: continue
    opcode = struct.unpack_from("<H", payload, 0)[0]
    opcodes_seen.setdefault(opcode, []).append((int(frame), len(payload)))

for op, frames in sorted(opcodes_seen.items()):
    print(f"  opcode 0x{op:04X}  count={len(frames)}  sample frames={frames[:3]}")
