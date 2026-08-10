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
const saveBtn = document.getElementById("save-selection");
const lightboxEl = document.getElementById("lightbox");
const lightboxFrameEl = lightboxEl.querySelector(".lightbox-frame");
const lightboxCloseBtn = document.getElementById("lightbox-close");

let items = [];
let selected = new Set();
let activeCategories = new Set();
let activeTags = new Set();

function checkIcon() {
  return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 8.5L6.2 11.5L13 4.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderCard(item, index, total) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = item.id;
  if (selected.has(item.id)) card.classList.add("selected");

  const tags = item.tags || [];
  const visibleTags = tags.slice(0, 3);
  const overflow = tags.length - visibleTags.length;
  const palette = item.palette || [];
  const isVideo = item.mediaType === "video";

  const mediaHtml = isVideo
    ? `<video class="card-image" src="/images/${encodeURIComponent(item.filename)}" poster="/images/${encodeURIComponent(item.thumbnail || "")}" muted loop playsinline preload="metadata"></video>
       <span class="card-video-badge">▶</span>`
    : `<img class="card-image" src="/images/${encodeURIComponent(item.filename)}" alt="${item.title || ""}" loading="lazy" />`;

  card.innerHTML = `
    <div class="card-surface">
      <div class="card-check">${checkIcon()}</div>
      ${mediaHtml}
      <div class="card-body">
        <div class="card-title-row">
          <h2 class="card-title">${item.title || "Untitled"}</h2>
        </div>
        <div class="card-subtitle">${item.subtitle || ""}</div>
        <div class="card-tags">
          ${visibleTags.map((t) => `<span class="tag" data-tag="${t}">${t}</span>`).join("")}
          ${overflow > 0 ? `<span class="tag tag-overflow">+${overflow}</span>` : ""}
        </div>
        ${palette.length > 0 ? `
        <div class="card-palette">
          ${palette.map((hex) => `<span class="swatch" style="background:${hex}" title="${hex}"></span>`).join("")}
        </div>` : ""}
        <div class="card-footer">
          <span class="card-category" data-category="${item.category || "Uncategorized"}">${item.category || "Uncategorized"}</span>
          <span class="card-index">${String(index + 1).padStart(2, "0")} / ${total}</span>
        </div>
      </div>
    </div>
  `;

  card.addEventListener("click", () => toggleSelect(item.id, card));

  const mediaEl = card.querySelector(".card-image");
  mediaEl.addEventListener("click", (e) => {
    e.stopPropagation();
    openLightbox(item);
  });

  if (isVideo) {
    const videoEl = card.querySelector("video.card-image");
    card.addEventListener("mouseenter", () => videoEl.play().catch(() => {}));
    card.addEventListener("mouseleave", () => {
      videoEl.pause();
      videoEl.currentTime = 0;
    });
    videoEl.addEventListener("loadedmetadata", scheduleLayout);
  } else {
    const imgEl = card.querySelector("img.card-image");
    if (imgEl.complete) scheduleLayout();
    else imgEl.addEventListener("load", scheduleLayout);
  }

  card.querySelectorAll(".tag[data-tag]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTagFilter(el.dataset.tag);
    });
  });

  const categoryEl = card.querySelector(".card-category[data-category]");
  categoryEl.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCategoryFilter(categoryEl.dataset.category);
  });

  return card;
}

function openLightbox(item) {
  const isVideo = item.mediaType === "video";
  lightboxFrameEl.innerHTML = isVideo
    ? `<video src="/images/${encodeURIComponent(item.filename)}" controls autoplay loop playsinline></video>`
    : `<img src="/images/${encodeURIComponent(item.filename)}" alt="${item.title || ""}" />`;
  lightboxEl.hidden = false;
}

function closeLightbox() {
  lightboxEl.hidden = true;
  lightboxFrameEl.innerHTML = "";
}

function toggleSelect(id, card) {
  if (selected.has(id)) {
    selected.delete(id);
    card.classList.remove("selected");
  } else {
    selected.add(id);
    card.classList.add("selected");
  }
  updateSelectionBar();
}

function updateSelectionBar() {
  const count = selected.size;
  selectionBar.hidden = count === 0;
  selectionCountEl.textContent = `${count} selected`;
}

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [item.title, item.subtitle, item.category, ...(item.tags || [])]
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
  categoryFiltersEl.innerHTML = counts
    .map(
      ([cat, count]) => `
    <button type="button" class="pill${activeCategories.has(cat) ? " active" : ""}" data-category="${cat}">
      ${cat} <span class="pill-count">${count}</span>
    </button>`
    )
    .join("");
  categoryFiltersEl.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => toggleCategoryFilter(btn.dataset.category));
  });
}

