"""Prepare the approved paired glass backgrounds; attendee text stays in the shared layout."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from PIL import Image
from pypdf import PdfReader
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

parser = argparse.ArgumentParser()
parser.add_argument("assets", type=Path)
args = parser.parse_args()
out = Path(__file__).resolve().parents[1] / "public/print"
header_path = args.assets / "original-header.png"
glass_path = args.assets / "01-prismatic-print-v4.png"
header, glass = Image.open(header_path), Image.open(glass_path)
assert header.size == (1200, 901) and glass.size == (2172, 724)
target = out / "badge-v19-background.pdf"
c = canvas.Canvas(str(target), pagesize=(288, 216), pageCompression=1)
c.setTitle("BioHubNet v19 paired badge backgrounds")
for mirrored in (False, True):
    c.saveState()
    clip = c.beginPath()
    clip.rect(0, 152, 288, 64)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(ImageReader(header), 0, 0, 288, 216, mask="auto")
    c.restoreState()
    c.saveState()
    if mirrored:
        c.translate(288, 0)
        c.scale(-1, 1)
    clip = c.beginPath()
    clip.rect(0, 0, 288, 55.67)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(ImageReader(glass), -2*288/2168, -8*55.67/716, 2172*288/2168, 724*55.67/716, mask="auto")
    c.restoreState()
    c.showPage()
c.save()
reader = PdfReader(target)
assert len(reader.pages) == 2
assert all(list(map(float, page.mediabox)) == [0, 0, 288, 216] for page in reader.pages)
assert all(not page.extract_text().strip() for page in reader.pages)
for number in (1, 2):
    subprocess.run(["pdftoppm", "-f", str(number), "-l", str(number), "-singlefile",
                    "-r", "300", "-png", str(target), str(out / f"badge-v19-background-{number}")], check=True)
(out / "badge-v19-source.json").write_text(json.dumps({
    "design": "Approved teal/navy multi-faceted glass, print-optimized",
    "headerSha256": hashlib.sha256(header_path.read_bytes()).hexdigest(),
    "glassSha256": hashlib.sha256(glass_path.read_bytes()).hexdigest(),
    "badgePoints": [288, 216], "pages": ["left", "right"],
    "originalLogoPixelsPreserved": True, "backgroundHasText": False,
    "glassEffectiveDpi": 542, "rightFooterMirrored": True,
}, indent=2))
print(target)
