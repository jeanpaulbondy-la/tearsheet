---
name: tearsheet-to-figma
description: Turn the user's saved Tearsheet selection into a new Figma starter kit — color variables, approximate typography styles, and (if any selected image looks like real UI) a full set of token-bound component families with their state variants. Automatically checks for a saved selection from the Tearsheet app, or guides the user to create one. Use when the user says things like "turn my tearsheet selection into a figma file", "build a figma starter kit from my references", or "/tearsheet-to-figma".
---

# Tearsheet → Figma Starter Kit

Builds a new Figma file from the images the user selected in Tearsheet: real extracted colors as variables, an approximate type ramp, and — only where the source images actually show UI — a set of component families with state variants.

This skill is designed for the hybrid workflow: the user selects images in the Tearsheet web app (http://localhost:4560), saves their selection, then manually runs this skill in Claude Code. The skill automatically checks for a saved selection and offers to use it; if none exists, it guides you to Tearsheet first.

This is heavier than `/use-tearsheet`: it needs Figma auth and makes a dozen or so tool calls. Default scope is a **complete starter kit**: color and type foundations, the real reference images, and up to 10 component families, each with its states and kinds as variants. It is not a full production design system (no light/dark modes or accessibility audit) unless the user explicitly asks.

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

**Tints are opacity variants, not mixed-toward-white/black hexes.** Earlier versions of this skill generated a 50–900 lighten/darken ramp per color as separate bindable variables — don't do that. Instead, "Coral at 60%" is literally `primitive/coral` rendered at 60% opacity, the same way `text-white/60` works in Tailwind. This is simpler and reads better to designers, but it comes with one hard Figma constraint, discovered by testing this exact thing:

> **Figma silently resets a paint's `opacity` to `1` if that paint's `color` is bound to a variable.** Confirmed by setting `opacity: 0.3` on a variable-bound paint, then re-querying the node fresh — it read back `1`, not `0.3`, even though the immediate in-script readback misleadingly showed `0.3`. Always re-query a node in a *separate* script after any opacity-sensitive change before trusting it — the same script that made the change can report stale/optimistic state.

Practical consequence — two different mechanisms for two different needs:
- **A token that must stay a real, reusable, bindable variable** (e.g. `color/accent/primary` itself) → bind its color to the primitive, full opacity, no dimming. This is what most semantic tokens should be.
- **A "dimmed" role** (secondary text, a subtle border, a hover state) → do **not** try to make this a bindable semantic variable at all. Apply it directly at each point of use as an **unbound** flat paint: `{ type: "SOLID", color: <primitive's plain RGB, no binding>, opacity: <0.15–0.9> }`. Document the recipe (e.g. "text/secondary = cream primitive, 70% opacity") in your build notes and the Foundations page — see below — but don't create a Figma variable for it, since it can't hold real opacity anyway.
- If you do bind a color to a paint and *also* need custom opacity on that same paint, set `paint.opacity` **after** calling `setBoundVariableForPaint`, on the object it returns — setting it before gets silently discarded by that call.

Propose a semantic layer for the roles that map to a stable single hue: `color/bg/primary`, `color/bg/surface`, `color/text/primary`, `color/accent/primary`, `color/accent/secondary` (only if the palette clearly supports two distinct accent hues) — these bind directly to a primitive, one role one hue, no dimming involved. Don't invent a semantic variable for roles that are actually "primitive + opacity" recipes (`text/secondary`, `accent/primary-hover`, `border/default`) — document those as recipes instead, per above.

**Check contrast before deciding `color/text/on-accent`.** Don't default to white/cream — extracted accent hues are frequently light-to-medium tones (a coral or a sky blue, not a deep saturated one), and light text on a light-medium accent fails contrast. Look at the actual accent hex's lightness and pick whichever of your ink/cream-equivalent primitives actually contrasts. Same logic for any other fill that will host text or icons directly.

**Default to a dark theme (dark bg, light text) unless the pooled palette clearly reads as light-first.** `color/bg/primary`/`color/bg/surface` → your darkest neutral primitives; `color/text/primary` → your lightest. This is the expected default for these builds — confirm with the user only if the palette is ambiguous or they've asked for something specific.

**Tints/opacity recipes are internal build material only** — they exist to give components more to work with. Never surface them (or any color/typography output from this skill) back on a Tearsheet gallery card; the card always shows just the 6 raw extracted colors, unrelated to this file.

**On the Foundations page** (Step 5), document color two ways: (1) the semantic swatch row — one swatch per semantic token, bound, labeled with **both** its token path and natural name, e.g. `color/accent/primary` / `Coral` (the path alone forces anyone reading the file to go look it up); (2) per-primitive opacity documentation — for each primitive, one large 100%-opacity bound swatch, and a row of smaller unbound swatches underneath at fixed opacity steps (e.g. 90/75/60/45/30/15%), each labeled with its percentage. This is what actually proves the tint mechanism works, since the mechanism itself can't be inspected by looking at the variables panel (there's nothing to bind).

