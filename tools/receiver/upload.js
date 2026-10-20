/* Upload suite - the Bullpen Chart's dashboard upload, end to end, against the
   real receiver/Code.gs running on a stand-in Apps Script runtime.

       node tools/receiver/upload.js      (from the titans-apps folder)

   It serves the app itself on port 8898, with the receiver URL, key and wait
   written into the page as it is served. (A Playwright route that rewrites the
   page instead leaves later cross-origin requests hanging in Chromium.)

   Part 1 drives the receiver directly: every reason it should turn an upload
   away, duplicates, a write that dies halfway, and text that must not become a
   formula or a date.

   Part 2 runs the real app in Chromium against the receiver on ANOTHER origin
   (port 8899), the way an iPad talks to script.google.com: a cross-origin POST,
   answered with a redirect, like Apps Script does. It proves the app sends a
   "simple" request (no preflight - Apps Script cannot answer one), uploads on
   filing, queues with no signal, catches up later, never sends a practice
   session, never blocks charting while the receiver is slow, and stops on a
   refusal instead of hammering.

   Exits non-zero if anything fails. */
"use strict";
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");
const { makeRuntime } = require("./mock-gas");

const ROOT = path.join(__dirname, "..", "..");
const APORT = 8898, RPORT = 8899;
const APP = "http://localhost:" + APORT;
const RURL = "http://localhost:" + RPORT + "/macros/s/TEST/exec";
const CODE = path.join(__dirname, "..", "..", "receiver", "Code.gs");
let fails = 0, checks = 0;

function check(name, got, want) {
  checks++;
  const ok = String(got) === String(want);
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(52) + got + (ok ? "" : "   (expected " + want + ")"));
  if (!ok) fails++;
}

/* ---------------------------------------------------------------- runtime */
function freshRuntime() {
  const rt = makeRuntime(CODE);
  rt.newBook("SEASON1");
  rt.props.SEASON_SHEET_ID = "SEASON1";
  rt.key = rt.sandbox.setup();
  return rt;
}
function upload(key, over) {
  const p = {
    schema: 1, key, app: "bullpen", build: "v32",
    record: { id: "abc1234", mound: "Mound 1", date: "2027-01-12", coach: "Coach V", template: "Fastball Command",
              scriptId: "s1", filedAt: "2027-01-12T22:00:00.000Z", pitches: 2 },
    tables: { pitches: { columns: ["SessionID", "Mound", "PitchNo", "Velo", "AO3plus", "Coach"],
                         rows: [["abc1234", "Mound 1", 1, 78, "++", "Coach V"],
                                ["abc1234", "Mound 1", 2, "", "-+", "Coach V"]] } }
  };
  return Object.assign(p, over || {});
}

