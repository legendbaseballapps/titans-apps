/* Dashboard 2.0, the whole page, end to end (Nov 16, 2026).

     cd titans-apps && node tools/dashboard/pages.js [screenshot-folder]

   A made-up season (season-gen.js) goes into a stand-in season Sheet. dashboard/Code.gs + Model.gs +
   Comments.gs run on the stand-in Apps Script runtime and serve the page exactly as doGet does. Chromium
   then opens every side, season, level and page, every player, exit report, scouting report and plan,
   and checks: no script errors, no "NaN" / "undefined" on screen, key numbers equal to sums worked out
   here from the rows, the phone layout doesn't scroll sideways, and coach comments save through the
   real saveComment with the level rule enforced. Also: who can open the page at all. */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { chromium } = require("playwright");
const { makeRuntime } = require("../receiver/mock-gas");
const { season } = require("./season-gen");

const ROOT = path.join(__dirname, "..", "..");
const DASH = ["Code.gs", "Model.gs", "Comments.gs"].map((f) => path.join(process.env.DASH_DIR || path.join(ROOT, "dashboard"), f));
const SHOTS = process.argv[2] || "";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "dash2-"));
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; if (fail < 50) console.log("FAIL " + m); } }
function eq(a, b, m) { ok(a === b, m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

function world(mutate) {
  const G = season();
  if (mutate) mutate(G.sheet);
  const rt = makeRuntime(DASH, { now: "2027-04-17T18:00:00Z" });
  const b = rt.newBook("SEASON");
  Object.keys(G.sheet).forEach((t) => { b.insertSheet(t).data = JSON.parse(JSON.stringify(G.sheet[t])); });
  rt.props.SEASON_SHEET_ID = "SEASON";
  rt.session.active = "coachv@example.com";
  return { rt, G, T: G.sheet };
}
const rowsOf = (T, n) => { const t = T[n], h = t[0]; return t.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };

/* ---------------------------------------------------------------- who can open it */
{
  const { rt } = world();
  rt.session.active = "stranger@example.com";
  ok(/is not on the Coaches tab/.test(rt.sandbox.doGet({ parameter: {} }).getContent()), "someone not on the Coaches tab gets No access");
  rt.session.active = "coachv@example.com";
  const html = rt.sandbox.doGet({ parameter: {} }).getContent();
  ok(/window\.MODEL = {/.test(html) && /id="view"/.test(html), "a coach gets the full dashboard");
  ok(!/<\/script>[^]*window\.MODEL=[^]*<\/script>[^]*<\/script>[^]*window\.MODEL/.test(html), "one model on the page");
  ok(/150 FEWER|Program goal/.test(rt.sandbox.doGet({ parameter: { p: "summary" } }).getContent()), "?p=summary still serves the 1.x Program summary");
  const n0 = Object.keys(rt.cache).length;
  rt.sandbox.doGet({ parameter: {} });
  ok(n0 > 0 && Object.keys(rt.cache).length === n0, "the model is cached, and a second load reuses it");
}

/* ---------------------------------------------------------------- comments: setup and the level rule */
const W = world();
{
  const { rt } = W;
  rt.session.active = "owner@example.com";
  rt.sandbox.setupComments();
  const cid = rt.props.COMMENTS_SHEET_ID, cb = rt.book(cid);
  ok(!!cb, "setupComments makes the comments spreadsheet and saves its id");
  eq(cb.getSheets().map((s) => s.getName()).join(","), "Varsity,JV,Sophomore,Freshman", "one tab per level, and nothing else");
  eq(cb.getSheetByName("Varsity").getProtections()[0].eds.sort().join(","), "coachv@example.com,jim@example.com", "only Varsity coaches can write the Varsity tab");
  eq(cb.getSheetByName("Sophomore").getProtections()[0].eds.sort().join(","), "coachf@example.com,coachs@example.com,jim@example.com", "a coach on 2 levels writes both");
  eq(cb.editors.length, 5, "every coach can open it");
  rt.sandbox.setupComments();
  eq(cb.getSheets().length, 4, "running it again changes nothing");
  rt.session.active = "coachv@example.com";
  const v = rt.sandbox.saveComment({ id: "t001", lv: "Varsity", role: "", text: "=Great year. 3-2 counts were his best.", player: "Cole Avery" });
  eq(v.text, "=Great year. 3-2 counts were his best.", "a Varsity coach saves a Varsity comment");
  const row = cb.getSheetByName("Varsity").data[1];
  eq(row[3], "=Great year. 3-2 counts were his best.", "stored as text, never a formula");
  eq(cb.flags.formula, 0, "no formula ever reaches the comments spreadsheet");
  rt.sandbox.saveComment({ id: "t001", lv: "Varsity", role: "", text: "Second thoughts.", player: "Cole Avery" });
  eq(cb.getSheetByName("Varsity").data.length, 2, "saving again replaces his comment");
  let err = "";
  try { rt.sandbox.saveComment({ id: "t008", lv: "JV", role: "", text: "x" }); } catch (e) { err = e.message; }
  ok(/Only JV coaches/.test(err), "a Varsity coach can't write a JV comment (" + err + ")");
  try { rt.sandbox.saveComment({ id: "t001", lv: "Varsity", text: "x".repeat(1501) }); err = ""; } catch (e) { err = e.message; }
  ok(/under 1500/.test(err), "too long is refused");
  rt.sandbox.saveComment({ id: "t001", lv: "Varsity", role: "", text: "" });
  eq(cb.getSheetByName("Varsity").data.length, 1, "an empty save removes the comment");
}

/* ---------------------------------------------------------------- the page */
(async () => {
  const { rt, T } = W;
  rt.session.active = "coachv@example.com";
  const html = rt.sandbox.doGet({ parameter: {} }).getContent();
  const file = path.join(TMP, "dash.html");
  fs.writeFileSync(file, html);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\//, (r) => r.abort());
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  /* google.script.run, wired to the real saveComment on the stand-in runtime */
  await pg.exposeFunction("__save", (c) => { try { return { ok: rt.sandbox.saveComment(c) }; } catch (e) { return { err: e.message }; } });
  await pg.addInitScript(() => {
    function runner(s, f) { return { withSuccessHandler: (h) => runner(h, f), withFailureHandler: (h) => runner(s, h),
      saveComment: (c) => { window.__save(c).then((r) => (r.err ? f && f(new Error(r.err)) : s && s(r.ok))); } }; }
    window.google = { script: { run: runner(null, null) } };
  });
  await pg.goto("file://" + file);
  await pg.waitForTimeout(200);
  const txt = () => pg.innerText("#view");
  /* the season's data reached the page: the footer carries the version and when the Sheet was read, the bar his name */
  ok(/dashboard 2\.[\d.]+ \(.*\) · every number from the 2027 season Sheet, read /.test(await pg.innerText(".foot")), "the footer shows the version and when the Sheet was read (" + (await pg.innerText(".foot")) + ")");
  eq(await pg.innerText("#who"), "Coach V\nVarsity coach", "the bar shows who is signed in and his level");
  const bad = [];
  let views = 0;
  async function look(tag) {
    views++;
    const t = await txt(), m = t.match(/.{0,30}\b(NaN|undefined|null|Infinity|\[object)\b.{0,30}/g);
    if (m) bad.push(tag + " :: " + m[0].replace(/\n/g, " "));
    if (errs.length) { bad.push(tag + " !! " + errs.join(" | ")); errs.length = 0; }
  }
  const click = async (sel) => { const el = await pg.$(sel); if (!el) return false; await el.click(); await pg.waitForTimeout(15); return true; };
  const clickData = (attr, val) => pg.evaluate(([a, v]) => { const el = [...document.querySelectorAll("[data-" + a + "]")].find((e) => e.dataset[a.replace(/-([a-z])/g, (x, c) => c.toUpperCase())] === v); if (el) el.click(); return !!el; }, [attr, val]);

  /* --- numbers on the page against the rows */
  const recs = new Set(rowsOf(T, "Records").map((r) => r.RecordID));
  const inn = rowsOf(T, "Game_Innings").filter((r) => recs.has(r.RecordID));
  const DEF = { Varsity: 17.9, JV: 20.3, Sophomore: 18.2, Freshman: 17.7 };
  let saved = 0; Object.keys(DEF).forEach((lv) => { const m = inn.filter((r) => r.Level === lv); saved += m.reduce((a, r) => a + r.BattersFaced, 0) * DEF[lv] / 100 - m.reduce((a, r) => a + r.FreeBases, 0); });
  const t0 = await txt();
  ok(t0.includes(Math.round(saved) + "\n/ 150") || t0.includes(Math.round(saved) + " / 150"), "the 150 counter shows " + Math.round(saved));
  const bf = inn.reduce((a, r) => a + r.BattersFaced, 0);
  ok(t0.includes(bf.toLocaleString("en-US") + " batters faced"), "Program batters faced " + bf);
  /* the ladder's pen rung: each pitcher's last 3 scripted pens, pitches added up */
  const bp = rowsOf(T, "Bullpen_Pitches").filter((r) => r.Mode === "Script" && recs.has(r.RecordID));
  const per = {};
  bp.forEach((r) => { const s = (per[r.PitcherID] = per[r.PitcherID] || {})[r.SessionID] = (per[r.PitcherID] || {})[r.SessionID] || { d: r.Date, ok: 0, n: 0 };
    if (/^(Spot|Close|Miss)$/.test(r.Result) && !/Glove|Unknown/.test(r.CallSource)) { s.n++; if (r.Result !== "Miss") s.ok++; } });
  let lok = 0, ln = 0;
  Object.values(per).forEach((ss) => Object.values(ss).sort((a, c) => (a.d < c.d ? -1 : 1)).slice(-3).forEach((s) => { lok += s.ok; ln += s.n; }));
  ok(new RegExp("LATE-WINTER BULLPENS\\s+" + Math.round(lok * 100 / ln) + "%").test(t0.toUpperCase()), "ladder pen rung " + Math.round(lok * 100 / ln) + "%");
  /* Varsity team: his innings */
  await clickData("level", "Varsity"); await click('#sub [data-tab="teams"]');
  const top = await pg.$eval("table tr[data-open] td.name", (td) => td.textContent);
  const name = top.replace(/ also .*$/, "").trim(), pid = rowsOf(T, "Players").find((p) => p.First + " " + p.Last === name).PlayerID;
  const outs = inn.filter((r) => r.Level === "Varsity" && r.PitcherID === pid).reduce((a, r) => a + r.Outs, 0);
  /* every pitcher on the Varsity table: his innings, and his pen rung (his own last 3 pens, pitches added up) */
  const trs = await pg.$$eval("table tr[data-open]", (x) => x.map((tr) => [tr.dataset.open, tr.cells[3].textContent, tr.querySelector(".lad").textContent]));
  let ipOk = 0, penOk = 0, penN = 0;
  trs.forEach(([id, ip, lad]) => {
    const p2 = id.split("|")[1], o2 = inn.filter((r) => r.Level === "Varsity" && r.PitcherID === p2).reduce((a, r) => a + r.Outs, 0);
    if (ip === Math.floor(o2 / 3) + "." + (o2 % 3) || (!o2 && /Not yet/.test(ip))) ipOk++;
    const ss = Object.values(per[p2] || {}).sort((a, c) => (a.d < c.d ? -1 : 1)).slice(-3);
    if (ss.length) { penN++; const k = ss.reduce((a, s) => a + s.ok, 0), n = ss.reduce((a, s) => a + s.n, 0); if (lad.split(" › ")[0] === String(Math.round(k * 100 / n))) penOk++; }
  });
  eq(ipOk, trs.length, "every Varsity pitcher's innings (" + name + " first)");
  eq(penOk, penN, "every Varsity pitcher's pen rung");
  ok(penN > 4, "Varsity pitchers with pens (" + penN + ")");
  /* winter: pens charted */
  await click('[data-season="Winter"]'); await click('#sub [data-tab="overview"]');
  const pens = new Set(bp.map((r) => r.SessionID + "|" + r.PitcherID)).size;
  ok((await txt()).includes(pens + "\nPENS CHARTED") || (await txt()).toUpperCase().includes(pens + "\nPENS CHARTED"), "winter pens charted " + pens);
  /* hitting: plate appearances */
  await click('[data-season="Spring"]'); await click('[data-side="Hitting"]'); await clickData("level", "Program");
  const pas = new Set(rowsOf(T, "Offense_Pitches").filter((r) => recs.has(r.RecordID) && r.PAResult).map((r) => r.RecordID + "|" + r.PA)).size;
  ok((await txt()).includes(pas.toLocaleString("en-US") + " plate appearances"), "program plate appearances " + pas);
  await click('[data-side="Pitching"]');

  /* --- comments on the page: write, save, it shows, and a JV player has no Write button for a Varsity coach */
  await clickData("level", "Varsity"); await click('#sub [data-tab="players"]');
  await clickData("person", name); await pg.waitForTimeout(30);
  ok(await click("[data-cedit]"), "a Varsity coach sees Write/Edit on a Varsity player");
  await pg.fill("#cbox", "Ready for a bigger role next spring.");
  await click("[data-csave]"); await pg.waitForTimeout(150);
  ok((await txt()).includes("Ready for a bigger role next spring."), "the saved comment shows on his page");
  eq(rt.book(rt.props.COMMENTS_SHEET_ID).getSheetByName("Varsity").data.slice(-1)[0][3], "Ready for a bigger role next spring.", "and it is in the comments spreadsheet");
  await click("[data-back]");
  await clickData("level", "JV"); await click('#sub [data-tab="players"]');
  const jv = await pg.$eval("[data-person]", (x) => x.dataset.person);
  await clickData("person", jv);
  eq(await pg.$$eval("[data-cedit]", (x) => x.length), 0, "no Write button on a JV player for a Varsity coach");
  await click("[data-back]");

  /* --- every view */
  for (const side of ["Pitching", "Hitting", "Defense"]) {
    await click(`[data-side="${side}"]`);
    for (const ssn of side === "Pitching" ? ["Spring", "Winter"] : ["Spring"]) {
      if (side === "Pitching") await click(`[data-season="${ssn}"]`);
      const levels = ssn === "Winter" ? ["All", "Sr", "Jr", "So", "Fr"] : ["Program", "Varsity", "JV", "Sophomore", "Freshman"];
      for (const lv of levels) {
        await click(ssn === "Winter" ? `#nav [data-cls="${lv}"]` : `#nav [data-level="${lv}"]`);
        const tabs = await pg.$$eval("#sub [data-tab]", (x) => x.map((e) => e.dataset.tab));
        for (const tab of tabs) {
          await click(`#sub [data-tab="${tab}"]`); await look(`${side}/${ssn}/${lv}/${tab}`);
          if (tab === "board") { for (const w of await pg.$$eval("[data-wk]", (x) => x.map((e) => e.dataset.wk))) { await clickData("wk", w); await look("board " + w); } await click("input[data-seeds]"); await look("seeds"); }
          if (tab === "overview" && lv === "Program" && side !== "Defense") for (const m of await pg.$$eval("[data-metric],[data-hmetric]", (x) => x.map((e) => e.dataset.metric || e.dataset.hmetric))) { await clickData(side === "Hitting" ? "hmetric" : "metric", m); await look("metric " + m); }
          if (tab === "teams" && side === "Pitching" && ssn === "Spring") for (const d of await pg.$$eval("[data-asof]", (x) => x.map((e) => e.dataset.asof))) { await clickData("asof", d); await look("asof " + d); }
          if (tab === "scout" && lv !== "Program" && side === "Pitching") for (const k of await pg.$$eval("[data-scout]", (x) => x.map((e) => e.dataset.scout))) {
            await clickData("scout", k); await look("scout " + k);
            for (let i = 0; i < 3; i++) { await pg.evaluate((i) => { const c = document.querySelectorAll("input[data-sp]")[i]; if (c) c.click(); }, i); await pg.waitForTimeout(10); }
            await look("plans " + k); await click("[data-close]");
          }
          if (tab === "reports" && lv !== "Program" && side === "Pitching") for (const k of await pg.$$eval("[data-report]", (x) => x.map((e) => e.dataset.report))) { await clickData("report", k); await look("report " + k); }
          if (tab === "players") for (const k of await pg.$$eval("[data-person],[data-open]", (x) => x.map((e) => [e.dataset.person ? "person" : "open", e.dataset.person || e.dataset.open]))) {
            await clickData(k[0], k[1]); await look(side + " player " + k[1]); await click("[data-back]");
          }
        }
      }
    }
  }
  ok(views > 600, "every view opened (" + views + ")");
  eq(bad.length, 0, "views with a script error or NaN/undefined on screen" + (bad.length ? ": " + bad.slice(0, 5).join(" || ") : ""));

  /* --- a phone: nothing scrolls sideways (wide tables scroll inside their cards) */
  await pg.setViewportSize({ width: 390, height: 844 });
  for (const [side, ssn, lv, tab] of [["Pitching", "Spring", "Program", "overview"], ["Pitching", "Spring", "Varsity", "teams"], ["Pitching", "Winter", "All", "overview"], ["Hitting", "Spring", "JV", "teams"], ["Defense", "Spring", "Varsity", "teams"]]) {
    await click(`[data-side="${side}"]`); if (side === "Pitching") await click(`[data-season="${ssn}"]`);
    await click(ssn === "Winter" ? `#nav [data-cls="${lv}"]` : `#nav [data-level="${lv}"]`); await click(`#sub [data-tab="${tab}"]`);
    const w = await pg.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= 390, `phone ${side} ${ssn} ${lv} ${tab}: page width ${w}`);
    if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, `phone-${side}-${lv}-${tab}.png`), fullPage: true });
  }
  await b.close();

  /* --- an empty Sheet (the day it's deployed): every page still draws */
  {
    const E = world((T2) => { Object.keys(T2).forEach((k) => { if (!/Coaches|Config|Players/.test(k)) T2[k] = [T2[k][0]]; }); });
    const h2 = E.rt.sandbox.doGet({ parameter: {} }).getContent(), f2 = path.join(TMP, "empty.html");
    fs.writeFileSync(f2, h2);
    const b2 = await chromium.launch(), p2 = await b2.newPage(), e2 = [];
    p2.on("pageerror", (e) => e2.push(e.message));
    await p2.route(/^https?:\/\//, (r) => r.abort());
    await p2.goto("file://" + f2); await p2.waitForTimeout(150);
    ok((await p2.innerText("#view")).includes("Winter 2027"), "with no spring games it opens on Winter");
    for (const side of ["Pitching", "Hitting", "Defense"]) for (const tab of ["overview", "teams", "players", "scout", "reports", "board"]) {
      await p2.click(`[data-side="${side}"]`).catch(() => {}); const t = await p2.$(`#sub [data-tab="${tab}"]`); if (t) await t.click();
      const v = await p2.innerText("#view"); if (/\b(NaN|undefined)\b/.test(v)) e2.push(side + "/" + tab + " shows NaN/undefined");
    }
    eq(e2.length, 0, "an empty Sheet draws every page cleanly" + (e2.length ? ": " + e2.slice(0, 3).join(" | ") : ""));
    await b2.close();
  }
  console.log(pass + " page checks" + (fail ? ", " + fail + " FAILED" : ""));
  if (fail) process.exit(1);
  console.log("ALL PAGE CHECKS PASS");
})().catch((e) => { console.error(e); process.exit(1); });
