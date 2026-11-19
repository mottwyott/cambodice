// app.js
// ---------------------------------------------------------------
// How this file is organised:
//   1. STATE   – one object that holds everything about the game
//   2. ACTIONS – functions that change the state (add points, bank…)
//   3. RENDER  – functions that redraw the screen from the state
//   4. WIRING  – connect buttons to actions
//
// The golden rule: buttons never touch the screen directly. They
// change the state, then call render(). That keeps things simple
// and is exactly how the TV scoreboard will work later (the TV just
// receives the state and renders its own bigger version).
// ---------------------------------------------------------------

// ===== 1. STATE =================================================

const SAVE_KEY = "cambodice-game-v1";

function freshState() {
  return {
    phase: "setup",         // "setup" | "playing" | "over"
    target: RULES.targetScore, // 5000 or 10000, picked on the setup screen
    players: [],            // { name, avatar, score, onBoard }
    current: 0,             // index of whose turn it is
    turn: [],               // points added this turn, e.g. [100, 50, 500]
    finalTriggeredBy: null, // index of who first hit the target
    scoreCheck: null,       // { name, milestone } while the score-check popup is showing
    scoreCheckDone: false,  // the score check only happens once per game
    lastTurn: null,         // { player, points, bust } for the "Last turn" line
  };
}

// Load a saved game (so closing the app doesn't lose it), or start fresh.
// The "..." merges in any new fields that older saved games didn't have.
let state = { ...freshState(), ...(load() || {}) };

// Undo history: a stack of earlier states.
let history = [];

// One-off effects for the next redraw (sounds, shakes, count-ups).
// These aren't "game state", just decoration, so they live outside it.
let fx = {};

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // Storage full (lots of big photos) or private browsing. The game still works, it just won't survive a reload.
  }
}
function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}

// Take a snapshot BEFORE every change, so Undo can step back.
function remember() {
  history.push(JSON.parse(JSON.stringify(state)));
  if (history.length > 100) history.shift();
}

// ===== 2. ACTIONS ===============================================

const turnTotal = () => state.turn.reduce((sum, n) => sum + n, 0);
const currentPlayer = () => state.players[state.current];

// Give each new player a character nobody else has yet.
function unusedAvatar() {
  const taken = state.players.map((p) => p.avatar);
  return [...CHARACTERS, ...AVATARS].find((a) => !taken.includes(a)) || AVATARS[0];
}

// "  Mott " and "mott" are the same person: lower-case, single spaces.
const nameKey = (name) => name.trim().replace(/\s+/g, " ").toLowerCase();

function addPlayer(name, avatar) {
  name = name.trim().replace(/\s+/g, " ");
  if (!name) return;
  if (state.players.some((p) => nameKey(p.name) === nameKey(name))) return; // already playing
  // Typed the name of a regular? Use their saved spelling and face.
  const regular = loadBoard()[nameKey(name)];
  if (regular) { name = regular.name || name; avatar = avatar || regular.avatar; }
  const taken = state.players.map((p) => p.avatar);
  if (!avatar || taken.includes(avatar)) avatar = unusedAvatar();
  state.players.push({ name, avatar, score: 0, onBoard: false });
  update();
}

function removePlayer(i) {
  state.players.splice(i, 1);
  update();
}

// Move a player from one spot in the turn order to another.
function movePlayer(from, to) {
  if (from === to) return;
  const [p] = state.players.splice(from, 1); // take them out...
  state.players.splice(to, 0, p);            // ...and put them back in the new spot
  update();
}

function setAvatar(i, avatar) {
  state.players[i].avatar = avatar;
  update();
}

function setTarget(n) {
  state.target = n;
  update();
}

function startGame() {
  if (state.players.length < 1) return;
  // Reset scores, plus the little stats used for awards and pop-ups
  state.players.forEach((p) => Object.assign(p, {
    score: 0, onBoard: false,
    turns: 0, busts: 0, bustStreak: 0, bankStreak: 0, bestStreak: 0, biggest: 0, boardTurn: null,
  }));
  state.checkRanks = null; // who was where at the score check (for "Comeback Kid")
  state.recorded = false;  // has this game been added to the all-time leaderboard yet?
  state.phase = "playing";
  state.current = 0;
  state.turn = [];
  state.finalTriggeredBy = null;
  state.scoreCheck = null;
  state.scoreCheckDone = false;
  state.lastTurn = null;
  history = [];
  update();
}

function addPoints(n) {
  remember();
  state.turn.push(n);
  Sound.tap();
  update({ pop: true });
}

