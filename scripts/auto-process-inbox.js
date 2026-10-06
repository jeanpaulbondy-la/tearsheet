#!/usr/bin/env node
/**
 * Auto-process inbox files on server startup.
 * Minimal metadata extraction with palette via palette.js.
 * Runs silently without skill invocation or permission prompts.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const INBOX_DIR = path.join(__dirname, '../inbox');
const IMAGES_DIR = path.join(__dirname, '../images');
const GALLERY_FILE = path.join(__dirname, '../data/gallery.json');
const PROJECT_ROOT = path.join(__dirname, '..');

const VALID_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov', '.webm', '.m4v'];

function extractPalette(imagePath) {
  try {
    const output = execSync(`node scripts/palette.js "${imagePath}" 2>/dev/null`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    }).trim();
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function slugify(filename) {
  return path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function guessCategory(filename, existingCategories) {
  const lower = filename.toLowerCase();

  // Match against existing categories by common patterns
  if (lower.includes('screenshot') || lower.includes('screen') || lower.includes('ui') || lower.includes('app')) {
    if (existingCategories.includes('Mobile App Interfaces')) return 'Mobile App Interfaces';
    if (existingCategories.includes('Website UI Screenshots')) return 'Website UI Screenshots';
    return 'App Interface';
  }
  if (lower.includes('design') || lower.includes('layout')) return 'Design Layout';
  if (lower.includes('type') || lower.includes('font')) return 'Typography';
  if (lower.includes('render') || lower.includes('3d')) return '3D Render';
  if (lower.includes('illustration') || lower.includes('artwork')) return 'Illustration';

  return 'Reference';
}

function generateBasicTags(filename) {
  const tags = [];
  const lower = filename.toLowerCase();

  if (lower.includes('dark')) tags.push('dark theme');
  if (lower.includes('light')) tags.push('light theme');
  if (lower.includes('mobile')) tags.push('mobile interface');
  if (lower.includes('gradient')) tags.push('gradient');
  if (lower.includes('neon') || lower.includes('glow')) tags.push('neon glow');
  if (lower.includes('flat')) tags.push('flat design');
  if (lower.includes('minimal')) tags.push('minimal');

  // Pad to at least 2 tags
  if (tags.length === 0) {
    tags.push('design reference');
  }
  if (tags.length === 1) {
    tags.push('visual inspiration');
  }

  return tags.slice(0, 5);
}

function makeUniqueSlug(baseSlug, existingIds) {
  let slug = baseSlug;
  let counter = 2;
  while (existingIds.has(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
}

function processInbox() {
  if (!fs.existsSync(INBOX_DIR)) {
    return { processed: 0, skipped: 0 };
  }

  const files = fs
    .readdirSync(INBOX_DIR)
    .filter((f) => !f.startsWith('.') && VALID_EXTS.includes(path.extname(f).toLowerCase()));

  if (files.length === 0) {
    return { processed: 0, skipped: 0 };
  }

  // Read existing gallery
  let gallery = [];
  if (fs.existsSync(GALLERY_FILE)) {
    gallery = JSON.parse(fs.readFileSync(GALLERY_FILE, 'utf8'));
  }

  const existingIds = new Set(gallery.map((g) => g.id));
  const existingCategories = [...new Set(gallery.map((g) => g.category))];

  let processed = 0;
  let skipped = 0;

  for (const file of files) {
    const inboxPath = path.join(INBOX_DIR, file);
    const ext = path.extname(file).toLowerCase();
    const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);

    try {
      // Derive metadata from filename
      const baseSlug = slugify(file);
      const slug = makeUniqueSlug(baseSlug, existingIds);
      const newFilename = `${slug}${ext}`;
      const newPath = path.join(IMAGES_DIR, newFilename);

      // Move file
      fs.renameSync(inboxPath, newPath);

      // Extract palette
      const palette = extractPalette(newPath);

      // Build entry with sensible defaults
      const entry = {
        id: slug,
        filename: newFilename,
        title: file.replace(ext, '').substring(0, 50), // Use original filename as title
        subtitle: 'auto-processed reference',
        category: guessCategory(file, existingCategories),
        tags: generateBasicTags(file),
        description: `Auto-processed from inbox. Original filename: ${file}`,
        addedAt: new Date().toISOString(),
      };

      if (isVideo) {
        entry.mediaType = 'video';
      }

      if (palette && Array.isArray(palette) && palette.length > 0) {
        entry.palette = palette;
      }

      gallery.push(entry);
      existingIds.add(slug);
      processed++;
    } catch (err) {
      console.error(`[inbox] Error processing ${file}: ${err.message}`);
      skipped++;
    }
  }

  // Write updated gallery
  if (processed > 0) {
    fs.writeFileSync(GALLERY_FILE, JSON.stringify(gallery, null, 2));
  }

  return { processed, skipped };
}

// Run if invoked directly
if (require.main === module) {
  const result = processInbox();
  if (result.processed > 0) {
    console.log(`[inbox] Processed ${result.processed} new item(s)`);
  }
  if (result.skipped > 0) {
    console.error(`[inbox] Skipped ${result.skipped} item(s) due to errors`);
  }
}

module.exports = { processInbox };
