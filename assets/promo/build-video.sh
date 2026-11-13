#!/bin/bash
# Renders the promo: synthesizes the beat, renders 960 frames (32 s at 30 fps) in four parallel
# Chrome instances, and encodes out/promo.mp4 (full quality) plus the repo-sized files.
#
# Usage: bash assets/promo/build-video.sh
# Needs: Google Chrome, Node 20+, Python 3 with numpy, ffmpeg.
# The inputs in assets/promo/input/ must exist first (see README.md).
set -euo pipefail
cd "$(dirname "$0")"

[ -f input/ui-grid.png ] && [ -d input/thumbs ] && [ -f input/fig/components.png ] || {
  echo "Missing inputs. Follow the steps in assets/promo/README.md first." >&2; exit 1; }

OUT=out
rm -rf "$OUT" && mkdir -p "$OUT/all"

python3 beat.py "$OUT/beat.wav"

i=0
for range in 0-240 240-480 480-720 720-960; do
  node render.js "$OUT/part-$range" "full:$range" "$((9500 + i))" > "$OUT/log-$range.txt" 2>&1 &
  i=$((i + 1))
done
wait
cp "$OUT"/part-*/f*.jpg "$OUT/all/"
echo "frames: $(ls "$OUT/all" | wc -l)"

ffmpeg -v error -y -framerate 30 -i "$OUT/all/f%05d.jpg" -i "$OUT/beat.wav" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT/promo.mp4"

# Repo-sized MP4 and the looping GIF the README shows (GitHub strips <video> tags, so the GIF plays inline)
ffmpeg -v error -y -framerate 30 -i "$OUT/all/f%05d.jpg" -i "$OUT/beat.wav" -vf "scale=1280:-2" \
  -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart "$OUT/tearsheet-demo.mp4"
ffmpeg -v error -y -i "$OUT/promo.mp4" \
  -vf "fps=10,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "$OUT/tearsheet-demo.gif"

echo "Done. Copy out/tearsheet-demo.mp4 and out/tearsheet-demo.gif into assets/readme/ to update the README."
