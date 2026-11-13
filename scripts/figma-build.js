// Builds a Figma starter kit by running Claude Code headless (`claude -p`) with the Figma MCP
// allowed. Uses the user's existing Claude login: no API key.
//
// Most of a build is Claude writing code, not Figma running it, so the build is split: one setup
// worker creates the file, tokens, and a component plan; then several workers build the Foundations
// page, the References page, and batches of component families at the same time. (Figma runs
// scripts on one file one at a time, but that is only a small part of the total.)

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { findClaude, blockedReason, LOGIN_HINT, AUTH_ERROR } = require("./claude-cli");
const prompts = require("./figma-prompts");

const ROOT = path.resolve(__dirname, "..");
const BUILD_LOG = path.join(ROOT, ".tearsheet-figma-build.log");
const FIGMA_MCP = "figma";
const FIGMA_MCP_URL = "https://mcp.figma.com/mcp";
// Builds get exactly one MCP server. Nothing else the user has connected (mail, drive, calendar) is loaded.
const MCP_CONFIG = JSON.stringify({ mcpServers: { [FIGMA_MCP]: { type: "http", url: FIGMA_MCP_URL } } });
const TIMEOUT_MS = 30 * 60 * 1000;
const MAX_COMPONENT_WORKERS = Number(process.env.TEARSHEET_WORKERS) || 5;
// Defaults are Claude Code's own. TEARSHEET_MODEL / TEARSHEET_EFFORT apply to every worker; the
// TEARSHEET_WORKER_* pair applies only to the parallel workers (not setup).
const MODEL = process.env.TEARSHEET_MODEL;
const EFFORT = process.env.TEARSHEET_EFFORT;
const WORKER_MODEL = process.env.TEARSHEET_WORKER_MODEL || MODEL;
const WORKER_EFFORT = process.env.TEARSHEET_WORKER_EFFORT || EFFORT;
const LIMIT_ERROR = /session limit|usage limit|rate limit|limit reached/i;
const FIGMA_URL = /https:\/\/www\.figma\.com\/(?:design|file)\/[A-Za-z0-9]+[^\s)>"'\\\]]*/g;

const SETUP_HINT =
  `Figma isn't connected to Claude Code yet. Run \`npm run setup -- --figma\`, then run \`claude\` once, ` +
  `type /mcp, and sign in to "${FIGMA_MCP}".`;
const SIGN_IN_HINT = `Figma needs a one-time sign-in. Run \`npm run setup -- --figma\` if you haven't, then run \`claude\` in Terminal, type /mcp, choose "${FIGMA_MCP}", and approve access in the browser. Then try again.`;

// One short line per tool call, tool result, and final result, for debugging a build.
function logLine(label, text) {
  try {
    fs.appendFileSync(BUILD_LOG, `${new Date().toISOString()} [${label}] ${text.replace(/\s+/g, " ")}\n`);
  } catch {}
}

function logEvent(label, event) {
  const clip = (v, n = 400) => (typeof v === "string" ? v : JSON.stringify(v) || "").replace(/\s+/g, " ").slice(0, n);
  const blocks = Array.isArray(event.message?.content) ? event.message.content : [];
  for (const b of blocks) {
    if (b.type === "tool_use") logLine(label, `CALL ${b.name} ${clip(b.input)}`);
    if (b.type === "tool_result") logLine(label, `${b.is_error ? "ERROR" : "OK"} ${clip(b.content)}`);
  }
  if (event.type === "result") {
    const u = event.usage || {};
    logLine(
      label,
      `STATS turns=${event.num_turns} seconds=${Math.round((event.duration_ms || 0) / 1000)} apiSeconds=${Math.round((event.duration_api_ms || 0) / 1000)} outputTokens=${u.output_tokens} cost=$${(event.total_cost_usd || 0).toFixed(2)}`
    );
    if (event.permission_denials?.length) logLine(label, `DENIED ${clip(event.permission_denials)}`);
  }
}

// Runs one headless Claude worker to completion. Never rejects: resolves with
// { ok, text, error, limit, seconds }. `children` collects live processes so a cancel can stop them all.
function runWorker({ label, prompt, model, effort, children, checkFigma }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let finalText = "";
    let resultFailed = false;
    let stderr = "";
    let buffer = "";

    const settle = (value) => {
      if (settled) return;
      settled = true;
      children.delete(child);
      resolve({ seconds: Math.round((Date.now() - started) / 1000), ...value });
    };

    const child = spawn(
      findClaude(),
      [
        "-p",
        "--output-format", "stream-json",
        "--verbose",
        "--no-session-persistence",
        "--permission-mode", "dontAsk",
        ...(model ? ["--model", model] : []),
        ...(effort ? ["--effort", effort] : []),
        // Skip the user's own settings (their output style adds explanation text around every piece of code)
        // and skills (the Skill tool only produced a failing call).
        "--setting-sources", "project,local",
        "--disable-slash-commands",
        "--strict-mcp-config", "--mcp-config", MCP_CONFIG,
        "--allowedTools", `mcp__${FIGMA_MCP}`, "Read", "Bash(curl -sS -X POST:*)",
      ],
      { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] }
    );
    children.add(child);

    function handleLine(line) {
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }

      if (event.type === "system" && event.subtype === "init") {
        // Remote servers can still be "pending" at init, so only a clear failure is fatal.
        if (!checkFigma) return;
        const figmas = (event.mcp_servers || []).filter((s) => /figma/i.test(s.name));
        if (!figmas.some((s) => s.status === "connected" || s.status === "pending")) {
          const seen = (event.mcp_servers || []).map((s) => `${s.name}: ${s.status}`).join(", ") || "none";
          settle({ ok: false, error: `${figmas.length ? SIGN_IN_HINT : SETUP_HINT} (Claude saw: ${seen})` });
          child.kill("SIGTERM");
        }
        return;
      }

      logEvent(label, event);
      if (event.type === "result") {
        finalText = event.result || "";
        resultFailed = event.is_error === true || LIMIT_ERROR.test(finalText);
      }
    }

    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach(handleLine);
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => settle({ ok: false, error: `Couldn't start Claude Code: ${err.message}` }));
    child.on("close", () => {
      handleLine(buffer);
      const said = finalText.trim() || stderr.trim();
      if (resultFailed || !finalText.trim()) {
        const limit = LIMIT_ERROR.test(said);
        const error = AUTH_ERROR.test(said) ? LOGIN_HINT : said.slice(0, 300) || "Claude stopped before finishing.";
        return settle({ ok: false, text: finalText, error, limit });
      }
      settle({ ok: true, text: finalText });
    });

    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

