"""contact sheet: python scripts/sheet.py out.jpg a.jpg b.jpg ... (cells 270x480, 5 per row)"""
import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
W, H, N = 270, 480, 5
rows = (len(files) + N - 1) // N
s = Image.new("RGB", (W * N, H * rows), "black")
for i, f in enumerate(files):
    s.paste(Image.open(f).convert("RGB").resize((W, H)), ((i % N) * W, (i // N) * H))
s.save(out, quality=88)
