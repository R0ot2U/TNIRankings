/* Faction Tier List page. Buckets every faction into S–F tiers by average
   win rate (win=1, draw=0.5, loss=0), averaged across each NI player's own
   win rate for that faction — same win-rate definition as the Win Rate view
   on the Factions page. Tier bands are fixed win-rate percentages (not
   percentile ranks), so a tier can end up empty or crowded as the meta
   shifts — that's expected and meaningful, not a bug.

   Faction images live in assets/factions/<slug>.png, where <slug> is the
   faction name lowercased with anything that isn't a-z/0-9 collapsed to a
   single hyphen (e.g. "Space Marines (Astartes)" -> "space-marines-astartes").
   Missing images fall back to a two-letter initials badge. */

const TIERS = [
  { key: "S", min: 0.58, color: "#f5c518" },
  { key: "A", min: 0.54, color: "#4caf50" },
  { key: "B", min: 0.50, color: "#8bc34a" },
  { key: "C", min: 0.46, color: "#ffc107" },
  { key: "D", min: 0.42, color: "#ff9800" },
  { key: "E", min: 0.36, color: "#ff5722" },
  { key: "F", min: -Infinity, color: "#f44336" },
];

let rows = [];
let factions = [];
let year = null;
const regionFilter = new Set(["NI"]);

async function init() {
  const resolved = await resolveYear();
  year = resolved.year;
  renderYearButtons(document.getElementById("year-btns"), resolved.years, year);

  let index;
  try {
    index = await fetchJSON(`data/${year}/index.json`);
    rows = await fetchJSON(`data/${year}/rankings.json`);
  } catch (e) {
    document.getElementById("tier-list").innerHTML =
      `<div class="loading error-state">Failed to load ${year} rankings: ${e.message}</div>`;
    return;
  }

  document.getElementById("season-label").textContent =
    `${year} season · ${index.window ? index.window.start + " → " + index.window.end : ""}`;

  const pool = rows.filter(r => regionMatches(r.regions, regionFilter));
  factions = aggregateWinRates(pool);

  renderTierList();
  renderFooter(index);
  document.getElementById("search").addEventListener("input", debounce(renderTierList, 200));
}

function aggregateWinRates(pool) {
  const byFaction = new Map();
  for (const r of pool) {
    for (const fp of (r.faction_points || [])) {
      if (fp.win_rate == null) continue;   // no scored games under this faction — nothing to tier
      if (!byFaction.has(fp.faction)) byFaction.set(fp.faction, []);
      byFaction.get(fp.faction).push(fp.win_rate);
    }
  }
  return [...byFaction.entries()].map(([faction, rates]) => ({
    faction,
    win_rate: rates.reduce((s, v) => s + v, 0) / rates.length,
    player_count: rates.length,
  }));
}

function tierFor(winRate) {
  return TIERS.find(t => winRate >= t.min) || TIERS[TIERS.length - 1];
}

function slugify(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function initials(name) {
  const words = (name || "").split(/[\s(),'-]+/).filter(Boolean);
  return words.slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
}

function tileHtml(f) {
  const slug = slugify(f.faction);
  return `
    <div class="tier-tile">
      <div class="tier-tile-img-wrap">
        <img src="assets/factions/${slug}.png" alt="${f.faction}" loading="lazy"
             onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';">
        <div class="tier-tile-fallback" style="display:none;">${initials(f.faction)}</div>
      </div>
      <div class="tier-tile-name">${f.faction}</div>
      <div class="tier-tile-wr">${(f.win_rate * 100).toFixed(1)}%</div>
    </div>`;
}

function renderTierList() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  const visible = q ? factions.filter(f => f.faction.toLowerCase().includes(q)) : factions;

  const buckets = new Map(TIERS.map(t => [t.key, []]));
  for (const f of visible) buckets.get(tierFor(f.win_rate).key).push(f);
  for (const list of buckets.values()) list.sort((a, b) => b.win_rate - a.win_rate);

  document.getElementById("row-count").textContent = `${visible.length} factions`;
  document.getElementById("build-info").textContent = `${factions.length} factions tiered`;

  document.getElementById("tier-list").innerHTML = TIERS.map(t => {
    const list = buckets.get(t.key);
    const body = list.length
      ? list.map(tileHtml).join("")
      : `<div class="tier-empty">No factions in this tier.</div>`;
    return `
      <div class="tier-row">
        <div class="tier-badge" style="background:${t.color}">
          <div>${t.key}</div>
          <div class="tier-badge-range">${t.min === -Infinity ? `< ${(TIERS[TIERS.indexOf(t) - 1].min * 100).toFixed(0)}%` : `≥ ${(t.min * 100).toFixed(0)}%`}</div>
        </div>
        <div class="tier-body">${body}</div>
      </div>`;
  }).join("");
}

init();
