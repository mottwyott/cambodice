// net.js
// ---------------------------------------------------------------
// Shared by the phone (tv-link.js) and the TV page (tv.js).
//
// How the phone and TV find each other:
//   PeerJS (lib/peerjs.min.js) is a free library for WebRTC, the
//   tech video calls use to send data straight between two devices.
//   To *find* each other, both sides check in with a free public
//   "matchmaker" server (0.peerjs.com). The TV checks in under the
//   name "cambodice-ABCD", the phone asks for that name, and from then
//   on they talk directly to each other.
// ---------------------------------------------------------------

const PEER_PREFIX = "cambodice-";

// Letters that can't be confused on a TV (no I, L, O, 0 or 1)
const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return code;
}

// Settings for the matchmaker. Normally the free cloud one (empty {}).
// For testing on a computer you can add ?broker=localhost:9000 to the
// address to use a matchmaker running on your own machine instead.
function peerOptions() {
  const m = location.search.match(/broker=([\w.-]+):(\d+)/);
  const opts = { debug: 0 };
  if (m) Object.assign(opts, { host: m[1], port: Number(m[2]), path: "/", secure: false });
  return opts;
}
