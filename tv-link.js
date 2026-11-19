// tv-link.js  (phone side)
// ---------------------------------------------------------------
// Connects this phone to the TV page and keeps it up to date.
//
// The idea is simple: every time the game changes, the phone sends
// the WHOLE game state to the TV, and the TV draws its own big
// version of it. One-off things (pop-up lines, sounds, the bust
// shake, confetti) are sent as little "events".
//
// Messages the phone sends (all plain objects):
//   { type: "state", state, lang, theme, fx, blocker, awards, board }
//   { type: "toast", text, mood }
//   { type: "sound", name }        bank / bust / check / win
//   { type: "shake" }              bust animation
//   { type: "confetti" }
//   { type: "rules", open }        show/hide the house rules
// ---------------------------------------------------------------

const TV = {
  peer: null,
  conn: null,
  code: null,       // the 4-letter code we're connected (or connecting) to
  status: "off",    // "off" | "connecting" | "on" | "failed"
  retryTimer: null,
  failTimer: null,

  isOn() { return this.status === "on" && this.conn && this.conn.open; },

  // Send something to the TV (does nothing if no TV is connected)
  send(msg) {
    if (!this.isOn()) return;
    try { this.conn.send(msg); } catch (e) {}
  },

  // The full picture of the game, sent after every change
  sendState() {
    if (!this.isOn()) return;
    this.send({
      type: "state",
      state,
      lang,
      theme,
      fx: { banked: fx.banked || null, win: !!fx.win },
      blocker: state.phase === "playing" ? bankBlocker() : null,
      awards: state.phase === "over" ? awards() : null,
      board: loadBoard(),
    });
  },

  // Connect to the TV showing this code. manual = the person just typed it.
  connect(code, manual = false) {
    code = code.toUpperCase();
    clearTimeout(this.retryTimer);
    clearTimeout(this.failTimer);
    if (this.conn) { this.conn.removeAllListeners?.(); this.conn.close(); this.conn = null; }
    this.code = code;
    this.status = "connecting";
    this.manual = manual;
    this.draw();

    // Our own check-in with the matchmaker (made once, then reused)
    if (!this.peer || this.peer.destroyed) {
      this.peer = new Peer(peerOptions());
      this.peer.on("disconnected", () => { if (!this.peer.destroyed) this.peer.reconnect(); });
      this.peer.on("error", (err) => this.problem(err));
    }
    const go = () => {
      const conn = this.peer.connect(PEER_PREFIX + code, { reliable: true });
      this.conn = conn;
      conn.on("open", () => {
        if (this.conn !== conn) return;
        clearTimeout(this.failTimer);
        this.status = "on";
        try { localStorage.setItem("cambodice-tv", code); } catch (e) {}
        this.draw();
        this.sendState();
        if (!this.manual) toast(t("tvBack"), "good");
      });
      conn.on("close", () => this.lost(conn));
      conn.on("error", () => this.lost(conn));
    };
    if (this.peer.open) go(); else this.peer.once("open", go);

    // Give up after 10 seconds
    this.failTimer = setTimeout(() => { if (this.status === "connecting") this.problem({ type: "timeout" }); }, 10000);
  },

  // Something went wrong while connecting
  problem(err) {
    if (this.status === "on") return; // already fine, ignore
    if (this.manual) {
      this.status = "failed"; // tell the person; don't keep trying a code that may be wrong
      this.draw();
    } else {
      this.status = "off";
      this.retrySoon();          // a remembered TV: quietly try again in a bit
    }
  },

  // The connection dropped (TV switched off, phone locked…)
  lost(conn) {
    if (this.conn !== conn) return;
    const wasOn = this.status === "on";
    this.conn = null;
    this.status = "off";
    this.draw();
    if (wasOn) toast(t("tvLost"), "bad");
    this.retrySoon();
  },

  retrySoon() {
    clearTimeout(this.retryTimer);
    if (!this.saved()) return;
    this.retryTimer = setTimeout(() => {
      if (document.visibilityState === "visible" && this.status !== "on") this.connect(this.saved());
    }, 5000);
  },

  // Stop using the TV (and forget it)
  disconnect() {
    try { localStorage.removeItem("cambodice-tv"); } catch (e) {}
    clearTimeout(this.retryTimer);
    clearTimeout(this.failTimer);
    if (this.conn) { const c = this.conn; this.conn = null; c.close(); }
    this.status = "off";
    this.draw();
  },

  saved() {
    try { return localStorage.getItem("cambodice-tv"); } catch (e) { return null; }
  },

  // Called once when the app opens: reconnect to the TV we used last time
  init() {
    if (typeof Peer === "undefined") return; // library didn't load: no TV, app still works
    if (this.saved()) this.connect(this.saved());
    // Phones freeze web pages when locked. When it wakes up, reconnect.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.saved() && this.status !== "on" && this.status !== "connecting") {
        this.connect(this.saved());
      }
    });
    this.draw();
  },

  // Update the TV buttons and the TV sheet
  draw() {
    const on = this.status === "on";
    document.querySelectorAll(".tv-btn").forEach((b) => b.classList.toggle("linked", on));
    const sheet = document.getElementById("tv-sheet");
    if (!sheet) return;
    document.getElementById("tv-off").classList.toggle("hidden", on);
    document.getElementById("tv-on").classList.toggle("hidden", !on);
    document.getElementById("tv-go").classList.toggle("hidden", on);
    document.getElementById("tv-disconnect").classList.toggle("hidden", !on);
    document.getElementById("tv-go").disabled = this.status === "connecting";
    document.getElementById("tv-go").textContent = this.status === "connecting" ? t("tvConnecting") : t("tvConnect");
    document.getElementById("tv-on-text").textContent = t("tvConnected", { code: this.code || "" });
    const msg = document.getElementById("tv-msg");
    msg.textContent = this.status === "failed" ? t("tvFailed", { code: this.code }) : "";
    msg.classList.toggle("warn", this.status === "failed");
  },
};

// While a TV is connected, the big sounds play on the TV instead of
// the phone (the phone keeps its little tap click).
["bank", "bust", "check", "win"].forEach((name) => {
  const playHere = Sound[name].bind(Sound);
  Sound[name] = () => (TV.isOn() ? TV.send({ type: "sound", name }) : playHere());
});
