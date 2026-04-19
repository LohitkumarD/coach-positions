#!/usr/bin/env python3
"""Generate solid-color PWA PNG icons (stdlib only). Run from repo root: python scripts/gen_pwa_icons.py"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path


def _chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def solid_rgb_png(width: int, height: int, r: int, g: int, b: int) -> bytes:
    rows = []
    for _ in range(height):
        rows.append(bytes([0]) + bytes([r, g, b] * width))
    raw = b"".join(rows)
    compressed = zlib.compress(raw, 9)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", compressed) + _chunk(b"IEND", b"")


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out = root / "ops" / "static" / "ops"
    out.mkdir(parents=True, exist_ok=True)
    # Brand-ish rail blue on light grey background (#f3f6fb) — simple, readable on home screen.
    bg = (243, 246, 251)
    fg = (15, 76, 129)
    for name, w, h, rgb in (
        ("pwa-icon-192.png", 192, 192, fg),
        ("pwa-icon-512.png", 512, 512, fg),
        ("pwa-maskable-512.png", 512, 512, fg),
    ):
        (out / name).write_bytes(solid_rgb_png(w, h, *rgb))
    print("Wrote:", out / "pwa-icon-192.png", out / "pwa-icon-512.png", out / "pwa-maskable-512.png")


if __name__ == "__main__":
    main()
