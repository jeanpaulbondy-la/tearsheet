---
name: tearsheet-to-figma
description: Turn the user's saved Tearsheet selection into a new Figma starter kit — color variables, approximate typography styles, and (if any selected image looks like real UI) a working baseline of token-bound components. Automatically checks for a saved selection from the Tearsheet app, or guides the user to create one. Use when the user says things like "turn my tearsheet selection into a figma file", "build a figma starter kit from my references", or "/tearsheet-to-figma".
---

# Tearsheet → Figma Starter Kit

Builds a new Figma file from the images the user selected in Tearsheet: real extracted colors as variables, an approximate type ramp, and — only where the source images actually show UI — a small set of working components.

This skill is designed for the hybrid workflow: the user selects images in the Tearsheet web app (http://localhost:4560), saves their selection, then manually runs this skill in Claude Code. The skill automatically checks for a saved selection and offers to use it; if none exists, it guides you to Tearsheet first.

This is heavier than `/use-tearsheet`: it needs Figma auth and makes a dozen or so tool calls. Default scope is a **fast baseline** for the designer to iterate on: color and type foundations with hex values, the real reference images, and one working component per UI pattern the references show (up to 8). It deliberately omits variant matrices, component sets, light/dark modes, and accessibility audits unless the user explicitly asks.

## Preamble — Check for saved selection

When this skill is invoked, immediately check `~/.claude/tearsheet-selection.json`.

- **If the file exists and contains a non-empty `images` array:** Use this saved selection and proceed directly to Step 2. The user ran the skill specifically to build from this selection—no permission needed. Print "Found N images. Building the Figma starter kit."
- **If the file is missing or empty:** Proceed to Step 1 normally.

## Step 1 — Read the selection

Read `~/.claude/tearsheet-selection.json`.
- Missing or empty `images` array: tell the user to open Tearsheet (at `http://localhost:4560`), select images, click "Save for Figma" (or "Save for Claude Code"), then run `/tearsheet-to-figma` again. Stop here.

## Step 2 — Classify each selected image

For each image, decide:
- **UI source** — plausibly shows an interface: app screen, dashboard, website, visible buttons/nav/cards/forms.
- **Mood/palette source** — illustration, fine art, type specimen, texture, photography. Contributes color and typographic *feel*, not literal components.

Use the image's own `category`/`tags`/`description` as a first-pass hint before opening it again — most Tearsheet categories (e.g. "Organic Vessel Abstraction," "Typography," "Retro-Futurist Space Poster") are self-evidently mood sources, not UI. View any genuinely ambiguous ones with the Read tool to confirm.

If **zero** images classify as UI sources: say so plainly, and only do Step 4a (color) and 4b (typography) — do not force component extraction onto art. This is an expected, normal outcome, not an error.

**Never surface a real brand, product, or company name anywhere in the output** — not in References-page captions, component names, layer names, or text placed inside a component. UI-source screenshots routinely carry third-party names (the site's own brand, client-logo strips, feature/product names in body copy), and none of that belongs in a generated Figma file. Refer to each source by what it generically is instead (e.g. "the fintech landing page," "the travel booking hero," "an agency homepage") and swap any literal third-party logos or names in a component mockup (e.g. a "Trusted by" logo row) for made-up placeholder names.

## Step 3 — Resolve the Figma target

1. Check `~/.claude/tearsheet-figma-plan.json` for a cached `{ planKey, planName }`. If present, use it and proceed to 3.4. Print "Using team: <planName>."
2. Otherwise call `whoami`. If the user has exactly one plan, use it automatically. If multiple, ask which one (this is the ONLY ask in this step—there's genuine ambiguity). Write the choice to `~/.claude/tearsheet-figma-plan.json` as `{ "planKey": "...", "planName": "...", "savedAt": "<ISO timestamp>" }` and proceed to 3.4.
3. If the saved selection contains a `figmaUrl`, note it: "Creating in: <planName>. (Your selection was for <figmaUrl>.)"
4. Derive a Figma file name from the shared theme of the selected images (e.g. their common `category`, or "Tearsheet Starter Kit — <date>" if mixed). Don't ask the user—proceed with this default unless they interrupt before the file is created.
5. Call `create_new_file` with `editorType: "design"`, the resolved `planKey`, and the chosen file name. Keep the returned `fileKey` for every subsequent `use_figma`/`upload_assets` call.

## Step 4 — Derive design intent

**4a. Color** — Pool the `palette` array from every selected image (UI and mood sources both count). Dedupe near-duplicate hexes down to a reasonable primitive set (typically 4–8 base colors). You'll create each as a single Figma primitive variable named `primitive/<natural-color-name>` (e.g. `primitive/coral`, `primitive/seafoam`). **The name must be something a designer or developer would actually say out loud** — a real color/mood word (coral, seafoam, rust, dusk, ink, sand, acid, slate), never a placeholder like "color1," "accent-orange," or the raw hex. Pick it by looking at the swatch, not by category.

**No tint ramps.** Don't generate lighter or darker copies of a color as separate variables. If a dimmed role is needed (secondary text, a subtle border), apply the primitive as an **unbound** paint with an opacity at the point of use. One hard Figma constraint: Figma silently resets a paint's `opacity` to 1 if that paint's color is bound to a variable, so set `paint.opacity` after calling `setBoundVariableForPaint`, or use an unbound paint.

Propose a semantic layer for the roles that map to a stable single hue: `color/bg/primary`, `color/bg/surface`, `color/text/primary`, `color/accent/primary`, `color/accent/secondary` (only if the palette clearly supports two distinct accent hues). Each binds directly to a primitive.

**Check contrast before deciding `color/text/on-accent`.** Don't default to white/cream — extracted accent hues are frequently light-to-medium tones (a coral or a sky blue, not a deep saturated one), and light text on a light-medium accent fails contrast. Look at the actual accent hex's lightness and pick whichever of your ink/cream-equivalent primitives actually contrasts. Same logic for any other fill that will host text or icons directly.

**Default to a dark theme (dark bg, light text) unless the pooled palette clearly reads as light-first.** `color/bg/primary`/`color/bg/surface` → your darkest neutral primitives; `color/text/primary` → your lightest. This is the expected default for these builds — confirm with the user only if the palette is ambiguous or they've asked for something specific.

**Never surface any color or typography output from this skill back on a Tearsheet gallery card;** the card always shows just the 6 raw extracted colors, unrelated to this file.

**Show the HEX value of every color, everywhere a color is documented.** A designer must be able to read the code off the page without opening the variables panel or the eyedropper. Write each as uppercase `#RRGGBB` in the Mono text style, computed from the color you actually applied (convert the resolved RGB to hex in code, never retype it from memory, so the label cannot disagree with the swatch). Do this in four places:
1. **Foundations swatches.** Every swatch label has three lines: token path, natural name, hex (e.g. `color/accent/primary` / `Indigo` / `#573ABF`). A semantic token shows the hex of the primitive it aliases. A primitive's heading includes its hex.
2. **The variables themselves.** Set each variable's `description`: a primitive gets its hex (`#573ABF`); a semantic variable gets its alias and hex (`primitive/indigo · #573ABF`). That way the hex also shows in the variables panel and in Dev Mode.
3. **The References page.** Under each reference image, show that image's six extracted palette colors from its `palette` array: a row of small swatches plus a Mono text line of the hexes, three per line.
4. **The final report** (Step 6) lists the primitive palette as natural name plus hex.

**4b. Typography** — From any image with legible type (UI sources, plus type-specimen-style mood images), describe what you see (serif/sans/mono, weight, tracking, mood). Pick the closest real Figma font per role — up to three roles: Heading, Body, Mono — verifying exact family/style strings with `listAvailableFontsAsync`. Name the resulting text styles to flag the approximation, e.g. `Heading/Serif (approx. Georgia)`. Never imply an exact font match.

**4c. Components** — The goal is a fast, working **baseline** for the designer to iterate on, not a complete component library. **The baseline must be recognizably built from what the sources show.** If the references are chat apps, it has chat components; if they are audio plugins, it has knobs and faders; a generic button/input/toggle set that ignores the subject is a failed build.

1. **Inventory from the selection.** The selection's `description`, `tags`, and `category` already say what each UI source contains; use them to list the specific UI patterns by their real names (for example chat bubble, message input bar, conversation row, avatar, rotary knob, vertical fader, level meter, payment card, metric tile, settings row, nav bar). Only view an image with the Read tool if its description doesn't make the patterns clear. Do not write the inventory out at length.
2. **One working component per pattern.** Pick the **most prominent and distinctive patterns first** (domain patterns before generic ones). Build **up to 8**. Fill with a generic essential (button, input) only if the sources actually show one and there is room. If the inventory is longer, build the top 8 and name what you left out in the report.
3. **Keep each component simple.** A single real Figma component (auto layout, fills and strokes bound to the color variables, text on the text styles, realistic content). Add a second variant **only when the pattern is defined by exactly two states** (a toggle on/off, a tab active/inactive, a bubble incoming/outgoing). Do **not** build hover, pressed, or disabled matrices, size variants, or component sets for completeness; the designer will add those.

If there are no UI sources (all mood or palette references), build no components, as described in Step 2.

Add a semantic status token (`color/status/success`, `warning`, or `danger`, aliasing a primitive from the palette) **only if a component you build uses it.**

## Step 5 — Build the file

**Speed is the priority: a working baseline in a few minutes.** Do not deliberate over choices; pick and build. Load the `figma-use` skill (or the Figma MCP's `get_figma_skill` tool if the skill isn't available) for the Plugin API conventions. Then build with **a few large `use_figma` calls** (about five in total). Never screenshot per component. In an interactive session, state the plan in one line and proceed without asking permission.

**Layout rules for every page you build.** These exist because earlier builds produced swatch rows collapsed to 10px tall, with the swatches and their labels clipped out of sight.
- **Never use `layoutWrap = "WRAP"`.** A wrapped auto-layout frame keeps its old height through the plugin API, so wrapped rows spill out of it and get clipped. For any grid (swatches, components), split the items into rows of at most 6 and stack the rows in a vertical auto-layout frame.
- **Set `clipsContent = false`** on every container frame on the Foundations, References, and Components pages.
- **Stack sections with auto-layout** (a vertical frame with a gap), never by hand-computing y positions, so a section cannot land on top of the next one.
- Set `layoutSizingHorizontal` and `layoutSizingVertical` (HUG or FIXED) **after** appending children. A frame made with `createAutoLayout()` starts with a white fill, so set `fills = []` unless it needs one.
- **Overflow check.** After building each page, run this in a `use_figma` call and fix every entry it returns (resize the parent or re-lay-out the children):

```js
const bad = [];
(function walk(n) {
  if (!("children" in n)) return;
  for (const c of n.children) {
    if ((n.type === "FRAME" || n.type === "COMPONENT") && (c.x < -1 || c.y < -1 || c.x + c.width > n.width + 1 || c.y + c.height > n.height + 1)) bad.push(`${n.name} > ${c.name}`);
    walk(c);
  }
})(figma.currentPage);
return bad;
```

1. **Foundations call.** Create the pages (Cover, Foundations, References, Components) and set every page background to `color/bg/primary`. Create the primitive variables, the semantic variables (aliased, with explicit scopes, never `ALL_SCOPES`), and the three text styles. Build the Foundations page: a primitive swatch row and a semantic swatch row (each swatch labeled with token path, natural name, and hex), and the type specimens. Return any node IDs you need later.
2. **References call.** One rectangle plus caption per selected image, stating what it contributed (palette, typography, which component), and under each one its six extracted palette colors as small swatches with their hex values (see "Show the HEX value of every color"). Then upload the real images into those rectangles (the headless instructions above say how; interactively, use `upload_assets`).
3. **Components call(s).** Build all the components in one `use_figma` call, or two if the code would be very long. Load every font first. Place the components in a labeled grid on the Components page, a short label above each.
4. **Final check.** Run the overflow check on all three pages in a single call, then take one `get_screenshot` per page with `enableBase64Response: true` (a headless run cannot download the default link, so without that flag you never see the page). Look at each image and fix anything visibly broken (clipped or empty swatches, overlapping layers, unreadable text, empty image fills) in a single follow-up call. Never report the build as checked if you did not actually see the screenshots.

Text placed on a page or inside a component always uses one of the text styles, never the default font. Never surface a real brand or product name anywhere in the file.

**If the user asks for more** (variants and states, light/dark modes, every component in the sources), do it, but say that it makes the build much longer.

## Step 6 — Report results

Give the user: the new Figma file URL, the primitive color palette as natural name plus hex, a short breakdown of which source image contributed which tokens/components, which UI patterns were built vs. left out, and an explicit note that typography and component shapes are Claude's closest approximation of the references, not exact extraction.

## Notes

- `path` values in the selection file are absolute — use them as-is.
- If an image path no longer exists, mention it and skip it rather than failing the whole run.
- This skill uses **direct Figma API calls** (via `use_figma`), not secondary skills like `figma-generate-library`. Keep calls few and large, and take screenshots only at the end.
