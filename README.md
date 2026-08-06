# Tearsheet

A personal, Pinterest-style reference gallery. Drop screenshots in, let Claude Code catalog them, browse them, and pull a selection into any future project as design reference — or scaffold a Figma starter kit (color variables, type styles, a few components) straight from what you selected.

## Setup

```bash
npm install
npm start
```

Open http://localhost:4560. The gallery starts empty — `data/gallery.json` is created automatically on first run.

### Install the Claude Code skills

This repo ships three skills. One (`/process-inbox`) is project-scoped and works automatically once you `cd` into this folder in Claude Code. The other two need to be installed once, globally, since they're meant to work from *any* project:

```bash
cp -r skills/use-tearsheet ~/.claude/skills/
cp -r skills/tearsheet-to-figma ~/.claude/skills/
```

Restart Claude Code afterward — it only loads the list of available skills at startup.

## Adding images

1. Drop image files into `inbox/`.
2. In Claude Code, inside this project, run:
   ```
   /process-inbox
   ```
   Claude will look at each image, rename it, tag it, extract its dominant colors, and file it into `images/` + `data/gallery.json`.

## Using a selection as reference in a new project

1. In the gallery site, click images to select them (border highlights, checkmark appears).
2. Click **Save for Claude Code** in the floating bar — this writes `~/.claude/tearsheet-selection.json`.
3. In Claude Code, in any other project, run:
   ```
   /use-tearsheet
   ```
   Claude will read the selection, view the images, and use them as style reference for what you're building.

## Turning a selection into a Figma starter kit

Requires the official Figma MCP server connected in your Claude Code environment.

1. Select images in the gallery and save, same as above.
2. In Claude Code, run:
   ```
   /tearsheet-to-figma
   ```
   Claude classifies the selection into UI sources vs. mood/palette sources, pools their extracted colors into a token set, approximates the typography, and builds a small set of token-bound components (capped at 5) in a new Figma file — with a References page tracing every token back to its source image. See `skills/tearsheet-to-figma/SKILL.md` for the full behavior, including how to ask for the full (uncapped) design-system treatment instead of the starter-kit default.

## Structure

- `inbox/` — drop zone for new, unprocessed images
- `images/` — processed, renamed images
- `data/gallery.json` — metadata for every gallery item (git-ignored — this is your personal library, not shared)
- `public/` — the gallery website (static HTML/CSS/JS)
- `server.js` — serves the site and handles saving selections
- `.claude/skills/process-inbox/` — the `/process-inbox` command (project-scoped, auto-loaded)
- `skills/use-tearsheet/`, `skills/tearsheet-to-figma/` — the two global commands; copy into `~/.claude/skills/` per the setup step above
