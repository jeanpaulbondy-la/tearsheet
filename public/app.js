const grid = document.getElementById("grid");
const emptyEl = document.getElementById("empty");
const noResultsEl = document.getElementById("no-results");
const searchEl = document.getElementById("search");
const resultCountEl = document.getElementById("result-count");
const categoryFiltersEl = document.getElementById("category-filters");
const tagFilterListEl = document.getElementById("tag-filter-list");
const activeFiltersEl = document.getElementById("active-filters");
const activeFiltersListEl = document.getElementById("active-filters-list");
const clearFiltersBtn = document.getElementById("clear-filters");
const clearFiltersBtn2 = document.getElementById("clear-filters-2");
const selectionBar = document.getElementById("selection-bar");
const selectionCountEl = document.getElementById("selection-count");
const clearBtn = document.getElementById("clear-selection");
const saveFigmaBtn = document.getElementById("save-for-figma");
const saveClaudeBtn = document.getElementById("save-for-claude");
const indexToggle = document.getElementById("index-toggle");
const lightboxEl = document.getElementById("lightbox");
const lightboxFrameEl = lightboxEl.querySelector(".lightbox-frame");
const lightboxCloseBtn = document.getElementById("lightbox-close");
const detailPanel = document.getElementById("detail-panel");
const detailPrev = document.getElementById("detail-prev");
const detailNext = document.getElementById("detail-next");

let items = [];
let visibleItems = [];
let selected = new Set();
let activeCategories = new Set();
let activeTags = new Set();
let detailIndex = -1;
let hasRenderedOnce = false;

const MOTIF_MIN_COUNT = 2;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mediaUrl(filename) {
  return `/images/${encodeURIComponent(filename || "")}`;
}

function pad(n, width) {
  return String(n).padStart(width, "0");
}

function indexWidth(total) {
  return Math.max(2, String(total).length);
}

function checkIcon() {
  return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M3 8.5L6.2 11.5L13 4.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---------- cards ---------- */

function renderCard(item, index, total) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = item.id;
  card.style.setProperty("--i", Math.min(index, 24));
  if (selected.has(item.id)) card.classList.add("selected");
  if (!hasRenderedOnce) card.classList.add("entering");

  const tags = item.tags || [];
  const visibleTags = tags.slice(0, 3);
  const overflow = tags.length - visibleTags.length;
  const palette = item.palette || [];
  const isVideo = item.mediaType === "video";
  const category = item.category || "Uncategorized";

  const mediaHtml = isVideo
    ? `<video class="card-image" src="${mediaUrl(item.filename)}" poster="${mediaUrl(item.thumbnail)}" muted loop playsinline preload="metadata"></video>
       <span class="card-video-badge">VIDEO</span>`
    : `<img class="card-image" src="${mediaUrl(item.filename)}" alt="${esc(item.title)}" loading="lazy" />`;

  card.innerHTML = `
    <div class="card-surface">
      <div class="card-media">
        <div class="card-frame">${mediaHtml}</div>
        ${palette.length ? `
        <div class="card-palette">
          ${palette.map((hex) => `<span class="swatch" style="background:${esc(hex)}" title="${esc(hex)}"></span>`).join("")}
        </div>` : ""}
        <div class="card-check" role="checkbox" aria-checked="${selected.has(item.id)}" aria-label="Select">${checkIcon()}</div>
      </div>
      <div class="card-meta">
        <div class="card-kicker">
          <span class="card-index">${pad(index + 1, indexWidth(total))}</span>
          <span class="card-category" data-category="${esc(category)}">${esc(category)}</span>
        </div>
        <h2 class="card-title">${esc(item.title || "Untitled")}</h2>
        ${item.subtitle ? `<div class="card-subtitle">${esc(item.subtitle)}</div>` : ""}
        ${tags.length ? `
        <div class="card-tags">
          ${visibleTags.map((t) => `<span class="tag" data-tag="${esc(t)}">${esc(t)}</span>`).join("")}
          ${overflow > 0 ? `<span class="tag tag-overflow">+${overflow}</span>` : ""}
        </div>` : ""}
      </div>
    </div>
  `;

  card.addEventListener("click", () => toggleSelect(item.id));

  const mediaEl = card.querySelector(".card-image");
  mediaEl.addEventListener("click", (e) => {
    e.stopPropagation();
    openDetail(index);
  });

  if (isVideo) {
    const videoEl = card.querySelector("video.card-image");
    card.addEventListener("mouseenter", () => videoEl.play().catch(() => {}));
    card.addEventListener("mouseleave", () => {
      videoEl.pause();
      videoEl.currentTime = 0;
    });
  }

  card.querySelectorAll(".tag[data-tag]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTagFilter(el.dataset.tag);
    });
  });

  card.querySelector(".card-category").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCategoryFilter(category);
  });

  return card;
}

