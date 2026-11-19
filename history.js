// history.js
// ---------------------------------------------------------------
// Game history + the all-time leaderboard.
//
// The big idea: we only SAVE finished games (who played, scores,
// awards, every turn). The leaderboard is never saved by itself:
// it's worked out from the games every time it's shown.
// So deleting a wrong or test game automatically fixes everyone's
// wins, points and shots owed.
//
// Saved on this phone (localStorage):
//   cambodice-games    list of finished games
//   cambodice-paid     how many shots each person has paid off
//   cambodice-faces    latest photo of each person (kept apart so
//                      big photos aren't copied into every game)
//   cambodice-alltime  the OLD leaderboard from before history
//                      existed. Still counted, shown as "Earlier games".
// ---------------------------------------------------------------

const GAMES_KEY = "cambodice-games";
const PAID_KEY = "cambodice-paid";
const FACES_KEY = "cambodice-faces";
const LEGACY_KEY = "cambodice-alltime";

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

// All finished games, newest first
// Only games that look right are used, so one broken or junk entry
// in the online database can never crash the app.
// Anything that came from the internet is cleaned before it's drawn,
// so a booby-trapped name or picture can't run code in the app.
const BADGES = ["moneybag", "magnet", "flame", "snail", "rocket"];
function safeAvatar(a) {
  if (typeof a !== "string") return null;
  if (/^avatars\/[\w-]+\.png$/.test(a)) return a;                          // a character
  if (/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(a)) return a; // a photo
  if (a.length <= 16 && !/[<>"'&]/.test(a)) return a;                     // an emoji
  return null;
}
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
function cleanGame(g) {
  return {
    id: g.id, date: g.date, synced: !!g.synced,
    target: num(g.target) || 10000,
    winner: String(g.winner),
    players: g.players.map((p) => ({
      name: String(p.name).slice(0, 20), avatar: safeAvatar(p.avatar), score: num(p.score),
      turns: num(p.turns), busts: num(p.busts), biggest: num(p.biggest), bestStreak: num(p.bestStreak),
    })),
    losers: (g.losers || []).map(String),
    awards: (Array.isArray(g.awards) ? g.awards : [])
      .filter((a) => a && BADGES.includes(a.badge) && /^a[A-Z]\w+$/.test(a.title))
      .map((a) => ({ badge: a.badge, title: a.title, who: String(a.who), n: String(a.n ?? "") })),
    log: (Array.isArray(g.log) ? g.log : [])
      .map((e) => (Array.isArray(e) ? e : e && typeof e === "object" ? [e.p, e.pts, e.b] : null))
      .filter((e) => Array.isArray(e) && e.length === 3)
      .map(([w, pts, b]) => [num(w), num(pts), b ? 1 : 0])
      .filter(([w]) => w >= 0 && w < g.players.length),
  };
}
const validGame = (g) => g && typeof g.id === "string" && typeof g.date === "string" &&
  Array.isArray(g.players) && g.players.length > 0 &&
  g.players.every((p) => p && typeof p.name === "string" && typeof p.score === "number") &&
  typeof g.winner === "string" && /^[\w-]{1,40}$/.test(g.id) && !isNaN(Date.parse(g.date));
const loadGames = () => loadJSON(GAMES_KEY, [])
  .filter(validGame)
  .map(cleanGame)
  .sort((a, b) => (a.date < b.date ? 1 : -1));
const saveGames = (games) => saveJSON(GAMES_KEY, games);

// ----- Saving a finished game ------------------------------------
// Called once by the winner screen. list = players best-first.
function recordGame(list, losers) {
  const faces = loadJSON(FACES_KEY, {});
  const game = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
    target: state.target,
    // players in turn order, with the stats for the details screen
    players: state.players.map((p) => {
      const photo = p.avatar && p.avatar.startsWith("data:");
      if (photo) faces[nameKey(p.name)] = p.avatar;
      return {
        name: p.name,
        avatar: photo ? null : p.avatar, // photos live in cambodice-faces instead
        score: p.score,
        turns: p.turns || 0,
        busts: p.busts || 0,
        biggest: p.biggest || 0,
        bestStreak: p.bestStreak || 0,
      };
    }),
    winner: list[0].name,
    losers: losers.map((p) => p.name),
    awards: awards(),
    log: state.log || [],
  };
  saveJSON(FACES_KEY, faces);
  saveGames([game, ...loadGames()]);
  // Online too (if switched on). If there's no signal it waits and uploads later.
  Cloud.upload(game);
  state.players.forEach((p) => p.avatar?.startsWith("data:") && Cloud.uploadFace(nameKey(p.name), p.avatar));
}

function deleteGame(id) {
  const removeHere = () => {
    if (id === "earlier") localStorage.removeItem(LEGACY_KEY);
    else saveGames(loadGames().filter((g) => g.id !== id));
  };
  // Online: delete there first. The database refuses unless you're the admin.
  if (Cloud.on) return Cloud.remove(id).then(removeHere);
  removeHere();
  return Promise.resolve();
}

// ----- The leaderboard, worked out from the games -----------------
// Returns { "mott": { name, wins, games, points, shots, avatar }, ... }
function loadBoard() {
  const board = {};
  const faces = loadJSON(FACES_KEY, {});
  const row = (key) => (board[key] ||= { name: key, wins: 0, games: 0, points: 0, shots: 0, avatar: null });

  // 1. the old leaderboard from before history was kept
  Object.entries(loadJSON(LEGACY_KEY, {})).forEach(([key, old]) => {
    const r = row(key);
    r.name = String(old.name || key);
    r.avatar = safeAvatar(old.avatar);
    r.wins += num(old.wins);
    r.games += num(old.games);
    r.points += num(old.points);
    r.shots += num(old.shots);
  });

  // 2. every saved game, oldest first (so the newest name/face wins)
  [...loadGames()].reverse().forEach((g) => {
    const losers = g.losers.map(nameKey);
    g.players.forEach((p) => {
      const key = nameKey(p.name);
      const r = row(key);
      r.name = p.name;
      r.avatar = p.avatar || safeAvatar(faces[key]) || r.avatar;
      r.games++;
      r.points += p.score;
      if (nameKey(g.winner) === key) r.wins++;
      if (losers.includes(key)) r.shots++;
    });
  });

  // 3. take off the shots people have paid
  const paid = loadJSON(PAID_KEY, {});
  Object.entries(board).forEach(([key, r]) => (r.shots = Math.max(0, r.shots - num(paid[key]))));
  return board;
}

function payShot(key) {
  const paid = loadJSON(PAID_KEY, {});
  paid[key] = (paid[key] || 0) + 1;
  saveJSON(PAID_KEY, paid);
  Cloud.pay(key);
}

function resetEverything() {
  [GAMES_KEY, PAID_KEY, LEGACY_KEY].forEach((k) => localStorage.removeItem(k));
}

// ===== Drawing ====================================================

let lbTab = "board"; // "board" | "history"

function renderBoard() {
  document.querySelectorAll("[data-lbtab]").forEach((b) => b.classList.toggle("on", b.dataset.lbtab === lbTab));
  $("lb-list").classList.toggle("hidden", lbTab !== "board");
  $("lb-reset").classList.toggle("hidden", Cloud.on); // online: delete games one by one instead
  $("lb-cloud").classList.remove("hidden");
  $("lb-cloud").innerHTML = (Cloud.on ? (Cloud.isAdmin ? t("cloudAdmin") : t("cloudOn")) : "") +
    `<small>${APP_VERSION} · ${esc(Cloud.status)}</small>`;
  $("hist-list").classList.toggle("hidden", lbTab !== "history");
  if (lbTab === "history") return renderHistory();

  const rows = Object.entries(loadBoard()).sort((a, b) => b[1].wins - a[1].wins || a[1].games - b[1].games);
  $("lb-list").innerHTML = rows.length
    ? rows.map(([key, r], i) => `<li>
        <span class="sc-rank">${i + 1}</span>
        ${avatarHTML(r.avatar, "md")}
        <span class="name">${esc(r.name)}<small>${t("lbWins")}: ${r.wins} · ${t("lbGames")}: ${r.games} · ${t("lbPoints")}: ${fmt(r.points)}</small></span>
        <span class="lb-shots">${r.shots > 0
          ? `<b>${r.shots}</b><img src="badges/shot.png" alt="" /><button class="btn btn-small" data-paid="${esc(key)}">${t("lbPaid")}</button>`
          : ""}</span>
      </li>`).join("")
    : `<li class="lb-empty">${t("lbEmpty")}</li>`;
}

// "Thu 19 Nov, 21:40"
function niceDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function faceOf(p) {
  return p.avatar || safeAvatar(loadJSON(FACES_KEY, {})[nameKey(p.name)]);
}

function renderHistory() {
  const games = loadGames();
  const legacy = Object.values(loadJSON(LEGACY_KEY, {}));
  const items = games.map((g) => {
    const winner = g.players.find((p) => p.name === g.winner) || g.players[0];
    const others = [...g.players].sort((a, b) => b.score - a.score).filter((p) => p !== winner);
    return `<li class="hist-item" data-game="${g.id}">
      ${avatarHTML(faceOf(winner), "md")}
      <span class="name">${esc(t("wins", { name: winner.name }))}
        <small>${niceDate(g.date)} · ${t("histTo", { target: fmt(g.target) })}</small>
        <small class="hist-others">${others.map((p) => `${esc(p.name)} ${fmt(p.score)}`).join(" · ")}</small>
      </span>
      <span class="hist-score num">${fmt(winner.score)}</span>
    </li>`;
  });
  if (legacy.length) {
    const n = Math.max(...legacy.map((r) => num(r.games)));
    items.push(`<li class="hist-item" data-game="earlier">
      <span class="avatar avatar-md">🗂️</span>
      <span class="name">${t("earlier")}<small>${t("earlierSub", { n })}</small></span>
    </li>`);
  }
  $("hist-list").innerHTML = items.length ? items.join("") : `<li class="lb-empty">${t("lbEmpty")}</li>`;
}

// Line colours for the chart (one per player)
const LINE_COLOURS = ["#6a52c9", "#1f9d6a", "#d0506d", "#d29a00", "#3b82c4", "#b5683a", "#8e5bb5", "#4a9c9c"];

// A small line chart: everyone's score after each turn
function chartSVG(g) {
  const W = 340, H = 150, pad = 6;
  const n = g.players.length;
  const totals = g.players.map(() => 0);
  const lines = g.players.map(() => [[0, 0]]);
  g.log.forEach(([who, pts, bust], i) => {
    if (!bust) totals[who] += pts;
    lines[who].push([i + 1, totals[who]]);
  });
  const maxX = Math.max(1, g.log.length);
  const maxY = Math.max(g.target, ...g.players.map((p) => p.score));
  const x = (v) => pad + (v / maxX) * (W - pad * 2);
  const y = (v) => H - pad - (v / maxY) * (H - pad * 2);
  const goal = `<line x1="${pad}" x2="${W - pad}" y1="${y(g.target)}" y2="${y(g.target)}" class="chart-goal" />`;
  const paths = lines.map((pts, i) =>
    `<polyline fill="none" stroke="${LINE_COLOURS[i % LINE_COLOURS.length]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"
      points="${pts.map(([a, b]) => `${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(" ")}" />`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Scores over the game">${goal}${paths}</svg>`;
}

let openGameId = null;
function openGame(id) {
  openGameId = id;
  $("gd-delete").classList.toggle("hidden", !canDelete());
  if (id === "earlier") {
    $("gd-title").textContent = t("earlier");
    $("gd-body").innerHTML = `<p class="gd-note">${t("earlierSub", { n: Math.max(...Object.values(loadJSON(LEGACY_KEY, {})).map((r) => num(r.games))) })}</p>`;
    $("game-detail").classList.remove("hidden");
    return;
  }
  const g = loadGames().find((x) => x.id === id);
  if (!g) return;
  const order = [...g.players].sort((a, b) => b.score - a.score);
  $("gd-title").textContent = niceDate(g.date);
  $("gd-body").innerHTML = `
    <div class="gd-head">${t("wins", { name: esc(g.winner) })} <small>${t("histTo", { target: fmt(g.target) })}</small></div>
    ${g.log.length ? `<div class="section-label">${t("chartTitle")}</div>
      <div class="gd-chart">${chartSVG(g)}
        <div class="chart-key">${g.players.map((p, i) => `<span><i style="background:${LINE_COLOURS[i % LINE_COLOURS.length]}"></i>${esc(p.name)}</span>`).join("")}</div>
      </div>` : ""}
    <ol class="sc-list gd-list">${order.map((p, i) => `<li>
      <span class="sc-rank">${i + 1}</span>
      ${avatarHTML(faceOf(p), "md")}
      <span class="name">${esc(p.name)}${g.losers.includes(p.name) ? `<img class="gd-shot" src="badges/shot.png" alt="bought the shots" />` : ""}
        <small>${t("gdStats", { turns: p.turns, busts: p.busts, best: fmt(p.biggest) })}</small></span>
      <span class="sc-score"><b>${fmt(p.score)}</b></span>
    </li>`).join("")}</ol>
    ${g.awards.length ? `<div class="section-label">${t("awards")}</div><ul class="awards">${g.awards.map((a) => `<li>
      <img src="badges/${a.badge}.png" alt="" />
      <div><b>${t(a.title)}</b><small>${esc(a.who)} · ${t(a.title + "D", { n: esc(a.n) })}</small></div></li>`).join("")}</ul>` : ""}`;
  $("game-detail").classList.remove("hidden");
}

// Who may delete games. On this phone only for now; once the online
// database is switched on, only the admin (Mott) will.
function canDelete() { return !Cloud.on || Cloud.isAdmin; }

// Something changed (maybe on another phone): redraw what's showing
function refreshHistory() {
  if (!$("leaderboard").classList.contains("hidden")) renderBoard();
  if (state.phase === "setup") render(); // the "regulars" chips
  TV.sendState();
}

// ===== Wiring =====================================================
$("lb-open").addEventListener("click", () => { renderBoard(); $("leaderboard").classList.remove("hidden"); });
$("lb-close").addEventListener("click", () => $("leaderboard").classList.add("hidden"));
$("lb-tabs").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-lbtab]")?.dataset.lbtab;
  if (tab) { lbTab = tab; renderBoard(); }
});
$("lb-list").addEventListener("click", (e) => {
  const key = e.target.closest("[data-paid]")?.dataset.paid;
  if (!key) return;
  payShot(key);
  Sound.bank();
  renderBoard();
});
$("hist-list").addEventListener("click", (e) => {
  const id = e.target.closest("[data-game]")?.dataset.game;
  if (id) openGame(id);
});
$("gd-close").addEventListener("click", () => $("game-detail").classList.add("hidden"));
$("gd-delete").addEventListener("click", () =>
  askConfirm(t("gameDelete"), t("gameDeleteText"), t("gameDelete"), () => {
    deleteGame(openGameId)
      .then(() => {
        $("game-detail").classList.add("hidden");
        refreshHistory(); // leaderboard, regulars and the TV all update
      })
      .catch(() => toast(t("deleteFailed"), "bad"));
  })
);

// ----- Admin sign-in (only the admin can delete games online) -----
function drawAdmin() {
  $("admin-open").classList.toggle("hidden", !Cloud.on);
  $("admin-out").classList.toggle("hidden", !Cloud.isAdmin);
  $("admin-in").classList.toggle("hidden", Cloud.isAdmin);
  $("admin-go").classList.toggle("hidden", Cloud.isAdmin);
  $("admin-signout").classList.toggle("hidden", !Cloud.isAdmin);
}
$("admin-open").addEventListener("click", () => {
  $("admin-msg").textContent = "";
  drawAdmin();
  $("admin").classList.remove("hidden");
});
$("admin-close").addEventListener("click", () => $("admin").classList.add("hidden"));
$("admin-go").addEventListener("click", () => {
  $("admin-msg").textContent = "";
  Cloud.signIn($("admin-email").value.trim(), $("admin-pass").value)
    .then(() => { $("admin-pass").value = ""; $("admin").classList.add("hidden"); toast(t("cloudAdmin"), "good"); })
    .catch(() => ($("admin-msg").textContent = t("adminFailed")));
});
$("admin-signout").addEventListener("click", () => Cloud.signOut().then(() => $("admin").classList.add("hidden")));

// Switch the online database on (does nothing until cloud.js has the config)
document.addEventListener("DOMContentLoaded", () => {
  Cloud.init();
  drawAdmin();
});
$("lb-reset").addEventListener("click", () =>
  askConfirm(t("lbReset"), t("lbResetText"), t("lbReset"), () => { resetEverything(); renderBoard(); render(); TV.sendState(); })
);