function part1() {
  console.log("\nRECEIVER · setup");
  let rt = freshRuntime();
  const b = rt.book("SEASON1");
  check("setup builds every tab", b.order.join(","),
        "Records,Bullpen_Pitches,Bullpen_Notes,Game_Pitches,Game_Innings,Game_Notes,Offense_Pitches,Log,Coaches,Config");
  check("setup makes a 40-character key", /^[0-9a-f]{40}$/.test(rt.key), true);
  check("setup prints the key to the log", rt.logs.some(l => l.indexOf(rt.key) >= 0), true);
  const again = rt.sandbox.setup();
  check("running setup again keeps the same key", again === rt.key, true);
  check("doGet says hello and nothing else", JSON.stringify(Object.keys(rt.get()).sort()), '["ok","schemas","service","version"]');

  /* Coaches is Jim's. setup must not rewrite it if it is already there. */
  const rt2 = makeRuntime(CODE); const b2 = rt2.newBook("S2"); rt2.props.SEASON_SHEET_ID = "S2";
  const co = b2.insertSheet("Coaches"); co.getRange(1, 1, 2, 3).setValues([["Name", "Google account", "Level(s)"], ["Jim Vaughn", "jim@example.com", "All"]]);
  rt2.sandbox.setup();
  check("setup leaves an existing Coaches tab alone", b2.getSheetByName("Coaches").data.length + " rows", "2 rows");

  console.log("\nRECEIVER · turns away what it should");
  const rej = (label, body, want) => { const r = rt.post(typeof body === "string" ? body : JSON.stringify(body)); check(label, r.ok + " / " + r.error, "false / " + want); };
  rej("not JSON", "this is not json", "not JSON");
  rej("wrong key", upload("nope"), "wrong key");
  rej("missing key", upload(undefined), "wrong key");
  rej("unknown upload version", upload(rt.key, { schema: 99 }), "unknown upload version 99");
  rej("unknown app", upload(rt.key, { app: "softball" }), "unknown app");
  rej("bad record id", upload(rt.key, { record: { id: "../../x" } }), "bad record id");
  rej("a table the app may not send", upload(rt.key, { tables: { innings: { columns: ["A"], rows: [] } } }), "unknown table innings");
  rej("row that does not match the columns", upload(rt.key, { tables: { pitches: { columns: ["A", "B"], rows: [[1]] } } }), "row 1 does not match the columns");
  rej("an app trying to set RecordID", upload(rt.key, { tables: { pitches: { columns: ["RecordID"], rows: [["x"]] } } }), "RecordID is set by the receiver");
  rej("a column name that is not a name", upload(rt.key, { tables: { pitches: { columns: ["=SUM(A1)"], rows: [["x"]] } } }), "bad column name");
  rej("a duplicated column", upload(rt.key, { tables: { pitches: { columns: ["A", "A"], rows: [[1, 2]] } } }), "duplicate column A");
  rej("too large", "x".repeat(3000001), "too large");
  check("nothing turned away reached Records", b.getSheetByName("Records").rows().length, 0);
  check("rejects are logged with a reason", b.getSheetByName("Log").rows().length >= 11, true);
  check("the log never holds the key", JSON.stringify(b.getSheetByName("Log").data).indexOf(rt.key) < 0, true);

  console.log("\nRECEIVER · stores, once");
  let r = rt.post(JSON.stringify(upload(rt.key)));
  check("a good upload is stored", r.ok + " " + r.status + " " + r.rows, "true stored 2");
  const pit = b.getSheetByName("Bullpen_Pitches");
  check("column A is RecordID, then the app's columns", pit.header().join(","), "RecordID,SessionID,Mound,PitchNo,Velo,AO3plus,Coach");
  check("every row carries the RecordID", pit.rows().map(x => x[0]).join(","), "abc1234,abc1234");
  check("numbers stay numbers", typeof pit.rows()[0][4] + " " + pit.rows()[0][4], "number 78");
  check("AO3+ \"++\" stays text, not a formula", pit.rows()[0][5], "++");
  check("Records gets one row, written last", b.getSheetByName("Records").rows().length, 1);
  r = rt.post(JSON.stringify(upload(rt.key)));
  check("the same session again is a duplicate", r.ok + " " + r.status, "true duplicate");
  check("and adds nothing", pit.rows().length + " pitch rows, " + b.getSheetByName("Records").rows().length + " record", "2 pitch rows, 1 record");
  check("the lock is released after every reply", rt.locked, false);

  console.log("\nRECEIVER · text that must stay text");
  const nasty = upload(rt.key, { record: { id: "nasty01", coach: "=HYPERLINK(\"http://x\")", date: "2027-01-12" },
    tables: { pitches: { columns: ["Coach", "Count", "Note", "Neg", "Id"],
      rows: [["=1+1", "2-1", "+chase", "-3", "007"], ["@x", "1/2", "-glove side", "-0.5", "0"]] } } });
  r = rt.post(JSON.stringify(nasty));
  check("an upload full of formula-shaped text is stored", r.ok, true);
  check("no cell anywhere became a formula", b.flags.formula, 0);
  check("no count became a date", b.flags.date, 0);
  const last = pit.records().slice(-2);
  check("\"=1+1\" is stored as the text =1+1", last[0].Coach, "=1+1");
  check("\"2-1\" is stored as the text 2-1", last[0].Count, "2-1");
  check("\"-3\" is a number", last[0].Neg, -3);
  check("a new column lands at the right-hand end", pit.header().slice(-4).join(","), "Count,Note,Neg,Id");
  check("old rows get a blank in the new columns", [undefined, ""].indexOf(pit.records()[0].Count) >= 0, true);
  const nrec = b.getSheetByName("Records").records().find(x => x.RecordID === "nasty01");
  check("a formula-shaped coach name is text in Records", nrec && nrec.Coach, "=HYPERLINK(\"http://x\")");

  console.log("\nRECEIVER 2 · bullpen notes, on a Sheet set up by receiver 1");
  {
    const rt4 = freshRuntime(), b4 = rt4.book("SEASON1");
    /* a Sheet built by receiver 1 has no Bullpen_Notes tab */
    delete b4.sheets["Bullpen_Notes"]; b4.order = b4.order.filter(n => n !== "Bullpen_Notes");
    const withNotes = upload(rt4.key, { record: { id: "notes01", date: "2027-01-12" }, tables: {
      pitches: { columns: ["SessionID", "PitchNo"], rows: [["notes01", 1]] },
      notes: { columns: ["SessionID", "PitcherID", "ToPitcher", "CoachOnly"], rows: [["notes01", "p0001", "Finish out front", "=watch the elbow"]] } } });
    const r4 = rt4.post(JSON.stringify(withNotes));
    check("an upload with notes is stored", r4.ok + " " + r4.status + " " + r4.rows, "true stored 2");
    check("the missing Bullpen_Notes tab was made on first use", !!b4.getSheetByName("Bullpen_Notes"), true);
    const n4 = b4.getSheetByName("Bullpen_Notes");
    check("notes: RecordID first, then the app's columns", n4.header().join(","), "RecordID,SessionID,PitcherID,ToPitcher,CoachOnly");
    check("a formula-shaped note stayed text", n4.records()[0].CoachOnly, "=watch the elbow");
    check("the offense app may not send notes", (() => { const x = rt4.post(JSON.stringify(upload(rt4.key, { app: "offense", record: { id: "o000001" }, tables: { notes: { columns: ["A"], rows: [] } } }))); return x.ok + " / " + x.error; })(), "false / unknown table notes");
  }

  console.log("\nRECEIVER 3 · a notes update replaces that record's notes, and nothing else");
  {
    const rt5 = freshRuntime(), b5 = rt5.book("SEASON1");
    const P = r => rt5.post(JSON.stringify(r));
    P(upload(rt5.key, { record: { id: "upd0001", date: "2027-01-12" }, tables: {
      pitches: { columns: ["SessionID", "PitchNo"], rows: [["upd0001", 1], ["upd0001", 2]] },
      notes: { columns: ["SessionID", "PitcherID", "ToPitcher"], rows: [["upd0001", "p1", "first note"], ["upd0001", "p2", "second"]] } } }));
    P(upload(rt5.key, { record: { id: "upd0002", date: "2027-01-13" }, tables: {
      pitches: { columns: ["SessionID", "PitchNo"], rows: [["upd0002", 1]] },
      notes: { columns: ["SessionID", "PitcherID", "ToPitcher"], rows: [["upd0002", "p3", "keep me"]] } } }));
    const r5 = P(upload(rt5.key, { record: { id: "upd0001" }, update: "notes", tables: {
      notes: { columns: ["SessionID", "PitcherID", "ToPitcher"], rows: [["upd0001", "p1", "changed"], ["upd0001", "p2", "second"]] } } }));
    check("a notes update for a record already in", r5.ok + " " + r5.status + " " + r5.rows, "true notes updated 2");
    const n5 = b5.getSheetByName("Bullpen_Notes");
    check("  its note rows are replaced, not added to", n5.rows().length, 3);
    check("  with the new text", n5.records().filter(x => x.RecordID === "upd0001").map(x => x.ToPitcher).join(","), "changed,second");
    check("  another record's notes are untouched", n5.records().filter(x => x.RecordID === "upd0002").map(x => x.ToPitcher).join(","), "keep me");
    check("  pitch rows are untouched", b5.getSheetByName("Bullpen_Pitches").rows().length, 3);
    check("  Records is untouched", b5.getSheetByName("Records").rows().length, 2);
    const early = P(upload(rt5.key, { record: { id: "upd0099" }, update: "notes", tables: { notes: { columns: ["A"], rows: [["x"]] } } }));
    check("a notes update before the record is in: try later", early.ok + " / " + early.error + " / " + early.retry, "false / not on the dashboard yet / true");
    const bad1 = P(upload(rt5.key, { record: { id: "upd0001" }, update: "notes", tables: { pitches: { columns: ["A"], rows: [["x"]] } } }));
    check("a notes update may carry only notes", bad1.ok + " / " + bad1.error, "false / a notes update carries only notes");
    const bad2 = P(upload(rt5.key, { record: { id: "upd0001" }, update: "pitches", tables: { notes: { columns: ["A"], rows: [["x"]] } } }));
    check("no other kind of update", bad2.ok + " / " + bad2.error, "false / unknown update pitches");
    check("  and nothing changed after either", n5.rows().length + " notes, " + b5.getSheetByName("Bullpen_Pitches").rows().length + " pitches", "3 notes, 3 pitches");
    const g5 = P(upload(rt5.key, { app: "game", record: { id: "g000005" }, tables: {
      pitches: { columns: ["Level", "Pitch"], rows: [["JV", 1]] }, notes: { columns: ["Level", "PitcherID", "ToPitcher"], rows: [["JV", "p1", "nice"]] } } }));
    check("the game app may send notes (receiver 3)", g5.ok + " " + g5.status, "true stored");
    check("  they land on Game_Notes", b5.getSheetByName("Game_Notes") ? b5.getSheetByName("Game_Notes").rows().length : "no tab", 1);
  }

  console.log("\nRECEIVER · a write that dies halfway");
  rt = freshRuntime();
  const b3 = rt.book("SEASON1");
  b3.failNext("Records");
  r = rt.post(JSON.stringify(upload(rt.key)));
  check("the failure is reported as retryable", r.ok + " " + !!r.retry, "false true");
  check("the pitch rows got written before it died", b3.getSheetByName("Bullpen_Pitches").rows().length, 2);
  check("the record is NOT in Records", b3.getSheetByName("Records").rows().length, 0);
  check("the lock is released after a failure", rt.locked, false);
  r = rt.post(JSON.stringify(upload(rt.key)));
  check("the retry is stored", r.ok + " " + r.status, "true stored");
  check("the half-written rows were cleared, not doubled", b3.getSheetByName("Bullpen_Pitches").rows().length, 2);
  check("Records has it once", b3.getSheetByName("Records").rows().length, 1);

  console.log("\nRECEIVER · a leading-zero id survives");
  r = rt.post(JSON.stringify(upload(rt.key, { record: { id: "0012345" } })));
  r = rt.post(JSON.stringify(upload(rt.key, { record: { id: "0012345" } })));
  check("an all-digit id with a leading zero is recognised again", r.status, "duplicate");

  console.log("\nRECEIVER · busy");
  rt.sandbox.LockService.getScriptLock().tryLock();
  r = rt.post(JSON.stringify(upload(rt.key, { record: { id: "busy001" } })));
  check("a held lock answers busy, retryable", r.ok + " " + r.error + " " + r.retry, "false busy true");
  rt.sandbox.LockService.getScriptLock().releaseLock();
}

