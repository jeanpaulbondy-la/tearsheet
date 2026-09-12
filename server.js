const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4560;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const ROOT = __dirname;
const IMAGES_DIR = path.join(ROOT, "images");
const GALLERY_JSON = path.join(ROOT, "data", "gallery.json");

if (!fs.existsSync(GALLERY_JSON)) {
  fs.mkdirSync(path.dirname(GALLERY_JSON), { recursive: true });
  fs.writeFileSync(GALLERY_JSON, "[]\n");
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(ROOT, "public")));
app.use("/images", express.static(IMAGES_DIR));
app.use("/data", express.static(path.join(ROOT, "data")));

app.post("/api/selection", async (req, res) => {
  const images = Array.isArray(req.body.images) ? req.body.images : [];
  const figmaUrl = req.body.figmaUrl || null;

  if (images.length === 0) {
    return res.status(400).json({ error: "No images provided" });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured. Add it to .env file." });
  }

  try {
    // Build the prompt for Claude to create Figma file
    const imageDescriptions = images
      .map((img) => `- ${img.title} (${img.category}): ${img.description || "No description"}\n  Palette: ${img.palette?.join(", ") || "N/A"}`)
      .join("\n");

    const prompt = `You are a Figma design automation expert. Build a Figma starter kit from these reference images:

${imageDescriptions}

Create a new Figma file with:
1. Color tokens (primitives + semantics) extracted from the palettes
2. Typography styles (Heading, Body, Mono) inferred from the images
3. A References page showing all images with captions
4. A Components page with 3-5 UI components (if any images are UI sources)
5. A Foundations page documenting colors and type

Use the figma-use skill to build the file. Make ONE comprehensive use_figma() call with all operations inline (no multiple calls, no validation loops).

The Figma file should be created in the user's default team/org.

Return the Figma file URL when complete.`;

    // Call Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-5",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Claude API error:", error);
      return res.status(500).json({ error: "Failed to build Figma file", details: error });
    }

    const data = await response.json();
    const figmaFileUrl = extractFigmaUrl(data.content[0].text);

    if (!figmaFileUrl) {
      return res.status(500).json({ error: "Could not extract Figma file URL from response" });
    }

    res.json({
      ok: true,
      figmaUrl: figmaFileUrl,
      message: "Figma file created successfully!",
    });
  } catch (error) {
    console.error("Error creating Figma file:", error);
    res.status(500).json({ error: "Failed to create Figma file", details: error.message });
  }
});

// Extract Figma URL from Claude response
function extractFigmaUrl(text) {
  const urlMatch = text.match(/https:\/\/www\.figma\.com\/design\/[^\s)]+/);
  return urlMatch ? urlMatch[0] : null;
}

app.listen(PORT, () => {
  console.log(`Tearsheet running at http://localhost:${PORT}`);
  if (!ANTHROPIC_API_KEY) {
    console.warn("\n⚠️  WARNING: ANTHROPIC_API_KEY not set.");
    console.warn("Add it to .env file to enable Figma file creation.\n");
  }
});
