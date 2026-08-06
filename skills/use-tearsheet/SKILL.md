---
name: use-tearsheet
description: Load the images the user selected in their Tearsheet gallery (a local Pinterest-style reference site) and use them as design reference for the current project. Use when the user says things like "use my tearsheet selection", "pull in my saved references", or "/use-tearsheet".
---

# Use Tearsheet

Brings design references the user picked out in their Tearsheet gallery into the current project.

## Steps

1. Read `~/.claude/tearsheet-selection.json`.
   - If the file doesn't exist or its `images` array is empty, tell the user: open the Tearsheet gallery, select images, and click "Save for Claude Code" — then try again. Stop here.
2. For each entry in `images`, view the file at its `path` with the Read tool.
3. Before doing any design/implementation work, briefly summarize what you're drawing from: for each image, its title and the qualities that seem relevant (layout, color, typography, texture, tone) based on its `subtitle`, `category`, `tags`, `description`, and `palette` (hex colors extracted from the image) fields alongside what you see.
4. Use these images as visual/style reference for whatever the user is building next in this project — matching layout patterns, color palettes, typographic choices, or textures as appropriate, rather than copying content verbatim.

## Notes

- `path` in the selection file is an absolute path — use it as-is regardless of the current project directory.
- If an image path no longer exists (moved/renamed in the gallery since selection), mention it and skip it rather than failing.
- This selection file is overwritten each time the user saves a new selection from the gallery — always re-read it fresh rather than assuming prior contents.
- If the user wants to go further and scaffold an actual Figma file (color variables, typography, components) from this same selection, use the `tearsheet-to-figma` skill instead — it's heavier (needs Figma auth, many tool calls) so it's kept separate from this one.