/* ---------------------------------------------------------------- server */
function serve(rt) {
  const st = { down: false, delay: 0, preflights: 0, posts: 0, tokens: {}, n: 0 };
  const srv = http.createServer((req, res) => {
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (req.method === "OPTIONS") { st.preflights++; res.writeHead(405, cors); res.end(); return; }
    if (req.url.indexOf("/echo") === 0) {
      const t = new URL(req.url, "http://x").searchParams.get("t");
      res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, cors));
      res.end(st.tokens[t] || "{}"); return;
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", () => {
        if (st.down) { req.socket.destroy(); return; }
        st.posts++;
        st.lastType = req.headers["content-type"];
        const go = () => {
          const out = rt.sandbox.doPost({ postData: { contents: body } }).getContent();
          const t = "t" + (++st.n); st.tokens[t] = out;
          /* Apps Script answers a POST with a redirect to the actual content. */
          res.writeHead(302, Object.assign({ Location: "http://localhost:" + RPORT + "/echo?t=" + t }, cors));
          res.end();
        };
        if (st.delay) setTimeout(go, st.delay); else go();
      });
      return;
    }
    res.writeHead(404, cors); res.end();
  });
  return new Promise(r => srv.listen(RPORT, () => r({ srv, st })));
}

/* ---------------------------------------------------------------- app server */
const fs = require("fs");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
                ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
function serveApp() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, APP);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)));
    if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(file);
    if (/^\/(bullpen|offense|game)\/index\.html$/.test(u.pathname)) {
      let t = body.toString("utf8");
      const q = u.searchParams;
      /* The shipped build carries the real receiver's URL and key. Every test
         points it at the stand-in instead, or (noUrl) blanks it to prove "off". */
      const toUrl = q.get("u") || "", toKey = q.get("k") || "";
      t = t.replace(/var UPLOAD_URL = "[^"]*";/, () => "var UPLOAD_URL = " + JSON.stringify(toUrl) + ";")
           .replace(/var UPLOAD_KEY = "[^"]*";/, () => "var UPLOAD_KEY = " + JSON.stringify(toKey) + ";");
      /* belt and braces: if the swap ever misses, refuse to serve the real address */
      if (t.indexOf("script.google.com/macros") >= 0) { res.writeHead(500); res.end("real receiver URL still in page"); return; }
      if (q.get("w")) t = t.replace("var UPLOAD_WAIT = 20000;", "var UPLOAD_WAIT = " + Number(q.get("w")) + ";");
      body = t;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  });
  return new Promise(r => srv.listen(APORT, () => r(srv)));
}

