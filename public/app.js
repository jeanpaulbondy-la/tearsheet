const grid = document.getElementById("grid");
const emptyEl = document.getElementById("empty");
const searchEl = document.getElementById("search");
const selectionBar = document.getElementById("selection-bar");
const selectionCountEl = document.getElementById("selection-count");
const clearBtn = document.getElementById("clear-selection");
const saveBtn = document.getElementById("save-selection");

let items = [];
let selected = new Set();

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

  card.innerHTML = `
    <div class="card-check">${checkIcon()}</div>
    <img class="card-image" src="/images/${encodeURIComponent(item.filename)}" alt="${item.title || ""}" loading="lazy" />
    <div class="card-body">
      <div class="card-title-row">
        <h2 class="card-title">${item.title || "Untitled"}</h2>
      </div>
      <div class="card-subtitle">${item.subtitle || ""}</div>
      <div class="card-tags">
        ${visibleTags.map((t) => `<span class="tag">${t}</span>`).join("")}
        ${overflow > 0 ? `<span class="tag">+${overflow}</span>` : ""}
      </div>
      ${palette.length > 0 ? `
      <div class="card-palette">
        ${palette.map((hex) => `<span class="swatch" style="background:${hex}" title="${hex}"></span>`).join("")}
      </div>` : ""}
      <div class="card-footer">
        <span class="card-category">${item.category || "Uncategorized"}</span>
        <span class="card-index">${String(index + 1).padStart(2, "0")} / ${total}</span>
      </div>
    </div>
  `;

  card.addEventListener("click", () => toggleSelect(item.id, card));
  return card;
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

function render() {
  const query = searchEl.value.trim();
  const filtered = items.filter((item) => matchesSearch(item, query));

  grid.innerHTML = "";
  emptyEl.hidden = items.length !== 0;

  if (items.length === 0) return;

  filtered.forEach((item, i) => {
    grid.appendChild(renderCard(item, i, filtered.length));
  });
}

async function loadGallery() {
  const res = await fetch("/data/gallery.json", { cache: "no-store" });
  items = await res.json();
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
clearBtn.addEventListener("click", () => {
  selected.clear();
  render();
  updateSelectionBar();
});
saveBtn.addEventListener("click", saveSelection);

loadGallery();