function parsePlan(text) {
  const line = text.split("\n").find((l) => l.trim().startsWith("TEARSHEET_PLAN"));
  if (!line) return null;
  try {
    const plan = JSON.parse(line.trim().slice("TEARSHEET_PLAN".length).trim());
    if (!plan.fileKey || !plan.containerId || !plan.pages) return null;
    return plan;
  } catch {
    return null;
  }
}

// Runs one build. `job` is updated in place and `onUpdate` is called after every change,
// so the caller can persist it. `job.cancel()` stops a running build.
function runFigmaBuild(images, figmaUrl, job, onUpdate = () => {}) {
  const children = new Set();
  let cancelled = false;

  const finish = (status, fields = {}) => {
    if (job.status !== "running") return;
    Object.assign(job, { status, finishedAt: Date.now(), ...fields });
    onUpdate();
  };
  const fail = (error) => finish("error", { error });
  const setStep = (step) => {
    if (job.status !== "running" || job.step === step) return;
    job.step = step;
    onUpdate();
  };
  const killAll = () => children.forEach((c) => c.kill("SIGTERM"));

  const blocked = blockedReason();
  if (blocked) return fail(blocked);

  job.cancel = () => {
    cancelled = true;
    finish("cancelled");
    killAll();
  };
  const timer = setTimeout(() => {
    fail("Timed out after 30 minutes.");
    killAll();
  }, TIMEOUT_MS);

  (async () => {
    const t0 = Date.now();

    setStep("Setting up the file");
    const setup = await runWorker({ label: "setup", prompt: prompts.setupPrompt(images, figmaUrl), model: MODEL, effort: EFFORT, children, checkFigma: true });
    if (cancelled) return;
    logLine("setup", `DONE seconds=${setup.seconds} ok=${setup.ok}`);

    const plan = setup.ok ? parsePlan(setup.text) : null;
    const sawUrl = (setup.text || "").match(FIGMA_URL);
    const fallbackUrl = (sawUrl && sawUrl[sawUrl.length - 1]) || figmaUrl;
    if (!plan) {
      const why = setup.ok ? "Setup didn't produce a build plan." : setup.error;
      return fail(`${why}${fallbackUrl ? ` The file may be partly built: ${fallbackUrl}` : ""}`);
    }
    const fileUrl = plan.fileUrl || `https://www.figma.com/design/${plan.fileKey}`;

    const batches = prompts.planBatches(Array.isArray(plan.families) ? plan.families : [], MAX_COMPONENT_WORKERS);
    const tasks = [
      { label: "foundations", prompt: prompts.foundationsPrompt(plan, images) },
      { label: "references", prompt: prompts.referencesPrompt(plan, images) },
      ...batches.map((families, i) => ({ label: `components-${i + 1}`, prompt: prompts.componentsPrompt(plan, families, images) })),
    ];

    let done = 0;
    const progress = () => setStep(`Building ${tasks.length} parts at once (${done} done)`);
    progress();
    const results = await Promise.all(
      tasks.map(async (t) => {
        const r = await runWorker({ ...t, model: WORKER_MODEL, effort: WORKER_EFFORT, children });
        logLine(t.label, `DONE seconds=${r.seconds} ok=${r.ok}${r.ok ? "" : ` error=${r.error}`}`);
        done++;
        progress();
        return { label: t.label, ...r };
      })
    );
    if (cancelled) return;

    const failed = results.filter((r) => !r.ok);
    const seconds = Math.round((Date.now() - t0) / 1000);
    logLine("build", `RESULT ${fileUrl} total=${seconds}s parts=${tasks.length} failed=${failed.length}`);

    if (failed.length === tasks.length) {
      return fail(`${failed[0].error} The file may be partly built: ${fileUrl}`);
    }
    finish("done", {
      figmaUrl: fileUrl,
      ...(failed.length && { warning: `${failed.length} of ${tasks.length} parts didn't finish (${failed.map((f) => f.label).join(", ")}). Open the file to see what's there.` }),
    });
  })()
    .catch((err) => fail(`Build failed: ${err.message}`))
    .finally(() => {
      clearTimeout(timer);
      killAll();
    });
}

module.exports = { runFigmaBuild, FIGMA_MCP, FIGMA_MCP_URL, SETUP_HINT };
