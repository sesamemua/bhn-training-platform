#!/usr/bin/env python3
"""
Re-render the AV source PDFs to the page PNGs the comparison page shows.

WHY THIS EXISTS. The six page renders and fifty-two row crops under
private/av-clips/ arrived as committed output with no tooling beside
them, so "re-cut the clips" was not a command anybody could run — it was
an afternoon of rediscovering what had been done. Three pages were
missing for that reason alone: q2025 p3, and q2026 p3-4, which is the
Terms and Conditions page the comparison table argues about.

THE RECIPE IS NOT A GUESS. Running this against the three PDFs
reproduces all six pre-existing renders BYTE-FOR-BYTE — same SHA-256,
same file size — which is what pins PyMuPDF at Matrix(2, 2) as the
original recipe rather than one that merely looks similar. --check
asserts that, so a future dependency bump that would silently change the
pixels fails loudly instead.

    python3 scripts/av-render-pages.py --check     # verify, write nothing
    python3 scripts/av-render-pages.py             # write missing pages
    python3 scripts/av-render-pages.py --force     # rewrite everything

DEPENDENCY. PyMuPDF, which is not in package.json because this is not
part of the build — it is run by hand when the vendor sends a new
document. A throwaway venv is the least invasive way:

    python3 -m venv /tmp/pdfvenv && /tmp/pdfvenv/bin/pip install pymupdf
    /tmp/pdfvenv/bin/python scripts/av-render-pages.py

THE SOURCES ARE NOT IN THE REPO. They are pictures of a vendor's
pricing, kept where AV_SOURCE_FOLDER in src/lib/symposium/av.ts says
they are. This script reads them from there and writes only the renders,
which are already tracked.

NOT INCLUDED: the row crops (q2026--wireless-mics.png and friends). Those
were cut at a different scale (~2.42x) and trimmed per document to each
one's content column, and the box fractions in av-clips.json were derived
from that pass. Reproducing them needs the crop rectangles, which were
not written down. Pages are the half that can be made reproducible today;
say so rather than implying the whole pipeline is covered.
"""
import argparse
import hashlib
import json
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "private" / "av-clips"
MANIFEST = REPO / "src" / "lib" / "symposium" / "av-clips.json"

# Mirrors AV_SOURCE_FOLDER in src/lib/symposium/av.ts. Kept as a literal
# rather than parsed out of the TypeScript: one of them moving without
# the other should be a loud failure here, not a silently wrong render.
SOURCE_DIR = pathlib.Path.home() / "Desktop" / "Work Files" / "2026 TRAINING WEEK AND SYMPOSIUM" / "AV"

DOCS = {
    "q2025": "Livecast_AV_Quote_2025_Estimate_20250956.pdf",
    "i2025": "Livecast_Final_Invoice_2025_Invoice_2025-325.pdf",
    "q2026": "Quote - 2026 Annual Symposium BioHubNet.pdf",
}

# 2x the 612x792pt US-Letter mediabox = 1224x1584, i.e. 144 DPI. Any
# other value changes every byte of every page.
SCALE = 2


def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify existing renders reproduce; write nothing")
    ap.add_argument("--force", action="store_true", help="rewrite pages that already exist")
    args = ap.parse_args()

    try:
        import pymupdf
    except ImportError:
        print("PyMuPDF is not installed. See the header of this file.", file=sys.stderr)
        return 2

    missing = [n for n in DOCS.values() if not (SOURCE_DIR / n).exists()]
    if missing:
        print(f"Source PDFs not found in {SOURCE_DIR}:", file=sys.stderr)
        for m in missing:
            print(f"  {m}", file=sys.stderr)
        return 2

    manifest = json.loads(MANIFEST.read_text())
    pages = manifest["pages"]
    written, verified, differed = [], [], []

    for key, name in DOCS.items():
        doc = pymupdf.open(SOURCE_DIR / name)
        for i in range(doc.page_count):
            page_no = i + 1
            file = f"page--{key}--{page_no}.png"
            target = OUT / file
            pix = doc[i].get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE))

            if target.exists() and not args.force:
                tmp = target.with_suffix(".tmp.png")
                pix.save(tmp)
                same = sha(tmp) == sha(target)
                tmp.unlink()
                (verified if same else differed).append(file)
            elif args.check:
                differed.append(f"{file} (missing)")
            else:
                pix.save(target)
                written.append(file)

            pages[f"{key}:{page_no}"] = {"file": file, "w": pix.width, "h": pix.height}
        doc.close()

    if verified:
        print(f"reproduced byte-for-byte: {len(verified)}")
    for f in written:
        print(f"+ {f}")
    for f in differed:
        print(f"! {f} does NOT reproduce", file=sys.stderr)

    if args.check:
        return 1 if differed else 0

    MANIFEST.write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"manifest: {len(pages)} pages")
    return 1 if differed else 0


if __name__ == "__main__":
    raise SystemExit(main())
