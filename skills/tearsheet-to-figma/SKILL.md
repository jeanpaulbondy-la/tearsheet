---
name: tearsheet-to-figma
description: Turn the user's saved Tearsheet selection into a new Figma starter kit — color variables, approximate typography styles, and (if any selected image looks like real UI) a small set of token-bound components. Use when the user says things like "turn my tearsheet selection into a figma file", "build a figma starter kit from my references", or "/tearsheet-to-figma".
---

# Tearsheet → Figma Starter Kit

Builds a new Figma file from the images the user selected in Tearsheet: real extracted colors as variables, an approximate type ramp, and — only where the source images actually show UI — a capped set of components.

This is heavier than `/use-tearsheet`: it needs Figma auth and makes many tool calls. Default scope is a **small starter kit**, not a full production design system. Only go bigger if the user explicitly asks (see Step 5).

## Step 1 — Read the selection

Read `~/.claude/tearsheet-selection.json`.
- Missing or empty `images` array: tell the user to open Tearsheet, select images, click "Save for Claude Code," then retry. Stop here.

## Step 2 — Classify each selected image

For each image, decide:
- **UI source** — plausibly shows an interface: app screen, dashboard, website, visible buttons/nav/cards/forms.
- **Mood/palette source** — illustration, fine art, type specimen, texture, photography. Contributes color and typographic *feel*, not literal components.

Use the image's own `category`/`tags`/`description` as a first-pass hint before opening it again — most Tearsheet categories (e.g. "Organic Vessel Abstraction," "Display Type Specimens," "Retro-Futurist Space Poster") are self-evidently mood sources, not UI. View any genuinely ambiguous ones with the Read tool to confirm.

If **zero** images classify as UI sources: say so plainly, and only do Step 4a (color) and 4b (typography) — do not force component extraction onto art. This is an expected, normal outcome, not an error.

## Step 3 — Resolve the Figma target

1. Check `~/.claude/tearsheet-figma-plan.json` for a cached `{ planKey, planName }`. If present, use it and skip to 3.3.
2. Otherwise call `whoami`. If the user has exactly one plan, use it. If multiple, ask the user which team/org to use. Either way, write the choice to `~/.claude/tearsheet-figma-plan.json` as `{ "planKey": "...", "planName": "...", "savedAt": "<ISO timestamp>" }` and tell the user it's been remembered for next time.
3. Ask the user for a Figma file name, offering a default derived from the shared theme of the selected images (e.g. their common `category`, or "Tearsheet Starter Kit — <date>" if the selection is mixed).
4. Call `create_new_file` with `editorType: "design"`, the resolved `planKey`, and the chosen file name. Keep the returned `fileKey` for every subsequent `use_figma`/`upload_assets` call.

## Step 4 — Derive design intent

**4a. Color** — Pool the `palette` array from every selected image (UI and mood sources both count). Dedupe near-duplicate hexes down to a reasonable primitive set. Propose a light-mode semantic layer aliased to those primitives: `color/bg/primary`, `color/bg/surface`, `color/text/primary`, `color/text/secondary`, `color/accent/primary`, `color/border/default` (adapt names to what the palette actually supports — don't invent roles with no plausible source color). Add a second accent (`color/accent/secondary`) only if the palette clearly supports two distinct accent hues.

Always include **`color/text/on-accent`** (typically white or near-white, aliased to a dedicated primitive) whenever any accent token exists — components in 4c almost always need text/icon color sitting on top of an accent fill (buttons, badges), and skipping this token up front means adding it mid-build in Phase 5 instead. Same logic applies to any other fill that will host text or icons directly: if 4c's component list includes something with reversed/inverted colors, add its "on-X" token here, not later.

**4b. Typography** — From any image with legible type (UI sources, plus type-specimen-style mood images), describe what you see (serif/sans/mono, weight, tracking, mood). Pick the closest real Figma font per role — up to three roles: Heading, Body, Mono — verifying exact family/style strings with `listAvailableFontsAsync`. Name the resulting text styles to flag the approximation, e.g. `Heading/Serif (approx. Georgia)`. Never imply an exact font match.

**4c. Components** — From UI-source images only, list the distinct element types you can actually identify (button, nav bar, card, input, badge, etc.), capped at **5** for starter-kit scope. If more are visible, pick the 5 most representative and name what got left out and why — the user can ask for the rest in a follow-up run.

## Step 5 — Build the file

Load the `figma-use` skill before any `use_figma` call (mandatory), and the `figma-generate-library` skill for any component work (mandatory per that skill's own trigger — even one component needs proper variable foundations). Follow `figma-generate-library`'s phase discipline, scoped down to what Step 4 locked in:

- **Skip Phase 0** discovery mechanics (this is a blank new file) — instead print a short scope summary: what's UI-sourced vs mood-sourced, and what's in v1 vs deliberately left out.
- **Phase 1 Foundations**: create the primitive + semantic color variables from 4a and the text styles from 4b. Explicit scopes on every variable, never `ALL_SCOPES`. Alias semantic to primitive, never duplicate raw values.
- **Phase 2 File structure**: minimal skeleton — Cover → Foundations → `---` → Components (only if 4c is non-empty).
- **References page** (build this first, right after Cover): upload the actual selected source images via `upload_assets` with a short caption per image noting what it contributed (palette / typography / which component) — keeps the file traceable back to the moodboard instead of showing bare tokens.
- **Phase 3 Components**: build only the capped list from 4c, one at a time, with the checklist/validate/screenshot discipline `figma-generate-library` requires. Skip entirely if 4c is empty.
- **Skip Phase 4's full QA audit** for starter-kit scope (no variant matrices or dark mode to audit) — do a quick final screenshot pass instead.

**If the user explicitly asks for the full treatment** (e.g. "build the full design system," "don't cap it"), run the complete `figma-generate-library` Phase 0–4 process instead of the capped version above — variant matrices, light/dark modes, accessibility audit, the works. Confirm this is what they want before starting, since it's a much longer run.

## Step 6 — Report results

Give the user: the new Figma file URL, a short breakdown of which source image contributed which tokens/components, which candidate components were built vs. left out and why, and an explicit note that typography and component shapes are Claude's closest approximation of the references, not exact extraction.

## Notes

- `path` values in the selection file are absolute — use them as-is.
- If an image path no longer exists, mention it and skip it rather than failing the whole run.
- Never skip straight to component creation without the color/type foundations from Step 4 existing first — `figma-generate-library` treats that as a hard error, not a shortcut.
