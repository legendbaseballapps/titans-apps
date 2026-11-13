/* The released opponent list (E-012, Nov 13, 2026): Pitch Chart v37, Offense Chart v55.

       cd titans-apps && python3 -m http.server 8807 &
       node tools/opponents.js

   The file: the same in both folders, ids unique and permanent-looking, in the
   service worker's file list and on its network-first path. The header: a picker
   in place of the text box, Other team for a typed name, a schedule spelling
   (PONDO) picked for the coach, one control at a time, the pick surviving a
   refresh, and the old text box when opponents.js is missing. Nov 13: the picker
   lives on Setup ("Everything that defines a game - other than the date picker -
   should be done in Setup"); the header shows the team and opens Setup. Matching: the Pull buttons put games against today's team first, on
   the id, so "Rock Canyon HS" typed last spring is Rock Canyon. The export and
   upload carry OpponentID (the upload suite checks the Sheet end to end). */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..");
const BASE = process.env.BASE || "http://localhost:8807";
let fails = 0, checks = 0;
function is(name, got, want) {
  checks++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(62) + JSON.stringify(got) + (ok ? "" : "  (expected " + JSON.stringify(want) + ")"));
}

/* ------------------------------------------------------------------ the file */
console.log("THE FILE");
const files = ["game", "offense"].map(a => fs.readFileSync(path.join(ROOT, a, "opponents.js"), "utf8"));
is("game/ and offense/ have the same opponents.js", files[0] === files[1], true);
const box = {window: {}};
vm.runInNewContext(files[0], box);
const L = box.window.TITANS_OPPONENTS;
is("19 teams from the 2027 schedules", L.length, 19);
is("ids are unique", new Set(L.map(o => o.id)).size, L.length);
is("ids are lowercase with dashes", L.every(o => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.id)), true);
is("every team has a name", L.every(o => typeof o.name === "string" && o.name.trim().length > 0), true);
is("every short name fits the header box (14 letters)", L.filter(o => (o.short || o.name).length > 15).map(o => o.short || o.name), []);
const akas = [].concat(...L.map(o => [o.name, o.short].concat(o.aka || []).map(x => String(x).toLowerCase().replace(/[^a-z0-9]/g, ""))));
const owners = {};
L.forEach(o => [o.name, o.short].concat(o.aka || []).forEach(x => { const k = String(x).toLowerCase().replace(/[^a-z0-9]/g, ""); (owners[k] = owners[k] || new Set()).add(o.id); }));
is("no spelling points at 2 teams", Object.keys(owners).filter(k => owners[k].size > 1), []);
for (const a of ["game", "offense"]) {
  const sw = fs.readFileSync(path.join(ROOT, a, "sw.js"), "utf8");
  is(a + ": the worker caches opponents.js", /"\.\/opponents\.js"/.test(sw), true);
  const m = sw.match(/function isRoster\(url\)\{\s*return (\/.*\/)\.test\(url\);/);
  const re = m ? eval(m[1]) : null;
  is(a + ": and asks the network first, like roster.js", !!re && re.test("https://x/" + a + "/opponents.js") && re.test("https://x/" + a + "/roster.js") && !re.test("https://x/" + a + "/index.html"), true);
  const html = fs.readFileSync(path.join(ROOT, a, "index.html"), "utf8");
  is(a + ": the page loads it after roster.js", html.indexOf('<script src="opponents.js"></script>') > html.indexOf('<script src="roster.js"></script>'), true);
}

/* ------------------------------------------------------------------ in the apps */
const APPS = [
  {name: "PITCH CHART v38", path: "/game/index.html", key: "dugout-pitch-chart-v2", akey: "dugout-pitch-chart-archive-v1", cur: "G"},
  {name: "OFFENSE CHART v56", path: "/offense/index.html", key: "titans-offense-v1", akey: "titans-offense-archive-v1", cur: "O"}
];
async function open(b, app, opts) {
  opts = opts || {};
  const ctx = await b.newContext({viewport: {width: opts.w || 1180, height: 900}, serviceWorkers: "block"});
  if (opts.noList) await ctx.route("**/opponents.js", r => r.fulfill({status: 404, body: "not here"}));
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on("pageerror", e => pg.errs.push(e.message));
  await pg.goto(BASE + app.path);
  if (opts.seed) {
    await pg.evaluate(s => { for (const k in s) localStorage.setItem(k, s[k]); }, opts.seed);
    await pg.reload();
  }
  await pg.waitForTimeout(300);
  pg.ctx = ctx;
  return pg;
}
const state = (pg, app) => pg.evaluate(k => { const g = JSON.parse(localStorage.getItem(k) || "{}"); return {opp: g.opp || "", oppId: g.oppId || ""}; }, app.key);
const view = pg => pg.evaluate(() => { const s = document.getElementById("fOppPick"), i = document.getElementById("fOpp");
  return {pick: !s.hidden, box: !i.hidden, value: s.value, text: s.hidden ? "" : (s.options[s.selectedIndex] || {}).textContent}; });
const choose = (pg, v) => pg.selectOption("#fOppPick", v);

(async () => {
  const b = await chromium.launch();
  for (const app of APPS) {
    console.log("\n" + app.name);
    let pg = await open(b, app);
    is("the header has the picker, not the text box", await view(pg), {pick: true, box: false, value: "", text: "— pick —"});
    is("  19 teams, A to Z, then Other team", await pg.evaluate(() => { const o = [...document.getElementById("fOppPick").options].map(x => x.textContent); return [o.length, o[1], o[19], o[20]]; }), [21, "Castle View", "Valor Christian", "Other team…"]);
    await choose(pg, "rock-canyon");
    is("picking a team files its id and name", await state(pg, app), {opp: "Rock Canyon", oppId: "rock-canyon"});
    await pg.reload(); await pg.waitForTimeout(300);
    is("  and it survives a refresh", [await view(pg), await state(pg, app)], [{pick: true, box: false, value: "rock-canyon", text: "Rock Canyon"}, {opp: "Rock Canyon", oppId: "rock-canyon"}]);
    await choose(pg, "__other");
    is("Other team: the text box opens under the picker, ready to type", [await view(pg), await pg.evaluate(() => document.activeElement && document.activeElement.id)], [{pick: true, box: true, value: "__other", text: "Other team\u2026"}, "fOpp"]);
    is("  the old pick is gone", await state(pg, app), {opp: "", oppId: ""});
    await pg.fill("#fOpp", "Bishop Gorman");
    await pg.evaluate(() => document.getElementById("fOpp").blur());
    is("a team not on the list is typed, with no id", await state(pg, app), {opp: "Bishop Gorman", oppId: ""});
    is("  and stays a text box", (await view(pg)).box, true);
    is("  the app knows it is off the list", await pg.evaluate(c => oppOffList(window[c] || eval(c)), app.cur).catch(() => "n/a"), app.cur === "O" ? true : "n/a");
    /* Jim, Nov 13: "v55 doesn't show the opponent as a dropdown". A game typed before the list
       came back with the text box only. The picker must always be there. */
    await pg.reload(); await pg.waitForTimeout(300);
    is("a game typed before the list opens with the dropdown on Other team, the name under it", [await view(pg), await pg.inputValue("#fOpp")], [{pick: true, box: true, value: "__other", text: "Other team\u2026"}, "Bishop Gorman"]);
    await choose(pg, "legacy");
    is("  picking a list team from there closes the box", [await view(pg), await state(pg, app)], [{pick: true, box: false, value: "legacy", text: "Legacy"}, {opp: "Legacy", oppId: "legacy"}]);
    await choose(pg, "__other");
    await pg.fill("#fOpp", "Bishop Gorman");
    await pg.evaluate(() => document.getElementById("fOpp").blur());
    await pg.fill("#fOpp", "");
    await pg.evaluate(() => document.getElementById("fOpp").blur());
    is("emptying the box closes it", await view(pg), {pick: true, box: false, value: "", text: "— pick —"});
    await choose(pg, "__other");
    await pg.fill("#fOpp", "pondo");
    await pg.evaluate(() => document.getElementById("fOpp").blur());
    is("a schedule spelling (pondo) picks the team", [await state(pg, app), await view(pg)], [{opp: "Ponderosa", oppId: "ponderosa"}, {pick: true, box: false, value: "ponderosa", text: "Ponderosa"}]);
    is("no page errors", pg.errs, []);
    await pg.ctx.close();

    /* Nov 13: everything that defines a game is on Setup; the header only shows the opponent */
    pg = await open(b, app, {w: 1080});
    const hdr = () => pg.evaluate(() => { const h = document.getElementById("hdrOpp"), t = document.getElementById("hdrOppTx");
      return {inHeader: !!h.closest(".top"), text: t.textContent, unset: t.classList.contains("unset"), control: !document.querySelector(".top select, .top #fOpp")}; });
    is("the header shows Set on Setup, and has no opponent control", await hdr(), {inHeader: true, text: "Set on Setup", unset: true, control: true});
    is("the picker is on the Setup tab, in This game", await pg.evaluate(() => !!document.getElementById("fOppPick").closest("#v-setup") && /This game/.test(document.getElementById("fOppPick").closest(".panel").textContent)), true);
    is("  with full names", await pg.evaluate(() => [...document.getElementById("fOppPick").options].some(o => o.textContent === "Highlands Ranch")), true);
    await choose(pg, "highlands-ranch");
    is("picked: the header shows the short name", (await hdr()).text, "Highlands Rch");
    is("  and says the full one on hover", await pg.evaluate(() => document.getElementById("hdrOpp").title), "Opponent: Highlands Ranch. Change it on the Setup tab");
    await pg.click("#tab-chart").catch(() => {});
    await pg.click("#hdrOpp");
    is("tapping it opens Setup", await pg.evaluate(() => !document.getElementById("v-setup").hidden && document.getElementById("v-setup").style.display !== "none"), true);
    is("1080 wide: the header is one row and nothing scrolls sideways", await pg.evaluate(() => {
      const s = document.getElementById("hdrOpp").getBoundingClientRect(), t = document.querySelector(".top .tabs").getBoundingClientRect();
      return Math.abs(s.top - t.top) < 30 && document.documentElement.scrollWidth <= innerWidth; }), true);
    await choose(pg, "__other");
    await pg.fill("#fOpp", "Bishop Gorman");
    is("a typed team shows in the header as typed", (await hdr()).text, "Bishop Gorman");
    is("no page errors", pg.errs, []);
    await pg.ctx.close();

    /* no opponents.js: the old text box, nothing else changes */
    pg = await open(b, app, {noList: true});
    is("no opponents.js: the plain text box, as before", await view(pg), {pick: false, box: true, value: "", text: ""});
    await pg.fill("#fOpp", "Rock Canyon");
    is("  typing works, with no id", await state(pg, app), {opp: "Rock Canyon", oppId: ""});
    is("  no page errors", pg.errs, []);
    await pg.ctx.close();
  }

  /* ------------------------------------------------------------------ the Pull buttons */
  console.log("\nPITCH CHART · Pull a lineup puts today's team first");
  {
    const lineup = n => [{men: [{name: n, jersey: "1"}]}];
    const filed = [
      {opp: "Rock Canyon HS", date: "2026-04-02", level: "Varsity", lineup: lineup("Canyon Kid"), spots: 1, filed: 1},
      {opp: "Legacy", oppId: "legacy", date: "2027-04-10", level: "Varsity", lineup: lineup("Legacy Guy"), spots: 1, filed: 3},
      {opp: "Valor", date: "2027-04-12", level: "Varsity", lineup: lineup("Valor Kid"), spots: 1, filed: 4}
    ];
    const pg = await open(b, APPS[0], {seed: {[APPS[0].akey]: JSON.stringify(filed)}});
    await pg.click("#tab-setup");
    const pulls = () => pg.evaluate(() => [...document.querySelectorAll("#suPull button")].map(x => x.textContent.split(" · ")[0]));
    is("latest filed first with no opponent picked", await pulls(), ["Valor", "Legacy", "Rock Canyon HS"]);
    await choose(pg, "rock-canyon");
    await pg.click("#tab-setup");
    is("Rock Canyon picked: last spring's typed \"Rock Canyon HS\" comes first", (await pulls())[0], "Rock Canyon HS");
    await choose(pg, "valor-christian");
    await pg.click("#tab-setup");
    is("Valor Christian picked: the game typed \"Valor\" comes first", (await pulls())[0], "Valor");
    is("no page errors", pg.errs, []);
    await pg.ctx.close();
  }

  console.log("\nOFFENSE CHART · Pull a pitcher puts today's team's pitchers first");
  {
    const pit = (name, n) => ({name, hand: "R", notes: "", tags: {}});
    const pas = n => Array.from({length: n}, (_, i) => ({spot: 0, p: 0, pitches: [{t: "FB", r: 2, c: 2, m: "T", call: "S"}], result: "K"}));
    const filed = [
      {opp: "Legacy", oppId: "legacy", date: "2027-04-10", level: "Varsity", rid: "a1", filed: 3, pitchers: [pit("Busy Arm")], pas: pas(6), lineup: []},
      {opp: "Rock Canyon High School", date: "2026-04-02", level: "Varsity", rid: "a2", filed: 1, pitchers: [pit("Canyon Ace")], pas: pas(2), lineup: []}
    ];
    const pg = await open(b, APPS[1], {seed: {[APPS[1].akey]: JSON.stringify(filed)}});
    await choose(pg, "rock-canyon");
    const order = await pg.evaluate(() => { pickPitcher(0); const o = [...document.querySelectorAll(".ppick b")].map(x => x.textContent);
      const c = document.querySelector(".askwrap [data-no]"); if (c) c.click(); return o; });
    is("Rock Canyon picked: their pitcher first, though he threw fewer pitches", order, ["Canyon Ace", "Busy Arm"]);
    const exp = await pg.evaluate(() => { const t = tableOf(Object.assign({}, O, {pas: O.pas})); return t.head.slice(-1)[0]; });
    is("the CSV's last column is OpponentID", exp, "OpponentID");
    const old = await pg.evaluate(() => { const g = arch().find(x => x.rid === "a2"); const t = tableOf(g), n = notesTableOf ? 1 : 0;
      return [t.rows[0][t.head.length - 1], upPayload(g).tables.notes.columns.slice(-1)[0]]; });
    is("a game typed \"Rock Canyon High School\" before the list exports rock-canyon", old, ["rock-canyon", "OpponentID"]);
    is("no page errors", pg.errs, []);
    await pg.ctx.close();
  }
  console.log("\nBULLPEN CHART v46 · the mound is named on Setup too");
  {
    const pg = await open(b, {path: "/bullpen/index.html"});
    const hdr = () => pg.evaluate(() => ({text: document.getElementById("hdrPadTx").textContent, input: !!document.querySelector(".top input:not([type=date])")}));
    is("the header has only the date to type in", (await hdr()).input, false);
    is("  and shows the mound (a new iPad starts on Mound 1)", (await hdr()).text, "Mound 1");
    is("Mound is in This session, beside Who's charting", await pg.evaluate(() => /This session/.test(document.getElementById("s-pad").closest(".panel").textContent) && !!document.getElementById("s-coach").closest(".sessrow").contains(document.getElementById("s-pad"))), true);
    await pg.fill("#s-pad", "Mound 3");
    is("typing it updates the header as you go", (await hdr()).text, "Mound 3");
    await pg.reload(); await pg.waitForTimeout(300);
    is("  and it is still there after a refresh", [(await hdr()).text, await pg.inputValue("#s-pad")], ["Mound 3", "Mound 3"]);
    await pg.click("#tab-hist");
    await pg.click("#hdrPad");
    is("tapping it opens Setup", await pg.evaluate(() => !document.getElementById("v-setup").hidden), true);
    is("no page errors", pg.errs, []);
    await pg.ctx.close();
  }
  await b.close();
  console.log("\n" + checks + " opponent checks");
  console.log(fails ? "FAILURES: " + fails : "ALL OPPONENT CHECKS PASS");
  process.exit(fails ? 1 : 0);
})();
