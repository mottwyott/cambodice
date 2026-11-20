// rules.js
// ---------------------------------------------------------------
// All the "house rules" live in ONE object here. If your group plays
// a little differently, change a number below and the whole app
// follows along: the scorekeeping AND the Rules screen.
// (Later, the TV scoreboard will load this same file, so the rules
// shown on the TV always match the phone.)
// ---------------------------------------------------------------

const RULES = {
  diceCount: 5,          // how many dice you roll
  targetScore: 10000,    // default game length (first to this triggers the final round)
  targetOptions: [5000, 10000], // choices on the setup screen

  // "Score check" popup: shows everyone's standings ONCE per game,
  // the first time anybody passes this score (about two-thirds of the way).
  // Key = game length, value = score that triggers it.
  scoreCheckAt: { 5000: 3500, 10000: 6500 },
  // Points needed in ONE turn before your first bank.
  // Key = game length, value = minimum (shorter games need less).
  minToGetOnBoard: { 5000: 250, 10000: 500 },
  finalRound: true,      // everyone else gets one more turn after someone hits the target

  singles: { 1: 100, 5: 50 },   // lone 1s and 5s
  tripleOnes: 1000,             // three 1s
  tripleMultiplier: 100,        // other triples: face x 100 (three 4s = 400)
  fourOfAKindMultiplier: 2,     // 4 of a kind = 2 x the triple
  fiveOfAKindMultiplier: 4,     // 5 of a kind = 4 x the triple
  straight: 1500,               // 1-2-3-4-5 or 2-3-4-5-6

  loserBuysShots: true,         // last place buys everyone a shot
};

// Illustrated characters (cut from one sprite sheet, in avatars/).
const CHARACTERS = [
  "avatars/01-sunnies.png",
  "avatars/02-bun.png",
  "avatars/03-tash.png",
  "avatars/04-shades-up.png",
  "avatars/05-cap.png",
  "avatars/06-tongue.png",
  "avatars/07-bucket.png",
  "avatars/08-goldie.png",
  "avatars/09-ginger.png",
  "avatars/10-grin.png",
  "avatars/11-blondie.png",
  "avatars/12-beanie.png",
  "avatars/13-curls.png",
  "avatars/14-purple-cap.png",
  "avatars/15-round-shades.png",
  "avatars/16-topknot.png",
];

// Emoji avatars, as a backup to the characters (or players can use a photo).
const AVATARS = [
  "🦊", "🐻", "🐼", "🐸", "🦁", "🐯", "🐵", "🐙",
  "🦄", "🐲", "🦖", "🐺", "🦉", "🐧", "🦈", "🐝",
  "👽", "🤖", "👻", "💀", "🤠", "😎", "🥸", "🤡",
  "🔥", "⚡", "🍀", "🎲", "🍺", "🌮", "🍕", "👑",
];

// Small helper: 10000 -> "10,000"
function fmt(n) {
  return n.toLocaleString("en-US");
}

// ---------------------------------------------------------------
// rulesAsHTML() builds the Rules screen text straight from the
// numbers above, so the rules can never be "out of date".
// ---------------------------------------------------------------
// How many points you need to get on the board in a game of this length.
function minToGetOn(target = RULES.targetScore) {
  return RULES.minToGetOnBoard[target] || 500;
}

function rulesAsHTML(target = RULES.targetScore) {
  const R = RULES;
  const triple = (face) => (face === 1 ? R.tripleOnes : face * R.tripleMultiplier);

  // Scoring table rows: [what you rolled, points]
  const rows = [
    [t("rSingle", { n: 1 }), R.singles[1]],
    [t("rSingle", { n: 5 }), R.singles[5]],
    ...[1, 2, 3, 4, 5, 6].map((f) => [t("rThree", { n: f }), triple(f)]),
    [t("rFour"), t("rTimesTriple", { x: R.fourOfAKindMultiplier })],
    [t("rFive"), t("rTimesTriple", { x: R.fiveOfAKindMultiplier })],
    [t("rStraight"), R.straight],
  ];

  const table = rows
    .map(([what, pts]) => `<tr><td>${what}</td><td>${typeof pts === "number" ? fmt(pts) : pts}</td></tr>`)
    .join("");

  const vars = { dice: R.diceCount, min: fmt(minToGetOn(target)), target: fmt(target) };
  return `
    <h2>${t("rScoring")}</h2>
    <table class="rules-table">${table}</table>
    <p class="rules-eg">${t("rExample", { a: fmt(triple(2) * R.fourOfAKindMultiplier), b: fmt(triple(1) * R.fiveOfAKindMultiplier) })}</p>

    <h2>${t("rTurn")}</h2>
    <ul class="rules-list">
      <li>${t("rTurn1", vars)}</li>
      <li>${t("rBust")}</li>
      <li>${t("rHot", vars)}</li>
      <li>${t("rBoard", vars)}</li>
      <li>${t("rSameRoll")}</li>
    </ul>

    <h2>${t("rWinning")}</h2>
    <ul class="rules-list">
      <li>${t("rFirstTo", vars)}${R.finalRound ? " " + t("rLastTurn") : ""}</li>
      <li>${t("rHighest")}</li>
      ${R.loserBuysShots ? `<li>${t("rShots")}</li>` : ""}
    </ul>
  `;
}