function syncCardSelection(id) {
  const card = grid.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const on = selected.has(id);
  card.classList.toggle("selected", on);
  const check = card.querySelector(".card-check");
  if (check) check.setAttribute("aria-checked", String(on));
}

function toggleSelect(id) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  syncCardSelection(id);
  updateSelectionBar();
  if (!lightboxEl.hidden) renderDetailActions();
}

function updateSelectionBar() {
  const count = selected.size;
  selectionBar.hidden = count === 0;
  selectionCountEl.textContent = count === 1 ? "1 selected" : `${count} selected`;
}

/* ---------- detail ---------- */

function setHash(item) {
  const url = item ? `#ref=${encodeURIComponent(item.id)}` : location.pathname + location.search;
  history.replaceState(null, "", url);
}

function openDetail(index) {
  detailIndex = index;
  renderDetail();
  setHash(visibleItems[index]);
  lightboxEl.hidden = false;
  lightboxEl.focus({ preventScroll: true });
}

function closeDetail() {
  lightboxEl.hidden = true;
  lightboxFrameEl.innerHTML = "";
  detailPanel.innerHTML = "";
  detailIndex = -1;
  setHash(null);
}

function stepDetail(delta) {
  if (lightboxEl.hidden) return;
  const next = detailIndex + delta;
  if (next < 0 || next >= visibleItems.length) return;
  detailIndex = next;
  renderDetail();
  setHash(visibleItems[next]);
}

