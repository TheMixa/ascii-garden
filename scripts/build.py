"""Build the two outputs from extension/:

  docs/index.html                     one self-contained page (the live demo on GitHub Pages)
  dist/ascii-garden-extension.zip     the extension in a folder, ready for "Load unpacked"
  dist/ascii-garden-store.zip         the same files with manifest.json at the root, for the Chrome Web Store

Usage:  python3 scripts/build.py
"""
import base64
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
ext = root / "extension"
docs = root / "docs"
dist = root / "dist"
docs.mkdir(exist_ok=True)
dist.mkdir(exist_ok=True)

html = (ext / "index.html").read_text()
css = (ext / "style.css").read_text()
js = (ext / "app.js").read_text()
icon = base64.b64encode((ext / "icons" / "icon32.png").read_bytes()).decode()

html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "</style>")
html = html.replace('<script src="app.js"></script>', "<script>\n" + js + "</script>")
html = html.replace('href="icons/icon32.png"', f'href="data:image/png;base64,{icon}"')
html = html.replace("<title>New Tab</title>", "<title>ASCII Garden: live demo</title>")
(docs / "index.html").write_text(html)

files = ["manifest.json", "index.html", "style.css", "app.js"] + [f"icons/icon{n}.png" for n in (16, 32, 48, 128)]
with zipfile.ZipFile(dist / "ascii-garden-extension.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for name in files:
        z.write(ext / name, f"ascii-garden-extension/{name}")

with zipfile.ZipFile(dist / "ascii-garden-store.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for name in files:
        z.write(ext / name, name)  # Chrome Web Store wants manifest.json at the zip root

print("built docs/index.html, dist/ascii-garden-extension.zip and dist/ascii-garden-store.zip")
