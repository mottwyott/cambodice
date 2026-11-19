// sounds.js
// ---------------------------------------------------------------
// All sounds are made in code with the Web Audio API (tiny
// synthesiser built into every browser), so there are no sound
// files to download. Each sound is just a few notes:
//   note(frequency in Hz, start delay in seconds, length, volume, wave shape)
// iPhones only allow sound after the first tap, which is fine:
// every sound here is triggered by a tap.
// ---------------------------------------------------------------

const Sound = {
  ctx: null,
  on: true,

  init() {
    try { this.on = localStorage.getItem("cambodice-sound") !== "off"; } catch (e) {}
  },

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem("cambodice-sound", this.on ? "on" : "off"); } catch (e) {}
    if (this.on) this.tap();
  },

  // Play one note. type: "sine" (soft), "triangle" (bell-ish), "square" (retro)
  note(freq, delay = 0, length = 0.12, volume = 0.15, type = "sine") {
    if (!this.on) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      // quick fade in, smooth fade out = no clicks
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + length + 0.02);
      return osc;
    } catch (e) { /* no audio available: stay silent */ }
  },

  // Soft click when you add points
  tap() { this.note(880, 0, 0.07, 0.08, "triangle"); },

  // Happy rising three notes when you bank
  bank() {
    [523, 659, 784].forEach((f, i) => this.note(f, i * 0.08, 0.25, 0.14, "triangle"));
  },

  // Sad falling "wah-wah" when you bust
  bust() {
    const o1 = this.note(330, 0, 0.3, 0.16, "sawtooth");
    const o2 = this.note(247, 0.28, 0.5, 0.16, "sawtooth");
    try {
      o1 && o1.frequency.exponentialRampToValueAtTime(280, this.ctx.currentTime + 0.3);
      o2 && o2.frequency.exponentialRampToValueAtTime(180, this.ctx.currentTime + 0.8);
    } catch (e) {}
  },

  // Two-note "ding-ding" for the score check / final round
  check() {
    this.note(988, 0, 0.3, 0.12, "sine");
    this.note(1319, 0.14, 0.45, 0.12, "sine");
  },

  // Little fanfare for the winner
  win() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
      this.note(f, i * 0.12, i === 5 ? 0.7 : 0.18, 0.14, "triangle")
    );
  },
};

Sound.init();
