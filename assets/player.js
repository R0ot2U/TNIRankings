/* Player detail page. Loads data/<year>/player/<safeUid>.json.
   Reachable via the pretty URL /player/<userId> (see 404.html) or ?uid=<userId>. */

function getUid() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("uid");
  if (q) return q;
  // Fallback: pretty path /.../player/<uid>
  const parts = location.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("player");
  if (i !== -1 && parts.length >= i + 2) return decodeURIComponent(parts[i + 1]);
  return null;
}

// Mirror the Python _safe_id: [^A-Za-z0-9_-] -> _
function safeUid(uid) {
  return String(uid).replace(/[^A-Za-z0-9_-]/g, "_");
}

const BCP_EVENT = id => `https://www.bestcoastpairings.com/event/${id}`;

const regionFilter = new Set(["NI"]);   // exclusive region filter (NI, ROI, or neither); NI selected by default
let rankingRows = [];

function filterLabel() {
  return regionFilter.size ? [...regionFilter][0] : "All";
}

// Where this player ranks among the currently region-filtered player pool
// (same tie-break as the rankings page), or null if they don't match the
// active filter at all.
function computeFilteredRank(uid) {
  const pool = rankingRows.filter(r => regionMatches(r.regions, regionFilter));
  const match = withRanks(pool).find(r => r.user_id === uid);
  return match ? match.rank : null;
}

function updateRankDisplay(uid) {
  const rank = computeFilteredRank(uid);
  document.getElementById("player-rank-val").textContent = rank ?? "—";
  document.getElementById("player-rank-note").textContent = `(${filterLabel()})`;
}

// Directory containing player.html itself (works whether we're currently at
// the real .../player.html or the rewritten pretty .../player/<uid> path).
function siteBase() {
  return location.pathname.replace(/\/(player\/[^/]*|player\.html)$/, "");
}

// Recomputed fresh each call against the live location.pathname, so it stays
// correct both before and after the pretty-URL history.replaceState below.
function backLinkHref(year) {
  return `${siteBase()}/index.html?year=${year}`;
}

async function init() {
  const resolved = await resolveYear();
  const year = resolved.year;
  const uid = getUid();
  const content = document.getElementById("player-content");

  // Preserve the season on the back link.
  document.getElementById("back-link").href = backLinkHref(year);

  if (!uid) {
    content.innerHTML = `<div class="empty">No player specified.</div>`;
    return;
  }

  // Fetch data FIRST — relative paths resolve against the current document URL,
  // so we must not rewrite the address bar until after the fetches complete.
  let p, index = {};
  try {
    index = await fetchJSON(`data/${year}/index.json`);
    p = await fetchJSON(`data/${year}/player/${safeUid(uid)}.json`);
    rankingRows = await fetchJSON(`data/${year}/rankings.json`);
  } catch (e) {
    content.innerHTML = `<div class="empty">Player not found in the ${year} season.</div>`;
    return;
  }

  // Now normalise the address bar to the shareable pretty URL (cosmetic only).
  try {
    history.replaceState(null, "", `${siteBase()}/player/${encodeURIComponent(uid)}?year=${year}`);
  } catch (_) {}

  // The address bar just gained an extra /player/<uid> path segment — the
  // back link must be recomputed against it, or it resolves one level short.
  document.getElementById("back-link").href = backLinkHref(year);

  document.title = `${p.player_name} — TNIRankings`;
  renderFooter(index);

  const events = (p.events || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const countedN = events.filter(e => e.counts).length;

  const initialRank = computeFilteredRank(uid);

  content.innerHTML = `
    <div class="hero">
      <div>
        <h2>${p.player_name || uid}</h2>
        <div class="meta">${regionsHtml(p.regions)} ${p.faction ? "· " + p.faction : ""}${p.team ? " · " + p.team : ""}</div>
        <div class="btn-group" id="player-region-filter" role="group" aria-label="Region filter" style="margin-top:8px;">
          <button type="button" class="btn${regionFilter.has("NI") ? " active" : ""}" data-region="NI">NI</button>
          <button type="button" class="btn${regionFilter.has("ROI") ? " active" : ""}" data-region="ROI">ROI</button>
        </div>
      </div>
      <div class="hero-stats">
        <div class="stat-box"><div class="val" id="player-rank-val">${initialRank ?? "—"}</div><div class="lbl">Rank <span id="player-rank-note" style="color:var(--dim)">(${filterLabel()})</span></div></div>
        <div class="stat-box"><div class="val">${fmtPoints(p.total_points)}</div><div class="lbl">Points</div></div>
        <div class="stat-box"><div class="val">${p.events_played || 0}</div><div class="lbl">Events</div></div>
        <div class="stat-box"><div class="val">${p.best_finish ?? "—"}</div><div class="lbl">Best finish</div></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Counting Events
        <span class="panel-note">(${events.length} played · best ${countedN} count toward total)</span></div>
      <div class="table-wrap">
        <table id="events-table">
          <thead>
            <tr>
              <th>Date</th><th>Event</th><th>Region</th><th>Players</th>
              <th>Rounds</th><th>Placing</th><th>Max</th><th>Points</th>
            </tr>
          </thead>
          <tbody>
            ${events.map(ev => `
              <tr${ev.counts ? "" : ' style="opacity:.5" title="Not one of the best results this season — does not count toward the total"'}>
                <td style="color:var(--dim)" data-sort="${ev.date ? new Date(ev.date).getTime() : 0}">${fmtDate(ev.date)}</td>
                <td><a class="list-link" href="${BCP_EVENT(ev.event_id)}" target="_blank" rel="noopener">${ev.event_name || ev.event_id}</a>${ev.forced ? ' <span class="badge badge-yellow">override</span>' : ""}</td>
                <td>${regionBadge(ev.region)}</td>
                <td>${ev.field_size ?? ""}</td>
                <td>${ev.rounds ?? ""}</td>
                <td>${ev.placing ?? ""}</td>
                <td style="color:var(--dim)">${ev.max_points ?? ""}</td>
                <td data-sort="${ev.points || 0}"><strong>${fmtPoints(ev.points)}</strong></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  const table = document.getElementById("events-table");
  if (table) makeSortable(table);

  setupRegionFilter("player-region-filter", regionFilter, () => updateRankDisplay(uid));
}

init();