**4b. Typography** — From any image with legible type (UI sources, plus type-specimen-style mood images), describe what you see (serif/sans/mono, weight, tracking, mood). Pick the closest real Figma font per role — up to three roles: Heading, Body, Mono — verifying exact family/style strings with `listAvailableFontsAsync`. Name the resulting text styles to flag the approximation, e.g. `Heading/Serif (approx. Georgia)`. Never imply an exact font match.

**4c. Components** — Build a real starter kit, not a sampler. From the UI-source images, identify the element types they actually show, then build up to **10 component families**. Prefer what the sources show (button, input, toggle, card, badge, nav or tab bar, list row, avatar, alert or toast, progress or chart tile, checkbox or radio, segmented control). If at least one source is UI and the sources show fewer than 8 families, fill out the set with the essentials any UI needs: button, input, toggle, checkbox, badge, alert, card, tab. If they show more than 10, pick the 10 most representative and name what got left out.

**Every family is a component set with variants, not a single component.** Cover the states and kinds that family really has:
- Button: Type (primary, secondary, ghost, destructive) × State (default, hover, pressed, disabled)
- Input: State (default, focused, filled, error, disabled)
- Toggle: Value (off, on) × State (default, disabled)
- Checkbox and radio: Value (unchecked, checked) × State (default, disabled)
- Badge: Kind (neutral, accent, success, warning, danger)
- Alert or toast: Kind (info, success, warning, danger)
- Card: State (default, hover, selected, disabled)
- Tab or nav item: State (inactive, active, disabled)
- Anything else: its natural states (default, hover, pressed, selected, disabled, error)

Use real Figma variant properties (`combineAsVariants`) named `State`, `Type`, `Kind`, `Value`, so each is switchable in the properties panel.

**Status and state colors.** Add semantic tokens `color/status/success`, `color/status/warning`, `color/status/danger`, `color/status/info`, and `color/text/on-status`, each aliasing a primitive. Use the palette's own hues where one fits (a red-leaning coral for danger, a green-leaning teal for success); where none does, add a muted primitive tuned to the palette's saturation and lightness so it doesn't clash. Name each one naturally. State colors follow the opacity constraint above: hover is the accent RGB lightened about 8% and pressed is darkened about 12%, both as unbound flat fills documented on the Foundations page; disabled is the component's layer `opacity` set to 0.4 (layer opacity is safe, unlike paint opacity on a bound paint); focused is a 2px outline stroke in `color/accent/primary`; error is a stroke in `color/status/danger`.

## Step 5 — Build the file

Load the `figma-use` skill (or the Figma MCP's `get_figma_skill` tool if the skill isn't available) for the Plugin API conventions. Then build with a handful of large `use_figma` calls: not dozens of tiny ones, and not one giant one. Never screenshot per component. In an interactive session, state the plan in one line and proceed without asking permission.

1. **Foundations call.** Create the pages (Cover, Foundations, References, Components) and bind every page background to `color/bg/primary`. Create the primitive variables, the semantic variables (aliased, with explicit scopes, never `ALL_SCOPES`), and the three text styles. Build the Foundations page: a semantic swatch row (each labeled with token path and natural name), per-primitive opacity rows, the type specimens, and the state and status color notes. Return any node IDs you need later.
2. **References call.** One rectangle plus caption per selected image, stating what it contributed (palette, typography, which component). Then upload the real images into those rectangles (the headless instructions above say how; interactively, use `upload_assets`).
3. **Component calls.** One `use_figma` call per component family (two families per call only if both are tiny). In each: load every font first; build the base component with auto layout and token-bound fills, strokes, and text styles; create one variant per state or kind; `combineAsVariants`; name the set and its properties; place the set in a labeled grid on the Components page with a section label above it. Check each call's returned node IDs instead of taking a screenshot.
4. **Final check.** One `get_screenshot` per page. Fix anything visibly broken (overlapping layers, unreadable text, empty image fills) in a single follow-up call.

Text placed on a page or inside a component always uses one of the text styles, never the default font. Never surface a real brand or product name anywhere in the file.

**If the user asks for more** (dark/light modes, a full accessibility audit, every component in the sources), do it, but say that it makes the build much longer.

## Step 6 — Report results

Give the user: the new Figma file URL, a short breakdown of which source image contributed which tokens/components, which candidate components were built vs. left out and why, and an explicit note that typography and component shapes are Claude's closest approximation of the references, not exact extraction.

## Notes

- `path` values in the selection file are absolute — use them as-is.
- If an image path no longer exists, mention it and skip it rather than failing the whole run.
- This skill uses **direct Figma API calls** (via `use_figma`), not secondary skills like `figma-generate-library`. Keep calls few and large, and take screenshots only at the end.
