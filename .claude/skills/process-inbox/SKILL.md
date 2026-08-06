---
name: process-inbox
description: Process new images dropped in inbox/ into the Tearsheet gallery — view each one, rename it descriptively, tag it, and add it to data/gallery.json. Use when the user asks to process, import, or add inbox images to the gallery.
---

# Process Inbox

Turns raw images sitting in `inbox/` into cataloged gallery entries in `images/` + `data/gallery.json`.

## Steps

1. List image files in `inbox/` (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`). Ignore `.gitkeep`. If none, say so and stop.
2. Read `data/gallery.json` to see existing entries — reuse their `category` values when a new image fits one, otherwise coin a new short category name (title case, e.g. "Print-Tech Paper", "Minimal SaaS", "Dark Dashboard UI").
3. For each image in `inbox/`:
   - View it with the Read tool.
   - Decide:
     - `title` — short, e.g. product/site name if visible, otherwise a plain descriptive name (2-4 words).
     - `subtitle` — lowercase, terse, mono-style descriptor of the style (e.g. `"warm editorial x print DNA"`).
     - `category` — one of the existing categories if it fits, else a new one.
     - `tags` — 3 to 6 short lowercase phrases describing distinct visual elements (layout, texture, color, typography, imagery style). Match the style of: `"halftone CMYK dot texture"`, `"mono coordinate labels"`.
     - `description` — one or two sentences on what the image shows and why it's notable as reference.
   - Derive a kebab-case filename from the title + a couple of distinguishing words, keeping the original extension, e.g. `stillpage-ai-workspace-warm-editorial.png`. If a file with that name already exists in `images/`, append `-2`, `-3`, etc.
   - Move the file from `inbox/` to `images/` under the new name.
   - Run `node scripts/palette.js images/<new filename>` from the project root — it prints a JSON array of the image's 6 most prominent colors as hex strings, e.g. `["#241f18","#e58846",...]`. Use that array verbatim as `palette`. If the script errors, omit the `palette` field rather than guessing colors yourself.
   - Append an entry to the in-memory gallery array:
     ```json
     {
       "id": "<slug matching filename without extension>",
       "filename": "<new filename>",
       "title": "...",
       "subtitle": "...",
       "category": "...",
       "tags": ["...", "..."],
       "description": "...",
       "palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5", "#hex6"],
       "addedAt": "<current ISO 8601 timestamp>"
     }
     ```
4. Write the updated array back to `data/gallery.json` (pretty-printed, 2-space indent).
5. Report a short summary: how many images processed, their new filenames and titles.

## Notes

- Process every image left in `inbox/` in one run unless the user says otherwise.
- Keep `id` unique — derive it from the filename (without extension); if it collides with an existing id, add a numeric suffix.
- Don't touch existing entries in `gallery.json` — only append.
