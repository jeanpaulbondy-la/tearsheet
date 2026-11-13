// Captures the real UI stills the promo uses from your running Tearsheet gallery (1920x1080):
//   input/ui-grid.png    the gallery grid
//   input/ui-grid2.png   the grid scrolled down
//   input/ui-detail.png  one reference opened full size, with its extracted palette
//   input/ui-select.png  several references selected, with the selection bar showing
//
// Usage: node capture-stills.js [detailTitle] [selectTitles, comma separated]
// Titles are matched against card titles in YOUR gallery (case-insensitive, partial match).
// Tearsheet must be running at http://localhost:4560 and Google Chrome must be installed.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OUT = path.join(__dirname, "input");
const DETAIL = process.argv[2] || "Circles Composition";
const SELECT = (process.argv[3] || "Cirro,Naomi,Mission Control,Tiamo").split(",").map((s) => s.trim());
const W = 1920, H = 1080, PORT = 9334;

fs.mkdirSync(OUT, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tearsheet-stills-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, "--hide-scrollbars",
  `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch {}
    await sleep(200);
  }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
  const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, "base64")); console.log("saved", name); };
  const click = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  const key = async (k, code, vk) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
  };
  const cardRect = (title, sel) => ev(`(()=>{const c=[...document.querySelectorAll(".card")].find(c=>c.querySelector(".card-title")?.textContent.toLowerCase().includes(${JSON.stringify(title.toLowerCase())}));if(!c)return null;c.scrollIntoView({block:"center"});const e=c.querySelector(${JSON.stringify(sel)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:4560/" });
  await sleep(3500);
  await shot("ui-grid.png");
  await ev("window.scrollTo(0, 1500)"); await sleep(900);
  await shot("ui-grid2.png");
  await ev("window.scrollTo(0, 0)"); await sleep(500);

  const detail = await cardRect(DETAIL, ".card-frame");
  if (!detail) throw new Error(`No card title contains "${DETAIL}"`);
  await click(detail.x, detail.y);
  await sleep(1800);
  await shot("ui-detail.png");
  await key("Escape", "Escape", 27);
  await sleep(700);

  for (const t of SELECT) {
    const r = await cardRect(t, ".card-check");
    if (r) { await click(r.x, r.y); await sleep(400); } else console.warn(`No card title contains "${t}"`);
  }
  await sleep(1200);
  await shot("ui-select.png");
  ws.close();
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => { chrome.kill(); setTimeout(() => { fs.rmSync(profile, { recursive: true, force: true }); process.exit(); }, 400); });