/* ---------------------------------------------------------------- app driver */
async function openApp(b, rt, opts) {
  opts = opts || {};
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block" });
  if (opts.seed) await ctx.addInitScript(s => { for (const k in s) localStorage.setItem(k, s[k]); }, opts.seed);
  const pg = await ctx.newPage();
  pg.errs = []; pg.on("pageerror", e => pg.errs.push(String(e)));
  if (process.env.DEBUG) { pg.on("request", r => { if (r.url().indexOf("8899") > 0) console.log("    [request] " + r.method() + " " + r.url()); }); pg.on("requestfinished", r => { if (r.url().indexOf("8899") > 0) console.log("    [finished] " + r.url()); }); pg.on("requestfailed", r => console.log("    [failed] " + r.url() + " " + (r.failure() && r.failure().errorText))); pg.on("console", m => console.log("    [console] " + m.text())); }
  const q = new URLSearchParams();
  if (!opts.noUrl) { q.set("u", RURL); q.set("k", opts.key || rt.key); }
  if (opts.wait) q.set("w", String(opts.wait));
  await pg.goto(APP + (opts.path || "/bullpen/index.html") + "?" + q, { waitUntil: "load" });
  await pg.waitForTimeout(900);
  pg.ctx = ctx;
  return pg;
}
/* A real session: a mound name, two arms off the roster, a template, N pitches. */
async function chartSession(pg, n, opts) {
  opts = opts || {};
  await pg.evaluate(o => {
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    document.getElementById("tab-setup").click();
    set(document.getElementById("s-pad"), o.pad || "Mound 1");
    set(document.getElementById("s-coach"), o.coach || "Coach V");
    if (o.practice) { const c = document.getElementById("s-practice"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); }
    const tp = document.getElementById("tplPick");
    if (tp.options.length > 1) { set(tp, tp.options[1].value); document.getElementById("tplLoad").click(); }
    const yes = document.querySelector(".askwrap [data-yes]"); if (yes) yes.click();
    const R = window.TITANS_ROSTER || [];
    const sel = document.querySelectorAll('#rosterTbl select[data-f="rid"]');
    if (sel[0] && R[o.arm || 5]) set(sel[0], R[o.arm || 5].id);
    document.getElementById("tab-chart").click();
  }, opts);
  for (let i = 0; i < n; i++) {
    await pg.evaluate(i => {
      const z = document.querySelector('#zone button[data-r="' + (1 + i % 3) + '"][data-c="2"]');
      if (z) z.click();
    }, i);
  }
}
async function fileIt(pg) {
  await pg.evaluate(() => {
    /* v34: Finish & file is the header button, on any tab */
    document.getElementById("hdrFinish").click();
    document.querySelector(".askwrap [data-yes]").click();
  });
}
const arch = pg => pg.evaluate(() => JSON.parse(localStorage.getItem("titans-bullpen-archive-v1") || "[]"));
const line = pg => pg.evaluate(() => { const e = document.getElementById("upLine"); return e && !e.hidden ? e.className + " | " + e.textContent : "hidden"; });
async function until(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; }

