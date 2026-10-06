// Builds a Figma starter kit by running Claude Code headless (`claude -p`) with
// the Figma MCP allowed. Uses the user's existing Claude login: no API key.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");
const SKILL_FILE = path.join(ROOT, "skills", "tearsheet-to-figma", "SKILL.md");

const FIGMA_MCP = "figma";
const TIMEOUT_MS = 15 * 60 * 1000;
const FIGMA_URL = /https:\/\/www\.figma\.com\/(?:design|file)\/[A-Za-z0-9]+[^\s)>"'\\\]]*/g;

const STEP_LABELS = {
  whoami: "Connecting to Figma",
  create_new_file: "Creating the file",
  upload_assets: "Uploading references",
  use_figma: "Building tokens and components",
  get_screenshot: "Checking the result",
};

const SETUP_HINT =
  `Figma isn't connected to Claude Code yet. Run \`npm run setup -- --figma\`, then run \`claude\` once, ` +
  `type /mcp, and sign in to "${FIGMA_MCP}".`;
const SIGN_IN_HINT = `Figma needs a one-time sign-in. Run \`claude\` in Terminal, type /mcp, choose "${FIGMA_MCP}", and approve access in the browser. Then try again.`;

function findClaude() {
  const candidates = [
    ...(process.env.PATH || "").split(path.delimiter).map((d) => path.join(d, "claude")),
    path.join(os.homedir(), ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  return candidates.find((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function buildPrompt(images, figmaUrl) {
  const skill = fs.readFileSync(SKILL_FILE, "utf8").replace(/^---[\s\S]*?---\s*/, "");
  const selection = images.map((img) => ({
    id: img.id,
    path: path.join(IMAGES_DIR, img.mediaType === "video" && img.thumbnail ? img.thumbnail : img.filename),
    title: img.title,
    subtitle: img.subtitle,
    category: img.category,
    tags: img.tags,
    description: img.description,
    palette: img.palette,
  }));

  return `This is a headless, non-interactive run started from the Tearsheet web app. Nobody can answer questions, so never ask any; make the reasonable choice and keep going.

Overrides to the workflow below:
- The user's selection is provided here. Skip the Preamble and Step 1, and do not read or write any file in ~/.claude.
- Step 3: call whoami; if there are several plans, use the first. Use the default file name.${
    figmaUrl
      ? `\n- The user wants the kit built in this existing Figma file instead of a new one: ${figmaUrl}. Skip create_new_file and use its file key.`
      : ""
  }
- If the figma-use or figma-generate-library skills aren't available, call the Figma MCP's get_figma_skill tool (if it exists) to load its conventions.
- Reference images must be the real files, not placeholders. upload_assets returns single-use upload URLs and does not read local files, so: (1) in your build script, create one rectangle per reference on the References page and return its node ID; (2) call upload_assets once with count = number of references and nodeIds = those IDs, in order; (3) for each returned upload URL, send the bytes with exactly this shell command, using the file's path from the selection and its MIME type (image/png, image/jpeg, image/webp, or image/gif): curl -sS -X POST -H "Content-Type: <mime>" --data-binary @<path> <uploadUrl>. Only run curl against upload URLs returned by upload_assets. If an upload fails, keep that rectangle as a captioned placeholder and continue.
- Your last message must contain the final Figma file URL on its own line.

Selection:
${JSON.stringify({ images: selection }, null, 2)}

Workflow:

${skill}`;
}

function stepFromEvent(event) {
  if (event.type !== "assistant" || !Array.isArray(event.message?.content)) return null;
  const tool = event.message.content.filter((b) => b.type === "tool_use").pop();
  if (!tool) return null;
  const name = tool.name.split("__").pop();
  return STEP_LABELS[name] || "Working";
}

function runFigmaBuild(images, figmaUrl, job) {
  const fail = (error) => {
    job.status = "error";
    job.error = error;
  };

  if (process.env.CLAUDECODE) {
    return fail("Tearsheet was started inside Claude Code, which can't launch another Claude session. Start it with Tearsheet.app or `npm start` in Terminal.");
  }

  const claude = findClaude();
  if (!claude) {
    return fail("Claude Code isn't installed. Install it from https://claude.com/claude-code, then try again.");
  }

  const child = spawn(
    claude,
    [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--permission-mode", "dontAsk",
      "--allowedTools", `mcp__${FIGMA_MCP}`, "mcp__claude_ai_Figma", "Read", "Bash(curl -sS -X POST:*)",
    ],
    { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] }
  );

  let finalText = "";
  let sawFigmaUrl = null;
  let stderr = "";
  let buffer = "";
  const timer = setTimeout(() => {
    fail("Timed out after 15 minutes.");
    child.kill("SIGTERM");
  }, TIMEOUT_MS);

  function handleLine(line) {
    if (!line.trim()) return;
    const urls = line.match(FIGMA_URL);
    if (urls) sawFigmaUrl = urls[urls.length - 1];

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    if (event.type === "system" && event.subtype === "init") {
      // Remote servers can still be "pending" at init, so only a clear failure is fatal.
      const figmas = (event.mcp_servers || []).filter((s) => /figma/i.test(s.name));
      const usable = figmas.some((s) => s.status === "connected" || s.status === "pending");
      if (!usable) {
        const seen = (event.mcp_servers || []).map((s) => `${s.name}: ${s.status}`).join(", ") || "none";
        fail(`${figmas.length ? SIGN_IN_HINT : SETUP_HINT} (Claude saw: ${seen})`);
        child.kill("SIGTERM");
      }
      return;
    }

    const step = stepFromEvent(event);
    if (step) job.step = step;

    if (event.type === "result") finalText = event.result || "";
  }

  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    lines.forEach(handleLine);
  });
  child.stderr.on("data", (chunk) => (stderr += chunk));

  child.on("error", (err) => {
    clearTimeout(timer);
    fail(`Couldn't start Claude Code: ${err.message}`);
  });

  child.on("close", () => {
    clearTimeout(timer);
    handleLine(buffer);
    if (job.status === "error") return;

    const urls = finalText.match(FIGMA_URL);
    const url = (urls && urls[urls.length - 1]) || sawFigmaUrl || figmaUrl;
    if (url) {
      job.status = "done";
      job.figmaUrl = url;
    } else {
      fail(finalText.trim().slice(0, 400) || stderr.trim().slice(0, 400) || "Claude finished without creating a Figma file.");
    }
  });

  child.stdin.on("error", () => {});
  child.stdin.end(buildPrompt(images, figmaUrl));
}

module.exports = { runFigmaBuild, FIGMA_MCP, SETUP_HINT };
