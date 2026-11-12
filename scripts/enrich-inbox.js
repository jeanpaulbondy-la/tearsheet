// Stage two of inbox processing: Claude Code (headless) looks at each gallery entry
// flagged `needsReview` and writes its real title, subtitle, category, tags, and
// description, then the file is renamed to match. Items stay usable as placeholders
// if Claude is unavailable, and are retried on the next startup or inbox check.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { findClaude, blockedReason, LOGIN_HINT, AUTH_ERROR } = require("./claude-cli");

const ROOT = path.join(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");
const GALLERY_FILE = path.join(ROOT, "data", "gallery.json");

const BATCH_SIZE = 8;
const TIMEOUT_MS = 10 * 60 * 1000;

const state = { running: false, error: null };

const readGallery = () => JSON.parse(fs.readFileSync(GALLERY_FILE, "utf8"));
const writeGallery = (g) => fs.writeFileSync(GALLERY_FILE, JSON.stringify(g, null, 2));
const pendingItems = (g) => g.filter((e) => e.needsReview);

function getStatus() {
  return { enriching: state.running, pending: pendingItems(readGallery()).length, error: state.error };
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
}

function buildPrompt(batch, categories) {
  const items = batch.map((e) => ({
    id: e.id,
    path: path.join(IMAGES_DIR, e.thumbnail || e.filename),
    ...(e.mediaType === "video" && { note: "A video; the path is one representative frame." }),
  }));

  return `You are cataloging design references for a personal visual gallery. This is a headless run: never ask questions.

View each image below with the Read tool, then describe it. Reply with ONLY a JSON array, one object per item, in this exact shape and nothing else:

[{"id":"<id from the list>","title":"...","subtitle":"...","category":"...","tags":["...","..."],"description":"..."}]

Field rules:
- title: 2 to 4 words. Use the product or site name if one is visible, otherwise a plain descriptive name.
- subtitle: lowercase, terse, a style descriptor (e.g. "warm editorial x print DNA").
- category: reuse one of these existing categories if the item fits; otherwise coin a short new one in Title Case: ${JSON.stringify(categories)}
- tags: 3 to 6 short lowercase phrases for distinct visual elements (layout, texture, color, typography, imagery), e.g. "halftone CMYK dot texture", "mono coordinate labels".
- description: one or two sentences on what it shows and why it is useful as a reference. For a video, mention that it is a motion reference.

Items:
${JSON.stringify(items, null, 2)}`;
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      findClaude(),
      [
        "-p",
        "--output-format", "json",
        "--no-session-persistence",
        "--permission-mode", "dontAsk",
        "--setting-sources", "project,local",
        // Describing images needs no connectors at all, so load none.
        "--strict-mcp-config", "--mcp-config", JSON.stringify({ mcpServers: {} }),
        "--allowedTools", "Read",
      ],
      { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] }
    );

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Timed out while describing new items."));
    }, TIMEOUT_MS);

    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", () => {
      clearTimeout(timer);
      let result;
      try {
        result = JSON.parse(out);
      } catch {
        return reject(new Error(err.trim().slice(0, 300) || "Claude returned no readable output."));
      }
      if (result.is_error || typeof result.result !== "string") {
        return reject(new Error(String(result.result || err).slice(0, 300)));
      }
      resolve(result.result);
    });

    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

function parseResults(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  const parsed = JSON.parse(body);
  if (!Array.isArray(parsed)) throw new Error("Claude's reply wasn't a list.");
  return parsed;
}

const isText = (v) => typeof v === "string" && v.trim().length > 0;

// Writes Claude's answers into the gallery, re-reading it first so nothing added meanwhile is lost.
function applyResults(results) {
  const gallery = readGallery();
  const categories = new Map(gallery.map((e) => [e.category.toLowerCase(), e.category]));
  let applied = 0;

  for (const r of results) {
    const entry = gallery.find((e) => e.id === r?.id && e.needsReview);
    if (!entry || !isText(r.title) || !isText(r.description)) continue;

    entry.title = r.title.trim();
    entry.subtitle = isText(r.subtitle) ? r.subtitle.trim().toLowerCase() : "";
    entry.category = isText(r.category) ? categories.get(r.category.trim().toLowerCase()) || r.category.trim() : entry.category;
    entry.tags = Array.isArray(r.tags) ? r.tags.filter(isText).map((t) => t.trim().toLowerCase()).slice(0, 6) : [];
    entry.description = r.description.trim();
    delete entry.needsReview;

    renameToMatchTitle(entry, gallery);
    applied++;
  }

  if (applied > 0) writeGallery(gallery);
  return applied;
}

function renameToMatchTitle(entry, gallery) {
  const ext = path.extname(entry.filename);
  const base = slugify(entry.title) || entry.id;
  const others = new Set(gallery.filter((e) => e !== entry).map((e) => e.id));

  let slug = base;
  for (let n = 2; slug !== entry.id && (others.has(slug) || fs.existsSync(path.join(IMAGES_DIR, slug + ext))); n++) {
    slug = `${base}-${n}`;
  }
  if (slug === entry.id) return;

  try {
    fs.renameSync(path.join(IMAGES_DIR, entry.filename), path.join(IMAGES_DIR, slug + ext));
    if (entry.thumbnail) {
      fs.renameSync(path.join(IMAGES_DIR, entry.thumbnail), path.join(IMAGES_DIR, `${slug}-thumb.jpg`));
      entry.thumbnail = `${slug}-thumb.jpg`;
    }
    entry.id = slug;
    entry.filename = slug + ext;
  } catch {
    // A failed rename is cosmetic; the entry keeps working under its old filename.
  }
}

let rerun = false;

// Starts describing any flagged items in the background. Safe to call repeatedly.
async function enrichPending() {
  if (state.running) {
    rerun = true;
    return;
  }

  const blocked = blockedReason();
  if (blocked) {
    state.error = blocked;
    return;
  }

  state.running = true;
  state.error = null;
  const attempted = new Set();

  try {
    do {
      rerun = false;
      for (;;) {
        const gallery = readGallery();
        const batch = pendingItems(gallery)
          .filter((e) => !attempted.has(e.id))
          .slice(0, BATCH_SIZE);
        if (batch.length === 0) break;

        batch.forEach((e) => attempted.add(e.id));
        const categories = [...new Set(gallery.filter((e) => !e.needsReview).map((e) => e.category))];
        const results = parseResults(await runClaude(buildPrompt(batch, categories)));
        if (applyResults(results) === 0) throw new Error("Claude's descriptions couldn't be matched to the new items.");
      }
    } while (rerun);
  } catch (err) {
    state.error = AUTH_ERROR.test(err.message) ? LOGIN_HINT : err.message;
    console.error(`[inbox] Couldn't describe new items: ${state.error}`);
  } finally {
    state.running = false;
  }
}

module.exports = { enrichPending, getStatus };
