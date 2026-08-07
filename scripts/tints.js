// Expands one or more base hex colors into a Tailwind-style 50-900 tint/shade ramp.
// Usage: node scripts/tints.js <hex1> [hex2 ...]
// Prints a JSON array of { base, tints: { "50": "#...", ..., "900": "#..." } }.
// 500 is the input color unchanged; steps below 500 mix toward white, above mix toward black.

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const STOPS = { 50: 0.95, 100: 0.9, 200: 0.75, 300: 0.6, 400: 0.35, 500: 0, 600: 0.15, 700: 0.3, 800: 0.45, 900: 0.6 };

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

function mix(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

function tintRamp(hex) {
  const base = hexToRgb(hex);
  const ramp = {};
  for (const [step, t] of Object.entries(STOPS)) {
    const s = Number(step);
    ramp[step] = s < 500 ? rgbToHex(mix(base, WHITE, t)) : s === 500 ? rgbToHex(base) : rgbToHex(mix(base, BLACK, t));
  }
  return ramp;
}

const hexes = process.argv.slice(2);
if (hexes.length === 0) {
  console.error("Usage: node scripts/tints.js <hex1> [hex2 ...]");
  process.exit(1);
}

console.log(JSON.stringify(hexes.map((hex) => ({ base: hex, tints: tintRamp(hex) })), null, 2));
