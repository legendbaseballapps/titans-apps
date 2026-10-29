/* Builds a stand-in season Sheet the player-card tests read (Oct 28, 2026).

     cd titans-apps && node tools/cards/fixture.js   ->  tools/cards/fixture-sheet.json

   The demo game and pens (tools/demo-data.json) are loaded into the REAL apps,
   switched off practice, given coach notes, and filed. Each app uploads them to the
   REAL receiver code (receiver/Code.gs) running on the stand-in Apps Script
   runtime, exactly the path an iPad takes. The Sheet that results is saved, so the
   card tests read the same columns, text and numbers the live Sheet will hold.

   Two pens are filed for the same 3 pitchers a week apart (the older one with
   some misses moved), so the pen card has a "last pen" to compare against. */
"use strict";
const http = require("http");
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { makeRuntime } = require("../receiver/mock-gas");

const ROOT = path.join(__dirname, "..", "..");
const APORT = 8898, RPORT = 8899;
const APP = "http://localhost:" + APORT;
const RURL = "http://localhost:" + RPORT + "/macros/s/TEST/exec";
const D = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "demo-data.json"), "utf8")).keys;

const rt = makeRuntime(path.join(ROOT, "receiver", "Code.gs"));
rt.newBook("SEASON1"); rt.props.SEASON_SHEET_ID = "SEASON1"; rt.key = rt.sandbox.setup();

function serveReceiver() {
  const tokens = {}; let n = 0;
  const srv = http.createServer((req, res) => {
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (req.url.indexOf("/echo") === 0) {
      const t = new URL(req.url, "http://x").searchParams.get("t");
      res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, cors)); res.end(tokens[t] || "{}"); return;
    }
    if (req.method === "POST") {
      let body = ""; req.on("data", c => { body += c; });
      req.on("end", () => {
        const out = rt.sandbox.doPost({ postData: { contents: body } }).getContent();
        const t = "t" + (++n); tokens[t] = out;
        res.writeHead(302, Object.assign({ Location: "http://localhost:" + RPORT + "/echo?t=" + t }, cors)); res.end();
      });
      return;
    }
    res.writeHead(404, cors); res.end();
  });
  return new Promise(r => srv.listen(RPORT, () => r(srv)));
}
function serveApp() {
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, APP);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)));
    if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(file);
    if (/^\/(bullpen|offense|game)\/index\.html$/.test(u.pathname)) {
      let t = body.toString("utf8")
        .replace(/var UPLOAD_URL = "[^"]*";/, () => "var UPLOAD_URL = " + JSON.stringify(RURL) + ";")
        .replace(/var UPLOAD_KEY = "[^"]*";/, () => "var UPLOAD_KEY = " + JSON.stringify(rt.key) + ";");
      if (t.indexOf("script.google.com/macros") >= 0) { res.writeHead(500); res.end("real receiver URL still in page"); return; }
      body = t;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  });
  return new Promise(r => srv.listen(APORT, () => r(srv)));
}
async function until(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { if (await fn()) return true; await new Promise(r => setTimeout(r, 200)); } return false; }

async function fileApp(b, appPath, seed, archKey) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem("seeded")) { for (const k in s) localStorage.setItem(k, s[k]); sessionStorage.setItem("seeded", "1"); } }, seed);
  const pg = await ctx.newPage();
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(APP + appPath, { waitUntil: "load" }); await pg.waitForTimeout(900);
  await pg.click("#hdrFinish"); await pg.waitForTimeout(200);
  if (await pg.$("#innOk")) { await pg.click("#innNoRuns"); await pg.waitForTimeout(200); }
  await pg.click(".askwrap [data-yes]");
  const ok = await until(async () => (await pg.evaluate(k => JSON.parse(localStorage.getItem(k) || "[]"), archKey)).every(g => g.up > 0));
  if (!ok || errs.length) throw new Error(appPath + " did not upload: " + errs.join(" | "));
  await ctx.close();
}

