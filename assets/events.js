/* Events list page. */

let events = [];
let index = {};
let year = null;

const BCP_EVENT = id => `https://www.bestcoastpairings.com/event/${id}`;

async function init() {
  const resolved = await resolveYear();
  year = resolved.year;
  renderYearButtons(document.getElementById("year-btns"), resolved.years, year);

  try {
    index = await fetchJSON(`data/${year}/index.json`);
    events = await fetchJSON(`data/${year}/events.json`);
  } catch (e) {
    document.getElementById("events-tbody").innerHTML =
      `<tr><td colspan="6" class="loading error-state">Failed to load ${year} events: ${e.message}</td></tr>`;
    return;
  }

  document.getElementById("season-label").textContent = `${year} season`;
  document.getElementById("build-info").textContent =
    `${index.total_events ?? events.length} events · ${index.total_players ?? 0} players`;

  renderTable();
  renderFooter(index);
  const table = document.getElementById("events-table");
  if (table) makeSortable(table);
  document.getElementById("search").addEventListener("input", debounce(renderTable, 200));
}

function renderTable() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  let data = events;
  if (q) data = data.filter(e => (e.name || "").toLowerCase().includes(q));
  data = [...data].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  document.getElementById("row-count").textContent = `${data.length} events`;
  const tbody = document.getElementById("events-tbody");
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No events match.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(e => `
    <tr>
      <td style="color:var(--dim)" data-sort="${e.date || ""}">${fmtDate(e.date)}</td>
      <td><a class="list-link" href="${BCP_EVENT(e.event_id)}" target="_blank" rel="noopener">${e.name || e.event_id}</a>${e.forced ? ' <span class="badge badge-yellow">override</span>' : ""}</td>
      <td>${regionBadge(e.region)}</td>
      <td data-sort="${e.field_size || 0}">${e.field_size ?? ""}</td>
      <td data-sort="${e.rounds || 0}">${e.rounds ?? ""}</td>
      <td data-sort="${e.max_points || 0}">${e.max_points ?? ""}</td>
    </tr>`).join("");
}

init();
