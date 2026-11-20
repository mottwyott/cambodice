// cloud.js
// ---------------------------------------------------------------
// The online database (Google Firebase / Firestore), so every phone
// shares the same game history and leaderboard.
//
// How it fits in:
//   The phone still keeps its own copy of everything (localStorage,
//   see history.js), so the app works with no signal. This file
//   keeps that copy in step with the online one:
//     - a finished game is uploaded (or queued until there's signal)
//     - when anyone's game lands online, every phone gets it
//     - deletes happen online first, so ONLY the admin can do them
//
// Who can do what is enforced by Firebase's "security rules"
// (firestore.rules), not by this file, so nobody can cheat by
// editing the website.
//
// If FIREBASE_CONFIG is empty, the app simply stays phone-only.
// ---------------------------------------------------------------

// Paste the config from the Firebase console here
// (these values are public by design: the security rules are what protect the data)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDz6XFL1-yvM-0OZXp9FVHV163XR_1uTmY",
  authDomain: "mottwyott-b980f.firebaseapp.com",
  projectId: "mottwyott-b980f",
  storageBucket: "mottwyott-b980f.firebasestorage.app",
  messagingSenderId: "265079824855",
  appId: "1:265079824855:web:bac6cb56fd3b300a2d2b92",
};

// Shown small on the History screen, handy to check a phone has the latest version
const APP_VERSION = "v21";

// The admin's account id (the same one written in firestore.rules)
const ADMIN_UID = "uN3NYHP3OJTIFQK1SnHWb5PKfi33";

const Cloud = {
  status: "off",   // what's happening, shown on the History screen
  on: false,       // is the online database switched on?
  db: null,
  auth: null,
  isAdmin: false,  // signed in with the admin email + password
  ready: false,    // have we heard from the server at least once?

  init() {
    if (!FIREBASE_CONFIG) return;
    if (typeof firebase === "undefined") { this.status = "library didn't load"; return; }
    this.status = "starting";
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      this.db = firebase.firestore();
      // Keep a copy on the phone so it works offline and uploads later
      this.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      this.auth = firebase.auth();
    } catch (e) { this.status = "error: " + e.message; return; }
    this.on = true;
    this.status = "signing in";

    // Everyone is signed in quietly as an anonymous "guest" (that's
    // enough to add games). The admin signs in with email + password.
    this.auth.onAuthStateChanged((user) => {
      if (!user) {
        this.auth.signInAnonymously().catch((e) => { this.status = "sign-in failed: " + (e.code || e.message); refreshHistory(); });
        return;
      }
      this.status = "connecting";
      this.isAdmin = user.uid === ADMIN_UID; // any other account is treated as a guest
      this.listen();
      if (this.isAdmin && this.ready) this.firstRun(); // admin just signed in: upload anything waiting
      drawAdmin();
      refreshHistory();
    });
  },

  // Listen for changes made by any phone, and copy them to this one
  listen() {
    if (this.listening) return;
    this.listening = true;

    this.db.collection("games").onSnapshot((snap) => {
      if (snap.metadata.fromCache && !this.ready) return; // wait for the real list
      if (!snap.metadata.fromCache) { this.ready = true; this.status = "connected"; }
      const online = snap.docs.map((d) => ({ ...d.data(), synced: true }));
      const onlineIds = new Set(online.map((g) => g.id));
      // Games finished on this phone that haven't made it online yet
      const waiting = loadGames().filter((g) => !g.synced && !onlineIds.has(g.id));
      waiting.forEach((g) => this.upload(g));
      saveGames([...online, ...waiting]);
      this.firstRun();
      refreshHistory();
    }, (e) => { this.status = "error: " + (e.code || e.message); refreshHistory(); });

    this.db.collection("faces").onSnapshot((snap) => {
      const faces = loadJSON(FACES_KEY, {});
      snap.docs.forEach((d) => (faces[d.id] = safeAvatar(d.data().avatar)));
      saveJSON(FACES_KEY, faces);
      refreshHistory();
    }, (e) => { this.status = "error: " + (e.code || e.message); refreshHistory(); });

    this.db.collection("paid").onSnapshot((snap) => {
      if (snap.metadata.fromCache && !this.ready) return;
      const paid = {};
      snap.docs.forEach((d) => (paid[d.id] = d.data().count || 0));
      saveJSON(PAID_KEY, paid);
      refreshHistory();
    }, (e) => { this.status = "error: " + (e.code || e.message); refreshHistory(); });

    this.db.collection("meta").doc("legacy").onSnapshot((doc) => {
      if (doc.metadata.fromCache && !this.ready) return;
      const board = doc.exists ? doc.data().board || {} : {};
      // Never let an empty online copy wipe an old leaderboard still waiting to upload
      if (Object.keys(board).length) saveJSON(LEGACY_KEY, board);
      else if (localStorage.getItem("cambodice-legacy-up")) localStorage.removeItem(LEGACY_KEY);
      refreshHistory();
    }, (e) => { this.status = "error: " + (e.code || e.message); refreshHistory(); });
  },

  // The very first time this phone goes online: move its old
  // "earlier games" and paid shots up to the shared database.
  firstRun() {
    // The old leaderboard can only be uploaded by the admin (so nobody
    // else can plant a fake one). It waits on the phone until then.
    const legacy = loadJSON(LEGACY_KEY, {});
    if (this.isAdmin && Object.keys(legacy).length && !localStorage.getItem("cambodice-legacy-up")) {
      const ref = this.db.collection("meta").doc("legacy");
      ref.get().then((doc) => {
        if (!doc.exists || !Object.keys(doc.data().board || {}).length) ref.set({ board: legacy });
        localStorage.setItem("cambodice-legacy-up", "1");
      }).catch(() => {});
    }
    if (localStorage.getItem("cambodice-cloud-moved")) return;
    localStorage.setItem("cambodice-cloud-moved", "1");
    Object.entries(loadJSON(PAID_KEY, {})).forEach(([key, n]) => {
      if (n > 0) this.db.collection("paid").doc(key).set({ count: firebase.firestore.FieldValue.increment(n) }, { merge: true });
    });
    Object.entries(loadJSON(FACES_KEY, {})).forEach(([key, avatar]) => this.uploadFace(key, avatar));
  },

  upload(game) {
    if (!this.on) return;
    const { synced, ...data } = game;
    // Firestore can't store lists inside lists, so each turn becomes { p, pts, b }
    data.log = (data.log || []).map((e) => (Array.isArray(e) ? { p: e[0], pts: e[1], b: e[2] } : e));
    this.db.collection("games").doc(game.id).set(data).catch(() => {});
  },

  uploadFace(key, avatar) {
    if (!this.on || !avatar) return;
    this.db.collection("faces").doc(key).set({ avatar }).catch(() => {});
  },

  pay(key) {
    if (!this.on) return;
    this.db.collection("paid").doc(key)
      .set({ count: firebase.firestore.FieldValue.increment(1) }, { merge: true }).catch(() => {});
  },

  remove(id) {
    if (!this.on) return Promise.resolve();
    if (id === "earlier") return this.db.collection("meta").doc("legacy").delete();
    return this.db.collection("games").doc(id).delete();
  },

  signIn(email, password) {
    return this.auth.signInWithEmailAndPassword(email, password);
  },
  signOut() {
    return this.auth.signOut(); // then we sign back in as a guest automatically
  },
};