(async () => {
  const rs = await serveReceiver(), as = await serveApp();
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  try {
    /* ---- Pitch Chart: the demo game, real, with notes for 2 arms */
    const G = JSON.parse(D["dugout-pitch-chart-v2"]);
    G.practice = false; G.date = "2027-04-06"; G.who = "Coach V";
    G.pitchers[0].note = "Fastball command was there all day. The first pitch is the next step.";
    G.pitchers[0].comments = "=Talk about tempo with runners on";
    G.pitchers[1].note = "Good job getting out of the 5th after the error.";
    await fileApp(b, "/game/index.html", { "dugout-pitch-chart-v2": JSON.stringify(G), "dugout-pitch-chart-archive-v1": "[]" }, "dugout-pitch-chart-archive-v1");

    /* ---- Offense Chart: the demo game, real, notes for 2 hitters */
    const O = JSON.parse(D["titans-offense-v1"]);
    O.practice = false; O.date = "2027-04-06"; O.who = "Coach V";
    O.hnotes = { fro8j13: { note: "Both doubles came on pitches you could drive. Same plan next game.", comments: "" },
                 zvn2wpb: { note: "Great takes in the first.", comments: "Talk about the 2-strike approach" } };
    await fileApp(b, "/offense/index.html", { "titans-offense-v1": JSON.stringify(O), "titans-offense-lineup-v1": D["titans-offense-lineup-v1"], "titans-offense-archive-v1": "[]" }, "titans-offense-archive-v1");

    /* ---- Bullpen: last week's pen (filed, waiting to upload) and today's */
    const S = JSON.parse(D["titans-bullpen-v1"]);
    S.practice = false; S.date = "2027-01-19"; S.coach = "Coach V";
    S.pitchers[0].note = "The change-up was on the spot 4 of 13. Finish it out front.";
    const old = JSON.parse(JSON.stringify(S));
    old.sid = "oldpen1"; old.date = "2027-01-12"; old.filed = Date.parse("2027-01-12T23:00:00Z"); old.sent = false; old.build = "v44";
    old.pitchers.forEach(p => { p.note = ""; p.comments = ""; p.pitches.forEach((q, i) => { if (i % 4 === 1) { q.c = Math.min(4, q.c + 1); } }); });
    await fileApp(b, "/bullpen/index.html", { "titans-bullpen-v1": JSON.stringify(S), "titans-bullpen-archive-v1": JSON.stringify([old]) }, "titans-bullpen-archive-v1");

    /* ---- Bullpen: a Live ABs mound a week later, Smith only, 6 at-bats */
    const L = JSON.parse(JSON.stringify(S));
    L.sid = "livepen1"; L.date = "2027-01-26"; L.mound = L.pad; delete L.filed; delete L.sent;
    const RES = ["K", "GO", "BB", "1B", "FO", "Kc"], LEN = [5, 3, 6, 2, 4, 4];
    L.pitchers.forEach((p, i) => {
      p.note = ""; p.comments = "";
      if (i !== 0) { p.pitches = []; p.abs = []; return; }
      p.mode = "live"; p.note = "Good tempo all day. Put hitters away once you get to 2 strikes.";
      const ps = p.pitches.slice(0, 24); let k = 0;
      p.abs = RES.map(r => ({ result: r }));
      LEN.forEach((n, ai) => { for (let j = 0; j < n; j++) { ps[k].ab = ai; ps[k].free = true; k++; } });
      p.pitches = ps;
    });
    await fileApp(b, "/bullpen/index.html", { "titans-bullpen-v1": JSON.stringify(L), "titans-bullpen-archive-v1": "[]" }, "titans-bullpen-archive-v1");

    const book = rt.book("SEASON1"), out = {};
    book.order.forEach(n => { out[n] = book.sheets[n].data; });
    fs.writeFileSync(path.join(__dirname, "fixture-sheet.json"), JSON.stringify(out));
    console.log("fixture-sheet.json: " + book.order.map(n => n + " " + Math.max(0, book.sheets[n].data.length - 1)).join(", "));
  } finally { await b.close(); rs.close(); as.close(); }
})().catch(e => { console.error(e); process.exit(1); });
