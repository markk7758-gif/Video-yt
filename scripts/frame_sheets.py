"""python scripts/frame_sheets.py <frames_dir> <out_dir> <first> <last>: one sheet per 60 frames (10 x 6, every frame,
numbered), from a Remotion jpeg sequence (element-NNN.jpeg with chunk-dependent zero padding)."""
import os, re, sys
from PIL import Image, ImageDraw
src, out, f0, f1 = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
os.makedirs(out, exist_ok=True)
files = {int(re.search(r"(\d+)\.jpeg$", f).group(1)): os.path.join(src, f) for f in os.listdir(src) if f.endswith(".jpeg")}
W, H = 162, 288
for s in range(f0 - f0 % 60, f1 + 1, 60):
    sheet = Image.new("RGB", (W * 10, H * 6), "black")
    d = ImageDraw.Draw(sheet)
    for k in range(60):
        f = s + k
        if f in files:
            sheet.paste(Image.open(files[f]).convert("RGB").resize((W, H)), ((k % 10) * W, (k // 10) * H))
        d.text(((k % 10) * W + 4, (k // 10) * H + 4), str(f), fill="yellow")
    sheet.save(os.path.join(out, f"sheet_{s:04d}.jpg"), quality=85)
    print("sheet", s)
