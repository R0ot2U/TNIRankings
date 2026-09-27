/* Shared helpers for the TNIRankings site.
   Trimmed from the Informed Crusader app.js — only the pieces this site uses. */

// Cache manifest (content hashes) loaded once, used to bust stale JSON.
let cacheManifest = null;

async function loadCacheManifest() {
  if (cacheManifest) return cacheManifest;
  try {
    const resp = await fetch(`data/cache_manifest.json?t=${Date.now()}`);
    cacheManifest = resp.ok ? await resp.json() : {};
  } catch (e) {
    console.warn("Failed to load cache manifest; falling back to date-based busting", e);
    cacheManifest = {};
  }
  return cacheManifest;
}

async function fetchJSON(path, cacheBust = true) {
  const params = new URLSearchParams(window.location.search);
  const forceNoCache = params.has("nocache");
  const manifest = await loadCacheManifest();

  let url = path;
  if (forceNoCache) {
    url = `${path}?t=${Date.now()}`;
  } else if (cacheBust) {
    const relPath = path.startsWith("data/") ? path.slice(5) : path;
    const hash = manifest && manifest[relPath];
    url = hash ? `${path}?v=${hash}` : `${path}?v=${new Date().toISOString().split("T")[0]}`;
  }

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load ${path}: ${resp.status}`);
  return resp.json();
}

// Which season year to show. ?year=NNNN wins; otherwise years.json default.
async function resolveYear() {
  const params = new URLSearchParams(window.location.search);
  const requested = parseInt(params.get("year"), 10);
  let years = { years: [], default: null };
  try {
    years = await fetchJSON("data/years.json");
  } catch (_) {}
  const available = years.years || [];
  if (requested && available.includes(requested)) return { year: requested, years };
  return { year: years.default || available[available.length - 1] || new Date().getFullYear(), years };
}

// Render the year switcher into #year-btns (only if more than one season exists).
function renderYearButtons(el, years, current) {
  if (!el || !years || (years.years || []).length <= 1) return;
  el.innerHTML = years.years
    .slice()
    .sort((a, b) => b - a)
    .map(y => `<a class="btn ${y === current ? "active" : ""}" href="?year=${y}">${y}</a>`)
    .join("");
}

function regionBadge(region) {
  if (!region) return "";
  const cls = region === "NI" ? "badge-blue" : "badge-green";
  return `<span class="badge ${cls}">${region}</span>`;
}

function regionsHtml(regions) {
  return (regions || []).map(regionBadge).join(" ");
}

// filterSet holds at most one region (exclusive either/or filter — see
// setupRegionFilter below). Shared by the rankings and player pages.
function regionMatches(regions, filterSet) {
  if (!filterSet || filterSet.size === 0) return true;
  const set = new Set(regions || []);
  for (const rg of filterSet) {
    if (!set.has(rg)) return false;
  }
  return true;
}

// Recompute rank within a given set of rows, using the same canonical
// ordering/tie-break as the build script — independent of display sort.
function withRanks(data) {
  const ordered = [...data].sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.events_played !== a.events_played) return b.events_played - a.events_played;
    const bfA = a.best_finish ?? 9999, bfB = b.best_finish ?? 9999;
    if (bfA !== bfB) return bfA - bfB;
    return (a.player_name || "").toLowerCase().localeCompare((b.player_name || "").toLowerCase());
  });
  let rank = 0, prevKey = null;
  return ordered.map((r, i) => {
    const key = `${r.total_points}|${r.events_played}|${r.best_finish}`;
    if (key !== prevKey) { rank = i + 1; prevKey = key; }
    return { ...r, rank };
  });
}

// Wires exclusive (either/or) click behaviour for a `.btn-group` of region
// buttons: clicking a region selects only it (deselecting any other),
// clicking the already-selected region clears the filter entirely. At most
// one region is ever active. Mutates `filterSet` in place and calls
// `onChange` after each click.
function setupRegionFilter(containerId, filterSet, onChange) {
  const buttons = document.querySelectorAll(`#${containerId} .btn`);
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const region = btn.dataset.region;
      const wasActive = filterSet.has(region);
      filterSet.clear();
      if (!wasActive) filterSet.add(region);
      buttons.forEach(b => b.classList.toggle("active", filterSet.has(b.dataset.region)));
      onChange();
    });
  });
}

function fmtPoints(n) {
  return (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch (_) {
    return iso;
  }
}

// Click-to-sort for plain (non-leaderboard) tables: sorts by data-sort attr
// (falling back to text), toggling direction on repeat clicks. Used by the
// events table and the player detail's events table.
function makeSortable(table) {
  const headers = table.querySelectorAll("thead th");
  let sortCol = -1, sortDir = 1;

  headers.forEach((th, colIdx) => {
    th.addEventListener("click", () => {
      if (sortCol === colIdx) {
        sortDir = -sortDir;
      } else {
        sortCol = colIdx;
        sortDir = 1;
      }
      headers.forEach(h => h.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(sortDir === 1 ? "sort-asc" : "sort-desc");

      const tbody = table.querySelector("tbody");
      const rows = Array.from(tbody.querySelectorAll("tr"));
      rows.sort((a, b) => {
        const av = a.cells[colIdx]?.dataset.sort ?? a.cells[colIdx]?.textContent ?? "";
        const bv = b.cells[colIdx]?.dataset.sort ?? b.cells[colIdx]?.textContent ?? "";
        const an = parseFloat(av), bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * sortDir;
        return av.localeCompare(bv) * sortDir;
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });
}

// Debounce utility for search inputs.
function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Footer with data provenance + build date.
function renderFooter(index) {
  const el = document.getElementById("site-footer");
  if (!el) return;
  const built = index?.generated_at
    ? new Date(index.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const win = index?.window ? `${index.window.start} → ${index.window.end}` : "";
  el.innerHTML = `
    <div class="footer-inner">
      <span>Source: Best Coast Pairings &amp; New Recruit${win ? " · " + win : ""}${built ? " · built " + built : ""}</span>
      <span class="footer-links">
        <a href="about.html">Methodology</a>
        <a href="https://github.com/R0ot2U/TNIRankings" target="_blank" rel="noopener">GitHub ↗</a>
      </span>
    </div>`;
}
