// tv.js  (the TV page)
// ---------------------------------------------------------------
// The TV is a "dumb screen": it never changes the game itself.
// It shows a code, waits for the phone to connect, and then simply
// draws whatever the phone sends it, just bigger.
//
// Order of things:
//   1. CODE + CONNECTION  – check in with the matchmaker as "cambodice-ABCD"
//   2. MESSAGES           – what to do with each thing the phone sends
//   3. DRAWING            – one function per screen
// ---------------------------------------------------------------

const $ = (id) => document.getElementById(id);
let S = null;           // the latest message of type "state" from the phone
let phone = null;       // the connection to the phone
let peer = null;
let shownTurnPoints = 0;

// Same little helpers as the phone (app.js)
function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
// Only draw pictures that are really a character or a photo. Anyone who
// guessed the TV's code could send anything, so nothing is trusted blindly.
function avatarHTML(avatar, size = "sm") {
  const a = typeof avatar === "string" ? avatar : "";
  if (/^avatars\/[\w-]+\.png$/.test(a) || /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(a)) {
    return `<span class="avatar avatar-${size}"><img src="${a}" alt="" /></span>`;
  }
  return `<span class="avatar avatar-${size}">${esc(a.slice(0, 16) || "🎲")}</span>`;
}
const BADGES = ["moneybag", "magnet", "flame", "snail", "rocket"];
// Best-first. A five-of-a-kind instant winner (index iw) always goes first.
const ranked = (players, iw = null) => {
  const w = players[iw];
  return [...players].sort((a, b) => (b === w) - (a === w) || b.score - a.score);
};

// ===== 1. CODE + CONNECTION =====================================

// The TV keeps the same code every time, so the phone can reconnect by itself.
let code = null;
try { code = localStorage.getItem("cambodice-tv-code"); } catch (e) {}
if (!code) {
  code = randomCode();
  try { localStorage.setItem("cambodice-tv-code", code); } catch (e) {}
}
let takenTries = 0;

function startPeer() {
  $("tv-code").innerHTML = [...code].map((c) => `<span>${c}</span>`).join("");
  $("tv-net").textContent = "";
  peer = new Peer(PEER_PREFIX + code, peerOptions());

  peer.on("open", () => { takenTries = 0; $("tv-net").textContent = ""; });

  // The phone calls us
  peer.on("connection", (conn) => {
    conn.on("open", () => {
      if (phone && phone !== conn) phone.close(); // newest phone wins
      phone = conn;
      showStatus("");
    });
    conn.on("data", onMessage);
    conn.on("close", () => {
      if (phone !== conn) return;
      phone = null;
      showStatus(t("tvPhoneGone")); // keep showing the game; the phone usually comes back
      if (!S) draw();
    });
  });

  peer.on("disconnected", () => setTimeout(() => !peer.destroyed && peer.reconnect(), 2000));

  peer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      // Our code is still "in use" (usually this same TV a moment ago,
      // after a reload). Wait and try again; after a few goes, pick a new code.
      takenTries++;
      peer.destroy();
      if (takenTries > 4) {
        code = randomCode();
        try { localStorage.setItem("cambodice-tv-code", code); } catch (e) {}
      }
      setTimeout(startPeer, 3000);
    } else if (["network", "server-error", "socket-error", "socket-closed"].includes(err.type)) {
      $("tv-net").textContent = t("tvNoNet");
      peer.destroy();
      setTimeout(startPeer, 5000);
    }
  });
}

function showStatus(text) {
  $("tv-status").textContent = text;
  $("tv-status").classList.toggle("show", !!text);
}

// ===== 2. MESSAGES FROM THE PHONE ===============================