async function part2() {
  const rt = freshRuntime();
  const book = rt.book("SEASON1");
  const pitches = () => book.getSheetByName("Bullpen_Pitches").rows().length;
  const records = () => book.getSheetByName("Records").rows().length;
  const { srv, st } = await serve(rt);
  const asrv = await serveApp();
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    /* The shipped bullpen carries the REAL receiver URL. No test may ever reach it:
       Google's script hosts do not resolve inside this browser. */
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  try {
    console.log("\nAPP · ships switched off, and says so");
    let pg = await openApp(b, rt, { noUrl: true });
    await chartSession(pg, 3); await fileIt(pg); await pg.waitForTimeout(500);
    await pg.evaluate(() => document.getElementById("tab-hist").click());
    check("with no URL nothing is sent", st.posts, 0);
    check("History says upload is not set up", (await line(pg)).indexOf("not set up") >= 0, true);
    check("the old export pill is back for that case", await pg.evaluate(() => document.querySelector(".hrow .pill").textContent), "not sent");
    check("no page errors", pg.errs.join(" | "), "");
    await pg.ctx.close();

    console.log("\nAPP · files and uploads");
    pg = await openApp(b, rt);
    await chartSession(pg, 7, { pad: "Mound 2", coach: "=cmd|' /C calc'!A0" });
    await pg.evaluate(() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
      set("note", "Finish out front. Great 2-strike changeup."); set("comments", "Arm slot dropping late");
    });
    await fileIt(pg);
    const up = await until(async () => (await arch(pg)).some(x => x.up));
    check("filing uploads straight away", up, true);
    check("the request was a simple one: no preflight", st.preflights, 0);
    check("sent as text/plain", /^text\/plain/.test(st.lastType || ""), true);
    check("the Sheet got one record", records(), 1);
    check("and all 7 pitches", pitches(), 7);
    const pit = book.getSheetByName("Bullpen_Pitches");
    const head = pit.header();
    check("the pitch tab carries every export column, RecordID first", head[0] + " … " + head.length + " columns, Practice=" + (head.indexOf("Practice") > 0), "RecordID … 39 columns, Practice=true");
    check("the rows join on the session id", pit.records()[0].RecordID === pit.records()[0].SessionID, true);
    check("a formula-shaped coach name stayed text", pit.records()[0].Coach, "=cmd|' /C calc'!A0");
    const notes = book.getSheetByName("Bullpen_Notes").records();
    check("v36: one notes row for the pitcher who threw", notes.length, 1);
    check("  To the pitcher reached the Sheet", notes[0] && notes[0].ToPitcher, "Finish out front. Great 2-strike changeup.");
    check("  Coach only reached the Sheet, in its own column", notes[0] && notes[0].CoachOnly, "Arm slot dropping late");
    check("  it joins on the session and the pitcher", notes[0] && (notes[0].RecordID === notes[0].SessionID && !!notes[0].PitcherID && notes[0].Pitches === 7), true);
    check("no cell became a formula or a date", book.flags.formula + book.flags.date, 0);
    const rec = book.getSheetByName("Records").records()[0];
    const BP_BUILD = (fs.readFileSync(path.join(ROOT, "bullpen/index.html"), "utf8").match(/var BUILD = "(v\d+)"/) || [])[1];
    check("Records names the app, build and mound", rec.App + " " + rec.Build + " " + rec.Mound, "bullpen " + BP_BUILD + " Mound 2");
    await pg.evaluate(() => document.getElementById("tab-hist").click());
    check("History pill says it is on the dashboard", await pg.evaluate(() => document.querySelector(".hrow .pill").textContent), "on dashboard");
    check("the status line says all done", (await line(pg)).split(" | ")[1], "Every filed session is on the dashboard.");
    check("no page errors", pg.errs.join(" | "), "");

    console.log("\nAPP v37 · a note changed after the session is on the dashboard");
    await pg.evaluate(() => document.getElementById("tab-hist").click());
    await pg.evaluate(() => document.querySelector("#histList [data-sum]").click());
    check("the Session summary opens from History", await pg.evaluate(() => !document.getElementById("v-sum").hidden && document.getElementById("v-hist").hidden), true);
    check("  the only inputs are the 2 notes", await pg.evaluate(() => [...document.querySelectorAll("#v-sum input, #v-sum textarea, #v-sum select")].map(e => e.getAttribute("data-k")).join(",")), "note,comments");
    check("  it shows the notes already written", await pg.evaluate(() => document.querySelector('#sumBody textarea[data-k="note"]').value), "Finish out front. Great 2-strike changeup.");
    check("  and says the session is on the dashboard", await pg.evaluate(() => document.getElementById("sumPill").textContent), "on dashboard");
    await pg.fill('#sumBody textarea[data-k="note"]', "Finish out front. The changeup was the pitch today.");
    check("  an edit marks the notes waiting", await pg.evaluate(() => document.getElementById("sumPill").textContent), "notes waiting");
    const pb = st.posts;
    await pg.click("#sumBack");
    check("  closing sends just the notes", await until(async () => { const a = await arch(pg); return a[a.length - 1].notesDirty === false; }), true);
    check("  in one request", st.posts - pb, 1);
    const bn = book.getSheetByName("Bullpen_Notes");
    check("  the note row was replaced, not doubled", bn.rows().length, 1);
    check("  with the new note", bn.records()[0].ToPitcher, "Finish out front. The changeup was the pitch today.");
    check("  Coach only kept", bn.records()[0].CoachOnly, "Arm slot dropping late");
    check("  pitches and Records untouched", records() + " records, " + pitches() + " pitches", "1 records, 7 pitches");
    check("  and the app is back on History", await pg.evaluate(() => !document.getElementById("v-hist").hidden), true);
    check("  pill back to on dashboard", await pg.evaluate(() => document.querySelector(".hrow .pill").textContent), "on dashboard");

    console.log("\nAPP · practice sessions never leave the iPad");
    const postsBefore = st.posts;
    await chartSession(pg, 4, { practice: true });
    check("the practice bar shows on the Chart tab", await pg.evaluate(() => !document.getElementById("practiceBar").hidden), true);
    await fileIt(pg); await pg.waitForTimeout(800);
    check("nothing was sent", st.posts - postsBefore, 0);
    check("the Sheet is unchanged", records() + " records, " + pitches() + " pitches", "1 records, 7 pitches");
    const a2 = await arch(pg);
    check("it is filed as practice", a2[a2.length - 1].practice + " / up " + a2[a2.length - 1].up, "true / up 0");
    check("practice switches itself off after filing", await pg.evaluate(() => document.getElementById("s-practice").checked + " / bar hidden " + document.getElementById("practiceBar").hidden), "false / bar hidden true");
    await pg.evaluate(() => document.getElementById("tab-hist").click());
    check("History marks it practice", await pg.evaluate(() => document.querySelector(".hrow .pill").textContent), "practice");
    check("the status line mentions it stays here", (await line(pg)).indexOf("1 practice session stays on this iPad.") >= 0, true);
    await pg.reload(); await pg.waitForTimeout(1200);
    check("reopening the app does not send it either", st.posts - postsBefore, 0);

    console.log("\nAPP · no signal, then signal");
    st.down = true;
    await chartSession(pg, 5, { pad: "Mound 3" });
    await fileIt(pg);
    await pg.waitForTimeout(1500);
    let a3 = await arch(pg);
    check("with the receiver unreachable it stays queued", a3[a3.length - 1].up, 0);
    check("and remembers why", a3[a3.length - 1].upErr, "offline");
    await pg.evaluate(() => document.getElementById("tab-hist").click());
    check("the line says it is waiting", (await line(pg)).split(" | ")[0], "upline wait");
    check("History pill says waiting", await pg.evaluate(() => document.querySelector(".hrow .pill").textContent), "waiting");
    check("charting still works", await pg.evaluate(() => { document.getElementById("tab-chart").click();
      const z = document.querySelector('#zone button[data-r="2"][data-c="2"]'); z.click(); return "clicked"; }), "clicked");
    st.down = false;
    await pg.evaluate(() => window.dispatchEvent(new Event("online")));
    check("getting signal back sends it", await until(async () => (await arch(pg)).every(x => x.practice || x.up)), true);
    check("Sheet now has both real sessions", records() + " records, " + pitches() + " pitches", "2 records, 12 pitches");
    const saved = await arch(pg);
    await pg.ctx.close();

    console.log("\nAPP · a reply that got lost");
    /* The receiver stored it but the iPad never heard back - e.g. signal dropped
       mid-reply. The iPad still has it queued; resending must change nothing. */
    const lost = JSON.parse(JSON.stringify(saved)); lost.forEach(x => { x.up = 0; });
    pg = await openApp(b, rt, { seed: { "titans-bullpen-archive-v1": JSON.stringify(lost) } });
    check("on open it resends both", await until(async () => (await arch(pg)).every(x => x.practice || x.up)), true);
    check("the receiver called them duplicates: nothing doubled", records() + " records, " + pitches() + " pitches", "2 records, 12 pitches");
    await pg.ctx.close();

    console.log("\nAPP · refused");
    pg = await openApp(b, rt, { key: "wrong-key" });
    await chartSession(pg, 3, { pad: "Mound 4" });
    const postsR = st.posts;
    await fileIt(pg);
    await pg.waitForTimeout(1500);
    a3 = await arch(pg);
    check("a refused session stays queued", a3[a3.length - 1].up, 0);
    check("with the receiver's reason", a3[a3.length - 1].upErr, "wrong key");
    await pg.evaluate(() => document.getElementById("tab-hist").click());
    const lr = await line(pg);
    check("the line says it was turned away", lr.split(" | ")[0] + " " + (lr.indexOf("Tell Jim") > 0), "upline bad true");
    check("it tried once, it did not hammer", st.posts - postsR, 1);
    check("the Sheet is unchanged", records(), 2);
    check("the Log says why", book.getSheetByName("Log").records().slice(-1)[0].Detail, "wrong key");
    await pg.ctx.close();

    console.log("\nAPP · a slow receiver never holds anything up");
    st.delay = 4000;
    pg = await openApp(b, rt, { wait: 1500 });
    await chartSession(pg, 3, { pad: "Mound 5" });
    const t0 = Date.now();
    await fileIt(pg);
    check("filing returns at once", Date.now() - t0 < 1000, true);
    await pg.evaluate(() => document.getElementById("tab-hist").click());
    check("the line says sending", (await line(pg)).split(" | ")[1], "Sending to the dashboard…");
    check("charting works while it sends", await pg.evaluate(() => { document.getElementById("tab-chart").click();
      document.querySelector('#zone button[data-r="1"][data-c="1"]').click(); return "clicked"; }), "clicked");
    await pg.waitForTimeout(2200);
    a3 = await arch(pg);
    check("after the app's own wait it is still queued, as a timeout", a3[a3.length - 1].up + " " + a3[a3.length - 1].upErr, "0 timeout");
    st.delay = 0;
    await pg.waitForTimeout(3000);
    await pg.evaluate(() => window.dispatchEvent(new Event("online")));
    check("the next try sends it (the late first copy is a duplicate)", await until(async () => (await arch(pg)).every(x => x.practice || x.up)), true);
    check("nothing doubled", records() + " records, " + pitches() + " pitches", "3 records, 15 pitches");
    await pg.ctx.close();

    console.log("\nAPP · four mounds at once");
    const pages = [];
    for (let m = 0; m < 4; m++) { const p = await openApp(b, rt); await chartSession(p, 6, { pad: "Mound " + (10 + m), arm: 10 + m }); pages.push(p); }
    await Promise.all(pages.map(fileIt));
    const allUp = await until(async () => { for (const p of pages) { if (!(await arch(p)).every(x => x.practice || x.up)) return false; } return true; }, 12000);
    check("all four upload", allUp, true);
    check("every session and pitch lands once", records() + " records, " + pitches() + " pitches", "7 records, 39 pitches");
    const ids = book.getSheetByName("Records").rows().map(r => r[0]);
    check("no record id appears twice", new Set(ids).size === ids.length, true);
    for (const p of pages) await p.ctx.close();

    console.log("\nAPP · the erase button is off in this build");
    pg = await openApp(b, rt);
    check("hidden and disabled", await pg.evaluate(() => document.getElementById("wipeBox").hidden + " " + document.getElementById("btnWipe").disabled), "true true");
    check("no page errors anywhere", pg.errs.join(" | "), "");
    await pg.ctx.close();
  } finally {
    await b.close();
    srv.close(); asrv.close();
  }
}


