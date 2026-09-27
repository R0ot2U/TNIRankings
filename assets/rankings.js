/* Rankings leaderboard page. */

let rows = [];
let index = {};
let year = null;
let sortCol = 0;   // default: rank
let sortDir = 1;   // 1 = asc
const regionFilter = new Set(["NI"]);   // active region filters, ANDed together; NI selected by default

const COLS = ["rank", "player_name", "total_points", "events_played", "best_finish", "region"];

async function init() {
  const resolved = await resolveYear();
  year = resolved.year;
  renderYearButtons(document.getElementById("year-btns"), resolved.years, year);

  try {
    index = await fetchJSON(`data/${year}/index.json`);
    rows = await fetchJSON(`data/${year}/rankings.json`);
  } catch (e) {
    document.getElementById("rankings-tbody").innerHTML =
      `<tr><td colspan="6" class="loading error-state">Failed to load ${year} rankings: ${e.message}</td></tr>`;
    return;
  }

  document.getElementById("season-label").textContent =
    `${year} season · ${index.window ? index.window.start + " → " + index.window.end : ""}`;
  document.getElementById("build-info").textContent =
    `${index.total_players ?? rows.length} players · ${index.total_events ?? 0} events`;

  renderTable();
  renderFooter(index);
  setupSorting();
  setupRegionFilter("region-filter", regionFilter, renderTable);
  document.getElementById("search").addEventListener("input", debounce(renderTable, 200));
}

function playerHref(uid) {
  const q = year ? `?year=${year}` : "";
  return `player/${encodeURIComponent(uid)}${q}`;
}

function sortedRows(data) {
  const key = COLS[sortCol];
  return [...data].sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === "region") { av = (a.regions || []).join("/"); bv = (b.regions || []).join("/"); }
    if (typeof av === "string" || typeof bv === "string") {
      return String(av ?? "").localeCompare(String(bv ?? "")) * sortDir;
    }
    return ((av ?? Infinity) - (bv ?? Infinity)) * sortDir;
  });
}

function filtered() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  let data = rows;
  if (regionFilter.size) data = data.filter(r => regionMatches(r.regions, regionFilter));
  if (q) data = data.filter(r => (r.player_name || "").toLowerCase().includes(q));
  return sortedRows(withRanks(data));
}

function renderTable() {
  const data = filtered();
  document.getElementById("row-count").textContent = `${data.length} players`;
  const tbody = document.getElementById("rankings-tbody");
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No players match.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td style="color:var(--dim)">${r.rank ?? "—"}</td>
      <td><a class="faction-link" href="${playerHref(r.user_id)}">${r.player_name || "Unknown"}</a></td>
      <td data-sort="${r.total_points || 0}"><strong>${fmtPoints(r.total_points)}</strong></td>
      <td data-sort="${r.events_played || 0}">${r.events_played || 0}</td>
      <td data-sort="${r.best_finish ?? 9999}">${r.best_finish ?? "—"}</td>
      <td>${regionsHtml(r.regions)}</td>
    </tr>`).join("");
  syncSortIndicators();
}

function setupSorting() {
  const headers = document.querySelectorAll("#rankings-table thead th");
  headers.forEach((th, i) => {
    th.addEventListener("click", () => {
      if (sortCol === i) { sortDir = -sortDir; }
      else { sortCol = i; sortDir = (i === 2 || i === 3) ? -1 : 1; }
      renderTable();
    });
  });
}

function syncSortIndicators() {
  const headers = document.querySelectorAll("#rankings-table thead th");
  headers.forEach((h, i) => {
    h.classList.remove("sort-asc", "sort-desc");
    if (i === sortCol) h.classList.add(sortDir === 1 ? "sort-asc" : "sort-desc");
  });
}

init();
