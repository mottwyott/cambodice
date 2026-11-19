# Cambodice: dice score keeper

A tiny web app for keeping score in a 5-dice "Ten Thousand" style game.
Plain HTML, CSS and JavaScript. No frameworks, no build step.

## The files (and what each one does)

| File | Job |
|---|---|
| `index.html` | The **skeleton**: every screen and button on the page. |
| `style.css` | The **look**: colors, sizes, glow. Colors live at the top as variables. |
| `rules.js` | The **house rules**: one `RULES` object. Change a number, the app and Rules screen follow. |
| `icons.js` | Small line icons drawn in code, plus the die in the logo. |
| `sounds.js` | Sound effects, made in code (no audio files). |
| `fonts/` | The Manrope font, stored inside the app so it works offline. |
| `app.js` | The **brain**: keeps the game state and redraws the screen when it changes. |
| `manifest.json` | Tells the iPhone the app's name, icon and colors for the home screen. |
| `sw.js` | The "service worker": saves a copy so the app opens offline. |
| `icons/` | Home-screen icons. |
| `history.js` | **Game history** and the all-time leaderboard. Only finished games are saved; the leaderboard is worked out from them, so deleting a game fixes the totals. |
| `net.js` | Shared by phone and TV: the 4-letter codes and the matchmaker settings. |
| `tv-link.js` | Phone side of the TV: connects to the TV and sends it the game after every change. |
| `tv/index.html`, `tv.js`, `tv.css` | The **TV page**. It shows a code, waits for the phone, then draws whatever the phone sends, big. |
| `lib/peerjs.min.js` | PeerJS, a free library that lets the phone and TV talk directly (WebRTC). |

## The big idea in app.js

1. **State** is one object: players, whose turn, points this turn.
2. **Actions** (add points, bank, bust, undo) change the state.
3. **render()** redraws the screen from the state.

Buttons never change the screen directly. That's what will make the TV
scoreboard easy later: the TV gets the same state and draws a big version.

## Try it on your computer

In this folder run `python3 -m http.server 8000`, then open http://localhost:8000.
(Opening `index.html` by double-clicking mostly works, but offline mode needs a server.)

## Put it on your iPhone

1. Host the folder somewhere with https (GitHub Pages is free).
2. Open the link in **Safari**, tap **Share → Add to Home Screen**.
3. It now opens full-screen like an app, and works with no signal.

When you change a file, bump `CACHE = "cambodice-v3"` in `sw.js` to `v4` so phones pick up the update.

## Avatars and photos

Each player is either an emoji or a photo. Photos get shrunk to a 200×200 square
in `photoToAvatar()` (app.js) so they save fast and can be sent to the TV later.
An avatar is just a piece of text: an emoji like "🦊", or a photo written out as
`data:image/jpeg...`. That's why the same value works on the phone and the TV.

## The TV scoreboard

1. On the TV (or any computer), open `mottwyott.github.io/cambodice/tv`. It shows a 4-letter code.
2. On the phone, tap **TV** and type the code. Done: the TV now mirrors the game, with sounds.
3. The phone remembers the TV and reconnects by itself after it's been locked.

The TV never changes the game. The phone is the boss: after every tap it sends the TV the whole
game state, plus little "events" for pop-ups, sounds, the bust shake and confetti.
To find each other they use PeerJS's free matchmaker (0.peerjs.com); after that they talk directly.

## Changing the rules

Open `rules.js`, edit a number, save, reload. Game length (5,000 or 10,000) is picked on the setup screen; when the score check pops up is `scoreCheckAt`.
