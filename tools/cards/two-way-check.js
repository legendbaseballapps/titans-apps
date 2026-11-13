/* A two-way game in a real browser (Nov 13, 2026, E-019): Smith pitched and hit in the
   same game, so he gets 1 email with both cards and 1 page with 2 reflection forms.
   Taps each form the way a kid would on a phone and checks they save separately.

     cd titans-apps && node tools/cards/two-way-check.js [shots-folder]

   google.script.run is stood in for by a tiny shim that posts to this test server,
   which calls saveReflection on the stand-in runtime. Nothing leaves this machine. */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright");
const { makeRuntime } = require("../receiver/mock-gas");
const ROOT = path.join(__dirname, "..", "..");
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixture-sheet.json"), "utf8"));
const ROSTER = fs.readFileSync(path.join(ROOT, "bullpen", "roster.js"), "utf8");
const SHOTS = process.argv[2] || "";
const PORT = 8898, BASE = "http://localhost:" + PORT;

const rt = makeRuntime(path.join(ROOT, "cards", "Code.gs"), { fetch: { "https://legendbaseballapps.github.io/titans-apps/bullpen/roster.js": ROSTER } });
const b = rt.newBook("S");
Object.keys(FIX).forEach(n => { b.insertSheet(n).data = JSON.parse(JSON.stringify(FIX[n])); });
Object.assign(rt.props, { SEASON_SHEET_ID: "S" });
rt.sandbox.setup(); rt.sandbox.addRosterPlayers();
Object.assign(rt.props, { CARDS_FROM: "2026-01-01T00:00:00Z", SEND_MODE: "test", TEST_TO: "t@example.com", PAGE_URL: BASE + "/exec",
  LOGO_URL: BASE + "/logo.png", ADMIN_EMAIL: "admin@example.com" });
const P = b.getSheetByName("Players"), h = P.header();
[["ad6bxsq", "smith@example.com"], ["fro8j13", "hazen@example.com"]].forEach(([id, em]) => {
  P.data.find(r => r[0] === id)[h.indexOf("Player email")] = em; });
/* Herbert's at-bats become Smith's: Smith pitched and hit at Ridgeview. */
{ const OP = b.getSheetByName("Offense_Pitches"), oh = OP.header(), at = k => oh.indexOf(k);
  OP.data.forEach((r, i) => { if (i && r[at("HitterID")] === "nlc1j7w") {
    r[at("HitterID")] = "ad6bxsq"; r[at("Hitter")] = "Smith"; r[at("HitterLast")] = "Smith"; r[at("HitterFirst")] = "Colten"; } }); }
rt.sandbox.runMorning();
const tok = id => b.getSheetByName("Player_Links").records().find(r => r.PlayerID === id).Token;
const recs = b.getSheetByName("Records").records();
const rid = app => recs.find(r => r.App === app).RecordID;
const SHIM = `<script>window.google={script:{run:(function(){function R(){this.s=null;this.f=null;}
R.prototype.withSuccessHandler=function(f){var r=new R();r.s=f;r.f=this.f;return r;};
R.prototype.withFailureHandler=function(f){var r=new R();r.s=this.s;r.f=f;return r;};
R.prototype.saveReflection=function(o){var s=this.s,f=this.f;fetch('/run',{method:'POST',body:JSON.stringify(o)}).then(function(x){return x.json();}).then(function(v){s&&s(v);},function(e){f&&f(e);});};
return new R();})()}};</script>`;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, BASE);
  if (u.pathname === "/logo.png") { res.writeHead(200, { "Content-Type": "image/png" }); res.end(fs.readFileSync(path.join(ROOT, "cards", "lt-logo.png"))); return; }
  if (u.pathname === "/run") { let body = ""; req.on("data", c => body += c); req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(rt.sandbox.saveReflection(JSON.parse(body)))); }); return; }
  if (u.pathname === "/exec") {
    const q = Object.fromEntries(u.searchParams);
    const html = rt.sandbox.doGet({ parameter: q }).getContent().replace("<head>", "<head>" + SHIM);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); return;
  }
  if (u.pathname.indexOf("/mail/") === 0) {
    const m = rt.mail[Number(u.pathname.slice(6))];
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(m ? m.htmlBody : "none"); return;
  }
  res.writeHead(404); res.end();
});

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL " + m); } }

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
  try {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    async function shot(name) { if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true }); }

    const mi = rt.mail.findIndex(m => /smith.*Your game cards/.test(m.subject));
    ok(mi >= 0, "Smith's pair email went out");
    await pg.goto(BASE + "/mail/" + mi); await shot("two-way-email");
    ok(await pg.evaluate(() => document.documentElement.scrollWidth) <= 390, "pair email fits a phone");

    await pg.goto(BASE + "/exec?t=" + tok("ad6bxsq") + "&r=" + rid("game") + "&k=pitch"); await shot("two-way-page");
    ok(await pg.evaluate(() => document.documentElement.scrollWidth) <= 390, "pair page fits a phone");
    ok((await pg.$$("form")).length === 2, "2 forms on the page");
    /* the hitting form first: a rough day at the plate */
    const fill = async (n, vals) => {
      await pg.click(`#f${n} .scale[data-name="arm"] button[data-v="${vals.arm}"]`);
      await pg.click(`#f${n} .scale[data-name="feel"] button[data-v="${vals.feel}"]`);
      await pg.click(`#f${n} .scale[data-name="pre"] button[data-v="${vals.pre}"]`);
      await pg.click(`#f${n} .scale[data-name="reset"] button[data-v="${vals.reset}"]`);
      await pg.fill(`#f${n} input[name=start]`, vals.start); await pg.fill(`#f${n} input[name=stop]`, "Chasing the high fastball");
      await pg.fill(`#f${n} input[name=cont]`, "Competing every pitch");
    };
    await fill(2, { arm: 4, feel: 2, pre: "Some", reset: "No", start: "Stay through the middle" });
    ok(await pg.evaluate(() => !document.querySelector('#f1 .scale button.on')), "tapping the hitting form leaves the pitching form untouched");
    await pg.click("#go2");
    await pg.waitForFunction(() => /Thanks/.test(document.getElementById("f2").textContent));
    ok(!!(await pg.$("#go1")), "pitching form still open after the hitting one is sent");
    await fill(1, { arm: 5, feel: 5, pre: "Every pitch", reset: "Every time", start: "Same plan next start" });
    await pg.click("#go1");
    await pg.waitForFunction(() => /Thanks/.test(document.getElementById("f1").textContent));
    await shot("two-way-page-sent");
    const R = b.getSheetByName("Reflections").records();
    ok(R.length === 2, "2 reflections saved");
    const hit = R.find(r => r.Kind === "hit"), pit = R.find(r => r.Kind === "pitch");
    ok(hit && hit.Feel === 2 && hit.PrePitch === "Some" && hit.Start === "Stay through the middle", "hitting reflection saved with its own answers");
    ok(pit && pit.Feel === 5 && pit.PrePitch === "Every pitch" && pit.Start === "Same plan next start", "pitching reflection saved with its own answers");
    await pg.goto(BASE + "/exec?t=" + tok("ad6bxsq") + "&r=" + rid("offense") + "&k=hit");
    ok((await pg.textContent("body")).match(/Your coaches have it/g).length === 2, "the page shows both saved reflections");
    ok(!errs.length, "no page errors: " + errs.join(" | "));
  } finally { await br.close(); srv.close(); }
  console.log(pass + " page checks" + (fail ? ", " + fail + " FAILED" : ""));
  if (fail) process.exit(1);
  console.log("ALL PAGE CHECKS PASS");
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