// Can the current player bank right now? Returns a reason if not.
function bankBlocker() {
  const pts = turnTotal();
  if (pts === 0) return t("hintStart");
  if (!currentPlayer().onBoard && pts < RULES.minToGetOnBoard) {
    return t("hintNeed", { min: fmt(RULES.minToGetOnBoard), more: fmt(RULES.minToGetOnBoard - pts) });
  }
  return null;
}

// Should this bank trigger the one-per-game score check?
// True the first time anyone goes from below the mark to at/above it.
function scoreCheckDue(before, after) {
  const mark = RULES.scoreCheckAt[state.target];
  if (!mark || state.scoreCheckDone) return null;
  return before < mark && after >= mark && after < state.target ? mark : null;
}

function bank() {
  if (bankBlocker()) return;
  remember();
  const p = currentPlayer();
  const before = p.score;
  const pts = turnTotal();
  const leaderBefore = soleLeader();
  const wasOnBoard = p.onBoard;
  state.lastTurn = { player: state.current, points: pts, bust: false };
  p.score += pts;
  p.onBoard = true;

  // stats for awards
  p.turns++;
  p.biggest = Math.max(p.biggest || 0, pts);
  p.bustStreak = 0;
  p.bankStreak = (p.bankStreak || 0) + 1;
  p.bestStreak = Math.max(p.bestStreak || 0, p.bankStreak);
  if (!wasOnBoard) p.boardTurn = p.turns;

  // Pick ONE pop-up line, the most exciting thing that just happened
  const leaderAfter = soleLeader();
  if (state.turn.length === 1 && pts === RULES.tripleOnes * RULES.fiveOfAKindMultiplier) {
    toast(pick("qLegend", { name: p.name }), "legend");   // five 1s in one go: easter egg
    setTimeout(confetti, 200);
  } else if (p.score === state.target) toast(pick("qPerfect", { name: p.name, target: fmt(state.target) }), "legend");
  else if (leaderAfter && leaderAfter !== leaderBefore && state.players.length > 1 && before > 0)
    toast(pick("qNewLeader", { name: p.name }));
  else if (pts >= 1500) toast(pick("qBigBank", { name: p.name }), "good");
  else if (!wasOnBoard) toast(pick("qOnBoard", { name: p.name }));

  const m = scoreCheckDue(before, p.score);
  if (m) {
    state.scoreCheck = { name: p.name, milestone: m };
    state.scoreCheckDone = true;
    state.checkRanks = ranked().map((x) => x.name); // remember the order for "Comeback Kid"
  }

  // First person to reach the target starts the final round.
  if (RULES.finalRound && state.finalTriggeredBy === null && p.score >= state.target) {
    state.finalTriggeredBy = state.current;
    state.scoreCheck = { name: p.name, milestone: state.target, final: true };
  }
  // Decoration for the redraw: highlight + count up the banker's row
  fx.banked = { player: state.current, from: before };
  if (state.scoreCheck) Sound.check(); else Sound.bank();

  // If final round is turned off, reaching the target wins instantly.
  if (!RULES.finalRound && p.score >= state.target) {
    state.phase = "over";
    fx.win = true;
    return update();
  }
  nextPlayer();
}

let busting = false; // stops a double-tap during the shake
function bust() {
  if (busting) return;
  busting = true;
  remember();
  state.lastTurn = { player: state.current, points: turnTotal(), bust: true };
  const p = currentPlayer();
  p.turns = (p.turns || 0) + 1;
  p.busts = (p.busts || 0) + 1;
  p.bankStreak = 0;
  p.bustStreak = (p.bustStreak || 0) + 1;
  if (p.bustStreak === 3) toast(pick("qThreeBusts", { name: p.name }), "bad");
  else toast(pick("qBust", { name: p.name }), "bad");
  Sound.bust();
  TV.send({ type: "shake" });
  // Shake the card first, THEN move on to the next player
  const card = document.querySelector(".turn-card");
  card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  setTimeout(() => {
    busting = false;
    card.classList.remove("shake");
    nextPlayer(); // turn points are simply thrown away
  }, 500);
}

function nextPlayer() {
  state.turn = [];
  state.current = (state.current + 1) % state.players.length;

  // Back round to whoever triggered the final round? Game over.
  if (state.finalTriggeredBy !== null && state.current === state.finalTriggeredBy) {
    state.phase = "over";
    state.scoreCheck = null;
    fx.win = true;
  }
  update();
}

function closeScoreCheck() {
  state.scoreCheck = null;
  update();
}

function undo() {
  if (history.length === 0) return;
  state = history.pop();
  update();
}

function rematch() {
  startGame(); // same players, scores reset
}

