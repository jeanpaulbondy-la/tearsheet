// Shared helpers for running Claude Code headless (`claude -p`) from the server.

const fs = require("fs");
const os = require("os");
const path = require("path");

const LOGIN_HINT = "Claude Code needs you to sign in again. Run `claude` in Terminal and type /login, then try again.";
const AUTH_ERROR = /authenticate|oauth|\/login|not logged in/i;

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

// Returns why a headless run can't start here, or null if it can.
function blockedReason() {
  if (process.env.CLAUDECODE) {
    return "Tearsheet was started inside Claude Code, which can't launch another Claude session. Start it with Tearsheet.app or `npm start` in Terminal.";
  }
  if (!findClaude()) {
    return "Claude Code isn't installed. Install it from https://claude.com/claude-code, then try again.";
  }
  return null;
}

module.exports = { findClaude, blockedReason, LOGIN_HINT, AUTH_ERROR };
