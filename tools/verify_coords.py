"""
Phase 0 helper — check whether bytes 110-116 of each 0x0836 record encode the
shop's (x, y) coordinates on its map.

Usage:
    python verify_coords.py <pcapng_path>

The script parses every 0x0836 search_store_info page from the capture,
extracts the 7 mystery bytes (offsets 110-116) for each record, and prints them
in several plausible decodings so you can manually correlate with the in-game
screenshot of vendor positions.

For each record we print:
  shopName, accountID
  bytes 110-116 raw
  candidate1: (u16 LE at 110, u16 LE at 112)    -- 4 bytes total
  candidate2: (u16 LE at 111, u16 LE at 113)    -- shifted by 1
  candidate3: (byte 110, byte 111)              -- single-byte x/y
  candidate4: bit-packed (RO coord encoding)    -- 3 bytes giving x10/y10/dir

If exactly one candidate's (x, y) consistently matches a known vendor's actual
in-game position across 3+ rows, that's our layout. Update the parser
accordingly.
"""
import struct
import subprocess
import sys
from pathlib import Path

TSHARK = "C:/Program Files/Wireshark/tshark.exe"


def extract_records(pcapng: Path) -> list[bytes]:
    """Return raw 141-byte records from every 0x0836 packet in the capture."""
    out = subprocess.run(
        [TSHARK, "-r", str(pcapng), "-Y", "tcp.len > 0",
         "-T", "fields", "-e", "tcp.stream", "-e", "tcp.seq", "-e", "tcp.payload"],
        capture_output=True, text=True, check=True,
    )
    streams: dict[int, list[tuple[int, bytes]]] = {}
    for line in out.stdout.splitlines():
        parts = line.strip().split("\t")
        if len(parts) != 3:
            continue
        sid = int(parts[0])
        seq = int(parts[1])
        data = bytes.fromhex(parts[2].replace(":", "").replace(" ", ""))
        streams.setdefault(sid, []).append((seq, data))

    records: list[bytes] = []
    for sid, pkts in streams.items():
        pkts.sort()
        stream = b"".join(p for _, p in pkts)
        i = 0
        while i < len(stream) - 4:
            if struct.unpack_from("<H", stream, i)[0] == 0x0836:
                length = struct.unpack_from("<H", stream, i + 2)[0]
                if i + length <= len(stream):
                    body = stream[i + 6 : i + length - 1]
                    n = len(body) // 141
                    for r in range(n):
                        records.append(body[r * 141 : (r + 1) * 141])
                    i += length
                    continue
            i += 1
    return records


def decode_record(rec: bytes) -> dict:
    name = rec[9:89].split(b"\x00", 1)[0].rstrip(b" ").decode("latin-1", errors="replace")
    return {
        "shopID": struct.unpack_from("<I", rec, 1)[0],
        "accountID": struct.unpack_from("<I", rec, 5)[0],
        "shopName": name,
        "itemID": struct.unpack_from("<I", rec, 89)[0],
        "refine": rec[100],
        "mystery": rec[110:117],
    }


def coord_candidates(mystery: bytes) -> list[tuple[str, tuple[int, int] | str]]:
    """Generate candidate (x, y) interpretations of the 7 mystery bytes."""
    assert len(mystery) == 7
    out: list[tuple[str, tuple[int, int] | str]] = []

    # candidate 1: u16 LE x, u16 LE y at offsets 0..3 (bytes 110-113)
    x1, y1 = struct.unpack_from("<HH", mystery, 0)
    out.append(("u16 LE @ 110/112", (x1, y1)))

    # candidate 2: u16 LE shifted by 1 (bytes 111-114)
    x2, y2 = struct.unpack_from("<HH", mystery, 1)
    out.append(("u16 LE @ 111/113", (x2, y2)))

    # candidate 3: u16 LE x, u16 LE y at bytes 113-116
    x3, y3 = struct.unpack_from("<HH", mystery, 3)
    out.append(("u16 LE @ 113/115", (x3, y3)))

    # candidate 4: single bytes
    out.append(("byte 110, byte 111", (mystery[0], mystery[1])))
    out.append(("byte 113, byte 114", (mystery[3], mystery[4])))

    # candidate 5: RO bit-packed coords (3 bytes -> 10b x + 10b y + 4b dir)
    for start in (0, 1, 2, 3, 4):
        b = mystery[start : start + 3]
        if len(b) == 3:
            x = (b[0] << 2) | (b[1] >> 6)
            y = ((b[1] & 0x3F) << 4) | (b[2] >> 4)
            out.append((f"RO 3-byte packed @ {110 + start}", (x, y)))

    return out


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: python verify_coords.py <pcapng>", file=sys.stderr)
        sys.exit(2)

    pcap = Path(sys.argv[1])
    if not pcap.exists():
        print(f"file not found: {pcap}", file=sys.stderr)
        sys.exit(1)

    records = extract_records(pcap)
    print(f"Loaded {len(records)} records from {pcap.name}\n")

    for i, rec in enumerate(records, 1):
        d = decode_record(rec)
        mystery_hex = " ".join(f"{b:02x}" for b in d["mystery"])
        print(f"#{i:>3}  shop='{d['shopName']}'  acct=0x{d['accountID']:08X}  "
              f"item={d['itemID']}  +{d['refine']}")
        print(f"       mystery (b110-116): {mystery_hex}")
        for label, value in coord_candidates(d["mystery"]):
            if isinstance(value, tuple):
                x, y = value
                # filter implausible coords: most RO maps are <= 400x400
                if 0 < x < 500 and 0 < y < 500:
                    flag = " <-- plausible"
                else:
                    flag = ""
                print(f"         {label:30s}: ({x:>5}, {y:>5}){flag}")
            else:
                print(f"         {label:30s}: {value}")
        print()


if __name__ == "__main__":
    main()