function newPlayers() {
  const keep = state.players.map((p) => ({ name: p.name, avatar: p.avatar, score: 0, onBoard: false }));
  const target = state.target;
  state = freshState();
  state.players = keep; // keep names + avatars so you can just tap Start
  state.target = target;
  history = [];
  update();
}

// The one player strictly ahead of everyone (null if tied or nobody scored)
function soleLeader() {
  const list = ranked();
  if (!list[0] || list[0].score === 0) return null;
  if (list[1] && list[1].score === list[0].score) return null;
  return list[0].name;
}

// Players sorted best-first (winner screen and score checks)
function ranked() {
  return [...state.players].sort((a, b) => b.score - a.score);
}

// ----- Photos ---------------------------------------------------
// Phone photos are huge (several MB). We shrink them to a small
// square so they save quickly and later send to the TV fast.
function photoToAvatar(file, size = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const side = Math.min(img.width, img.height); // crop the middle square
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.8)); // a text version of the picture
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ===== 3. RENDER ================================================

const $ = (id) => document.getElementById(id);

// Turns user text (player names) into safe HTML, so a name like
// "<b>" can't mess up the page.
function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// An avatar is one of three things, all stored as text:
//   a character picture ("avatars/02-bun.png"), a photo ("data:image/jpeg…"), or an emoji ("🦊").
const isPicture = (avatar) => !!avatar && (avatar.startsWith("data:") || avatar.startsWith("avatars/"));
function avatarHTML(avatar, size = "sm") {
  if (isPicture(avatar)) {
    return `<span class="avatar avatar-${size}"><img src="${avatar}" alt="" /></span>`;
  }
  return `<span class="avatar avatar-${size}">${esc(avatar || "🎲")}</span>`;
}

function update(opts = {}) {
  save();
  TV.sendState(); // if a TV is connected, send it the new state (tv-link.js)
  render(opts);
  keepAwake();
}

// Count a number up (or down) smoothly, e.g. 800 -> 1,350 over 0.5s
function countUp(el, from, to, ms = 500) {
  const start = performance.now();
  const id = (el.animId = (el.animId || 0) + 1); // a newer count-up on this element cancels this one
  function frame(now) {
    if (el.animId !== id) return;
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3); // fast at first, gentle at the end
    el.textContent = fmt(Math.round((from + (to - from) * eased) / 10) * 10);
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = fmt(to);
  }
  requestAnimationFrame(frame);
}
let shownTurnPoints = 0; // what the big number currently shows

function render(opts = {}) {
  // Show only the screen for the current phase
  $("setup").classList.toggle("hidden", state.phase !== "setup");
  $("game").classList.toggle("hidden", state.phase !== "playing");
  $("winner").classList.toggle("hidden", state.phase !== "over");

  if (state.phase === "setup") renderSetup();
  if (state.phase === "playing") renderGame(opts);
  if (state.phase === "over") renderWinner();
  renderScoreCheck();
  fx = {}; // effects are used once
}

function renderSetup() {
  // "Regulars": people from the leaderboard who aren't in this game yet. One tap adds them.
  const playing = state.players.map((p) => nameKey(p.name));
  const regulars = Object.entries(loadBoard())
    .filter(([key]) => !playing.includes(key))
    .sort((a, b) => b[1].games - a[1].games);
  $("regulars").innerHTML = regulars
    .map(([key, r]) => `<button class="chip" data-regular="${esc(key)}">${avatarHTML(r.avatar, "xs")}${esc(r.name || key)}</button>`)
    .join("");

  $("setup-list").innerHTML = state.players
    .map(
      (p, i) => `<li data-index="${i}">
        <span class="drag-handle" aria-label="Drag to reorder">${icon("grip")}</span>
        <button class="avatar-btn" data-pick="${i}" aria-label="Change avatar">${avatarHTML(p.avatar, "md")}</button>
        <span class="setup-name">${esc(p.name)}</span>
        <button class="remove" data-remove="${i}" aria-label="Remove">${icon("x", "icon-sm")}</button>
      </li>`
    )
    .join("");
  $("start-btn").disabled = state.players.length < 1;

  // Highlight the chosen game length
  document.querySelectorAll("[data-target]").forEach((b) =>
    b.classList.toggle("on", Number(b.dataset.target) === state.target)
  );
  $("rules-note").textContent =
    state.players.length > 1
      ? t("hintFacesDrag")
      : t("hintFaces");
}

