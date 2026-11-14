"""Build the two outputs from extension/:

  docs/index.html                     one self-contained page (the live demo on GitHub Pages)
  dist/ascii-garden-extension.zip     the extension, ready for "Load unpacked" or a release

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

print("built docs/index.html and dist/ascii-garden-extension.zip")
