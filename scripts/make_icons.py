"""Pixel-art butterfly icon in the same tile style as the page."""
import pathlib
from PIL import Image, ImageDraw

GRID = [
    "..............",
    "....A....A....",
    ".MMM.A..A.MMM.",
    "MLLLM.AA.MLLLM",
    "MLWLLM..MLLWLM",
    "MLLLLLDDLLLLLM",
    ".MLLLLDDLLLLM.",
    "..MMLLDDLLMM..",
    "..MLLMDDMLLM..",
    ".MLLLMDDMLLLM.",
    ".MLLM.DD.MLLM.",
    "..MM......MM..",
]
COL = {"M": (37, 99, 216), "L": (79, 155, 255), "W": (232, 246, 255),
       "D": (126, 150, 200), "A": (156, 196, 255)}

out = pathlib.Path(__file__).resolve().parent.parent / "extension" / "icons"
out.mkdir(parents=True, exist_ok=True)
rows, cols = len(GRID), len(GRID[0])


def render(size, background):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=(16, 19, 27, 255))
    usable = size * (0.8 if background else 1.0)
    cell = max(1, int(usable // cols))
    gap = 1 if cell >= 6 else 0
    ox = (size - cell * cols) // 2
    oy = (size - cell * rows) // 2
    for y, row in enumerate(GRID):
        for x, ch in enumerate(row):
            if ch in COL:
                x0, y0 = ox + x * cell, oy + y * cell
                d.rectangle([x0, y0, x0 + cell - 1 - gap, y0 + cell - 1 - gap], fill=COL[ch] + (255,))
    return img


for s in (16, 32):
    render(s, background=False).save(out / f"icon{s}.png")
for s in (48, 128):
    render(s, background=True).save(out / f"icon{s}.png")
print("icons done")