function scoreboardHTML(players, highlightIndex) {
  const top = Math.max(...players.map((p) => p.score));
  return players
    .map((p, i) => {
      const classes = [];
      if (i === highlightIndex) classes.push("current");
      if (p.score === top && top > 0) classes.push("leader");
      const pct = Math.min(100, (p.score / state.target) * 100);
      const tag = !p.onBoard ? `<span class="tag">${t("notOnBoard")}</span>` : "";
      // little badges: 🔥 after 3 banks in a row, 🌧️ after 3 busts in a row
      const badge = p.bankStreak >= 3 ? `<img class="streak" src="badges/flame.png" alt="on a streak" />`
        : p.bustStreak >= 3 ? `<img class="streak" src="badges/raincloud.png" alt="cursed" />` : "";
      return `<li class="${classes.join(" ")}">
        ${avatarHTML(p.avatar, "sm")}
        <span class="name">${esc(p.name)}${badge}${tag}</span>
        <span class="score num">${fmt(p.score)}</span>
        <span class="bar"><i style="width:${pct}%"></i></span>
      </li>`;
    })
    .join("");
}

function renderGame({ pop }) {
  const p = currentPlayer();
  $("scoreboard").innerHTML = scoreboardHTML(state.players, state.current);
  if (fx.banked) {
    // flash the row of whoever just banked and count their score up
    const row = $("scoreboard").children[fx.banked.player];
    row.classList.add("bumped");
    countUp(row.querySelector(".score"), fx.banked.from, state.players[fx.banked.player].score, 700);
  }

  // Final-round banner
  const banner = $("banner");
  if (state.finalTriggeredBy !== null) {
    const leader = state.players[state.finalTriggeredBy];
    banner.textContent = t("finalBanner", { name: leader.name, score: fmt(leader.score) });
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  // "Last turn" line
  const lt = state.lastTurn;
  const last = $("last-turn");
  if (lt && state.players[lt.player]) {
    const who = state.players[lt.player];
    const what = lt.bust
      ? `<span class="lt-bust">${lt.points ? t("bustLost", { points: fmt(lt.points) }) : t("bustNothing")}</span>`
      : `<span class="lt-bank">+${fmt(lt.points)}</span>`;
    last.innerHTML = `<span class="lt-label">${t("lastTurn")}</span>${avatarHTML(who.avatar, "xs")}<b>${esc(who.name)}</b>${what}`;
    last.classList.remove("hidden");
  } else {
    last.classList.add("hidden");
  }

  // Big face of whoever's holding the phone
  $("turn-avatar").innerHTML = avatarHTML(p.avatar, "lg");
  $("turn-name").textContent = t("turnOf", { name: p.name });
  const pts = $("turn-points");
  if (pop) {
    countUp(pts, shownTurnPoints, turnTotal(), 300);
    pts.classList.remove("pop"); void pts.offsetWidth; pts.classList.add("pop");
  } else {
    pts.animId = (pts.animId || 0) + 1; // stop any count-up still running
    pts.textContent = fmt(turnTotal());
  }
  shownTurnPoints = turnTotal();
  pts.classList.toggle("zero", turnTotal() === 0);

  // Hint line under the big number
  const blocker = bankBlocker();
  const hint = $("turn-hint");
  if (blocker && turnTotal() > 0) {
    hint.textContent = blocker;
    hint.classList.add("warn");
    hint.classList.remove("good");
  } else if (turnTotal() > 0) {
    hint.textContent = t("hintBank", { total: fmt(p.score + turnTotal()) });
    hint.classList.remove("warn");
    hint.classList.add("good");
  } else {
    hint.textContent = t("hintStart");
    hint.classList.remove("warn", "good");
  }

  $("bank-btn").disabled = !!blocker;
  $("undo-btn").disabled = history.length === 0;
  $("sound-btn").innerHTML = icon(Sound.on ? "sound" : "mute", "icon-sm");
  $("sound-btn").setAttribute("aria-label", Sound.on ? "Sound on" : "Muted");
}

function renderWinner() {
  const list = ranked();
  $("winner-name").textContent = t("wins", { name: list[0].name });

  // Podium: 2nd on the left, 1st in the middle (tallest), 3rd on the right.
  const order = [1, 0, 2].filter((i) => list[i]);
  $("podium").innerHTML = order
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

  // Everyone off the podium (4th place and below)
  $("final-list").innerHTML = list.length > 3 ? scoreboardHTML(list.slice(3), -1) : "";

  // Last place buys the shots. If several tie for last, they all do.
  const low = list[list.length - 1].score;
  const losers = list.filter((p) => p.score === low);
  const shot = $("shot-note");
  if (list.length > 1 && losers.length < list.length) {
    const names = losers.map((p) => p.name);
    const who = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + ` ${t("and")} ` + names.at(-1);
    shot.innerHTML = `<span class="shot-faces">${losers.map((p) => avatarHTML(p.avatar, "md")).join("")}</span>
      <img class="shot-badge" src="badges/shot.png" alt="" /><span>${t(names.length === 1 ? "shotOne" : "shotMany", { who: `<b>${esc(who)}</b>` })}</span>`;
    shot.classList.remove("hidden");
  } else {
    shot.classList.add("hidden");
  }

  // Awards: little prizes for the stats we kept during the game
  $("awards").innerHTML = awards()
    .map((a) => `<li>
      <img src="badges/${a.badge}.png" alt="" />
      <div><b>${t(a.title)}</b><small>${esc(a.who)} · ${t(a.title + "D", { n: a.n })}</small></div>
    </li>`)
    .join("");
  $("awards-wrap").classList.toggle("hidden", $("awards").children.length === 0);

  // Add this game to the all-time leaderboard (only once per game)
  if (!state.recorded) {
    state.recorded = true;
    recordGame(list, losers.length < list.length ? losers : []);
    save();
  }

  if (fx.win) {
    Sound.win();
    confetti();
  }
}

// Work out who earns which award. Each award needs someone to clearly "earn" it.
function awards() {
  const ps = state.players;
  const out = [];
  const most = (key) => {
    const top = Math.max(...ps.map((p) => p[key] || 0));
    const who = ps.filter((p) => (p[key] || 0) === top);
    return { top, who };
  };
  const names = (list) => list.map((p) => p.name).join(" & ");

  let m = most("biggest");
  if (m.top >= 1000) out.push({ badge: "moneybag", title: "aBigBanker", who: names(m.who), n: fmt(m.top) });
  m = most("busts");
  if (m.top >= 2) out.push({ badge: "magnet", title: "aBustMagnet", who: names(m.who), n: m.top });
  m = most("bestStreak");
  if (m.top >= 3) out.push({ badge: "flame", title: "aHotStreak", who: names(m.who), n: m.top });
  // Slow starter: most turns before getting on the board (never got on = turns + 1)
  ps.forEach((p) => (p.slow = p.boardTurn ?? (p.turns || 0) + 1));
  m = most("slow");
  if (m.top >= 3) out.push({ badge: "snail", title: "aSlowStarter", who: names(m.who), n: m.top });
  // Comeback: the winner wasn't leading at the score check
  const winner = ranked()[0];
  if (state.checkRanks && state.checkRanks[0] !== winner.name) {
    out.push({ badge: "rocket", title: "aComeback", who: winner.name, n: "" });
  }
  return out;
}

// ----- All-time leaderboard (kept on this phone, survives between games) -----
const LB_KEY = "cambodice-alltime";
function loadBoard() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || {}; } catch (e) { return {}; }
}
function saveBoard(board) {
  try { localStorage.setItem(LB_KEY, JSON.stringify(board)); } catch (e) {}
}
function recordGame(list, losers) {
  const board = loadBoard();
  list.forEach((p, i) => {
    const row = (board[nameKey(p.name)] ||= { wins: 0, games: 0, shots: 0 });
    row.name = p.name; // remember the latest spelling to show
    row.games++;
    row.points = (row.points || 0) + p.score; // total points ever
    row.avatar = p.avatar;
    if (i === 0) row.wins++;
    if (losers.includes(p)) row.shots++;
  });
  saveBoard(board);
}
function renderBoard() {
  const board = loadBoard();
  const rows = Object.entries(board).sort((a, b) => b[1].wins - a[1].wins || a[1].games - b[1].games);
  $("lb-list").innerHTML = rows.length
    ? rows.map(([name, r], i) => `<li>
        <span class="sc-rank">${i + 1}</span>
        ${avatarHTML(r.avatar, "md")}
        <span class="name">${esc(r.name || name)}<small>${t("lbWins")}: ${r.wins} · ${t("lbGames")}: ${r.games} · ${t("lbPoints")}: ${fmt(r.points || 0)}</small></span>
        <span class="lb-shots">${r.shots > 0
          ? `<b>${r.shots}</b><img src="badges/shot.png" alt="" /><button class="btn btn-small" data-paid="${esc(name)}">${t("lbPaid")}</button>`
          : ""}</span>
      </li>`).join("")
    : `<li class="lb-empty">${t("lbEmpty")}</li>`;
}

