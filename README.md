# Tearsheet

A personal, Pinterest-style reference gallery. Drop in images or videos — screenshots, illustrations, renders, motion references, whatever — let Claude Code catalog them, browse them, and pull a selection into any future project as design reference — or scaffold a Figma or Claude Design starter kit straight from what you selected.

## Install

```bash
git clone https://github.com/jeanpaulbondy-la/tearsheet.git
```

```bash
cd tearsheet && npm install
```

```bash
npm start
```

Open **http://localhost:4560** — the gallery starts empty.

Then install the global commands (one-time):

```bash
cp -r skills/use-tearsheet skills/tearsheet-to-figma skills/tearsheet-to-design ~/.claude/skills/
```

Restart Claude Code so it picks up the new commands.

## Use

**Add references:**
1. Drop image files (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`) or video files (`.mp4`, `.mov`, `.webm`, `.m4v`) into the `inbox/` folder.
2. In Claude Code, inside the `tearsheet` folder, run `/process-inbox` — it renames, tags, and catalogs each one automatically. Videos get a representative frame extracted (via a bundled ffmpeg, no separate install needed) for the palette and gallery thumbnail; cards preview the video on hover.

**Browse:** refresh `localhost:4560` to see them in the gallery.

**Use a selection in another project:**
1. Click images in the gallery to select them, then **Save for Claude Code**.
2. In Claude Code, in *any* project, run `/use-tearsheet` — Claude pulls in the selected images as design reference.

**Or turn a selection into a design-tool starter kit:**
- Same selection step, then run `/tearsheet-to-figma` (new Figma file) or `/tearsheet-to-design` (new claude.ai/design project) instead — either builds color tokens, type styles, and a few components from what you selected. See `skills/tearsheet-to-figma/SKILL.md` or `skills/tearsheet-to-design/SKILL.md` for the full behavior, including how to ask for the full (uncapped) design-system treatment instead of the starter-kit default.

That's the whole loop: drop in → `/process-inbox` → select in browser → `/use-tearsheet`, `/tearsheet-to-figma`, or `/tearsheet-to-design` in your next project.

## Structure

- `inbox/` — drop zone for new, unprocessed images and videos
- `images/` — processed, renamed images
- `data/gallery.json` — metadata for every gallery item (git-ignored — this is your personal library, not shared)
- `public/` — the gallery website (static HTML/CSS/JS)
- `server.js` — serves the site and handles saving selections
- `.claude/skills/process-inbox/` — the `/process-inbox` command (project-scoped, auto-loaded)
- `skills/use-tearsheet/`, `skills/tearsheet-to-figma/`, `skills/tearsheet-to-design/` — the global commands; copy into `~/.claude/skills/` per the install step above
