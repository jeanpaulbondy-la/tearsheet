<p align="center">
  <img src="assets/og-card.png" alt="Tearsheet: build your own visual library" width="100%" />
</p>

# Tearsheet

A personal, visual reference gallery that runs on your machine. Drop in images or videos and Claude Code catalogs them, reading each one for its mood, color, type, and UI and extracting a real color palette from the pixels. Browse them as an index, pull a selection into any project as design context, or scaffold the mood, typography, and UI patterns straight into a new Figma file or Claude Design project.

Everything stays local. Nothing is uploaded anywhere unless you explicitly push it.

## Install

```bash
git clone https://github.com/jeanpaulbondy-la/tearsheet.git
cd tearsheet
npm install && npm run setup
```

**Then set up Figma integration:**

1. Get your Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
2. Copy `.env.example` to `.env`
3. Add your key: `ANTHROPIC_API_KEY=sk-ant-...`

`npm run setup` installs the global Claude Code commands (`/use-tearsheet`, `/tearsheet-to-figma`, `/tearsheet-to-design`) into `~/.claude/skills/`. On macOS, it also builds **Tearsheet.app** — drag it onto the Dock to start the server and open the gallery from your menu bar.

<p>
  <img src="assets/readme/icon-128.png" alt="Tearsheet app icon" width="64" align="left" />
</p>

You can also run it by hand from the project folder:

```bash
npm start
```

Then open **http://localhost:4560**. The gallery starts empty.

## Use

**Add references**

1. Drop image files (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`) or video files (`.mp4`, `.mov`, `.webm`, `.m4v`) into the `inbox/` folder.
2. In Claude Code, inside the `tearsheet` folder, run `/process-inbox`. It renames, tags, describes, and catalogs each file, and extracts a real color palette from it. Videos get a representative frame pulled (via a bundled ffmpeg, no separate install) for the palette and thumbnail; cards preview the video on hover.

**Browse**

Reload `localhost:4560`. The index rail on the left lists every category with its count, plus the recurring motifs (tags shared by two or more references). Filters are multi-select; click an active one to clear it. Press `/` to search titles, tags, categories, and descriptions.

Click any image to open it full size with its description, the extracted palette (click a hex value to copy it), and its tags. The arrow keys move through the current result set and `Esc` closes. Every reference has a link of its own (`localhost:4560/#ref=<id>`) that opens straight to this view.

<p align="center">
  <img src="assets/readme/detail-view.jpg" alt="Detail view: full-size reference, description, extracted palette with hex values, and tags" width="100%" />
</p>

**Use a selection in another project**

1. Hover a card and click its checkbox to select it (or use the button in the detail view), then **Save for Claude Code**.
2. In Claude Code, in *any* project, run `/use-tearsheet`. Claude pulls in the selected references as design context.

**Or turn a selection into a design-tool starter kit**

Same selection step, then click "Build File" in Tearsheet. It creates a Figma file with color tokens, type styles, and UI components — all automatically, using your Anthropic API key.

### The complete workflow

```
1. Drop images into inbox/
   ↓
2. Run /process-inbox (indexes + extracts palettes)
   ↓
3. Browse at http://localhost:4560
   ↓
4. Select images → "Save for Figma" (optional: include your Figma project link for reference)
   ↓
5. Click "Build File"
   ↓
6. Figma file appears in seconds (browser opens it automatically)
```

**One-click frictionless:** Selection → Build → Done. No extra steps, no skill invocation, no approval gates. Claude builds the entire file server-side using the Figma API.

**Alternatively**, in Claude Code run `/tearsheet-to-figma` or `/tearsheet-to-design` for more control over the build (manual skill invocation gives you prompts and options).

See `skills/tearsheet-to-figma/SKILL.md` for build details.

## Structure

- `inbox/`: drop zone for new, unprocessed images and videos
- `images/`: processed, renamed images (git-ignored, this is your personal library)
- `data/gallery.json`: metadata for every item, including its extracted palette (git-ignored)
- `public/`: the gallery site (static HTML, CSS, JS; self-hosted type, no external requests)
- `server.js`: serves the site and handles saving selections
- `scripts/setup.js`: installs the global commands and builds the macOS launcher
- `scripts/palette.js`, `scripts/video-thumbnail.js`: palette extraction and video frame capture used by `/process-inbox`
- `.claude/skills/process-inbox/`: the `/process-inbox` command (project-scoped, auto-loaded)
- `skills/use-tearsheet/`, `skills/tearsheet-to-figma/`, `skills/tearsheet-to-design/`: the global commands installed by `npm run setup`
- `assets/`: app icon, social preview card, and README images

## License

MIT. Type is Bricolage Grotesque and DM Mono, both under the SIL Open Font License (see `public/fonts/LICENSE.txt`).
