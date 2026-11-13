// Prompts for the parallel Figma build. One setup worker creates the file, tokens, and a component
// plan; then several workers build the Foundations page, the References page, and batches of
// component families at the same time. Rules are lifted from the tearsheet-to-figma skill so the
// manual /tearsheet-to-figma command and the Tearsheet button stay in step.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");
const SKILL_FILE = path.join(ROOT, "skills", "tearsheet-to-figma", "SKILL.md");

// Copy of the text between two markers in the skill (to the end if `to` is missing).
function slice(md, from, to) {
  const a = md.indexOf(from);
  if (a < 0) return "";
  const b = to ? md.indexOf(to, a + from.length) : -1;
  return md.slice(a, b < 0 ? undefined : b).trim();
}

function skillParts() {
  const md = fs.readFileSync(SKILL_FILE, "utf8");
  return {
    brand: slice(md, "**Never surface a real brand", "## Step 3"),
    colorType: slice(md, "**4a. Color**", "**4c. Components**"),
    domain: slice(md, "**4c. Components**", "**Every family is a component set"),
    variants: slice(md, "**Every family is a component set", "## Step 5"),
    layout: slice(md, "**Layout rules for every page", "1. **Foundations call.**"),
    references: slice(md, "2. **References call.**", "3. **Component calls.**"),
  };
}

const HEADLESS = `This is a headless, non-interactive run started from the Tearsheet web app. Nobody can answer questions, so never ask any; make the reasonable choice and keep going. Do not read or write any file in ~/.claude. Never call a tool that is not needed for your task.`;

const SHARED_FILE = `Other workers are editing this same Figma file at the same time, each on its own page or frame. Touch only what your task names, and never delete, rename, or move anything you did not create. Use await figma.setCurrentPageAsync(page) to switch pages. Look up variables and text styles by name inside your script, for example:
const vars = Object.fromEntries((await figma.variables.getLocalVariablesAsync()).map((v) => [v.name, v]));
const styles = Object.fromEntries((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]));
const bound = (name) => figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", vars[name]);
and apply a style with await node.setTextStyleIdAsync(styles[name].id) after loading its font.`;

const UPLOAD = `Reference images must be the real files, not placeholders. upload_assets returns single-use upload URLs and does not read local files, so: (1) in your build script, create one rectangle per reference and return its node ID; (2) call upload_assets once with count = number of references and nodeIds = those IDs, in order; (3) for each returned upload URL, send the bytes with one Bash call per image, in parallel in a single message. Each call must be exactly this and nothing else, with the file's full absolute path written inline and its MIME type (image/png, image/jpeg, image/webp, or image/gif): curl -sS -X POST -H "Content-Type: <mime>" --data-binary @<absolute path> "<uploadUrl>". The command must start with the word curl. Do not use shell variables, cd, echo, newlines, ; or &&, and do not combine several uploads into one command, or the call is denied. Only run curl against upload URLs returned by upload_assets. If an upload fails, keep that rectangle as a captioned placeholder and continue.`;

const imagePath = (img) => path.join(IMAGES_DIR, img.mediaType === "video" && img.thumbnail ? img.thumbnail : img.filename);

function fullSelection(images) {
  return images.map((img) => ({
    id: img.id,
    path: imagePath(img),
    title: img.title,
    category: img.category,
    tags: img.tags,
    description: img.description,
    palette: img.palette,
    components: img.components,
  }));
}

const briefSelection = (images) =>
  images.map((img) => ({ id: img.id, title: img.title, category: img.category, tags: img.tags, description: img.description, palette: img.palette }));

function setupPrompt(images, figmaUrl) {
  const p = skillParts();
  return `${HEADLESS}

You are the setup worker of a parallel build. Other workers will build the Foundations page, the References page, and the component families, all at once, using what you create here. Be fast and compact. Do your job in exactly this order:

1. Call whoami; if there are several plans, use the first. ${
    figmaUrl
      ? `Do not create a file: use the existing one at ${figmaUrl} and its file key.`
      : `Call create_new_file (editorType "design") with a short name derived from the shared theme of the selection.`
  }
2. Make ONE use_figma call that does all of this, then returns the JSON described below:
   - Create the pages Cover, Foundations, References, Components (rename the starting page to Cover). Set each page's backgrounds to a flat SOLID color equal to the resolved color of color/bg/primary (a page background cannot be bound to a variable).
   - Create the color variables (primitive/<natural-name> for each deduped palette color, plus the semantic and status tokens), aliased, with explicit scopes, and each variable's description holding its hex as the skill says.
   - Load the fonts and create exactly three text styles: Heading, Body, Mono (named as the skill says, with an "approx." note).
   - On the Components page, create one vertical auto-layout frame named "Components" (itemSpacing 96, padding 80, fills = [], clipsContent = false, layoutSizingHorizontal "HUG", layoutSizingVertical "HUG") containing one text node "Components" in the Heading style. Component workers will append their sections to it.
   Return { containerId, pages: { cover, foundations, references, components } (node ids), variables: [{ name, hex, description }], textStyles: [{ name, family, style, size }] }.
3. Plan the component families (Step 4c below) and finish. Do not build any component yourself.

Your final message must contain one single line, starting with TEARSHEET_PLAN and a space, followed by compact JSON on that same line and nothing after it:
TEARSHEET_PLAN {"fileKey":"...","fileUrl":"https://www.figma.com/design/<fileKey>","containerId":"...","pages":{"cover":"..","foundations":"..","references":"..","components":".."},"variables":[{"name":"color/bg/primary","hex":"#RRGGBB","description":"..."}],"textStyles":[{"name":"...","family":"...","style":"...","size":16}],"families":[{"name":"Rotary Knob","source":"<image id>","summary":"one sentence on what it looks like and where it is used","variants":"State: default, hover, pressed, disabled; Size: small, large","weight":2}]}
"weight" is 1 for a small family (badge, toggle), 2 for a medium one (button, input, card), 3 for a large or composite one (a panel, a hero, a navigation bar). List the families most important first.

Each image's "components" array is its precomputed UI-component inventory, most prominent first; an empty array means it is not a UI source. Do NOT view images.

${p.brand}

${p.colorType}

${p.domain}

${p.variants}

Selection:
${JSON.stringify({ images: fullSelection(images) }, null, 2)}`;
}