// ----- Confetti: little pastel paper bits falling for 3 seconds -----
function confetti() {
  TV.send({ type: "confetti" });
  const canvas = $("confetti");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colours = ["#bff0da", "#ffd9df", "#e6defc", "#fff0b8", "#cfe3ff", "#6a52c9"];
  const bits = Array.from({ length: 140 }, () => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.6,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    vy: 2 + Math.random() * 3,
    vx: -1 + Math.random() * 2,
    spin: Math.random() * Math.PI,
    vspin: -0.1 + Math.random() * 0.2,
    colour: colours[Math.floor(Math.random() * colours.length)],
  }));
  const end = performance.now() + 3500;
  (function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    bits.forEach((b) => {
      b.x += b.vx; b.y += b.vy; b.spin += b.vspin;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.spin);
      ctx.fillStyle = b.colour;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.spin))); // flip effect
      ctx.restore();
    });
    if (now < end) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(performance.now());
}

// The "score check" popup: everyone's standings, best first,
// with how far behind the leader each person is.
function renderScoreCheck() {
  const sc = state.scoreCheck;
  $("score-check").classList.toggle("hidden", !sc);
  if (!sc) return;

  $("sc-eyebrow").textContent = sc.final ? t("finalEyebrow") : t("scEyebrow");
  $("sc-title").textContent = sc.final ? t("finalTitle", { name: sc.name, target: fmt(state.target) }) : t("scTitle");
  $("sc-sub").textContent = sc.final
    ? t("finalSub")
    : t("scSub", { name: sc.name, mark: fmt(sc.milestone) });

  const list = ranked();
  const top = list[0].score;
  $("sc-list").innerHTML = list
    .map((p, i) => {
      const behind = top - p.score;
      const gap = i === 0 ? t("leading") : behind === 0 ? t("tied") : `−${fmt(behind)}`;
      return `<li>
        <span class="sc-rank">${i + 1}</span>
        ${avatarHTML(p.avatar, "md")}
        <span class="name">${esc(p.name)}</span>
        <span class="sc-score"><b>${fmt(p.score)}</b><small>${gap}</small></span>
      </li>`;
    })
    .join("");
}

