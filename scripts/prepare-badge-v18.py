"""Prepare shared preview/print artwork from the approved v18 badge proof."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, FloatObject, NameObject
from reportlab.pdfbase.ttfonts import TTFont

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("--font-dir", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / "public/print"
reader = PdfReader(args.source)
writer = PdfWriter()
writer.clone_document_from_reader(reader)
page = writer.pages[0]
assert tuple(map(float, page.mediabox)) == (0, 0, 288, 216)
original_images = sorted(hashlib.sha256(image.data).hexdigest() for image in page.images)
content = ContentStream(page.get_contents(), writer)
operations = []
inside_text = False
shifted = 0
for operands, operator in content.operations:
    if operator == b"BT":
        inside_text = True
    if not inside_text:
        # v18's BHN image transform is in millimetres inside the logo group.
        if operator == b"cm" and abs(float(operands[0]) - 30) < 0.001 and abs(float(operands[4]) - 47) < 0.001:
            operands[4] = FloatObject(46)
            shifted += 1
        operations.append((operands, operator))
    if operator == b"ET":
        inside_text = False
assert shifted == 1 and not inside_text
content.operations = operations
target = page
target[NameObject("/Contents")] = writer._add_object(content)
target.compress_content_streams()
background = out / "badge-v18-background.pdf"
writer.write(background)
check = PdfReader(background).pages[0]
assert not check.extract_text().strip(), "Example attendee text must not remain hidden in the template"
assert original_images == sorted(hashlib.sha256(image.data).hexdigest() for image in check.images)
pdf = pdfium.PdfDocument(str(background))
preview = pdf[0].render(scale=300 / 72).to_pil()
original = pdfium.PdfDocument(str(args.source))
reference = original[0].render(scale=300 / 72).to_pil()
assert preview.crop((0, 605, 1200, 900)).tobytes() == reference.crop((0, 605, 1200, 900)).tobytes(), "Crystal footer must remain unchanged"
assert preview.crop((150, 65, 620, 225)).tobytes() == reference.crop((150, 65, 620, 225)).tobytes(), "U of T logo and divider must remain unchanged"
preview.save(out / "badge-v18-background.png")
original.close()
pdf.close()

metrics = {}
for key, filename in [("regular", "InstrumentSans-Regular.ttf"), ("bold", "InstrumentSans-Bold.ttf"), ("fallback", "NotoSans-Regular.ttf")]:
    if key != "fallback":
        shutil.copyfile(args.font_dir / filename, out / filename)
    font = TTFont(key, str(out / filename))
    metrics[key] = {str(code): round(width, 5) for code, width in font.face.charWidths.items()}
(out / "InstrumentSans-OFL.txt").write_text("\n".join(line.rstrip() for line in (args.font_dir / "InstrumentSans-OFL.txt").read_text().splitlines()) + "\n")
(root / "src/lib/events/badge-font-widths.json").write_text(json.dumps(metrics, separators=(",", ":")))
(out / "badge-v18-source.json").write_text(json.dumps({
    "design": "Approved v18, 23 October 2026", "sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
    "bhnShiftLeftMm": 1, "badgePoints": [288, 216], "originalLogoPixelsPreserved": True,
    "backgroundHasText": False, "footerRemainsVector": True,
}, indent=2))
print(background)
