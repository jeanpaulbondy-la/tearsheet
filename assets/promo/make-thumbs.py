"""Makes the square thumbnails for the opening mosaic from your own gallery.

Usage (from the repo root or anywhere): python3 assets/promo/make-thumbs.py
Needs ffmpeg on your PATH and a populated data/gallery.json and images/ folder. Writes
60 files, input/thumbs/t00.jpg to t59.jpg, which the mosaic fills a 10 x 6 grid with.
"""
import json, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "input", "thumbs")
os.makedirs(OUT, exist_ok=True)

gallery = json.load(open(os.path.join(ROOT, "data", "gallery.json")))
n = 0
for entry in gallery:
    if entry.get("mediaType") == "video":
        continue
    result = subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", os.path.join(ROOT, "images", entry["filename"]),
        "-vf", "scale=420:420:force_original_aspect_ratio=increase,crop=420:420",
        "-frames:v", "1", "-q:v", "4", os.path.join(OUT, f"t{n:02d}.jpg"),
    ])
    if result.returncode == 0:
        n += 1
    if n >= 60:
        break
print(f"wrote {n} thumbnails" + ("" if n >= 60 else f" (the mosaic wants 60; add more references or repeat some)"))
