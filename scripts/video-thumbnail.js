const { execFileSync } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

// Extracts one representative frame from a video as a JPEG.
// Usage: node scripts/video-thumbnail.js <video-path> <output-jpg-path> [timestampSeconds]

function main() {
  const [videoPath, outputPath, timestamp = "1"] = process.argv.slice(2);
  if (!videoPath || !outputPath) {
    console.error("Usage: node scripts/video-thumbnail.js <video-path> <output-jpg-path> [timestampSeconds]");
    process.exit(1);
  }

  function extractAt(ts) {
    execFileSync(ffmpegPath, [
      "-y",
      "-ss", String(ts),
      "-i", videoPath,
      "-frames:v", "1",
      "-q:v", "2",
      outputPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
  }

  try {
    extractAt(timestamp);
  } catch (err) {
    // Video shorter than the requested timestamp — fall back to the first frame.
    extractAt(0);
  }

  console.log(outputPath);
}

main();
