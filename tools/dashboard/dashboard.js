/* Coaches dashboard, page 1 (Program overview), on the stand-in Sheet (Nov 2026).

     cd titans-apps && node tools/dashboard/dashboard.js [screenshot-folder]

   Builds a small spring season from tools/cards/fixture-sheet.json: the demo Varsity game
   filed through the real apps, copied to JV, Sophomore and Freshman with a few changes,
   plus a practice game and a bullpen that must never count. Runs dashboard/Code.gs on the
   stand-in Apps Script runtime and checks every number on the page against sums worked
   out here, separately, straight from the rows. Also checks that the player cards and the
   dashboard agree on the 150 counter, and who can open the page. */
"use strict";
const fs = require("fs");
const path = require("path");
const { makeRuntime } = require("../receiver/mock-gas");

const ROOT = path.join(__dirname, "..", "..");
const CODE = process.env.DASH_CODE || path.join(ROOT, "dashboard", "Code.gs");
const CARDS = path.join(ROOT, "cards", "Code.gs");
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "cards", "fixture-sheet.json"), "utf8"));
const OUT = process.argv[2] || "";

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL " + m); } }
function eq(a, b, m) { ok(a === b, m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function text(h) { return h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·").replace(/&ndash;/g, "–")
  .replace(/&times;/g, "×").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }

/* ---------------------------------------------------------------- the season */
const GAME = FIX.Records[1][0];
const IH = FIX.Game_Innings[0], PH = FIX.Game_Pitches[0], RH = FIX.Records[0];
const col = (h, n) => h.indexOf(n);
function season(opts) {
  opts = opts || {};
  const S = JSON.parse(JSON.stringify(FIX));
  const base = { inn: S.Game_Innings.slice(1).filter(r => r[0] === GAME), pit: S.Game_Pitches.slice(1).filter(r => r[0] === GAME),
                 rec: S.Records.slice(1).find(r => r[0] === GAME) };
  if (!S.Game_Innings[0].includes("Practice")) { S.Game_Innings[0].push("Practice"); S.Game_Pitches[0].push("Practice"); }
  function copy(rid, level, date, change) {
    base.inn.forEach((r, i) => {
      const x = r.slice(); x[0] = rid; x[col(IH, "Level")] = level; x[col(IH, "Date")] = date;
      if (change) change(x, i);
      x[S.Game_Innings[0].length - 1] = change && change.practice ? "Y" : "";
      S.Game_Innings.push(x);
    });
    base.pit.forEach(r => { const x = r.slice(); x[0] = rid; x[col(PH, "Level")] = level; x[col(PH, "Date")] = date;
      x[S.Game_Pitches[0].length - 1] = change && change.practice ? "Y" : ""; S.Game_Pitches.push(x); });
    const rr = base.rec.slice(); rr[0] = rid; rr[col(RH, "Team")] = level; rr[col(RH, "Date")] = date; rr[col(RH, "FiledAt")] = date + "T2" + (S.Records.length % 10) + ":00:00Z";
    S.Records.push(rr);
  }
  /* JV: 2 extra free bases in the 1st. Sophomore: 3 extra outs of K. Freshman: as charted. */
  copy("jv-a", "JV", "2027-04-07", (x, i) => { if (i === 0) { x[col(IH, "FreeBases")] += 2; x[col(IH, "BattersFaced")] += 2; } });
  copy("so-a", "Sophomore", "2027-04-08", (x, i) => { if (i === 1) { x[col(IH, "K")] += 3; } });
  copy("fr-a", "Freshman", "2027-04-08");
  S.Records[S.Records.length - 1][col(RH, "Team")] = "";        /* level comes from the rows when the Record has none */
  if (!opts.noPractice) {
    const p = (x) => { x[col(IH, "FreeBases")] += 9; }; p.practice = true;
    copy("va-practice", "Varsity", "2027-04-09", p);           /* rows marked Practice: never count */
  }
  S.Records.push(["pen-x", "bullpen", "v44", 1, "Mound 1", "", "2027-01-20", "Coach V", "", "", "2027-01-20T20:00:00Z", "2027-01-20T20:00:01Z", 40]);
  S.Coaches.push(["Jim Vaughn", "jim@example.com", "All", "Both"]);
  return S;
}
function world(S, me) {
  const rt = makeRuntime(CODE);
  const b = rt.newBook("S");
  Object.keys(S).forEach(n => { b.insertSheet(n).data = JSON.parse(JSON.stringify(S[n])); });
  rt.props.SEASON_SHEET_ID = "S";
  rt.session.active = me || "jim@example.com";
  rt.b = b;
  rt.page = () => rt.sandbox.doGet({ parameter: {} }).getContent();
  return rt;
}

/* ---------------------------------------------------------------- expected, worked out here */
function expected(S, cfg) {
  cfg = Object.assign({ rate: { Varsity: 17.9, JV: 20.3, Sophomore: 18.2, Freshman: 17.7 }, share: { Varsity: 49, JV: 43, Sophomore: 34, Freshman: 24 },
                        games: { Varsity: 23, JV: 19, Sophomore: 19, Freshman: 19 }, budget: 3 }, cfg || {});
  const rows = (t) => S[t].slice(1).map(r => Object.fromEntries(S[t][0].map((h, i) => [h, r[i]])));
  const games = new Set(rows("Records").filter(r => r.App === "game").map(r => r.RecordID));
  const inn = rows("Game_Innings").filter(r => games.has(r.RecordID) && r.Practice !== "Y");
  const pit = rows("Game_Pitches").filter(r => games.has(r.RecordID) && r.Practice !== "Y");
  const L = { Varsity: {}, JV: {}, Sophomore: {}, Freshman: {} };
  const zero = () => ({ g: new Set(), p: 0, s: 0, fp: 0, fps: 0, bf: 0, outs: 0, free: 0, k: 0, h: 0, r: 0, er: 0, bb: 0, bip: 0, hard: 0 });
  Object.keys(L).forEach(k => { L[k] = zero(); }); const P = zero();
  inn.forEach(r => [L[r.Level], P].forEach(o => { o.g.add(r.RecordID); o.p += r.Pitches; o.s += r.Strikes; o.fp += r.FirstPitches; o.fps += r.FirstPitchStrikes;
    o.bf += r.BattersFaced; o.outs += r.Outs; o.free += r.FreeBases; o.k += r.K; o.h += r.Hits; o.r += r.Runs; o.er += r.Earned; }));
  const ab = new Map();
  pit.forEach(r => { const k = r.RecordID + "|" + r.Spot + "|" + r.AB; if (!ab.has(k)) ab.set(k, { lv: r.Level, res: "", hard: false });
    if (r.ABResult) { ab.get(k).res = r.ABResult; ab.get(k).hard = r.HardContact === "Y"; } });
  const BIP = new Set(["GO", "FO", "LO", "PO", "FC", "DP", "SAC", "SF", "1B", "2B", "3B", "HR", "E"]);
  ab.forEach(a => [L[a.lv], P].forEach(o => { if (a.res === "BB" || a.res === "IBB") o.bb++; if (BIP.has(a.res)) { o.bip++; if (a.hard) o.hard++; } }));
  const m = o => ({ free: o.free * 100 / o.bf, fps: o.fps * 100 / o.fp, strike: o.s * 100 / o.p, k: o.k * 100 / o.bf, kbb: o.k / o.bb,
    uer: o.r ? (o.r - o.er) * 100 / o.r : 0, hard: o.hard * 100 / o.bip, whip: (o.bb + o.h) / (o.outs / 3), era: o.er * 7 / (o.outs / 3) });
  let saved = 0, pace = 0;
  Object.keys(L).forEach(k => { const o = L[k]; o.saved = o.bf * cfg.rate[k] / 100 - o.free; o.pace = cfg.share[k] * Math.min(1, o.g.size / cfg.games[k]);
    saved += o.saved; pace += o.pace; o.m = m(o); });
  P.m = m(P);
  const perGame = {};
  inn.forEach(r => { const g = perGame[r.RecordID] = perGame[r.RecordID] || { lv: r.Level, bf: 0, free: 0 }; g.bf += r.BattersFaced; g.free += r.FreeBases; });
  const won = Object.values(perGame).filter(g => g.free <= cfg.budget).length;
  return { L, P, saved, pace, won, n: Object.keys(perGame).length, perGame, cfg };
}

/* ================================================================ 1. who can open it */
{
  const S = season();
  let rt = world(S, "stranger@example.com");
  ok(/is not on the Coaches tab/.test(rt.page()) && !/free bases saved/.test(rt.page()), "an account not on Coaches sees no numbers");
  rt = world(S, " ");
  ok(/is not on the Coaches tab/.test(rt.page()), "no signed-in account sees no numbers");
  rt = world(S); rt.props.SEASON_SHEET_ID = "nope";
  ok(/is not shared with jim@example.com/.test(rt.page()), "a Sheet he can't open: plain message");
  rt = world(S, "JIM@Example.com ");
  ok(/Program overview/.test(rt.page()) && /free bases saved/.test(rt.page()), "a coach on the list gets in (case and spaces ignored)");
}

/* ================================================================ 2. the counter, the shares, the battle */
{
  const S = season(), E = expected(S), rt = world(S), h = rt.page(), t = text(h);
  const n = Math.round(E.saved), p = Math.round(E.pace), d = n - p;
  ok(t.includes(n + " of 150 free bases saved"), "counter: " + n + " of 150 (worked out here " + E.saved.toFixed(2) + ")");
  const st = d > 0 ? d + " ahead of pace" : d < 0 ? (-d) + " behind pace" : "Right on pace";
  ok(t.includes(st + " (pace: " + p + " by now) · 4 games"), "pace: " + st + ", pace " + p + ", 4 games (practice game not counted)");
  ok(t.includes("4 of 80 games charted"), "header: 4 of 80 games charted (2027 schedule)");
  ok(t.includes("through Apr 8, 2027"), "header: as of the newest game");
  Object.keys(E.L).forEach(l => {
    const o = E.L[l], s = Math.round(o.saved), want = (s >= 0 ? s + " of " + E.cfg.share[l] : (-s) + " over 2026's rate") + " pace " + Math.round(o.pace);
    ok(t.includes(l + " " + o.g.size + " of " + E.cfg.games[l] + " games " + want), l + " share: " + want);
  });
  ok(t.includes(E.won + " of " + E.n + " games at 3 free bases or fewer"), "battle: " + E.won + " of " + E.n + " games at 3 or fewer");
  Object.keys(E.perGame).forEach(rid => {
    const g = E.perGame[rid], s = Math.round(g.bf * E.cfg.rate[g.lv] / 100 - g.free);
    ok(new RegExp(g.lv + " Ridgeview " + g.free + " " + g.bf + " " + (s > 0 ? "\\+" : "") + s + " ").test(t + " "), "battle row " + g.lv + ": " + g.free + " free, " + g.bf + " BF, saved " + s);
  });
  ok(!/va-practice|Mound 1/.test(h) && t.split(" Varsity Ridgeview ").length === 2, "practice game and bullpen never on the page");
  /* the bars: fill = saved / 150, marker = pace / 150 */
  const hero = h.match(/class="bar big[^"]*"><div class="fill" style="width:([\d.]+)%"><\/div><div class="pace" style="left:([\d.]+)%"/);
  ok(hero && Math.abs(+hero[1] - Math.max(0, Math.min(100, n * 100 / 150))) < 0.06 && Math.abs(+hero[2] - p * 100 / 150) < 0.06, "hero bar fill and pace marker drawn to scale");
}

/* ================================================================ 3. the 9 goals by level */
{
  const S = season(), E = expected(S), rt = world(S), h = rt.page();
  const table = h.match(/<table class="goals">[\s\S]*?<\/table>/)[0];
  const rows = table.split("<tr>").slice(2).map(r => r.split("<td").slice(1).map(c => text("<td" + c)));
  const G = [["free", 13, false, "%", 1], ["fps", 60, true, "%", 1], ["strike", 60, true, "%", 1], ["k", 22, true, "%", 1], ["kbb", 2, true, "", 1],
             ["uer", 15, false, "%", 1], ["hard", 20, false, "%", 1], ["whip", 1.5, false, "", 2], ["era", 3.5, false, "", 2]];
  eq(rows.length, 9, "9 goal rows");
  G.forEach((g, i) => ["Varsity", "JV", "Sophomore", "Freshman", "Program"].forEach((l, j) => {
    const x = (l === "Program" ? E.P : E.L[l]).m[g[0]];
    const want = x.toFixed(g[4]) + g[3], cell = rows[i][j + 1], met = g[2] ? x >= g[1] : x <= g[1];
    eq(cell.replace("&#10003;", "").trim(), want, l + " " + g[0]);
    eq(cell.includes("&#10003;"), met, l + " " + g[0] + " marker " + (met ? "met" : "not yet"));
  }));
  /* check or ring follows the goal */
  const vRow = table.split("<tr>")[2];
  const fpsMet = E.L.Varsity.m.free <= 13;
  ok((vRow.split("<td")[2].includes("&#10003;")) === fpsMet, "Varsity free bases marker matches " + (fpsMet ? "met" : "not met"));
}

/* ================================================================ 4. Config changes, dates as Dates, no games */
{
  const S = season();
  S.Config.push(["Free bases saved goal", 160, ""], ["2026 free-base rate JV", 25, ""], ["Free bases share JV", 50, ""], ["Games scheduled Varsity", 2, ""],
                ["Free base game budget", 2, ""], ["Strikes goal", 70, ""]);
  const E = expected(S, { rate: { Varsity: 17.9, JV: 25, Sophomore: 18.2, Freshman: 17.7 }, share: { Varsity: 49, JV: 50, Sophomore: 34, Freshman: 24 },
                          games: { Varsity: 2, JV: 19, Sophomore: 19, Freshman: 19 }, budget: 2 });
  const t = text(world(S).page());
  ok(t.includes(Math.round(E.saved) + " of 160 free bases saved"), "Config: goal 160 and JV rate 25 (" + Math.round(E.saved) + ")");
  ok(t.includes("pace: " + Math.round(E.pace) + " by now"), "Config: JV share 50, Varsity 2 games scheduled (pace " + Math.round(E.pace) + ")");
  ok(t.includes(E.won + " of " + E.n + " games at 2 free bases or fewer"), "Config: budget 2");
  ok(t.includes("Strikes goal 70% or more"), "Config: strikes goal 70");
  ok(t.includes("of 59 games charted"), "Config: schedule total follows (2 + 19 + 19 + 19)");
}
{
  const S = season(), rt = world(S);              /* the Sheet hands back Date objects for date cells */
  const GI = rt.b.getSheetByName("Game_Innings").data, RE = rt.b.getSheetByName("Records").data, di = col(GI[0], "Date");
  GI.forEach((r, i) => { if (i) r[di] = new Date(r[di] + "T00:00:00"); });
  RE.forEach((r, i) => { if (i) r[col(RH, "Date")] = new Date(r[col(RH, "Date")] + "T00:00:00"); });
  ok(Object.prototype.toString.call(GI[1][di]) === "[object Date]", "test setup: date cells really are Dates");
  const t = text(rt.page());
  ok(t.includes("through Apr 8, 2027") && /Apr 8 Freshman/.test(t), "date cells stored as Dates read the same");
}
{
  const S = season({ noPractice: true });
  S.Records = [S.Records[0], S.Records.find(r => r[1] === "bullpen")];
  const t = text(world(S).page());
  ok(t.includes("No spring games yet") && !t.includes("free bases saved"), "no games: an empty page that says why");
}

/* ================================================================ 5. the cards and the dashboard agree */
{
  const S = season(), E = expected(S);
  const rt = makeRuntime(CARDS, { fetch: {} });
  const b = rt.newBook("S");
  Object.keys(S).forEach(n => { b.insertSheet(n).data = JSON.parse(JSON.stringify(S[n])); });
  rt.props.SEASON_SHEET_ID = "S";
  rt.sandbox.guard_ = () => {};
  const pid = S.Game_Innings.find(r => r[0] === "fr-a")[col(IH, "PitcherID")];
  const card = text(rt.sandbox.previewCard("fr-a", pid));
  const n = Math.round(E.saved);
  if (!card.includes("Program goal " + n)) console.log("CARD: " + card.slice(card.indexOf("Program goal") - 20, card.indexOf("Program goal") + 120));
  ok(card.includes("Program goal " + n + " of 150 free bases saved so far, 4 games in."), "cards and dashboard agree on the counter (" + n + ", 4 games)");
}

/* ================================================================ 6. screenshots for a look */
async function shots() {
  if (!OUT) return;
  const { chromium } = require("playwright");
  const html = world(season()).page();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "overview.html"), html);
  const br = await chromium.launch();
  for (const [name, vp] of [["overview-laptop", { width: 1280, height: 900 }], ["overview-phone", { width: 390, height: 844 }]]) {
    const pg = await br.newPage({ viewport: vp, deviceScaleFactor: 1 });
    await pg.setContent(html);
    const wide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!wide, name + ": no sideways scroll");
    await pg.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true });
    await pg.close();
  }
  await br.close();
}

shots().then(() => {
  console.log(pass + " dashboard checks" + (fail ? ", " + fail + " FAILED" : ""));
  if (fail) process.exit(1);
  console.log("ALL DASHBOARD CHECKS PASS");
});
