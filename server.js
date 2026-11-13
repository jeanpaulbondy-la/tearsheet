const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { processInbox } = require("./scripts/auto-process-inbox");
const { enrichPending, ensureComponents, getStatus: getInboxStatus } = require("./scripts/enrich-inbox");
const { runFigmaBuild } = require("./scripts/figma-build");

const app = express();
const PORT = process.env.PORT || 4560;

const ROOT = __dirname;
const IMAGES_DIR = path.join(ROOT, "images");
const GALLERY_JSON = path.join(ROOT, "data", "gallery.json");
const BUILDS_JSON = path.join(ROOT, "data", "figma-builds.json");
const SELECTION_FILE = path.join(os.homedir(), ".claude", "tearsheet-selection.json");

if (!fs.existsSync(GALLERY_JSON)) {
  fs.mkdirSync(path.dirname(GALLERY_JSON), { recursive: true });
  fs.writeFileSync(GALLERY_JSON, "[]\n");
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(ROOT, "public")));
app.use("/images", express.static(IMAGES_DIR));
app.use("/data", express.static(path.join(ROOT, "data")));

app.post("/api/process-inbox", (req, res) => {
  try {
    const result = processInbox();
    enrichPending();
    res.json({ ok: true, ...result, ...getInboxStatus() });
  } catch (error) {
    console.error("Inbox processing failed:", error);
    res.status(500).json({ error: "Inbox processing failed", details: error.message });
  }
});

app.get("/api/inbox-status", (req, res) => res.json(getInboxStatus()));

// "Save for Claude Code": writes the selection for /use-tearsheet and /tearsheet-to-design.
app.post("/api/selection", (req, res) => {
  const images = Array.isArray(req.body.images) ? req.body.images : [];

  if (images.length === 0) {
    return res.status(400).json({ error: "No images provided" });
  }

  const payload = {
    savedAt: new Date().toISOString(),
    sourceGallery: ROOT,
    images: images.map((item) => ({
      id: item.id,
      path: path.join(IMAGES_DIR, item.filename),
      title: item.title,
      subtitle: item.subtitle,
      category: item.category,
      tags: item.tags,
      description: item.description,
      palette: item.palette,
      components: item.components,
    })),
  };

  fs.mkdirSync(path.dirname(SELECTION_FILE), { recursive: true });
  fs.writeFileSync(SELECTION_FILE, JSON.stringify(payload, null, 2));

  res.json({ ok: true, savedTo: SELECTION_FILE, count: payload.images.length });
});

// "Save for Figma": runs Claude Code headless as a background job. The history is saved to
// disk so the page can pick a build back up after a reload, and finished builds keep their link.
const MAX_BUILDS = 20;

function loadBuilds() {
  try {
    return JSON.parse(fs.readFileSync(BUILDS_JSON, "utf8")).map((b) =>
      b.status === "running"
        ? { ...b, status: "error", finishedAt: Date.now(), error: "Tearsheet restarted during this build. Check your Figma drafts; the file may have been created." }
        : b
    );
  } catch {
    return [];
  }
}

let builds = loadBuilds();

function saveBuilds() {
  builds = builds.slice(0, MAX_BUILDS);
  fs.writeFileSync(BUILDS_JSON, JSON.stringify(builds, null, 2));
}

if (builds.length) saveBuilds();

app.post("/api/figma-build", (req, res) => {
  const images = Array.isArray(req.body.images) ? req.body.images : [];
  if (images.length === 0) {
    return res.status(400).json({ error: "No images provided" });
  }

  const running = builds.find((b) => b.status === "running");
  if (running) {
    return res.status(202).json({ jobId: running.id });
  }

  const job = {
    id: crypto.randomUUID(),
    status: "running",
    step: "Listing components",
    startedAt: Date.now(),
    count: images.length,
    titles: images.map((img) => img.title),
  };
  builds.unshift(job);
  saveBuilds();
  prepareAndRun(images, req.body.figmaUrl || null, job);
  res.status(202).json({ jobId: job.id });
});

// Fills in any missing UI-component inventories first (a cached, one-time step per image), so the
// build itself doesn't spend minutes looking at images and working out what to build.
async function prepareAndRun(images, figmaUrl, job) {
  await ensureComponents(images.map((img) => img.id));
  if (job.status !== "running") return;

  let latest = new Map();
  try {
    latest = new Map(JSON.parse(fs.readFileSync(GALLERY_JSON, "utf8")).map((e) => [e.id, e]));
  } catch {}
  const withInventory = images.map((img) => ({ ...img, components: latest.get(img.id)?.components }));

  job.step = "Starting";
  saveBuilds();
  runFigmaBuild(withInventory, figmaUrl, job, saveBuilds);
}

app.get("/api/figma-builds", (req, res) => res.json(builds));

app.post("/api/figma-build/:id/cancel", (req, res) => {
  const job = builds.find((b) => b.id === req.params.id);
  if (!job) return res.status(404).json({ error: "Unknown build" });
  if (job.status === "running") {
    if (job.cancel) {
      job.cancel();
    } else {
      // Still preparing, so there is no Claude process to stop yet.
      Object.assign(job, { status: "cancelled", finishedAt: Date.now() });
      saveBuilds();
    }
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Tearsheet running at http://localhost:${PORT}`);

  const result = processInbox();
  if (result.processed > 0) {
    console.log(`[inbox] Added ${result.processed} new item(s) to the gallery`);
  }
  enrichPending();
});