// Clean up a "state" message before using it: every number really is a
// number, every name really is text. (Belt and braces: only our phone
// should ever be connected, but this keeps the TV safe if not.)
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const str = (x, max = 40) => String(x ?? "").slice(0, max);
function cleanState(m) {
  const st = m.state || {};
  const players = (Array.isArray(st.players) ? st.players : []).slice(0, 12).map((p) => ({
    name: str(p && p.name, 20), avatar: str(p && p.avatar, 200000), score: num(p && p.score), onBoard: !!(p && p.onBoard),
    bankStreak: num(p && p.bankStreak), bustStreak: num(p && p.bustStreak),
  }));
  const idx = (x) => Math.min(Math.max(0, num(x)), Math.max(0, players.length - 1));
  const sc = st.scoreCheck;
  const lt = st.lastTurn;
  const board = {};
  Object.entries(m.board && typeof m.board === "object" ? m.board : {}).slice(0, 50).forEach(([k, r]) => {
    board[str(k)] = { name: str(r && r.name, 20), avatar: str(r && r.avatar, 200000), wins: num(r && r.wins), games: num(r && r.games), points: num(r && r.points), shots: num(r && r.shots) };
  });
  return {
    type: "state",
    lang: LANGS[m.lang] ? m.lang : "en",
    theme: ["auto", "light", "dark"].includes(m.theme) ? m.theme : "auto",
    blocker: m.blocker ? str(m.blocker, 120) : null,
    awards: m.awards,
    board,
    fx: m.fx && m.fx.banked ? { banked: { player: idx(m.fx.banked.player), from: num(m.fx.banked.from) } } : {},
    state: {
      phase: ["setup", "playing", "over"].includes(st.phase) ? st.phase : "setup",
      target: num(st.target) || 10000,
      players,
      current: idx(st.current),
      turn: (Array.isArray(st.turn) ? st.turn : []).map(num),
      finalTriggeredBy: st.finalTriggeredBy === null || st.finalTriggeredBy === undefined ? null : idx(st.finalTriggeredBy),
      scoreCheck: sc ? { name: str(sc.name, 20), milestone: num(sc.milestone), final: !!sc.final } : null,
      lastTurn: lt ? { player: idx(lt.player), points: num(lt.points), bust: !!lt.bust } : null,
      instantWin: st.instantWin === null || st.instantWin === undefined ? null : idx(st.instantWin),
    },
  };
}

function onMessage(m) {
  if (!m || !m.type) return;
  if (m.type === "state") {
    m = cleanState(m);
    if (m.state.phase !== "setup" && !m.state.players.length) return;
    const langChanged = m.lang !== lang;
    S = m;
    if (LANGS[m.lang]) lang = m.lang;
    if (langChanged) applyLangToPage();
    applyTheme(m.theme);
    draw();
  }
  if (m.type === "toast") toast(str(m.text, 300), ["good", "bad", "legend"].includes(m.mood) ? m.mood : "");
  if (m.type === "sound" && typeof Sound[m.name] === "function") Sound[m.name]();
  if (m.type === "confetti") confetti();
  if (m.type === "shake") {
    const card = $("tv-turn");
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    setTimeout(() => card.classList.remove("shake"), 500);
  }
  if (m.type === "rules") {
    if (m.open) $("tv-rules-body").innerHTML = rulesAsHTML(S ? S.state.target : RULES.targetScore);
    $("tv-rules").classList.toggle("hidden", !m.open);
  }
}