/* ================================================================ GAME APPS (v45 / v25)
   The Offense Chart and the Pitch Chart through the same receiver. Jim's level
   rule (Oct 15) is proved first: picked every game, no default, cleared when the
   game is filed, charting locked until it is picked. Then the upload: the level
   reaches the Sheet, practice games never leave, games filed before the upload
   existed are never sent, and no signal means it waits. */
const seedArchive = (key, games) => ({ [key]: JSON.stringify(games) });

async function part3() {
  console.log("\nOFFENSE CHART v45 · the level");
  const rt = freshRuntime(), book = rt.book("SEASON1");
  const { srv, st } = await serve(rt);
  const asrv = await serveApp();
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  const AK = "titans-offense-archive-v1";
  /* one game filed by v44: no rid, no level - a test game on Jim's iPad */
  const legacy = { v: 1, date: "10-01", opp: "Old Test", who: "", home: "H", lineup: [], pitchers: [{ name: "X", hand: "R" }],
                   pas: [{ spot: 0, p: 0, pitches: [{ t: "FB", r: 2, c: 2, m: "X", p: 0, call: "S" }], result: "GO" }],
                   filed: Date.now() - 86400000, sent: false, build: "v44" };
  try {
    const pg = await openApp(b, rt, { path: "/offense/index.html", seed: seedArchive(AK, [legacy]) });
    const tabNow = () => pg.evaluate(() => tab);
    const offArch = () => pg.evaluate(k => JSON.parse(localStorage.getItem(k) || "[]"), AK);
    const recs = () => book.getSheetByName("Records").records().filter(r => r.App === "offense");
    check("a fresh game opens on Setup, not Chart", await tabNow(), "setup");
    check("no level is picked", await pg.evaluate(() => O.level), "");
    await pg.click("#tab-chart");
    check("the Chart tab refuses with no level", await tabNow(), "setup");
    check("  and says why, in amber", await pg.evaluate(() => { const n = document.getElementById("lvlNote"); return n.classList.contains("needed") && /locked/.test(n.textContent); }), true);
    check("logging a pitch is refused at the source too", await pg.evaluate(() => { logPitch(2, 2); return countPitches(); }), 0);
    await pg.click('[data-lvl="JV"]');
    check("picking JV unlocks the Chart tab", await (async () => { await pg.click("#tab-chart"); return tabNow(); })(), "chart");
    await pg.evaluate(() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
      set("fDate", "4-18"); set("fOpp", "Northview"); set("fWho", "Coach V");
    });
    const plot = () => pg.click('#v-chart [data-r="2"][data-c="2"]');
    const res = k => pg.click('#results [data-res="' + k + '"]');
    await plot(); await plot(); await res("1B"); await pg.click("#btnNextPA");
    await plot(); await res("GO"); await pg.click("#btnNextPA");
    await plot(); await plot(); await plot();               /* K, closes itself */
    await pg.click("#btnNextPA");
    /* a mistake can be fixed before filing (Jim) */
    await pg.click("#tab-setup"); await pg.click('[data-lvl="Varsity"]');
    check("the level can be changed before filing", await pg.evaluate(() => O.level), "Varsity");
    await pg.click("#btnArchive"); await pg.click(".askwrap [data-yes]");
    const a1 = await offArch();
    check("the filed game keeps its level", a1[0].level, "Varsity");
    check("after filing, the level is cleared", await pg.evaluate(() => O.level), "");
    check("  and the app is back on Setup", await tabNow(), "setup");
    await pg.click("#tab-chart");
    check("  and charting is locked again", await tabNow(), "setup");

    console.log("\nOFFENSE CHART v45 · the upload");
    check("the filed game uploads", await until(async () => (await offArch())[0].up > 0), true);
    const r = recs();
    check("one offense record, not two", r.length, 1);
    check("Records carries the level as the team", r[0] && r[0].Team, "Varsity");
    check("  and the date and charter", r[0] && (r[0].Date + " / " + r[0].Coach), "4-18 / Coach V");
    const op = book.getSheetByName("Offense_Pitches");
    check("every pitch reached Offense_Pitches", op.rows().length, 6);
    const orow = op.records()[0];
    check("rows carry Level and Opponent", orow.Level + " / " + orow.Opponent, "Varsity / Northview");
    check("RecordID is column A", op.header()[0], "RecordID");
    check("the game filed by v44 was never sent", (await offArch()).find(g => g.opp === "Old Test").up || 0, 0);
    check("nothing was turned away", book.getSheetByName("Log").rows().length, 0);

    /* practice */
    await pg.click('[data-lvl="Freshman"]');
    await pg.click("#fPractice");
    await pg.click("#tab-chart");
    check("the practice bar shows on the Chart tab", await pg.evaluate(() => !document.getElementById("practiceBar").hidden), true);
    const before = st.posts;
    await plot(); await res("FO"); await pg.click("#btnNextPA");
    await pg.click("#tab-setup"); await pg.click("#btnArchive"); await pg.click(".askwrap [data-yes]");
    await pg.waitForTimeout(900);
    check("a practice game is never sent", st.posts - before, 0);
    check("practice switches itself off after filing", await pg.evaluate(() => O.practice + " " + document.getElementById("fPractice").checked), "false false");

    /* no signal, then signal */
    st.down = true;
    await pg.click('[data-lvl="Sophomore"]'); await pg.click("#tab-chart");
    await plot(); await res("LO"); await pg.click("#btnNextPA");
    await pg.click("#tab-setup"); await pg.click("#btnArchive"); await pg.click(".askwrap [data-yes]");
    await pg.waitForTimeout(1200);
    await pg.click("#tab-history");
    const ln = await line(pg);
    check("with no signal it waits, and says so", /upline wait/.test(ln) && /1 game waiting/.test(ln), true);
    const pills = await pg.evaluate(() => [...document.querySelectorAll("#hist .pill")].map(p => p.textContent)
      .filter(t => ["waiting", "practice", "on dashboard", "kept here"].indexOf(t) >= 0));
    check("History pills: waiting, practice, on dashboard, kept here", pills.join(", "), "waiting, practice, on dashboard, kept here");
    st.down = false;
    await pg.evaluate(() => window.dispatchEvent(new Event("online")));
    check("signal back: it goes", await until(async () => recs().length === 2), true);
    check("  as Sophomore", recs()[1] && recs()[1].Team, "Sophomore");
    check("no page errors", pg.errs.join(" | "), "");
    check("no \"Something went wrong\" banner", await pg.evaluate(() => document.getElementById("noJs").hidden), true);
    await pg.ctx.close();
  } finally { await b.close(); srv.close(); asrv.close(); }
}

