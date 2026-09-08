#!/usr/bin/env node
// One-time setup after `npm install`:
//   1. Installs the global Claude Code skills into ~/.claude/skills
//   2. On macOS, builds Tearsheet.app (a Dock launcher) next to this file's project
//
// Usage: npm run setup            (both)
//        npm run setup -- --skills (skills only)
//        npm run setup -- --app    (app only)

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const only = args.find((a) => a === "--skills" || a === "--app");
const doSkills = !only || only === "--skills";
const doApp = !only || only === "--app";

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function installSkills() {
  const skillsSrc = path.join(ROOT, "skills");
  const skillsDest = path.join(os.homedir(), ".claude", "skills");
  const names = fs.readdirSync(skillsSrc).filter((n) => fs.statSync(path.join(skillsSrc, n)).isDirectory());
  for (const name of names) {
    copyDir(path.join(skillsSrc, name), path.join(skillsDest, name));
  }
  console.log(`Installed ${names.length} skills into ${skillsDest}:`);
  names.forEach((n) => console.log(`  /${n}`));
  console.log("Restart Claude Code so it picks them up.");
}

function buildApp() {
  if (process.platform !== "darwin") {
    console.log("Skipping Tearsheet.app (macOS only). Start the gallery with `npm start`.");
    return;
  }

  const app = path.join(ROOT, "Tearsheet.app");
  const contents = path.join(app, "Contents");
  const macos = path.join(contents, "MacOS");
  const resources = path.join(contents, "Resources");
  fs.rmSync(app, { recursive: true, force: true });
  fs.mkdirSync(macos, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Tearsheet</string>
  <key>CFBundleDisplayName</key><string>Tearsheet</string>
  <key>CFBundleIdentifier</key><string>local.tearsheet.launcher</string>
  <key>CFBundleVersion</key><string>1.1</string>
  <key>CFBundleShortVersionString</key><string>1.1</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Tearsheet</string>
  <key>CFBundleIconFile</key><string>Tearsheet.icns</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;
  fs.writeFileSync(path.join(contents, "Info.plist"), plist);

  // The launcher starts the server if nothing is listening on the port, then
  // opens the gallery in the default browser. Clicking it again just refocuses.
  const launcher = `#!/bin/bash
DIR=${JSON.stringify(ROOT)}
PORT=4560
LOG="$DIR/.tearsheet-server.log"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$DIR" || exit 1

if ! lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  nohup npm start >"$LOG" 2>&1 &
  disown
  for i in $(seq 1 40); do
    lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 0.25
  done
fi

open "http://localhost:$PORT"
`;
  const exe = path.join(macos, "Tearsheet");
  fs.writeFileSync(exe, launcher);
  fs.chmodSync(exe, 0o755);

  fs.copyFileSync(path.join(ROOT, "assets", "app-icon", "Tearsheet.icns"), path.join(resources, "Tearsheet.icns"));

  console.log(`Built ${app}`);
  console.log("Drag it onto the Dock to pin it. Double-click starts the server and opens the gallery.");
}

if (doSkills) installSkills();
if (doApp) buildApp();
