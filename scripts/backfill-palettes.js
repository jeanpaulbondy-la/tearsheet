const fs = require("fs");
const path = require("path");
const { getPalette } = require("./palette");

async function backfillPalettes() {
  const galleryPath = "./data/gallery.json";
  const imagesDir = "./images";

  // Load current gallery
  const data = JSON.parse(fs.readFileSync(galleryPath, "utf8"));
  const items = Array.isArray(data) ? data : (data.items || data.images || []);

  console.log(`Found ${items.length} items in gallery`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of items) {
    const imagePath = path.join(imagesDir, item.filename);

    if (!fs.existsSync(imagePath)) {
      console.log(`⊘ ${item.id} — image not found: ${item.filename}`);
      skipped++;
      continue;
    }

    try {
      const palette = await getPalette(imagePath, { colorCount: 6 });
      item.palette = palette;
      updated++;
      console.log(`✓ ${item.id}`);
    } catch (err) {
      console.error(`✗ ${item.id} — ${err.message}`);
      errors++;
    }
  }

  // Write back to gallery
  fs.writeFileSync(
    galleryPath,
    JSON.stringify(Array.isArray(data) ? items : { ...data, items }, null, 2)
  );

  console.log("\n" + "=".repeat(50));
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors:  ${errors}`);
  console.log(`Total:   ${items.length}`);
  console.log("=".repeat(50));
}

backfillPalettes().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
