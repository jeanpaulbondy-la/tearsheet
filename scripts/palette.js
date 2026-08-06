const { getPalette } = require("colorthief");

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/palette.js <image-path>");
    process.exit(1);
  }

  const palette = await getPalette(file, { colorCount: 6 });
  console.log(JSON.stringify(palette.map((c) => c.hex())));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
