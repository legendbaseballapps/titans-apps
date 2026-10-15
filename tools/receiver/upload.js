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
        "Records,Bullpen_Pitches,Game_Pitches,Game_Innings,Offense_Pitches,Log,Coaches,Config");
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
    if (u.pathname === "/bullpen/index.html") {
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
  await pg.goto(APP + "/bullpen/index.html?" + q, { waitUntil: "load" });
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
    document.getElementById("tab-setup").click();
    document.getElementById("btnFinish").click();
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
    check("no cell became a formula or a date", book.flags.formula + book.flags.date, 0);
    const rec = book.getSheetByName("Records").records()[0];
    check("Records names the app, build and mound", rec.App + " " + rec.Build + " " + rec.Mound, "bullpen v32 Mound 2");
    await pg.evaluate(() => document.getElementById("tab-hist").click());
    check("History pill says it is on the dashboard", await pg.evaluate(() => document.querySelector(".hrow .pill").textContent), "on dashboard");
    check("the status line says all done", (await line(pg)).split(" | ")[1], "Every filed session is on the dashboard.");
    check("no page errors", pg.errs.join(" | "), "");

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

(async () => {
  try { part1(); } catch (e) { console.log("  x  part 1 threw: " + e.stack); fails++; }
  try { await part2(); } catch (e) { console.log("  x  part 2 threw: " + e.stack); fails++; }
  console.log("\n" + checks + " upload checks");
  console.log(fails ? "FAILURES: " + fails : "ALL UPLOAD CHECKS PASS");
  process.exit(fails ? 1 : 0);
})();