function renderTagFilterList() {
  const counts = tagCounts();
  tagFilterListEl.innerHTML = counts
    .map(
      ([tag, count]) => `
    <label class="tag-filter-item">
      <input type="checkbox" data-tag="${tag}" ${activeTags.has(tag) ? "checked" : ""} />
      <span>${tag}</span>
      <span class="pill-count">${count}</span>
    </label>`
    )
    .join("");
  tagFilterListEl.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => toggleTagFilter(cb.dataset.tag));
  });
}

function renderActiveFilters() {
  const chips = [];
  activeCategories.forEach((cat) => chips.push({ type: "category", label: cat }));
  activeTags.forEach((tag) => chips.push({ type: "tag", label: tag }));

  activeFiltersEl.hidden = chips.length === 0;
  activeFiltersListEl.innerHTML = chips
    .map((c) => `<button type="button" class="chip" data-type="${c.type}" data-label="${c.label}">${c.label} ×</button>`)
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
  const filtered = items.filter(
    (item) => matchesCategory(item) && matchesTags(item) && matchesSearch(item, query)
  );

  grid.innerHTML = "";
  emptyEl.hidden = items.length !== 0;
  noResultsEl.hidden = items.length === 0 || filtered.length !== 0;
  resultCountEl.textContent = items.length ? `${filtered.length} / ${items.length}` : "";

  if (items.length === 0) return;

  filtered.forEach((item, i) => {
    grid.appendChild(renderCard(item, i, filtered.length));
  });

  layoutMasonry();
}

// Cards are absolutely positioned (not CSS multi-column) because Safari
// recomputes column fragmentation whenever a fragment's own paint
// properties change, which flickers the top item of every column on hover.
const CARD_MIN_WIDTH = 260;
const GRID_GAP = 28;
let layoutScheduled = false;

function scheduleLayout() {
  if (layoutScheduled) return;
  layoutScheduled = true;
  requestAnimationFrame(() => {
    layoutScheduled = false;
    layoutMasonry();
  });
}

function layoutMasonry() {
  const cards = [...grid.children];
  if (cards.length === 0) {
    grid.style.height = "0px";
    return;
  }

  const gridStyle = getComputedStyle(grid);
  const paddingLeft = parseFloat(gridStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(gridStyle.paddingRight) || 0;
  const paddingTop = parseFloat(gridStyle.paddingTop) || 0;
  const paddingBottom = parseFloat(gridStyle.paddingBottom) || 0;
  const containerWidth = grid.clientWidth - paddingLeft - paddingRight;

  const columns = Math.max(1, Math.floor((containerWidth + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)));
  const columnWidth = (containerWidth - (columns - 1) * GRID_GAP) / columns;
  const columnHeights = new Array(columns).fill(0);

  cards.forEach((card) => {
    card.style.width = `${columnWidth}px`;
    let col = 0;
    for (let i = 1; i < columns; i++) {
      if (columnHeights[i] < columnHeights[col]) col = i;
    }
    const left = paddingLeft + col * (columnWidth + GRID_GAP);
    const top = paddingTop + columnHeights[col];
    card.style.transform = `translate(${left}px, ${top}px)`;
    columnHeights[col] += card.offsetHeight + GRID_GAP;
  });

  grid.style.height = `${paddingTop + Math.max(...columnHeights) - GRID_GAP + paddingBottom}px`;
}

async function loadGallery() {
  const res = await fetch("/data/gallery.json", { cache: "no-store" });
  items = await res.json();
  renderCategoryFilters();
  renderTagFilterList();
  render();
}

async function saveSelection() {
  const selectedItems = items.filter((item) => selected.has(item.id));
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  try {
    const res = await fetch("/api/selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: selectedItems }),
    });
    const data = await res.json();
    saveBtn.textContent = data.ok ? "Saved ✓" : "Failed";
  } catch (err) {
    saveBtn.textContent = "Failed";
  } finally {
    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save for Claude Code";
    }, 1500);
  }
}

searchEl.addEventListener("input", render);
clearFiltersBtn.addEventListener("click", clearFilters);
clearFiltersBtn2.addEventListener("click", clearFilters);
clearBtn.addEventListener("click", () => {
  selected.clear();
  render();
  updateSelectionBar();
});
saveBtn.addEventListener("click", saveSelection);
window.addEventListener("resize", scheduleLayout);
lightboxCloseBtn.addEventListener("click", closeLightbox);
lightboxEl.addEventListener("click", (e) => {
  if (e.target === lightboxEl) closeLightbox();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !lightboxEl.hidden) closeLightbox();
});

loadGallery();