function openFromHash() {
  const match = location.hash.match(/^#ref=(.+)$/);
  if (!match) return;
  const id = decodeURIComponent(match[1]);
  const index = visibleItems.findIndex((item) => item.id === id);
  if (index >= 0) openDetail(index);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderDetail() {
  const item = visibleItems[detailIndex];
  if (!item) return;
  const isVideo = item.mediaType === "video";
  const total = visibleItems.length;
  const category = item.category || "Uncategorized";
  const palette = item.palette || [];
  const tags = item.tags || [];

  lightboxFrameEl.innerHTML = isVideo
    ? `<video src="${mediaUrl(item.filename)}" controls autoplay loop playsinline></video>`
    : `<img src="${mediaUrl(item.filename)}" alt="${esc(item.title)}" />`;

  detailPanel.innerHTML = `
    <div class="detail-kicker">
      <span>${pad(detailIndex + 1, indexWidth(total))} / ${pad(total, indexWidth(total))}</span>
      <span class="card-category" data-category="${esc(category)}">${esc(category)}</span>
    </div>
    <h2 class="detail-title">${esc(item.title || "Untitled")}</h2>
    ${item.subtitle ? `<div class="detail-subtitle">${esc(item.subtitle)}</div>` : ""}
    ${item.description ? `<p class="detail-desc">${esc(item.description)}</p>` : ""}

    ${palette.length ? `
    <section class="detail-section">
      <h3 class="detail-label">Extracted palette</h3>
      <div class="detail-palette">
        ${palette.map((hex) => `
          <button type="button" class="detail-swatch" data-hex="${esc(hex)}" title="Copy ${esc(hex)}">
            <span class="detail-swatch-color" style="background:${esc(hex)}"></span>
            <span class="detail-hex">${esc(hex)}</span>
            <span class="detail-copy">Copy</span>
          </button>`).join("")}
      </div>
    </section>` : ""}

    ${tags.length ? `
    <section class="detail-section">
      <h3 class="detail-label">Tags</h3>
      <div class="detail-tags">
        ${tags.map((t) => `<button type="button" class="motif" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}
      </div>
    </section>` : ""}

    <section class="detail-section">
      <dl class="detail-meta">
        <dt>File</dt><dd>${esc(item.filename)}</dd>
        ${item.addedAt ? `<dt>Added</dt><dd>${esc(formatDate(item.addedAt))}</dd>` : ""}
        ${isVideo ? `<dt>Type</dt><dd>Video reference</dd>` : ""}
      </dl>
    </section>

    <div class="detail-actions" id="detail-actions"></div>
  `;

  renderDetailActions();

  detailPanel.querySelectorAll(".detail-swatch").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const hex = btn.dataset.hex;
      try {
        await navigator.clipboard.writeText(hex);
        btn.classList.add("copied");
        btn.querySelector(".detail-copy").textContent = "Copied";
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.querySelector(".detail-copy").textContent = "Copy";
        }, 1400);
      } catch (err) {
        btn.querySelector(".detail-copy").textContent = hex;
      }
    });
  });

  detailPanel.querySelectorAll(".motif[data-tag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeDetail();
      toggleTagFilter(btn.dataset.tag);
    });
  });

  detailPanel.querySelector(".card-category").addEventListener("click", () => {
    closeDetail();
    toggleCategoryFilter(category);
  });

  detailPrev.disabled = detailIndex <= 0;
  detailNext.disabled = detailIndex >= total - 1;
  detailPanel.scrollTop = 0;
}

function renderDetailActions() {
  const actions = document.getElementById("detail-actions");
  const item = visibleItems[detailIndex];
  if (!actions || !item) return;
  const on = selected.has(item.id);
  actions.innerHTML = `
    <button type="button" class="${on ? "btn-ghost" : "btn-primary"}" id="detail-select">
      ${on ? "Remove from selection" : "Add to selection"}
    </button>
  `;
  actions.querySelector("#detail-select").addEventListener("click", () => toggleSelect(item.id));
}

/* ---------- filtering ---------- */

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [item.title, item.subtitle, item.category, item.description, ...(item.tags || [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesCategory(item) {
  if (activeCategories.size === 0) return true;
  return activeCategories.has(item.category || "Uncategorized");
}

function matchesTags(item) {
  if (activeTags.size === 0) return true;
  const itemTags = new Set(item.tags || []);
  return [...activeTags].every((t) => itemTags.has(t));
}

function categoryCounts() {
  const counts = new Map();
  items.forEach((item) => {
    const cat = item.category || "Uncategorized";
    counts.set(cat, (counts.get(cat) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function tagCounts() {
  const counts = new Map();
  items.forEach((item) => {
    (item.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderCategoryFilters() {
  const counts = categoryCounts();
  categoryFiltersEl.closest(".index-section").hidden = counts.length === 0;
  categoryFiltersEl.innerHTML = counts
    .map(
      ([cat, count]) => `
    <button type="button" class="index-item${activeCategories.has(cat) ? " active" : ""}" data-category="${esc(cat)}" aria-pressed="${activeCategories.has(cat)}">
      <span>${esc(cat)}</span>
      <span class="index-count-cell">${count}</span>
    </button>`
    )
    .join("");
  categoryFiltersEl.querySelectorAll(".index-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleCategoryFilter(btn.dataset.category);
      closeIndexDrawer();
    });
  });
}

function renderTagFilterList() {
  const recurring = tagCounts().filter(([, count]) => count >= MOTIF_MIN_COUNT);
  const extra = [...activeTags].filter((t) => !recurring.some(([tag]) => tag === t));
  const list = [...recurring, ...extra.map((t) => [t, null])];

  tagFilterListEl.closest(".index-section").hidden = list.length === 0;
  tagFilterListEl.innerHTML = list
    .map(
      ([tag, count]) => `
    <button type="button" class="index-item index-item-motif${activeTags.has(tag) ? " active" : ""}" data-tag="${esc(tag)}" aria-pressed="${activeTags.has(tag)}">
      <span>${esc(tag)}</span>
      <span class="index-count-cell">${count ?? ""}</span>
    </button>`
    )
    .join("");
  tagFilterListEl.querySelectorAll(".index-item").forEach((btn) => {
    btn.addEventListener("click", () => toggleTagFilter(btn.dataset.tag));
  });
}

function renderActiveFilters() {
  const chips = [];
  activeCategories.forEach((cat) => chips.push({ type: "category", label: cat }));
  activeTags.forEach((tag) => chips.push({ type: "tag", label: tag }));

  activeFiltersEl.hidden = chips.length === 0;
  activeFiltersListEl.innerHTML = chips
    .map(
      (c) => `<button type="button" class="chip" data-type="${c.type}" data-label="${esc(c.label)}">${esc(c.label)}<span class="chip-x" aria-hidden="true">×</span></button>`
    )
    .join("");
  activeFiltersListEl.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.dataset.type === "category") toggleCategoryFilter(chip.dataset.label);
      else toggleTagFilter(chip.dataset.label);
    });
  });
}

function toggleCategoryFilter(cat) {
  if (activeCategories.has(cat)) activeCategories.delete(cat);
  else activeCategories.add(cat);
  renderCategoryFilters();
  renderActiveFilters();
  render();
}

function toggleTagFilter(tag) {
  if (activeTags.has(tag)) activeTags.delete(tag);
  else activeTags.add(tag);
  renderTagFilterList();
  renderActiveFilters();
  render();
}

function clearFilters() {
  activeCategories.clear();
  activeTags.clear();
  renderCategoryFilters();
  renderTagFilterList();
  renderActiveFilters();
  render();
}

function render() {
  const query = searchEl.value.trim();
  visibleItems = items.filter(
    (item) => matchesCategory(item) && matchesTags(item) && matchesSearch(item, query)
  );

  grid.innerHTML = "";
  emptyEl.hidden = items.length !== 0;
  noResultsEl.hidden = items.length === 0 || visibleItems.length !== 0;

  if (items.length) {
    const w = indexWidth(items.length);
    resultCountEl.textContent =
      visibleItems.length === items.length
        ? `${pad(items.length, w)} references`
        : `${pad(visibleItems.length, w)} of ${pad(items.length, w)}`;
  } else {
    resultCountEl.textContent = "";
  }

  if (items.length === 0) return;

  visibleItems.forEach((item, i) => {
    grid.appendChild(renderCard(item, i, visibleItems.length));
  });

  hasRenderedOnce = true;
}

/* ---------- data + selection ---------- */

async function loadGallery() {
  const res = await fetch("/data/gallery.json", { cache: "no-store" });
  items = await res.json();
  renderCategoryFilters();
  renderTagFilterList();
  render();
  openFromHash();
}

function showFigmaModal() {
  const modal = document.getElementById("figma-modal");
  const input = document.getElementById("figma-url-input");
  modal.hidden = false;
  input.focus();
  input.value = "";
}

function closeFigmaModal() {
  const modal = document.getElementById("figma-modal");
  modal.hidden = true;
}

async function submitFigmaUrl() {
  const input = document.getElementById("figma-url-input");
  const figmaUrl = input.value.trim();

  if (!figmaUrl) {
    alert("Please enter a Figma URL");
    return;
  }

  closeFigmaModal();

  const selectedItems = items.filter((item) => selected.has(item.id));
  saveFigmaBtn.disabled = true;
  saveFigmaBtn.textContent = "Building Figma file…";

  try {
    const res = await fetch("/api/selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: selectedItems,
        figmaUrl: figmaUrl
      }),
    });
    const data = await res.json();
    if (data.ok && data.figmaUrl) {
      saveFigmaBtn.textContent = "✓ Figma file created";
      setTimeout(() => {
        window.open(data.figmaUrl, "_blank");
      }, 500);
    } else {
      saveFigmaBtn.textContent = "Failed";
      console.error(data.error, data.details);
    }
  } catch (err) {
    saveFigmaBtn.textContent = "Failed";
    console.error(err);
  } finally {
    setTimeout(() => {
      saveFigmaBtn.disabled = false;
      saveFigmaBtn.textContent = "Save for Figma";
    }, 3000);
  }
}

function showProcessingModal() {
  const processingModal = document.getElementById("figma-processing-modal");
  processingModal.hidden = false;

  // Auto-close after 5 minutes (300 seconds)
  setTimeout(() => {
    closeProcessingModal();
  }, 300000);
}

function closeProcessingModal() {
  const processingModal = document.getElementById("figma-processing-modal");
  processingModal.hidden = true;
}

function saveForFigma() {
  showFigmaModal();
}

async function saveForClaude() {
  const selectedItems = items.filter((item) => selected.has(item.id));
  saveClaudeBtn.disabled = true;
  saveClaudeBtn.textContent = "Saving…";
  try {
    const res = await fetch("/api/selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: selectedItems }),
    });
    const data = await res.json();
    saveClaudeBtn.textContent = data.ok ? "Saved" : "Failed";
  } catch (err) {
    saveClaudeBtn.textContent = "Failed";
  } finally {
    setTimeout(() => {
      saveClaudeBtn.disabled = false;
      saveClaudeBtn.textContent = "Save for Claude Code";
    }, 1500);
  }
}

/* ---------- index drawer ---------- */

function closeIndexDrawer() {
  document.body.classList.remove("index-open");
  indexToggle.setAttribute("aria-expanded", "false");
}

function toggleIndexDrawer() {
  const open = document.body.classList.toggle("index-open");
  indexToggle.setAttribute("aria-expanded", String(open));
}

/* ---------- wiring ---------- */

searchEl.addEventListener("input", render);
clearFiltersBtn.addEventListener("click", clearFilters);
clearFiltersBtn2.addEventListener("click", clearFilters);
clearBtn.addEventListener("click", () => {
  selected.clear();
  grid.querySelectorAll(".card.selected").forEach((card) => card.classList.remove("selected"));
  grid.querySelectorAll(".card-check").forEach((c) => c.setAttribute("aria-checked", "false"));
  updateSelectionBar();
  if (!lightboxEl.hidden) renderDetailActions();
});
saveFigmaBtn.addEventListener("click", saveForFigma);
saveClaudeBtn.addEventListener("click", saveForClaude);
indexToggle.addEventListener("click", toggleIndexDrawer);

const figmaModal = document.getElementById("figma-modal");
const figmaCancelBtn = document.getElementById("figma-cancel");
const figmaSubmitBtn = document.getElementById("figma-submit");
const figmaUrlInput = document.getElementById("figma-url-input");

figmaCancelBtn.addEventListener("click", closeFigmaModal);
figmaSubmitBtn.addEventListener("click", submitFigmaUrl);
figmaUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitFigmaUrl();
  if (e.key === "Escape") closeFigmaModal();
});
figmaModal.addEventListener("click", (e) => {
  if (e.target === figmaModal) closeFigmaModal();
});

lightboxCloseBtn.addEventListener("click", closeDetail);
detailPrev.addEventListener("click", () => stepDetail(-1));
detailNext.addEventListener("click", () => stepDetail(1));
lightboxEl.addEventListener("click", (e) => {
  if (e.target === lightboxEl || e.target.classList.contains("detail-stage")) closeDetail();
});

window.addEventListener("keydown", (e) => {
  const typing = e.target === searchEl;

  if (!lightboxEl.hidden) {
    if (e.key === "Escape") closeDetail();
    else if (e.key === "ArrowLeft") stepDetail(-1);
    else if (e.key === "ArrowRight") stepDetail(1);
    return;
  }

  if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  } else if (e.key === "Escape") {
    if (document.body.classList.contains("index-open")) closeIndexDrawer();
    else if (typing) {
      if (searchEl.value) {
        searchEl.value = "";
        render();
      } else {
        searchEl.blur();
      }
    }
  }
});

window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#ref=")) openFromHash();
  else if (!lightboxEl.hidden) closeDetail();
});

document.addEventListener("click", (e) => {
  if (!document.body.classList.contains("index-open")) return;
  if (e.target.closest("#index") || e.target.closest("#index-toggle")) return;
  closeIndexDrawer();
});

loadGallery();