// The avatar picker sheet for player number i
let pickingFor = null;
function openPicker(i) {
  pickingFor = i;
  const p = state.players[i];
  $("picker-title").textContent = t("pickFace", { name: p.name });
  $("char-grid").innerHTML = CHARACTERS.map(
    (a) => `<button class="emoji char ${a === p.avatar ? "on" : ""}" data-emoji="${a}"><img src="${a}" alt="" /></button>`
  ).join("");
  $("emoji-grid").innerHTML = AVATARS.map(
    (a) => `<button class="emoji ${a === p.avatar ? "on" : ""}" data-emoji="${a}">${a}</button>`
  ).join("");
  $("picker").classList.remove("hidden");
}
function closePicker() {
  pickingFor = null;
  $("picker").classList.add("hidden");
}

// ===== 4. WIRING ================================================

$("add-player-form").addEventListener("submit", (e) => {
  e.preventDefault(); // stop the form reloading the page
  addPlayer($("player-name").value);
  $("player-name").value = "";
  $("player-name").focus();
});

$("setup-list").addEventListener("click", (e) => {
  // .closest() finds the button even if you tapped the emoji inside it
  const remove = e.target.closest("[data-remove]");
  const pick = e.target.closest("[data-pick]");
  if (remove) removePlayer(Number(remove.dataset.remove));
  if (pick) openPicker(Number(pick.dataset.pick));
});

$("target-pick").addEventListener("click", (e) => {
  const b = e.target.closest("[data-target]");
  if (b) setTarget(Number(b.dataset.target));
});

$("start-btn").addEventListener("click", startGame);

$("regulars").addEventListener("click", (e) => {
  const key = e.target.closest("[data-regular]")?.dataset.regular;
  const r = key && loadBoard()[key];
  if (r) { addPlayer(r.name || key, r.avatar); Sound.tap(); }
});

// Avatar picker
$("picker").addEventListener("click", (e) => {
  const b = e.target.closest("[data-emoji]");
  if (!b || pickingFor === null) return;
  setAvatar(pickingFor, b.dataset.emoji);
  closePicker();
});
$("photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // so picking the same photo again still fires
  if (!file || pickingFor === null) return;
  try {
    setAvatar(pickingFor, await photoToAvatar(file));
  } catch (err) {
    $("picker-title").textContent = t("photoError");
    return;
  }
  closePicker();
});
$("picker-close").addEventListener("click", closePicker);

// One listener for all the +points buttons (they carry data-add="100")
$("pad").addEventListener("click", (e) => {
  const n = e.target.dataset.add;
  if (n) addPoints(Number(n));
});