async function part4() {
  console.log("\nPITCH CHART v25 · the level");
  const rt = freshRuntime(), book = rt.book("SEASON1");
  const { srv, st } = await serve(rt);
  const asrv = await serveApp();
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  const KEY = "dugout-pitch-chart-v2", AK = "dugout-pitch-chart-archive-v1";
  try {
    const legacy = { v: 7, date: "10-01", opp: "Old Test", filed: Date.now() - 86400000, sent: false, build: "v24",
                     pitchers: [{ name: "X" }], innings: [], lineup: [{ num: 1, cur: 0, men: [{ num: 1, abs: [{ pitches: [{ t: "X", r: 2, c: 2, k: "FB", p: 0, inn: 1 }], result: "GO" }] }] }] };
    const pg = await openApp(b, rt, { path: "/game/index.html", seed: seedArchive(AK, [legacy]) });
    const G = () => pg.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), KEY);
    const gArch = () => pg.evaluate(k => JSON.parse(localStorage.getItem(k) || "[]"), AK);
    const onSetup = () => pg.evaluate(() => !document.getElementById("v-setup").hidden);
    const recs = () => book.getSheetByName("Records").records().filter(r => r.App === "game");
    check("a fresh game opens on the Setup screen", await onSetup(), true);
    await pg.click("#btnSetup");
    check("Charting refuses with no level", await onSetup(), true);
    check("  and says why, in amber", await pg.evaluate(() => { const n = document.getElementById("lvlNote"); return n.classList.contains("needed") && /locked/.test(n.textContent); }), true);
    await pg.evaluate(() => document.querySelector("#zone .cell:nth-child(13)").click());
    check("a zone tap is refused at the source too", ((await G()) || { lineup: [] }).lineup.some(sp => sp.men.some(m => m.abs.some(a => a.pitches.length))), false);
    await pg.click('[data-lvl="JV"]');
    await pg.click("#btnSetup");
    check("picking JV unlocks charting", await onSetup(), false);
    await pg.evaluate(() => {
      const s = document.querySelector("#pitchers select[data-pick]");
      s.value = window.TITANS_ROSTER[0].id; s.dispatchEvent(new Event("change", { bubbles: true }));
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
      set("fDate", "4-18"); set("fOpp", "Rock Canyon");
    });
    const zone = () => pg.click("#zone .cell:nth-child(13)");
    const res = k => pg.click('#results button[data-res="' + k + '"]');
    await zone(); await zone(); await res("1B"); await pg.click("#nextBtn");
    await zone(); await res("GO"); await pg.click("#nextBtn");
    await res("IBB"); await pg.click("#nextBtn");
    /* fix the level before filing */
    await pg.click("#btnSetup"); await pg.click('[data-lvl="Varsity"]'); await pg.click("#btnSetup");
    check("the level can be changed before filing", (await G()).level, "Varsity");
    /* v27: the Game summary, from the Game tab: notes for the arm who pitched */
    await pg.click('#tabs button[data-tab="game"]');
    await pg.click("#btnSummary");
    check("v27: the Game summary opens from the Game tab", await pg.evaluate(() => !document.getElementById("v-sum").hidden && document.querySelector(".wrap").style.display === "none"), true);
    check("  one card per arm who entered", await pg.evaluate(() => document.querySelectorAll("#sumArms .panel").length), 1);
    check("  the only inputs are the 2 notes", await pg.evaluate(() => [...document.querySelectorAll("#v-sum input, #v-sum textarea, #v-sum select")].map(e => e.getAttribute("data-k")).join(",")), "note,comments");
    await pg.fill('#sumArms textarea[data-k="note"]', "Attack early. Great 2-strike slider.");
    await pg.fill('#sumArms textarea[data-k="comments"]', "=tired by the 3rd?");
    await pg.click("#sumBack");
    check("  the notes are saved with the game", (await G()).pitchers[0].note, "Attack early. Great 2-strike slider.");
    /* file: the open inning is asked about first */
    await pg.click('#tabs button[data-tab="game"]');
    await pg.click("#btnFinish");
    if (await pg.$("#innNoRuns")) { await pg.click("#innNoRuns"); await pg.waitForTimeout(200); if (await pg.$("#innOk")) await pg.click("#innOk"); }
    await pg.waitForTimeout(200);
    if (await pg.$(".askwrap [data-yes]")) await pg.click(".askwrap [data-yes]");
    await pg.waitForTimeout(300);
    const a1 = await gArch();
    const mine = a1.find(g => g.opp === "Rock Canyon");
    check("the game was filed with its level", mine && mine.level, "Varsity");
    check("after filing, the level is cleared", (await G()).level, "");
    check("  and the Setup screen is up again", await onSetup(), true);

    console.log("\nPITCH CHART v25 · the upload");
    check("the filed game uploads", await until(async () => ((await gArch()).find(g => g.opp === "Rock Canyon") || {}).up > 0), true);
    const r = recs();
    check("one game record", r.length, 1);
    check("Records carries the level as the team", r[0] && r[0].Team, "Varsity");
    const gp = book.getSheetByName("Game_Pitches");
    check("pitch log: 3 pitches plus the no-pitch IBB row", gp.rows().length, 4);
    check("columns: RecordID, then Level, Date, Opponent", gp.header().slice(0, 4).join(","), "RecordID,Level,Date,Opponent");
    const g0 = gp.records()[0];
    check("rows carry the level and opponent", g0.Level + " / " + g0.Opponent, "Varsity / Rock Canyon");
    const gi = book.getSheetByName("Game_Innings");
    check("the inning log went too", gi.rows().length >= 1, true);
    check("  with Runs entered as 0, not blank", gi.records()[0].Runs, 0);
    const gn = book.getSheetByName("Game_Notes");
    check("v27: one notes row for the arm who pitched", gn ? gn.rows().length : "no tab", 1);
    const n0 = gn ? gn.records()[0] : {};
    check("  stamped with level and opponent", n0.Level + " / " + n0.Opponent, "Varsity / Rock Canyon");
    check("  To the pitcher and Coach only in their own columns", n0.ToPitcher + " | " + n0.CoachOnly, "Attack early. Great 2-strike slider. | =tired by the 3rd?");
    check("  the next game starts with no notes", (await G()).pitchers[0].note || "", "");
    /* a note changed the morning after, from History */
    await pg.evaluate(() => { const row = [...document.querySelectorAll("#histList .hrow")].find(r => /Rock Canyon/.test(r.textContent)); [...row.querySelectorAll("button")].find(b => b.textContent === "Summary").click(); });
    check("the summary opens from History", await pg.evaluate(() => !document.getElementById("v-sum").hidden), true);
    check("  and says the game is on the dashboard", await pg.evaluate(() => document.getElementById("sumPill").textContent), "on dashboard");
    await pg.fill('#sumArms textarea[data-k="note"]', "Attack early. The slider was the out pitch.");
    check("  an edit marks the notes waiting", await pg.evaluate(() => document.getElementById("sumPill").textContent), "notes waiting");
    const gpb = st.posts;
    await pg.click("#sumBack");
    check("  closing sends just the notes", await until(async () => ((await gArch()).find(g => g.opp === "Rock Canyon") || {}).notesDirty === false), true);
    check("  in one request", st.posts - gpb, 1);
    check("  the note row was replaced, not doubled", gn.rows().length, 1);
    check("  with the new note", gn.records()[0].ToPitcher, "Attack early. The slider was the out pitch.");
    check("  the pitch rows were not touched", gp.rows().length, 4);
    check("  still one game record", recs().length, 1);
    check("  with no level picked, closing lands on Setup", await onSetup(), true);
    check("the game filed by v24 was never sent", (await gArch()).find(g => g.opp === "Old Test").up || 0, 0);
    check("nothing was turned away", book.getSheetByName("Log").rows().length, 0);

    /* practice */
    await pg.click('[data-lvl="Freshman"]');
    await pg.click("#fPractice");
    await pg.click("#btnSetup");
    check("the practice bar shows while charting", await pg.evaluate(() => !document.getElementById("practiceBar").hidden), true);
    const before = st.posts;
    await zone(); await res("FO"); await pg.click("#nextBtn");
    await pg.click('#tabs button[data-tab="game"]');
    await pg.click("#btnFinish");
    if (await pg.$("#innNoRuns")) { await pg.click("#innNoRuns"); await pg.waitForTimeout(200); if (await pg.$("#innOk")) await pg.click("#innOk"); }
    await pg.waitForTimeout(200);
    if (await pg.$(".askwrap [data-yes]")) await pg.click(".askwrap [data-yes]");
    await pg.waitForTimeout(900);
    check("a practice game is never sent", st.posts - before, 0);
    check("practice switches itself off after filing", (await G()).practice, false);
    await pg.evaluate(() => { const t = document.querySelector('#tabs button[data-tab="hist"]'); if (t) t.click(); });
    const pills = await pg.evaluate(() => [...document.querySelectorAll("#histList .pill")].map(p => p.textContent));
    check("History pills: practice, on dashboard, kept here", pills.join(", "), "practice, on dashboard, kept here");
    check("the status line is green", /upline ok/.test(await line(pg)), true);
    check("no page errors", pg.errs.join(" | "), "");
    await pg.ctx.close();
  } finally { await b.close(); srv.close(); asrv.close(); }
}

(async () => {
  /* ONLY=3 or ONLY=4 runs one game-app section (used when mutation-testing). */
  const only = process.env.ONLY;
  if (!only) {
  try { part1(); } catch (e) { console.log("  x  part 1 threw: " + e.stack); fails++; }
  try { await part2(); } catch (e) { console.log("  x  part 2 threw: " + e.stack); fails++; }
  }
  if (!only || only === "3") try { await part3(); } catch (e) { console.log("  x  offense threw: " + e.stack); fails++; }
  if (!only || only === "4") try { await part4(); } catch (e) { console.log("  x  pitch chart threw: " + e.stack); fails++; }
  console.log("\n" + checks + " upload checks");
  console.log(fails ? "FAILURES: " + fails : "ALL UPLOAD CHECKS PASS");
  process.exit(fails ? 1 : 0);
})();