function foundationsPrompt(plan, images) {
  const p = skillParts();
  return `${HEADLESS}

You build the Foundations page and the Cover page of the Figma file ${plan.fileKey}. The pages, color variables, and text styles already exist (a setup worker made them). Do not recreate them. ${SHARED_FILE}

Page ids: ${JSON.stringify(plan.pages)}
Color variables (name, hex, description): ${JSON.stringify(plan.variables)}
Text styles: ${JSON.stringify(plan.textStyles)}

Tasks, in at most two use_figma calls:
1. Foundations page: the semantic swatch row (each swatch bound to its variable, labeled with token path, natural name and hex), the per-primitive rows (one large bound swatch with its hex, and a row of smaller unbound swatches at 90/75/60/45/30/15 percent, each labeled with its percentage), the type specimens for the three text styles, and short state and status color notes. Compute every hex label from the real color. Put the overflow check at the end of the call.
2. Cover page: a title for the file, a one-line subtitle, and a strip of the primitive colors, using the text styles.
Then call get_screenshot on the Foundations page with enableBase64Response: true, look at it, and fix anything visibly broken (clipped or empty swatches, overlaps) in at most one more call. Finish with the single word DONE.

${p.brand}

${p.layout}

${p.colorType}

Selection (for context only):
${JSON.stringify({ images: briefSelection(images) }, null, 2)}`;
}

function referencesPrompt(plan, images) {
  const p = skillParts();
  return `${HEADLESS}

You build the References page of the Figma file ${plan.fileKey}. The pages, color variables, and text styles already exist (a setup worker made them). Do not recreate them. ${SHARED_FILE}

References page id: ${plan.pages.references}
Text styles: ${JSON.stringify(plan.textStyles)}
Color variables (name, hex): ${JSON.stringify(plan.variables.map((v) => ({ name: v.name, hex: v.hex })))}

${p.references}

${UPLOAD}

Finish with the single word DONE.

${p.brand}

${p.layout}

Selection:
${JSON.stringify({ images: fullSelection(images) }, null, 2)}`;
}

function componentsPrompt(plan, families, images) {
  const p = skillParts();
  return `${HEADLESS}

You build ${families.length} component families in the Figma file ${plan.fileKey}. The pages, color variables, and text styles already exist (a setup worker made them), and other workers are building the other families at the same time. Do not recreate shared things. ${SHARED_FILE}

Container frame to append to: ${plan.containerId} (the vertical auto-layout frame "Components" on the Components page; fetch it with await figma.getNodeByIdAsync).
Color variables (name, hex): ${JSON.stringify(plan.variables.map((v) => ({ name: v.name, hex: v.hex })))}
Text styles: ${JSON.stringify(plan.textStyles)}

Your families:
${JSON.stringify(families, null, 2)}

For each family make one use_figma call (two together only if both are tiny). In each call: load every font first; build the base component with auto layout and token-bound fills, strokes and text styles; create one variant per listed state or kind; combineAsVariants; name the set and its properties; put a small label text (Body style) above the set inside a vertical auto-layout "section" frame named after the family (fills = [], clipsContent = false, itemSpacing 16), and append that section to the container. Run the overflow check on your own section at the end of the call and return its result with the node IDs. Fix anything it reports in the next call. Do not take screenshots. Do not view images. Finish with the single word DONE.

Build each family so it looks like the thing its summary describes, in the palette of the variables. Keep scripts compact: build one variant with a function and loop over the states instead of writing each variant out by hand.

${p.brand}

${p.variants}

${p.layout}

Selection (for context only):
${JSON.stringify({ images: briefSelection(images) }, null, 2)}`;
}

// Splits the planned families into balanced batches (heavier families first, each into the
// lightest batch so far) while keeping the plan's importance order inside each batch.
function planBatches(families, maxWorkers) {
  const list = families.filter((f) => f && typeof f.name === "string" && f.name.trim());
  if (list.length === 0) return [];
  const count = Math.max(1, Math.min(maxWorkers, Math.ceil(list.length / 2)));
  const batches = Array.from({ length: count }, () => ({ load: 0, items: [] }));
  list
    .map((f, i) => ({ f, i, w: Math.min(3, Math.max(1, Number(f.weight) || 2)) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .forEach(({ f, i, w }) => {
      const lightest = batches.reduce((m, b) => (b.load < m.load ? b : m), batches[0]);
      lightest.items.push({ f, i });
      lightest.load += w;
    });
  return batches.map((b) => b.items.sort((x, y) => x.i - y.i).map((x) => x.f));
}

module.exports = { setupPrompt, foundationsPrompt, referencesPrompt, componentsPrompt, planBatches };
