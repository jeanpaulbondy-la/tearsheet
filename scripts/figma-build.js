// Builds a Figma starter kit by running Claude Code headless (`claude -p`) with
// the Figma MCP allowed. Uses the user's existing Claude login: no API key.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { findClaude, blockedReason, LOGIN_HINT, AUTH_ERROR } = require("./claude-cli");

const ROOT = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");
const SKILL_FILE = path.join(ROOT, "skills", "tearsheet-to-figma", "SKILL.md");

const BUILD_LOG = path.join(ROOT, ".tearsheet-figma-build.log");
const FIGMA_MCP = "figma";
const FIGMA_MCP_URL = "https://mcp.figma.com/mcp";
// Builds get exactly one MCP server. Nothing else the user has connected (mail, drive, calendar) is loaded.
const MCP_CONFIG = JSON.stringify({ mcpServers: { [FIGMA_MCP]: { type: "http", url: FIGMA_MCP_URL } } });
const TIMEOUT_MS = 30 * 60 * 1000;
// Most of a build is Claude thinking and writing code, not Figma. A lower effort and a smaller model are much
// faster but build fewer components, so both are opt-in: set TEARSHEET_MODEL (e.g. "sonnet") and TEARSHEET_EFFORT
// (e.g. "low") to trade breadth for speed. Unset means Claude Code's defaults.
const MODEL = process.env.TEARSHEET_MODEL;
const EFFORT = process.env.TEARSHEET_EFFORT;
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
const SIGN_IN_HINT = `Figma needs a one-time sign-in. Run \`npm run setup -- --figma\` if you haven't, then run \`claude\` in Terminal, type /mcp, choose "${FIGMA_MCP}", and approve access in the browser. Then try again.`;

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
- Reference images must be the real files, not placeholders. upload_assets returns single-use upload URLs and does not read local files, so: (1) in your build script, create one rectangle per reference on the References page and return its node ID; (2) call upload_assets once with count = number of references and nodeIds = those IDs, in order; (3) for each returned upload URL, send the bytes with one Bash call per image, in parallel in a single message. Each call must be exactly this and nothing else, with the file's full absolute path from the selection written inline and its MIME type (image/png, image/jpeg, image/webp, or image/gif): curl -sS -X POST -H "Content-Type: <mime>" --data-binary @<absolute path> "<uploadUrl>". The command must start with the word curl. Do not use shell variables, cd, echo, newlines, ; or &&, and do not combine several uploads into one command, or the call is denied. Only run curl against upload URLs returned by upload_assets. If an upload fails, keep that rectangle as a captioned placeholder and continue.
- You cannot download files. When you call get_screenshot, always pass enableBase64Response: true so the image comes back inline, and look at it.
- Your last message must contain the final Figma file URL on its own line.

Selection:
${JSON.stringify({ images: selection }, null, 2)}

Workflow:

${skill}`;
}

// One short line per tool call, tool result, and final result, for debugging a build.
function logEvent(event) {
  const clip = (v) => (typeof v === "string" ? v : JSON.stringify(v) || "").replace(/\s+/g, " ").slice(0, 400);
  const blocks = Array.isArray(event.message?.content) ? event.message.content : [];
  const lines = blocks.flatMap((b) => {
    if (b.type === "tool_use") return [`CALL ${b.name} ${clip(b.input)}`];
    if (b.type === "tool_result") return [`${b.is_error ? "ERROR" : "OK"} ${clip(b.content)}`];
    return [];
  });
  if (event.type === "result") {
    const u = event.usage || {};
    lines.push(
      `STATS turns=${event.num_turns} seconds=${Math.round((event.duration_ms || 0) / 1000)} apiSeconds=${Math.round((event.duration_api_ms || 0) / 1000)} outputTokens=${u.output_tokens} cost=$${(event.total_cost_usd || 0).toFixed(2)}`
    );
    lines.push(`RESULT ${clip(event.result)}`);
    if (event.permission_denials?.length) lines.push(`DENIED ${clip(event.permission_denials)}`);
  }
  if (lines.length) {
    try {
      fs.appendFileSync(BUILD_LOG, lines.map((l) => `${new Date().toISOString()} ${l}\n`).join(""));
    } catch {}
  }
}

function stepFromEvent(event) {
  if (event.type !== "assistant" || !Array.isArray(event.message?.content)) return null;
  const tool = event.message.content.filter((b) => b.type === "tool_use").pop();
  if (!tool) return null;
  const name = tool.name.split("__").pop();
  return STEP_LABELS[name] || "Working";
}

// Runs one build. `job` is updated in place and `onUpdate` is called after every change,
// so the caller can persist it. `job.cancel()` stops a running build.
function runFigmaBuild(images, figmaUrl, job, onUpdate = () => {}) {
  const finish = (status, fields = {}) => {
    if (job.status !== "running") return;
    Object.assign(job, { status, finishedAt: Date.now(), ...fields });
    onUpdate();
  };
  const fail = (error) => finish("error", { error });

  const blocked = blockedReason();
  if (blocked) return fail(blocked);

  const claude = findClaude();
  const child = spawn(
    claude,
    [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--permission-mode", "dontAsk",
      ...(MODEL ? ["--model", MODEL] : []),
      ...(EFFORT ? ["--effort", EFFORT] : []),
      // Skip the user's own settings (their output style adds explanation text around every piece of code)
      // and skills (the Skill tool only produced a failing call).
      "--setting-sources", "project,local",
      "--disable-slash-commands",
      "--strict-mcp-config", "--mcp-config", MCP_CONFIG,
      "--allowedTools", `mcp__${FIGMA_MCP}`, "Read", "Bash(curl -sS -X POST:*)",
    ],
    { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] }
  );

  job.cancel = () => {
    finish("cancelled");
    child.kill("SIGTERM");
  };

  let finalText = "";
  let sawFigmaUrl = null;
  let stderr = "";
  let buffer = "";
  const timer = setTimeout(() => {
    fail("Timed out after 30 minutes.");
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

    logEvent(event);

    const step = stepFromEvent(event);
    if (step && step !== job.step) {
      job.step = step;
      onUpdate();
    }

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
    if (job.status !== "running") return;

    const urls = finalText.match(FIGMA_URL);
    const url = (urls && urls[urls.length - 1]) || sawFigmaUrl || figmaUrl;
    if (url) {
      finish("done", { figmaUrl: url });
    } else {
      const said = finalText.trim() || stderr.trim();
      fail(AUTH_ERROR.test(said) ? LOGIN_HINT : said.slice(0, 400) || "Claude finished without creating a Figma file.");
    }
  });

  child.stdin.on("error", () => {});
  child.stdin.end(buildPrompt(images, figmaUrl));
}

module.exports = { runFigmaBuild, FIGMA_MCP, FIGMA_MCP_URL, SETUP_HINT };
