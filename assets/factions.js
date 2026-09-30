/* Faction Rankings page. Each player's rankings.json row carries a
   `faction_points` breakdown — points/win-rate/X-1 stats earned per
   faction, computed only from the events they actually played that
   faction in (so a player who switched factions mid-season only
   contributes to each faction they actually played). This page aggregates
   those breakdowns across NI players and surfaces the top 3 players per
   faction, for whichever view is selected. */

let rows = [];       // raw player rows from rankings.json
let factions = [];   // aggregated per-faction rows (all views precomputed)
let index = {};
let year = null;
let niPlayerCount = 0;
let sortCol = 2;    // default: the view's metric column
let sortDir = -1;   // desc
let currentView = "winrate";
const regionFilter = new Set(["NI"]);   // fixed to NI, matches the main rankings page

// better: -1 means higher metric value is better (desc rank), +1 means lower
// is better (asc rank).
const VIEWS = {
  points: {
    label: "Total Points",
    better: -1,
    faction: f => f.total_points,
    facFmt: v => fmtPoints(v),
    player: p => p.points,
    playerFmt: v => fmtPoints(v),
    headerTitle: "Sum of every NI player's points earned in events played under this faction",
    topTitle: "Top 3 scoring players for this faction",
  },
  winrate: {
    label: "Win Rate",
    better: -1,
    faction: f => f.avg_win_rate,
    facFmt: v => v == null ? "—" : `${(v * 100).toFixed(1)}%`,
    player: p => p.win_rate,
    playerFmt: v => v == null ? "—" : `${(v * 100).toFixed(1)}%`,
    headerTitle: "Average win rate (win=1, draw=0.5, loss=0) across NI players who played this faction",
    topTitle: "Top 3 players by win rate for this faction",
  },
  x1: {
    label: "X-1 Rate",
    better: -1,
    faction: f => f.total_x1_points,
    facFmt: v => fmtPoints(v),
    player: p => p.x1_points,
    playerFmt: v => fmtPoints(v),
    headerTitle: "Total X-1 points (1pt per 3-round X-1, 2pts per 5+ round X-1) earned by NI players of this faction",
    topTitle: "Top 3 players by X-1 points for this faction",
  },
};

const COLS = ["rank", "faction", "metric", "player_count"];

async function init() {
  const resolved = await resolveYear();
  year = resolved.year;
  renderYearButtons(document.getElementById("year-btns"), resolved.years, year);
  renderViewButtons();

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

function renderViewButtons() {
  const el = document.getElementById("view-btns");
  el.innerHTML = Object.entries(VIEWS)
    .map(([key, v]) => `<button type="button" class="btn ${key === currentView ? "active" : ""}" data-view="${key}">${v.label}</button>`)
    .join("");
  el.querySelectorAll(".btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.view;
      if (key === currentView) return;
      currentView = key;
      sortCol = 2;
      sortDir = VIEWS[key].better;
      el.querySelectorAll(".btn").forEach(b => b.classList.toggle("active", b.dataset.view === key));
      updateHeaders();
      renderTable();
    });
  });
  updateHeaders();
}

function updateHeaders() {
  const view = VIEWS[currentView];
  const metricHeader = document.getElementById("metric-header");
  metricHeader.textContent = view.label;
  metricHeader.title = view.headerTitle;
  const topHeader = document.getElementById("top-players-header");
  topHeader.textContent = "Top 3 Players";
  topHeader.title = view.topTitle;
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
        games_played: fp.games_played || 0,
        win_rate: fp.win_rate ?? null,
        x1_points: fp.x1_points || 0,
      });
    }
  }

  const list = [...byFaction.entries()].map(([faction, players]) => {
    const withGames = players.filter(p => p.win_rate != null);
    return {
      faction,
      player_count: players.length,
      total_points: round(players.reduce((s, p) => s + (p.points || 0), 0), 3),
      avg_win_rate: withGames.length
        ? round(withGames.reduce((s, p) => s + p.win_rate, 0) / withGames.length, 4)
        : null,
      total_x1_points: round(players.reduce((s, p) => s + (p.x1_points || 0), 0), 3),
      players,
    };
  });

  return list;
}

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function playerHref(uid) {
  const q = year ? `?year=${year}` : "";
  return `player/${encodeURIComponent(uid)}${q}`;
}

// Rank is pinned to the current view's metric, independent of whatever
// column the user has clicked to sort the visible table by.
function computeRanks(list) {
  const view = VIEWS[currentView];
  const withVal = list.map(f => ({ f, v: view.faction(f) }));
  withVal.sort((a, b) => {
    if (a.v == null && b.v == null) return 0;
    if (a.v == null) return 1;
    if (b.v == null) return -1;
    return (a.v - b.v) * view.better;
  });
  let rank = 0, prev, seen = 0;
  return withVal.map(({ f, v }) => {
    seen++;
    if (v == null) return { ...f, rank: null };
    if (v !== prev) { rank = seen; prev = v; }
    return { ...f, rank };
  });
}

function sortedRows(data) {
  const view = VIEWS[currentView];
  const key = COLS[sortCol];
  return [...data].sort((a, b) => {
    let av, bv;
    if (key === "metric") { av = view.faction(a); bv = view.faction(b); }
    else { av = a[key]; bv = b[key]; }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" || typeof bv === "string") {
      return String(av ?? "").localeCompare(String(bv ?? "")) * sortDir;
    }
    return (av - bv) * sortDir;
  });
}

function filtered() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  let data = computeRanks(factions);
  if (q) data = data.filter(f => f.faction.toLowerCase().includes(q));
  return sortedRows(data);
}

function topPlayersHtml(f) {
  const view = VIEWS[currentView];
  const eligible = f.players.filter(p => view.player(p) != null);
  const ordered = [...eligible].sort((a, b) => (view.player(a) - view.player(b)) * view.better);
  const top = ordered.slice(0, 3);
  if (!top.length) return "—";
  return top.map((p, i) => `
    <div>
      <a class="faction-link" href="${playerHref(p.user_id)}">${i + 1}. ${p.player_name || "Unknown"}</a>
      <span style="color:var(--dim)">(${view.playerFmt(view.player(p))})</span>
    </div>`).join("");
}

function renderTable() {
  const view = VIEWS[currentView];
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
      <td style="color:var(--dim)">${f.rank ?? "—"}</td>
      <td>${f.faction}</td>
      <td data-sort="${view.faction(f) ?? ""}"><strong>${view.facFmt(view.faction(f))}</strong></td>
      <td data-sort="${f.player_count}">${f.player_count}</td>
      <td>${topPlayersHtml(f)}</td>
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