// ----- Number pad (our own, so it looks like part of the app) -----
let typed = ""; // the digits typed so far, as text
function showNumpad() {
  typed = "";
  drawNumpad();
  $("numpad").classList.remove("hidden");
}
function drawNumpad() {
  const n = Number(typed || 0);
  $("numpad-display").textContent = fmt(n);
  const ok = n > 0 && n % 50 === 0;
  $("numpad-add").disabled = !ok;
  $("numpad-hint").textContent = n > 0 && !ok ? t("multipleOf50") : t("stepsOf50");
  $("numpad-hint").classList.toggle("warn", n > 0 && !ok);
}
$("other-btn").addEventListener("click", showNumpad);
$("numpad-keys").addEventListener("click", (e) => {
  const key = e.target.closest("[data-key]")?.dataset.key;
  if (!key) return;
  if (key === "back") typed = typed.slice(0, -1);
  else if (typed.length < 5) typed = (typed + key).replace(/^0+/, ""); // no leading zeros
  drawNumpad();
});
$("numpad-cancel").addEventListener("click", () => $("numpad").classList.add("hidden"));
$("numpad-add").addEventListener("click", () => {
  $("numpad").classList.add("hidden");
  addPoints(Number(typed));
});

// ----- Confirm box: askConfirm("Title", "Text", "Button", () => doThing()) -----
let onConfirm = null;
function askConfirm(title, text, yesLabel, action) {
  $("confirm-title").textContent = title;
  $("confirm-text").textContent = text;
  $("confirm-yes").textContent = yesLabel;
  onConfirm = action;
  $("confirm").classList.remove("hidden");
}
$("confirm-no").addEventListener("click", () => $("confirm").classList.add("hidden"));
$("confirm-yes").addEventListener("click", () => {
  $("confirm").classList.add("hidden");
  if (onConfirm) onConfirm();
});

$("bank-btn").addEventListener("click", bank);
$("bust-btn").addEventListener("click", bust);
$("undo-btn").addEventListener("click", undo);
$("sound-btn").addEventListener("click", () => { Sound.toggle(); render(); });
$("score-check").addEventListener("click", closeScoreCheck);

$("menu-btn").addEventListener("click", () =>
  askConfirm(t("endTitle"), t("endText"), t("endGame"), newPlayers)
);

$("rematch-btn").addEventListener("click", rematch);
$("new-players-btn").addEventListener("click", newPlayers);

// Rules sheet: open from any screen
document.querySelectorAll(".rules-open").forEach((btn) =>
  btn.addEventListener("click", () => {
    $("rules-body").innerHTML = rulesAsHTML(state.target);
    $("rules").classList.remove("hidden");
    TV.send({ type: "rules", open: true }); // the TV shows them too
  })
);
$("rules-close").addEventListener("click", () => {
  $("rules").classList.add("hidden");
  TV.send({ type: "rules", open: false });
});

// ----- Drag to reorder players (setup screen) -----
// Press on the ⋮⋮ handle, slide up or down, let go. "Pointer" events
// work for both fingers and a mouse.
let dragFrom = null;
$("setup-list").addEventListener("pointerdown", (e) => {
  const handle = e.target.closest(".drag-handle");
  if (!handle) return;
  dragFrom = Number(handle.closest("li").dataset.index);
  handle.closest("li").classList.add("dragging");
  e.preventDefault();
});
window.addEventListener("pointermove", (e) => {
  if (dragFrom === null) return;
  // Which row is the finger over right now?
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest("#setup-list li");
  if (!over) return;
  const to = Number(over.dataset.index);
  if (to !== dragFrom) {
    movePlayer(dragFrom, to); // redraws the list
    dragFrom = to;
    $("setup-list").children[to].classList.add("dragging");
  }
});
window.addEventListener("pointerup", () => {
  dragFrom = null;
  document.querySelectorAll(".dragging").forEach((li) => li.classList.remove("dragging"));
});

// ----- Keep the screen awake during a game -----
// Phones dim after 30 seconds. The "Wake Lock" asks the phone not to,
// but only while a game is running and the app is open.
let wakeLock = null;
async function keepAwake() {
  const want = state.phase === "playing" && document.visibilityState === "visible";
  try {
    if (want && !wakeLock && "wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } else if (!want && wakeLock) {
      await wakeLock.release();
    }
  } catch (e) { /* not supported on this phone: no harm done */ }
}
document.addEventListener("visibilitychange", keepAwake);