// The TV follows the phone's light/dark choice
function applyTheme(theme) {
  if (!theme || theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
}

// ===== 3. DRAWING ===============================================

function draw() {
  const phase = S ? S.state.phase : "wait";
  $("tv-wait").classList.toggle("hidden", phase !== "wait");
  $("tv-lobby").classList.toggle("hidden", phase !== "setup");
  $("tv-game").classList.toggle("hidden", phase !== "playing");
  $("tv-winner").classList.toggle("hidden", phase !== "over");
  if (phase === "setup") drawLobby();
  if (phase === "playing") drawGame();
  if (phase === "over") drawWinner();
  drawScoreCheck();
}

function drawLobby() {
  const st = S.state;
  $("lobby-title").textContent = st.players.length ? t("tvLobby") : t("tvLobbyEmpty");
  $("lobby-players").innerHTML = st.players
    .map((p) => `<div class="tv-lobby-player">${avatarHTML(p.avatar, "xl")}<b>${esc(p.name)}</b></div>`)
    .join("");
  $("lobby-target").textContent = t("tvPlayTo", { target: fmt(st.target) });

  // All-time leaderboard (from the phone), most wins first
  const rows = Object.entries(S.board || {}).sort((a, b) => b[1].wins - a[1].wins || a[1].games - b[1].games).slice(0, 8);
  $("lobby-board-wrap").classList.toggle("hidden", rows.length === 0);
  $("lobby-board").innerHTML = rows
    .map(([key, r], i) => `<li>
      <span class="sc-rank">${i + 1}</span>
      ${avatarHTML(r.avatar, "md")}
      <span class="name">${esc(r.name || key)}<small>${t("lbWins")}: ${r.wins} · ${t("lbGames")}: ${r.games} · ${t("lbPoints")}: ${fmt(r.points || 0)}</small></span>
      ${r.shots > 0 ? `<span class="lb-shots"><b>${r.shots}</b><img src="badges/shot.png" alt="" /></span>` : ""}
    </li>`)
    .join("");
}

function scoreboardHTML(players, highlightIndex, target) {
  const top = Math.max(...players.map((p) => p.score));
  return players
    .map((p, i) => {
      const classes = [];
      if (i === highlightIndex) classes.push("current");
      if (p.score === top && top > 0) classes.push("leader");
      const pct = Math.min(100, (p.score / target) * 100);
      const tag = !p.onBoard ? `<span class="tag">${t("notOnBoard")}</span>` : "";
      const badge = p.bankStreak >= 3 ? `<img class="streak" src="badges/flame.png" alt="" />`
        : p.bustStreak >= 3 ? `<img class="streak" src="badges/raincloud.png" alt="" />` : "";
      return `<li class="${classes.join(" ")}">
        ${avatarHTML(p.avatar, "md")}
        <span class="name">${esc(p.name)}${badge}${tag}</span>
        <span class="score num">${fmt(p.score)}</span>
        <span class="bar"><i style="width:${pct}%"></i></span>
      </li>`;
    })
    .join("");
}

function drawGame() {
  const st = S.state;
  const p = st.players[st.current];
  const turnTotal = st.turn.reduce((a, b) => a + b, 0);

  $("game-target").textContent = t("tvPlayTo", { target: fmt(st.target) });
  const board = $("tv-board");
  board.innerHTML = scoreboardHTML(st.players, st.current, st.target);
  board.style.setProperty("--rows", st.players.length);
  if (S.fx && S.fx.banked) {
    const row = board.children[S.fx.banked.player];
    if (row) {
      row.classList.add("bumped");
      countUp(row.querySelector(".score"), S.fx.banked.from, st.players[S.fx.banked.player].score, 900);
    }
  }

  // Final round banner
  const banner = $("tv-banner");
  if (st.finalTriggeredBy !== null) {
    const leader = st.players[st.finalTriggeredBy];
    banner.textContent = t("finalBanner", { name: leader.name, score: fmt(leader.score) });
    banner.classList.remove("hidden");
  } else banner.classList.add("hidden");

  // Whose turn
  $("tv-turn-avatar").innerHTML = avatarHTML(p.avatar, "xl");
  $("tv-turn-name").textContent = t("turnOf", { name: p.name });
  const pts = $("tv-turn-points");
  if (turnTotal > shownTurnPoints) {
    countUp(pts, shownTurnPoints, turnTotal, 350);
    pts.classList.remove("pop"); void pts.offsetWidth; pts.classList.add("pop");
  } else {
    pts.animId = (pts.animId || 0) + 1;
    pts.textContent = fmt(turnTotal);
  }
  shownTurnPoints = turnTotal;
  pts.classList.toggle("zero", turnTotal === 0);

  const hint = $("tv-turn-hint");
  hint.classList.remove("warn", "good");
  if (S.blocker && turnTotal > 0) { hint.textContent = S.blocker; hint.classList.add("warn"); }
  else if (turnTotal > 0) { hint.textContent = t("hintBank", { total: fmt(p.score + turnTotal) }); hint.classList.add("good"); }
  else hint.textContent = "";

  // Last turn
  const lt = st.lastTurn;
  const last = $("tv-last");
  if (lt && st.players[lt.player]) {
    const who = st.players[lt.player];
    const what = lt.bust
      ? `<span class="lt-bust">${lt.points ? t("bustLost", { points: fmt(lt.points) }) : t("bustNothing")}</span>`
      : `<span class="lt-bank">+${fmt(lt.points)}</span>`;
    last.innerHTML = `<span class="lt-label">${t("lastTurn")}</span>${avatarHTML(who.avatar, "sm")}<b>${esc(who.name)}</b>${what}`;
    last.classList.remove("hidden");
  } else last.classList.add("hidden");
}

function drawWinner() {
  const st = S.state;
  const list = ranked(st.players, st.instantWin);
  $("tv-winner-name").textContent = t("wins", { name: list[0].name });
  $("tv-podium").innerHTML = [1, 0, 2]
    .filter((i) => list[i])
    .map((i) => {
      const p = list[i];
      return `<div class="step step-${i + 1}">
        ${avatarHTML(p.avatar, i === 0 ? "xl" : "lg")}
        <div class="step-name">${esc(p.name)}</div>
        <div class="step-score">${fmt(p.score)}</div>
        <div class="step-block">${i + 1}</div>
      </div>`;
    })
    .join("");
  $("tv-final").innerHTML = list.length > 3 ? scoreboardHTML(list.slice(3), -1, st.target) : "";

  // Last place buys the shots
  const pool = st.instantWin !== null ? list.slice(1) : list; // instant winner never buys
  const low = list[list.length - 1].score;
  const losers = pool.filter((p) => p.score === low);
  const shot = $("tv-shot");
  if (list.length > 1 && losers.length < list.length) {
    const names = losers.map((p) => p.name);
    const who = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + ` ${t("and")} ` + names.at(-1);
    shot.innerHTML = `<span class="shot-faces">${losers.map((p) => avatarHTML(p.avatar, "md")).join("")}</span>
      <img class="shot-badge" src="badges/shot.png" alt="" /><span>${t(names.length === 1 ? "shotOne" : "shotMany", { who: `<b>${esc(who)}</b>` })}</span>`;
    shot.classList.remove("hidden");
  } else shot.classList.add("hidden");

  const aw = (Array.isArray(S.awards) ? S.awards : []).filter((a) => a && BADGES.includes(a.badge) && /^a[A-Z]\w+$/.test(a.title));
  $("tv-awards").innerHTML = aw
    .map((a) => `<li><img src="badges/${a.badge}.png" alt="" />
      <div><b>${t(a.title)}</b><small>${esc(String(a.who))} · ${t(a.title + "D", { n: esc(String(a.n ?? "")) })}</small></div></li>`)
    .join("");
  $("tv-awards-wrap").classList.toggle("hidden", aw.length === 0);
}

function drawScoreCheck() {
  const sc = S && S.state.phase === "playing" ? S.state.scoreCheck : null;
  $("score-check").classList.toggle("hidden", !sc);
  if (!sc) return;
  const st = S.state;
  $("sc-eyebrow").textContent = sc.final ? t("finalEyebrow") : t("scEyebrow");
  $("sc-title").textContent = sc.final ? t("finalTitle", { name: sc.name, target: fmt(st.target) }) : t("scTitle");
  $("sc-sub").textContent = sc.final ? t("finalSub") : t("scSub", { name: sc.name, mark: fmt(sc.milestone) });
  const list = ranked(st.players);
  const top = list[0].score;
  $("sc-list").innerHTML = list
    .map((p, i) => {
      const behind = top - p.score;
      const gap = i === 0 ? t("leading") : behind === 0 ? t("tied") : `−${fmt(behind)}`;
      return `<li><span class="sc-rank">${i + 1}</span>${avatarHTML(p.avatar, "md")}
        <span class="name">${esc(p.name)}</span>
        <span class="sc-score"><b>${fmt(p.score)}</b><small>${gap}</small></span></li>`;
    })
    .join("");
}

// ----- Effects (same as the phone, copied so the TV stands alone) -----
function countUp(el, from, to, ms = 500) {
  const start = performance.now();
  const id = (el.animId = (el.animId || 0) + 1);
  (function frame(now) {
    if (el.animId !== id) return;
    const k = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round((from + (to - from) * eased) / 10) * 10);
    if (k < 1) requestAnimationFrame(frame);
    else el.textContent = fmt(to);
  })(start);
}

