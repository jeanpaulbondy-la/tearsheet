const sharp = require("sharp");
const { kmeans } = require("./kmeans");
const { rgbToLab, labToRgb, rgbToHex } = require("./color-space");

// Cap the long edge before extracting pixels, purely for k-means speed —
// use nearest-neighbor so we never blend/average pixels together at this
// stage (that's exactly the averaging that muddied saturated accent colors
// under the old median-cut approach; resampling with a smoothing kernel
// here would reintroduce the same problem before clustering even starts).
const MAX_DIMENSION = 400;

// After resizing, also stride-sample so k-means runs over a few thousand
// points instead of a few hundred thousand — sampling skips pixels, it
// never averages them, so saturation is preserved.
const SAMPLE_TARGET = 20000;

async function loadLabPixels(file) {
  const image = sharp(file);
  const meta = await image.metadata();

  const scale = Math.min(1, MAX_DIMENSION / Math.max(meta.width, meta.height));
  const resized =
    scale < 1
      ? image.resize(
          Math.round(meta.width * scale),
          Math.round(meta.height * scale),
          { kernel: "nearest" }
        )
      : image;

  const { data, info } = await resized
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = info.width * info.height;
  const stride = Math.max(1, Math.floor(pixelCount / SAMPLE_TARGET));

  const labPixels = [];
  for (let i = 0; i < pixelCount; i += stride) {
    const offset = i * info.channels;
    const rgb = [data[offset], data[offset + 1], data[offset + 2]];
    labPixels.push(rgbToLab(rgb));
  }

  return labPixels;
}

async function getPalette(file, { colorCount = 6, internalK = null } = {}) {
  const labPixels = await loadLabPixels(file);
  // Run k-means at a higher k to capture more color diversity, then select
  // the top colorCount by a weighted score that balances frequency with
  // saturation, so accent colors aren't buried by neutral backgrounds.
  const k = internalK || Math.max(colorCount + 2, 10);
  const clusters = kmeans(labPixels, k);

  // Score each cluster by saturation and count. Any color more saturated than
  // a dull gray (sat > 0.10) gets a massive boost so vivid accents always rank
  // high even if they're tiny. This treats "perceptually important" (saturated)
  // colors as more important than "numerically common" (background) colors.
  const scored = clusters.map((cluster) => {
    const [L, a, b] = cluster.centroid;
    const saturation = Math.sqrt(a * a + b * b) / 128; // normalize to ~[0, 1]
    let score;
    if (saturation > 0.30) {
      score = cluster.count * 10; // very vivid colors (reds, teals, oranges)
    } else if (saturation > 0.15) {
      score = cluster.count * 5; // moderately saturated colors
    } else if (saturation > 0.10) {
      score = cluster.count * 2; // slightly saturated (not pure gray)
    } else {
      score = cluster.count; // near-grays/neutrals use raw count
    }
    return { ...cluster, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, colorCount)
    .map((cluster) => rgbToHex(labToRgb(cluster.centroid)));
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/palette.js <image-path>");
    process.exit(1);
  }

  const palette = await getPalette(file, { colorCount: 6 });
  console.log(JSON.stringify(palette));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { getPalette };