// ----- Pop-up one-liners ("toasts") -----
let toastTimer = null;
function toast(text, mood = "") {
  TV.send({ type: "toast", text, mood });
  const el = $("toast");
  el.textContent = text;
  el.className = `toast ${mood}`;
  void el.offsetWidth;          // restart the slide-in animation
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

// ----- Leaderboard sheet -----
$("lb-open").addEventListener("click", () => { renderBoard(); $("leaderboard").classList.remove("hidden"); });
$("lb-close").addEventListener("click", () => $("leaderboard").classList.add("hidden"));
$("lb-list").addEventListener("click", (e) => {
  const name = e.target.closest("[data-paid]")?.dataset.paid;
  if (!name) return;
  const board = loadBoard();
  if (board[name] && board[name].shots > 0) board[name].shots--;
  saveBoard(board);
  Sound.bank();
  renderBoard();
});
$("lb-reset").addEventListener("click", () =>
  askConfirm(t("lbReset"), t("lbResetText"), t("lbReset"), () => { saveBoard({}); renderBoard(); })
);

// ----- Easter egg: tap the logo die 5 times quickly -----
let logoTaps = [];
document.querySelector(".logo").addEventListener("click", () => {
  const now = Date.now();
  logoTaps = [...logoTaps.filter((t) => now - t < 1500), now];
  if (logoTaps.length >= 5) {
    logoTaps = [];
    const die = document.querySelector(".logo .die");
    die.classList.remove("roll"); void die.getBoundingClientRect(); die.classList.add("roll");
    [0, 0.08, 0.16, 0.24, 0.32].forEach((d) => Sound.note(300 + Math.random() * 500, d, 0.05, 0.1, "square"));
    setTimeout(() => toast(t("diceRoll", { n: 1 + Math.floor(Math.random() * 6) }), "good"), 700);
  }
});

// ----- Language: tap to cycle English -> Pirate -> UK slang -----
function applyLang() {
  applyLangToPage();
  $("lang-btn").innerHTML = `${icon("globe", "icon-sm")} ${t("label")}`;
  render();
  TV.draw();
  TV.sendState();
}
$("lang-btn").addEventListener("click", () => {
  const keys = Object.keys(LANGS);
  lang = keys[(keys.indexOf(lang) + 1) % keys.length];
  try { localStorage.setItem("cambodice-lang", lang); } catch (e) {}
  applyLang();
});

// ----- Light / dark mode -----
// "auto" follows the phone's own setting. Tapping cycles Auto -> Light -> Dark.
const THEMES = ["auto", "light", "dark"];
let theme = "auto";
try { theme = localStorage.getItem("cambodice-theme") || "auto"; } catch (e) {}
function applyTheme() {
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
  const label = { auto: "Auto", light: "Light", dark: "Dark" }[theme];
  const ic = { auto: "auto", light: "sun", dark: "moon" }[theme];
  // On the game screen the button is icon-only (class "icon-only") to save space
  document.querySelectorAll(".theme-btn").forEach((b) => {
    b.innerHTML = b.classList.contains("icon-only") ? icon(ic, "icon-sm") : `${icon(ic, "icon-sm")} ${label}`;
    b.setAttribute("aria-label", `Theme: ${label}`);
  });
  // the colour of the iPhone status bar area
  const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#14121d" : "#f7f6fb";
  TV.sendState();
}
document.querySelectorAll(".theme-btn").forEach((b) =>
  b.addEventListener("click", () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try { localStorage.setItem("cambodice-theme", theme); } catch (e) {}
    applyTheme();
  })
);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
applyTheme();

// Register the service worker: this is what lets the app open
// with no internet once it's on your home screen.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ----- TV sheet: type the code the TV shows -----
function openTvSheet() {
  $("tv-url").textContent = location.host + location.pathname.replace(/index\.html$/, "") + "tv";
  $("tv-code").value = TV.code && TV.status !== "on" ? TV.code : "";
  TV.draw();
  $("tv-sheet").classList.remove("hidden");
}
document.querySelectorAll(".tv-btn").forEach((b) => b.addEventListener("click", openTvSheet));
$("tv-code").addEventListener("input", (e) => {
  // capitals only, letters only, max 4
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  if (e.target.value.length === 4) TV.connect(e.target.value, true); // connect as soon as 4 letters are in
});
$("tv-go").addEventListener("click", () => {
  const code = $("tv-code").value;
  if (code.length === 4) TV.connect(code, true);
  else $("tv-code").focus();
});
$("tv-disconnect").addEventListener("click", () => TV.disconnect());
$("tv-close").addEventListener("click", () => $("tv-sheet").classList.add("hidden"));

// Draw the screen for the first time (applyLang fills in the words, then draws)
applyLang();
TV.init(); // reconnect to last time's TV, if there was one
