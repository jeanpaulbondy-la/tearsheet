# Promo video

The 32-second ad shown in the main README is built from code, not edited in a video app. Every scene is a pure function of time in one HTML page, rendered frame by frame in headless Chrome, with a synthesized 120 BPM beat underneath. That makes it easy to change a caption, a timing, or a scene and re-render.

| File | What it does |
| --- | --- |
| `motion.html` | The whole ad: seven scenes, captions, the real build timings, and the Figma editor scene. Open it in Chrome and call `render(12.5)` in the console to see any moment |
| `render.js` | Renders frames to JPEGs through the Chrome DevTools protocol |
| `beat.py` | Synthesizes the soundtrack (kick, hats, bass, arpeggio, hits on every scene change) |
| `capture-stills.js` | Captures the real UI stills from your running gallery |
| `make-thumbs.py` | Makes the thumbnails for the opening mosaic from your gallery |
| `build-video.sh` | Runs the beat and four parallel renders, then encodes the MP4 and the README GIF |

## Rebuild it

You need Google Chrome, Node 20 or newer, Python 3 with `numpy`, and `ffmpeg`.

```bash
pip3 install numpy
```

**1. Gather the inputs** into `assets/promo/input/`. They hold your own references, so the folder is git-ignored.

```bash
npm start                                  # Tearsheet must be running, in another terminal
node assets/promo/capture-stills.js        # ui-grid, ui-grid2, ui-detail, ui-select
python3 assets/promo/make-thumbs.py        # 60 thumbnails for the opening mosaic
```

`capture-stills.js` takes optional arguments: the title of the reference to open full size, and a comma-separated list of references to select. For example `node assets/promo/capture-stills.js "Circles Composition" "Cirro,Naomi,Tiamo"`.

For the Figma scenes, save three screenshots of a finished build into `input/fig/` as `foundations.png`, `references.png`, and `components.png`: one per page, at full size. Claude Code can fetch them with the Figma tool `get_screenshot` (use a large `maxDimension`, then download the image URL).

**2. Update the build data** at the top of the editor section in `motion.html` (`FAMILIES`, `SETS`, `PRIMS`, `REFS`, `PAINT`, and the camera targets in `editorState`). They hold the real layer names, variant properties, hex values, and node positions of the Figma file shown in the video, so they need to match your own build. Ask Claude Code for `get_metadata` on the Components, Foundations, and References pages to read them. The timings in `WORK` are the real durations of one build's workers from `.tearsheet-figma-build.log`.

**3. Render.**

```bash
bash assets/promo/build-video.sh
```

Output lands in `assets/promo/out/` (git-ignored): `promo.mp4` at full size, plus `tearsheet-demo.mp4` and `tearsheet-demo.gif` for the main README. Copy those two into `assets/readme/` to update the page.

## Notes

- The soundtrack is generated, so it is easy to retime: scene changes and hits are listed in `beat.py` and `motion.html` and must stay on the half-second beat grid. Off-grid hits sound like stumbles. To use your own track instead, encode your audio over `out/all/f%05d.jpg` yourself and retime the scene start times in `motion.html`.
- GitHub strips `<video>` tags from READMEs, so the page shows the GIF, which links to the MP4. For a player with sound on the page, upload the MP4 through GitHub's own editor.
- The Figma editor frame in the ad is recreated to match the editor's layout around real canvas screenshots and real file data. It isn't a live screen capture.
