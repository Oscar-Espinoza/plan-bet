"""Subset the variable fonts to the axes and glyphs the UI actually uses.

Archivo keeps wght 600–800 and wdth 75–118 (condensed, normal, 112, 118).
IBM Plex Sans keeps wght 400–700. DM Mono is already two static latin files
of about 15 KB each; glyph subsetting only saves about 1 KB, so it is left
as shipped by fontsource.

Source files are @fontsource-variable 5.3.0, the same bytes previously
copied into static/fonts. Requires fonttools and brotli:

    python3 -m venv /tmp/ft
    /tmp/ft/bin/pip install fonttools brotli
    /tmp/ft/bin/python scripts/subset-fonts.py
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "fonts"
UNICODES = ",".join(
    [
        "U+0000-00FF",
        "U+0131",
        "U+0152-0153",
        "U+02BB-02BC",
        "U+02C6",
        "U+02DA",
        "U+02DC",
        "U+2000-206F",
        "U+2074",
        "U+20AC",
        "U+2122",
        "U+2190-2193",
        "U+2212",
        "U+2215",
        "U+258D",
        "U+FEFF",
        "U+FFFD",
    ]
)

FONTS = [
    {
        "url": "https://cdn.jsdelivr.net/npm/@fontsource-variable/archivo@5.3.0/files/archivo-latin-wdth-normal.woff2",
        "file": "archivo-latin-wdth-normal.woff2",
        "axes": ["wght=600:800", "wdth=75:118"],
    },
    {
        "url": "https://cdn.jsdelivr.net/npm/@fontsource-variable/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-wght-normal.woff2",
        "file": "ibm-plex-sans-latin-wght-normal.woff2",
        "axes": ["wght=400:700"],
    },
]


def main() -> None:
    python = sys.executable
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for font in FONTS:
            source = work / font["file"]
            partial = work / f"partial-{font['file']}.ttf"
            dest = OUT / font["file"]
            print(f"download {font['url']}")
            urllib.request.urlretrieve(font["url"], source)
            subprocess.check_call(
                [
                    python,
                    "-m",
                    "fontTools.varLib.instancer",
                    str(source),
                    *font["axes"],
                    "-o",
                    str(partial),
                    "--update-name-table",
                ]
            )
            subprocess.check_call(
                [
                    python,
                    "-m",
                    "fontTools.subset",
                    str(partial),
                    f"--unicodes={UNICODES}",
                    "--flavor=woff2",
                    "--layout-features=*",
                    f"--output-file={dest}",
                ]
            )
            print(f"wrote {dest} ({dest.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
