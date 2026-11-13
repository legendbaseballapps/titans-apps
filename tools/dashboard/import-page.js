/* The import page in a real browser (dashboard 1.4): the "Add to" and "Change" choices.
     cd titans-apps && node tools/dashboard/import-page.js
   Serves the page from the stand-in Apps Script runtime, answers google.script.run from the
   same runtime, picks with the mouse, and checks what was saved. Made-up players only. */
"use strict";
const path = require("path");
const { chromium } = require("playwright");
const { makeRuntime } = require("../receiver/mock-gas");
const CODE = process.env.DASH_CODE || path.join(__dirname, "..", "..", "dashboard", "Code.gs");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

function grid(rows) {   /* a tiny export: Batting / Pitching / Fielding labels over the header */
  const head = ["Number", "Last", "First", "AB", "H", "IP", "BF", "TC", "PO", "A"];
  return [[null, null, null, "Batting", null, "Pitching", null, "Fielding", null, null], head]
    .concat(rows.map(r => [r.n, r.last, r.first, r.ab, r.h, r.ip, r.bf, r.tc, r.po, r.a]));
}
const BOOK = {season: "2026", sheets: [
  {name: "JV", grid: grid([{n: 13, last: "Lythgoe", first: null, ab: 3, h: 1, ip: "4.0", bf: 18, tc: 1, po: 1, a: 0}])},
  {name: "Sophomore", grid: grid([
    {n: 12, last: "Lythgoe", first: "Landon", ab: 20, h: 5, ip: "8.1", bf: 40, tc: 6, po: 2, a: 3},
    {n: 13, last: "Lythgoe", first: null, ab: 4, h: 2, ip: "3.2", bf: 16, tc: 2, po: 1, a: 1}])}
]};
function world(oldLinks) {
  const rt = makeRuntime(CODE), b = rt.newBook("S");
  b.insertSheet("Players").data = [["PlayerID", "Last", "First", "Class"], ["p-lyth", "Lythgoe", "Landon", "Jr"], ["p-other", "Archer", "Nolan", "Sr"]];
  b.insertSheet("Coaches").data = [["Name", "Google account", "Level(s)", "Notify"], ["Jim Vaughn", "jim@example.com", "All", "Both"]];
  if (oldLinks) b.insertSheet("GC_Links").data = [["Last", "First", "PlayerID", "Linked by", "Linked at"], ["Lythgoe", "", "SKIP", "jim@example.com", "2026-11-13"]];
  rt.props.SEASON_SHEET_ID = "S"; rt.session.active = "jim@example.com"; rt.b = b;
  return rt;
}
async function run(page, rt, pickFn) {
  const html = rt.sandbox.doGet({parameter: {p: "import"}}).getContent().replace(/<script src="https:\/\/cdnjs[^>]*><\/script>/, "");
  const calls = [];
  await page.exposeFunction("gsr", (fn, a, b) => { calls.push([fn, a, b]); try { return {ok: rt.sandbox[fn](a, b)}; } catch (e) { return {err: String(e.message)}; } });
  const stub = () => {
    const mk = () => { let s = () => {}, f = () => {}; const o = {withSuccessHandler(x) { s = x; return o; }, withFailureHandler(x) { f = x; return o; } };
      ["importPreview", "importCommit"].forEach(fn => { o[fn] = (a, b) => window.gsr(fn, a, b).then(r => r.err ? f({message: r.err}) : s(r.ok)); }); return o; };
    window.google = {script: {get run() { return mk(); }}};
  };
  await page.setContent(html);
  await page.evaluate(stub);
  await page.evaluate(b => { payload = b; preview(); }, BOOK);
  await page.waitForSelector("#save");
  await pickFn(page);
  await page.click("#save");
  await page.waitForFunction(() => /Imported|err/.test(document.getElementById("done").innerHTML));
  return {calls, done: await page.$eval("#done", e => e.innerText)};
}
const gcRows = rt => rt.b.getSheetByName("GameChanger").records();
(async () => {
  const br = await chromium.launch();
  for (const w of [1194, 390]) {
    /* fresh: #13 on Sophomore offers "Add to Landon Lythgoe (#12)" */
    let page = await br.newPage({viewport: {width: w, height: 900}});
    const errs = []; page.on("pageerror", e => errs.push(e.message));
    let rt = world(false);
    let r = await run(page, rt, async pg => {
      const sels = await pg.$$("select.pick");
      ok(sels.length === 2, w + ": 2 rows to pick (JV and Sophomore no-first-name rows)");
      const labels = await pg.$$eval("select.pick", ss => ss.map(s => [...s.querySelectorAll("optgroup")].map(g => g.label + ":" + [...g.children].map(o => o.textContent).join("|"))));
      ok(labels[1].some(t => t === "Same player, listed twice in GameChanger:Add to Landon Lythgoe (#12)"), w + ": Sophomore #13 offers Add to Landon Lythgoe (#12) [" + labels[1].join(" / ") + "]");
      ok(!labels[0].some(t => /listed twice/.test(t)), w + ": JV has nobody to add to, so no Add to");
      await sels[0].selectOption("p-lyth");
      await sels[1].selectOption("ADD:p-lyth");
    });
    ok(/Imported 2026/.test(r.done) && /1 added to another row/.test(r.done), w + ": saved, says 1 added [" + r.done + "]");
    const so = gcRows(rt).filter(x => x.Level === "Sophomore");
    ok(so.length === 1 && so[0]["Bat AB"] === 24 && so[0].Number === "12, 13", w + ": one Sophomore row, AB 20 + 4");
    ok(!errs.length, w + ": no page errors " + errs.join(";"));
    await page.close();

    /* the 1.3 state: "Lythgoe" saved as SKIP; both rows say Skipped before and can be changed */
    page = await br.newPage({viewport: {width: w, height: 900}});
    rt = world(true);
    r = await run(page, rt, async pg => {
      ok((await pg.$$("select.pick")).length === 0, w + ": nothing left to pick, but…");
      const chg = await pg.$$("select.chg");
      ok(chg.length === 2, w + ": …both remembered Lythgoe rows have a Change list");
      const wide = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      ok(!wide, w + ": no sideways scroll");
      await chg[0].selectOption("p-lyth");
      await chg[1].selectOption("ADD:p-lyth");
    });
    ok(/1 added to another row/.test(r.done), w + ": changed and saved [" + r.done + "]");
    ok(gcRows(rt).filter(x => x.PlayerID === "p-lyth").map(x => x.Level).join() === "JV,Sophomore", w + ": Landon has his JV and Sophomore rows");
    const commit = r.calls.find(c => c[0] === "importCommit");
    ok(Object.values(commit[2]).sort().join() === "ADD:p-lyth,p-lyth", w + ": only the 2 changed rows were sent");
    if (w === 390) await page.screenshot({path: process.env.SHOT || "/tmp/import-page.png", fullPage: true});
    await page.close();
  }
  await br.close();
  console.log(pass + fail + " import page checks" + (fail ? ", " + fail + " FAILED" : ""));
  process.exit(fail ? 1 : 0);
})();
