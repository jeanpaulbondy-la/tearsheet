// sRGB <-> CIE LAB conversion (D65 white point), the standard pipeline:
// sRGB -> linear RGB -> XYZ -> LAB. LAB is used for clustering because
// Euclidean distance in LAB approximates perceived color difference far
// better than Euclidean distance in raw RGB.

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

// D65 reference white
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

function pivotXyzToLab(t) {
  return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
}

function pivotLabToXyz(t) {
  const t3 = t * t * t;
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
}

function rgbToLab([r, g, b]) {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / XN;
  const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) / YN;
  const z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / ZN;

  const fx = pivotXyzToLab(x);
  const fy = pivotXyzToLab(y);
  const fz = pivotXyzToLab(z);

  return [
    (116 * fy) - 16, // L
    500 * (fx - fy), // a
    200 * (fy - fz), // b
  ];
}

function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const x = pivotLabToXyz(fx) * XN;
  const y = pivotLabToXyz(fy) * YN;
  const z = pivotLabToXyz(fz) * ZN;

  const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gl = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
  const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

module.exports = { rgbToLab, labToRgb, rgbToHex };
