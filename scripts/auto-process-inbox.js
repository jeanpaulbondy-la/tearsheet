#!/usr/bin/env node
// Stage one of inbox processing: move each file into images/, extract its palette
// (and a thumbnail for videos), and add a placeholder gallery entry flagged
// `needsReview`. It is instant and needs no Claude. Stage two (enrich-inbox.js)
// has Claude look at each flagged item and write the real title, tags, and description.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const INBOX_DIR = path.join(ROOT, "inbox");
const IMAGES_DIR = path.join(ROOT, "images");
const GALLERY_FILE = path.join(ROOT, "data", "gallery.json");

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".m4v"];

function runScript(script, args) {
  return execFileSync("node", [path.join("scripts", script), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueSlug(base, ext, takenIds) {
  let slug = base || "reference";
  for (let n = 2; takenIds.has(slug) || fs.existsSync(path.join(IMAGES_DIR, slug + ext)); n++) {
    slug = `${base || "reference"}-${n}`;
  }
  return slug;
}

function processInbox() {
  if (!fs.existsSync(INBOX_DIR)) return { processed: 0, skipped: 0 };

  const files = fs
    .readdirSync(INBOX_DIR)
    .filter((f) => !f.startsWith(".") && [...IMAGE_EXTS, ...VIDEO_EXTS].includes(path.extname(f).toLowerCase()));
  if (files.length === 0) return { processed: 0, skipped: 0 };

  const gallery = fs.existsSync(GALLERY_FILE) ? JSON.parse(fs.readFileSync(GALLERY_FILE, "utf8")) : [];
  const takenIds = new Set(gallery.map((g) => g.id));

  let processed = 0;
  let skipped = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const isVideo = VIDEO_EXTS.includes(ext);
    const slug = uniqueSlug(slugify(path.basename(file, path.extname(file))), ext, takenIds);
    const filename = slug + ext;
    const target = path.join(IMAGES_DIR, filename);

    try {
      fs.renameSync(path.join(INBOX_DIR, file), target);

      let frame = target;
      let thumbnail;
      if (isVideo) {
        thumbnail = `${slug}-thumb.jpg`;
        frame = path.join(IMAGES_DIR, thumbnail);
        runScript("video-thumbnail.js", [target, frame]);
      }

      let palette;
      try {
        const parsed = JSON.parse(runScript("palette.js", [frame]));
        if (Array.isArray(parsed) && parsed.length) palette = parsed;
      } catch {}

      const entry = {
        id: slug,
        filename,
        ...(isVideo && { mediaType: "video", thumbnail }),
        title: path.basename(file, path.extname(file)).slice(0, 60),
        subtitle: "describing…",
        category: "Unsorted",
        tags: [],
        description: "Added from the inbox. Claude is writing the description.",
        ...(palette && { palette }),
        addedAt: new Date().toISOString(),
        needsReview: true,
      };

      gallery.push(entry);
      takenIds.add(slug);
      processed++;
    } catch (err) {
      console.error(`[inbox] Error processing ${file}: ${err.message}`);
      skipped++;
    }
  }

  if (processed > 0) fs.writeFileSync(GALLERY_FILE, JSON.stringify(gallery, null, 2));
  return { processed, skipped };
}

if (require.main === module) {
  const { processed, skipped } = processInbox();
  if (processed > 0) console.log(`[inbox] Processed ${processed} new item(s)`);
  if (skipped > 0) console.error(`[inbox] Skipped ${skipped} item(s) due to errors`);
}

module.exports = { processInbox };
