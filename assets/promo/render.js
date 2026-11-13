// Renders motion.html frame by frame (a pure function of time) to JPEGs via headless Chrome + CDP.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
// Usage: node render.js <outDir> <mode> [port]
// mode: "test", "times:1.5,3.2", or "full:<startFrame>-<endFrame>" (30 fps)
const [,, OUT, mode, port0] = process.argv;
const PORT = Number(port0 || 9335);
const S = path.dirname(process.argv[1]);
fs.mkdirSync(OUT, { recursive: true });
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--window-size=1920,1080", "--hide-scrollbars", "--allow-file-access-from-files",
  "--user-data-dir=" + path.join(OUT, "profile"), "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const g = JSON.parse(m.data); if (g.id && pending.has(g.id)) { pending.get(g.id)(g.result); pending.delete(g.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "file://" + path.join(S, "motion.html") });
  await sleep(1500);
  await send("Runtime.evaluate", { expression: "window.ready", awaitPromise: true });
  const frame = async (t, name, quality = 92) => {
    const r = await send("Runtime.evaluate", { expression: `render(${t}); 1`, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    const s = await send("Page.captureScreenshot", { format: "jpeg", quality });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, "base64"));
  };
  if (mode === "test") {
    const times = [0.4, 1.0, 2.2, 3.2, 4.5, 5.6, 6.5, 7.8, 8.6, 10.2, 10.9, 14.5, 17.8, 19.0, 21.0, 22.4, 24.0, 26.0, 27.0, 29.6];
    for (const t of times) await frame(t, `t_${String(t).padStart(5, "0")}.jpg`, 70);
  } else if (mode.startsWith("times:")) {
    for (const t of mode.slice(6).split(",").map(Number)) await frame(t, `x_${t}.jpg`, 85);
  } else {
    const [a, b] = mode.slice(5).split("-").map(Number);
    for (let n = a; n < b; n++) await frame(n / 30, `f${String(n).padStart(5, "0")}.jpg`);
  }
  console.log("rendered");
  ws.close();
})().catch((e) => console.error(e.message)).finally(() => { chrome.kill(); setTimeout(() => process.exit(0), 300); });