let toastTimer = null;
function toast(text, mood = "") {
  const el = $("toast");
  el.textContent = text;
  el.className = `toast tv-toast ${mood}`;
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000); // a bit longer: people are further away
}

function confetti() {
  const canvas = $("confetti");
  const ctx = canvas.getContext("2d");
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const colours = ["#bff0da", "#ffd9df", "#e6defc", "#fff0b8", "#cfe3ff", "#6a52c9"];
  const bits = Array.from({ length: 260 }, () => ({
    x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.6,
    w: 10 + Math.random() * 10, h: 14 + Math.random() * 12,
    vy: 3 + Math.random() * 4, vx: -1.5 + Math.random() * 3,
    spin: Math.random() * Math.PI, vspin: -0.1 + Math.random() * 0.2,
    colour: colours[Math.floor(Math.random() * colours.length)],
  }));
  const end = performance.now() + 4500;
  (function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    bits.forEach((b) => {
      b.x += b.vx; b.y += b.vy; b.spin += b.vspin;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.spin);
      ctx.fillStyle = b.colour;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.spin)));
      ctx.restore();
    });
    if (now < end) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(performance.now());
}

// ----- Sound: browsers only allow it after someone presses a button -----
// One press of OK on the remote (or a click) switches it on for good.
function soundCheck() {
  const running = Sound.ctx && Sound.ctx.state === "running";
  $("tv-sound-hint").classList.toggle("hidden", running);
}
function enableSound() {
  Sound.unlock();
  Sound.tap();
  // Also go full screen if the TV allows it
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  setTimeout(soundCheck, 300);
}
document.addEventListener("click", enableSound);
document.addEventListener("keydown", enableSound); // TV remotes send key presses
$("tv-sound-hint").focus();

// Keep the TV from going to sleep / screensaver
let wakeLock = null;
async function keepAwake() {
  try {
    if (!wakeLock && "wakeLock" in navigator && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    }
  } catch (e) {}
}
document.addEventListener("visibilitychange", keepAwake);

// ----- Start -----
try { lang = localStorage.getItem("cambodice-lang") || "en"; } catch (e) {}
if (!LANGS[lang]) lang = "en";
applyLangToPage();
draw();
soundCheck();
keepAwake();
if (typeof Peer === "undefined") $("tv-net").textContent = t("tvNoNet");
else startPeer();
