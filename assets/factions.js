/* Faction Rankings page. Each player's rankings.json row carries a
   `faction_points` breakdown — points earned per faction, summed only from
   the events they actually played that faction in (so a player who
   switched factions mid-season only contributes the points earned under
   each one). This page totals those breakdowns across NI players and
   surfaces the top 3 scoring players per faction. */

let rows = [];       // raw player rows from rankings.json
let factions = [];   // aggregated per-faction rows
let index = {};
let year = null;
let niPlayerCount = 0;
let sortCol = 2;    // default: total points
let sortDir = -1;   // desc
const regionFilter = new Set(["NI"]);   // fixed to NI, matches the main rankings page

const COLS = ["rank", "faction", "total_points", "player_count"];

async function init() {
  const resolved = await resolveYear();
  year = resolved.year;
  renderYearButtons(document.getElementById("year-btns"), resolved.years, year);

  try {
    index = await fetchJSON(`data/${year}/index.json`);
    rows = await fetchJSON(`data/${year}/rankings.json`);
  } catch (e) {
    document.getElementById("factions-tbody").innerHTML =
      `<tr><td colspan="5" class="loading error-state">Failed to load ${year} rankings: ${e.message}</td></tr>`;
    return;
  }

  document.getElementById("season-label").textContent =
    `${year} season · ${index.window ? index.window.start + " → " + index.window.end : ""}`;

  const pool = rows.filter(r => regionMatches(r.regions, regionFilter));
  niPlayerCount = pool.length;
  factions = aggregateFactions(pool);

  renderTable();
  renderFooter(index);
  setupSorting();
  document.getElementById("search").addEventListener("input", debounce(renderTable, 200));
}

function aggregateFactions(pool) {
  const byFaction = new Map();
  for (const r of pool) {
    for (const fp of (r.faction_points || [])) {
      if (!byFaction.has(fp.faction)) byFaction.set(fp.faction, []);
      byFaction.get(fp.faction).push({
        user_id: r.user_id,
        player_name: r.player_name,
        points: fp.points,
        events_played: fp.events_played,
      });
    }
  }

  const list = [...byFaction.entries()].map(([faction, players]) => {
    const ordered = [...players].sort((a, b) => b.points - a.points);
    return {
      faction,
      total_points: Math.round(players.reduce((sum, p) => sum + (p.points || 0), 0) * 1000) / 1000,
      player_count: players.length,
      top_players: ordered.slice(0, 3),
    };
  });

  list.sort((a, b) => b.total_points - a.total_points);
  let rank = 0, prevPts = null;
  return list.map((f, i) => {
    if (f.total_points !== prevPts) { rank = i + 1; prevPts = f.total_points; }
    return { ...f, rank };
  });
}

function playerHref(uid) {
  const q = year ? `?year=${year}` : "";
  return `player/${encodeURIComponent(uid)}${q}`;
}

function sortedRows(data) {
  const key = COLS[sortCol];
  return [...data].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (typeof av === "string" || typeof bv === "string") {
      return String(av ?? "").localeCompare(String(bv ?? "")) * sortDir;
    }
    return ((av ?? 0) - (bv ?? 0)) * sortDir;
  });
}

function filtered() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  let data = factions;
  if (q) data = data.filter(f => f.faction.toLowerCase().includes(q));
  return sortedRows(data);
}

function topPlayersHtml(top) {
  if (!top.length) return "—";
  return top.map((p, i) => `
    <div>
      <a class="faction-link" href="${playerHref(p.user_id)}">${i + 1}. ${p.player_name || "Unknown"}</a>
      <span style="color:var(--dim)">(${fmtPoints(p.points)})</span>
    </div>`).join("");
}

function renderTable() {
  const data = filtered();
  document.getElementById("row-count").textContent = `${data.length} factions`;
  document.getElementById("build-info").textContent =
    `${factions.length} factions · ${niPlayerCount} players`;
  const tbody = document.getElementById("factions-tbody");
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">No factions match.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(f => `
    <tr>
      <td style="color:var(--dim)">${f.rank}</td>
      <td>${f.faction}</td>
      <td data-sort="${f.total_points}"><strong>${fmtPoints(f.total_points)}</strong></td>
      <td data-sort="${f.player_count}">${f.player_count}</td>
      <td>${topPlayersHtml(f.top_players)}</td>
    </tr>`).join("");
  syncSortIndicators();
}

function setupSorting() {
  const headers = document.querySelectorAll("#factions-table thead th");
  headers.forEach((th, i) => {
    if (i >= COLS.length) return;   // Top 3 column isn't sortable
    th.addEventListener("click", () => {
      if (sortCol === i) { sortDir = -sortDir; }
      else { sortCol = i; sortDir = (i === 2 || i === 3) ? -1 : 1; }
      renderTable();
    });
  });
}

function syncSortIndicators() {
  const headers = document.querySelectorAll("#factions-table thead th");
  headers.forEach((h, i) => {
    h.classList.remove("sort-asc", "sort-desc");
    if (i === sortCol) h.classList.add(sortDir === 1 ? "sort-asc" : "sort-desc");
  });
}

init();
