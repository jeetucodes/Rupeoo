#!/usr/bin/env python3
"""
scripts/check-images.py
Scans assets/ for image files and verifies magic bytes match the file extension.
Exits with code 1 if any file is invalid.
Usage: python scripts/check-images.py
"""

import os
import sys

# Magic byte signatures for each format
MAGIC_BYTES = {
    ".png":  (b"\x89PNG",          "PNG"),
    ".jpg":  (b"\xff\xd8\xff",     "JPEG"),
    ".jpeg": (b"\xff\xd8\xff",     "JPEG"),
    ".webp": (b"RIFF",             "WebP"),  # also needs bytes[8:12] == b"WEBP"
    ".gif":  (b"GIF8",             "GIF"),
}

def check_magic(path: str) -> tuple[bool, str]:
    """Returns (is_valid, message)."""
    ext = os.path.splitext(path)[1].lower()
    if ext not in MAGIC_BYTES:
        return True, "skipped (not an image extension)"

    try:
        with open(path, "rb") as f:
            header = f.read(16)
    except OSError as e:
        return False, f"could not read: {e}"

    if len(header) == 0:
        return False, "file is empty (0 bytes)"

    magic, fmt_name = MAGIC_BYTES[ext]
    if not header.startswith(magic):
        # Try to detect the real format
        real = "unknown"
        if header.startswith(b"\x89PNG"):      real = "PNG"
        elif header.startswith(b"\xff\xd8"):   real = "JPEG"
        elif header.startswith(b"RIFF"):       real = "RIFF/WebP"
        elif header.startswith(b"GIF8"):       real = "GIF"
        elif header.startswith(b"<svg"):       real = "SVG"
        elif header.startswith(b"PK\x03"):     real = "ZIP"
        return False, f"extension says {fmt_name} but magic bytes say {real!r}"

    # Extra WebP check: bytes 8-12 must be b"WEBP"
    if ext == ".webp" and header[8:12] != b"WEBP":
        return False, "RIFF header found but 'WEBP' marker missing — likely not a WebP"

    return True, "OK"


def main():
    assets_root = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
    if not os.path.isdir(assets_root):
        print(f"ERROR: assets directory not found at {assets_root}", file=sys.stderr)
        sys.exit(1)

    failures = []
    checked = 0

    for dirpath, _dirs, filenames in os.walk(assets_root):
        for filename in sorted(filenames):
            ext = os.path.splitext(filename)[1].lower()
            if ext not in MAGIC_BYTES:
                continue
            path = os.path.join(dirpath, filename)
            checked += 1
            valid, msg = check_magic(path)
            rel = os.path.relpath(path, start=os.path.dirname(assets_root))
            if valid:
                print(f"  OK  {rel}")
            else:
                print(f"  FAIL {rel}  ->  {msg}")
                failures.append((rel, msg))

    print()
    print(f"Checked {checked} image file(s). {len(failures)} failure(s).")

    if failures:
        print("\nFailed files:")
        for rel, msg in failures:
            print(f"  [FAIL] {rel}: {msg}")
        sys.exit(1)
    else:
        print("All images are valid. [OK]")
        sys.exit(0)


if __name__ == "__main__":
    main()
