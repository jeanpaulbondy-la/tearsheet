---
name: process-inbox
description: Process new images and videos dropped in inbox/ into the Tearsheet gallery — view each one, rename it descriptively, tag it, and add it to data/gallery.json. Use when the user asks to process, import, or add inbox items to the gallery.
---

# Process Inbox

Turns raw images and videos sitting in `inbox/` into cataloged gallery entries in `images/` + `data/gallery.json`.

## Steps

1. List files in `inbox/`:
   - Images: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`
   - Videos: `.mp4`, `.mov`, `.webm`, `.m4v`

   Ignore `.gitkeep`. If none, say so and stop.
2. Read `data/gallery.json` to see existing entries — reuse their `category` values when a new item fits one, otherwise coin a new short category name (title case, e.g. "Print-Tech Paper", "Minimal SaaS", "Dark Dashboard UI").
3. For each file in `inbox/`:
   - **If it's a video**: run `node scripts/video-thumbnail.js inbox/<file> <tmp-path>/thumb.jpg` from the project root (any writable temp path for `<tmp-path>` — it's deleted after this step) to extract one representative frame as a JPEG. View that extracted frame with the Read tool — that single frame is what informs `title`/`tags`/`description` below, since you can't watch the video directly. Mention in the description that it's a video/motion reference, not a static image, when that's relevant (e.g. "looping animation", "scroll-triggered transition").
   - **If it's an image**: view it directly with the Read tool.
   - Decide:
     - `title` — short, e.g. product/site name if visible, otherwise a plain descriptive name (2-4 words).
     - `subtitle` — lowercase, terse, mono-style descriptor of the style (e.g. `"warm editorial x print DNA"`).
     - `category` — one of the existing categories if it fits, else a new one.
     - `tags` — 3 to 6 short lowercase phrases describing distinct visual elements (layout, texture, color, typography, imagery style). Match the style of: `"halftone CMYK dot texture"`, `"mono coordinate labels"`.
     - `description` — one or two sentences on what the item shows and why it's notable as reference.
   - Derive a kebab-case filename from the title + a couple of distinguishing words, keeping the original extension, e.g. `stillpage-ai-workspace-warm-editorial.png` (or `.mp4` for a video). If a file with that name already exists in `images/`, append `-2`, `-3`, etc.
   - Move the file from `inbox/` to `images/` under the new name.
   - **For a video**, also move its extracted thumbnail frame into `images/` as `<same-slug>-thumb.jpg` (re-run `video-thumbnail.js` writing directly to that final path if you didn't already, or just copy the temp frame there before it'd otherwise be deleted).
   - Run `node scripts/palette.js images/<filename for images, or the video's -thumb.jpg for videos>` from the project root — it prints a JSON array of the frame's 6 most prominent colors as hex strings, e.g. `["#241f18","#e58846",...]`. Use that array verbatim as `palette`. If the script errors, omit the `palette` field rather than guessing colors yourself.
   - Append an entry to the in-memory gallery array:
     ```json
     {
       "id": "<slug matching filename without extension>",
       "filename": "<new filename>",
       "mediaType": "image | video",
       "thumbnail": "<slug>-thumb.jpg (video entries only — omit entirely for images)",
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
5. Report a short summary: how many items processed (broken out by image vs video if both), their new filenames and titles.

## Notes

- Process every item left in `inbox/` in one run unless the user says otherwise.
- Keep `id` unique — derive it from the filename (without extension); if it collides with an existing id, add a numeric suffix.
- Don't touch existing entries in `gallery.json` — only append.
- Existing entries have no `mediaType` field — the gallery treats a missing `mediaType` as `"image"`, so this is backward compatible. Only set `mediaType: "video"` explicitly, and only on video entries.
- `video-thumbnail.js` grabs the frame at 1 second by default; it automatically falls back to the very first frame if the video is shorter than that. Don't pass a custom timestamp unless the 1-second frame is clearly a bad representative (e.g. a fade-in from black).
