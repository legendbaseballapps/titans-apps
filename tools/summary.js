/* The Report tab as the summary page: bullpen v38 and Pitch Chart v28 (E-011;
   the summary pages were built in bullpen v37 and Pitch Chart v27).

     cd titans-apps && python3 -m http.server 8807 &
     node tools/summary.js

   The upload side (notes reaching the Sheet, a changed note sent again and
   replaced) is in tools/receiver/upload.js. This suite covers the screens.
   Google's script hosts are blocked, so nothing here reaches the real receiver:
   every filed record stays "waiting", which is the case these checks need. */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8807";
let fail = 0, n = 0;
function is(name, got, want) {
  n++;
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(56) + JSON.stringify(got) + (ok ? "" : "  (expected " + JSON.stringify(want) + ")"));
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  const open = async path => {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block" });
    const pg = await ctx.newPage(); pg.errs = []; pg.on("pageerror", e => pg.errs.push(String(e)));
    await pg.goto(BASE + path, { waitUntil: "load" }); await pg.waitForTimeout(700);
    pg.ctx = ctx; return pg;
  };
  const ev = (pg, s) => pg.evaluate(s);

  /* ------------------------------------------------------------ bullpen */
  console.log("\nBULLPEN v38 · Report tab = Session summary");
  {
    const pg = await open("/bullpen/index.html");
    await ev(pg, '(function(){ var s=document.querySelectorAll(\'#rosterTbl select[data-f="rid"]\'); var R=window.TITANS_ROSTER; [0,1].forEach(function(i){ s[i].value=R[i].id; s[i].dispatchEvent(new Event("input",{bubbles:true})); s[i].dispatchEvent(new Event("change",{bubbles:true})); }); var t=document.getElementById("tplPick"); t.value=t.options[1].value; t.dispatchEvent(new Event("change",{bubbles:true})); document.getElementById("tplLoad").click(); var y=document.querySelector(".askwrap [data-yes]"); if(y) y.click(); })()');
    await pg.click("#btnStart");
    for (let i = 0; i < 3; i++) await ev(pg, 'document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click()');
    await pg.click("#tab-report");
    is("the Report tab is the Session summary", await ev(pg, '!document.getElementById("v-report").hidden && /Session summary/.test(document.querySelector("#v-report .sumtitle").textContent)'), true);
    is("  the separate summary page is gone", await ev(pg, '!document.getElementById("v-sum") && !document.getElementById("btnSum")'), true);
    is("  says it is in progress", await ev(pg, 'document.getElementById("sumPill").textContent'), "in progress");
    is("  no History back button for the live session", await ev(pg, 'document.getElementById("sumBack").hidden'), true);
    is("  one card: only the arm who threw", await ev(pg, 'document.querySelectorAll("#rpt .rptcard").length'), 1);
    is("  the leaderboard is still there", await ev(pg, 'document.querySelectorAll("#board .barrow").length'), 1);
    is("  Export is at the bottom, after the cards", await ev(pg, '!!(document.getElementById("rpt").compareDocumentPosition(document.getElementById("expCsv")) & Node.DOCUMENT_POSITION_FOLLOWING)'), true);
    await pg.fill('#rpt textarea[data-k="note"]', "Stay tall");
    await pg.fill('#rpt textarea[data-k="comments"]', "Ready for live ABs");
    await pg.click("#tab-chart");
    is("  the Chart tab boxes hold the same notes", await ev(pg, 'document.getElementById("note").value + " | " + document.getElementById("comments").value'), "Stay tall | Ready for live ABs");
    await pg.click("#tab-report");
    is("  and the Report tab still shows them", await ev(pg, 'document.querySelector(\'#rpt textarea[data-k="note"]\').value'), "Stay tall");
    /* file, then edit from History while it is still waiting to upload */
    await pg.click("#hdrFinish"); await pg.click(".askwrap [data-yes]");
    is("the next session starts with no notes", await ev(pg, '(function(){ var S=JSON.parse(localStorage.getItem("titans-bullpen-v1")); return S.pitchers.map(function(p){ return (p.note||"")+(p.comments||""); }).join(""); })()'), "");
    await pg.click("#tab-hist");
    await ev(pg, 'document.querySelector("#histList [data-sum]").click()');
    is("History > Summary opens the same Report page", await ev(pg, '!document.getElementById("v-report").hidden && document.getElementById("v-hist").hidden'), true);
    is("  History stays lit (it came from there)", await ev(pg, 'document.getElementById("tab-hist").getAttribute("aria-selected")'), "true");
    is("  with ← History showing", await ev(pg, 'document.getElementById("sumBack").hidden'), false);
    is("  shows its notes", await ev(pg, 'document.querySelector(\'#rpt textarea[data-k="note"]\').value'), "Stay tall");
    is("  numbers are read-only: only the 2 notes are inputs", await ev(pg, '[...document.querySelectorAll("#rpt input, #rpt textarea, #rpt select")].map(function(e){ return e.getAttribute("data-k"); }).join(",")'), "note,comments");
    await pg.fill('#rpt textarea[data-k="note"]', "Stay tall through release");
    const a = await ev(pg, 'JSON.parse(localStorage.getItem("titans-bullpen-archive-v1"))[0]');
    is("  an edit is saved on the filed session", a.pitchers[0].note, "Stay tall through release");
    is("  the live session is untouched", await ev(pg, '(function(){ var S=JSON.parse(localStorage.getItem("titans-bullpen-v1")); return S.pitchers.map(function(p){ return p.note||""; }).join(""); })()'), "");
    is("  not yet uploaded, so no separate notes send is queued", !!a.notesDirty, false);
    is("  pill still says waiting", await ev(pg, 'document.getElementById("sumPill").textContent'), "waiting");
    await pg.click("#expTxt");
    is("  its Export is that filed session, with the edited note", await ev(pg, '/Stay tall through release/.test(document.getElementById("expText").value)'), true);
    await pg.click("#sumBack");
    is("← History returns to History", await ev(pg, '!document.getElementById("v-hist").hidden && document.getElementById("v-report").hidden'), true);
    await pg.click("#tab-report");
    is("the Report tab is the live session again", await ev(pg, 'document.getElementById("sumPill").textContent + " | " + document.getElementById("sumBack").hidden'), "in progress | true");
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  /* ------------------------------------------------------------ Pitch Chart */
  console.log("\nPITCH CHART v28 · Report tab = Game summary");
  {
    const pg = await open("/game/index.html");
    await pg.click('[data-lvl="JV"]');
    await ev(pg, '(function(){ var s=document.querySelectorAll("#pitchers select[data-pick]")[0]; s.value=window.TITANS_ROSTER[0].id; s.dispatchEvent(new Event("change",{bubbles:true})); var set=function(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event("input",{bubbles:true})); }; set("fDate","4-18"); set("fOpp","Ponderosa"); })()');
    await pg.click("#tab-chart");
    await pg.click("#zone .cell:nth-child(13)"); await pg.click('#results button[data-res="GO"]'); await pg.click("#nextBtn");
    await pg.click("#zone .cell:nth-child(13)"); await pg.click("#zone .cell:nth-child(13)"); await pg.click('#results button[data-res="1B"]'); await pg.click("#nextBtn");
    await pg.click("#tab-report");
    is("Report tab: full page; charting screen hidden", await ev(pg, '!document.getElementById("v-report").hidden && document.getElementById("v-chart").style.display === "none"'), true);
    is("  pitcher chips and live stats hide off the Chart tab", await ev(pg, 'document.getElementById("chartBar").style.display'), "none");
    is("  live parts show: AO3+, mix, game note, Finish", await ev(pg, '!document.getElementById("liveReads").hidden && !document.getElementById("liveTools").hidden && !!document.querySelector("#v-report #btnFinish")'), true);
    is("  no History back button for the live game", await ev(pg, 'document.getElementById("sumBack").hidden'), true);
    is("  the tab lights up", await ev(pg, 'document.getElementById("tab-report").getAttribute("aria-selected")'), "true");
    is("  Export is the last thing on the page", await ev(pg, '(function(){ var b=[...document.querySelectorAll("#v-report button")].filter(function(x){ return x.offsetParent; }); return b[b.length-1].id; })()'), "btnExport");
    is("  header names the game", await ev(pg, 'document.getElementById("sumSub").textContent'), "vs Ponderosa · 4-18 · JV · 3 pitches");
    is("  card shows counts: first-pitch strikes", await ev(pg, '(function(){ var k=[...document.querySelectorAll("#sumArms .sumkpi")].find(function(x){ return /First-pitch strikes/.test(x.textContent); }); return k ? k.querySelector("b").textContent : "none"; })()'), "2 of 2 100%");
    is("  batters faced", await ev(pg, '(function(){ var k=[...document.querySelectorAll("#sumArms .sumkpi")].find(function(x){ return /Batters/.test(x.textContent); }); return k.querySelector("b").textContent; })()'), "2");
    is("  the live inning ledger is there", await ev(pg, 'document.querySelectorAll("#innLedger tbody tr").length'), 1);
    is("  and each arm's line with P/IP", await ev(pg, '(function(){ var r=document.querySelector("#innSummary tbody tr"); return r ? r.querySelector(".pip").textContent : "none"; })()'), "9.0");
    await pg.fill('#sumArms textarea[data-k="note"]', "Good tempo");
    await pg.fill('#sumArms textarea[data-k="comments"]', "Work on the slide step");
    await pg.click("#tab-chart");
    is("Chart tab returns to charting", await ev(pg, 'document.getElementById("v-report").hidden && document.getElementById("v-chart").style.display === ""'), true);
    await pg.click("#tab-report");
    is("  the notes are still there", await ev(pg, 'document.querySelector(\'#sumArms textarea[data-k="note"]\').value'), "Good tempo");
    await pg.click("#btnExport");
    is("the game export carries both notes", await ev(pg, '(function(){ var t=document.getElementById("exportText").value; return /To the pitcher\\s+Good tempo/.test(t) && /Coach only\\s+Work on the slide step/.test(t); })()'), true);
    await ev(pg, 'document.getElementById("btnCloseExport").click()');
    await pg.click("#hdrFinish");
    if (await pg.$("#innNoRuns")) { await pg.click("#innNoRuns"); await pg.waitForTimeout(150); if (await pg.$("#innOk")) await pg.click("#innOk"); }
    await pg.waitForTimeout(150);
    await pg.click(".askwrap [data-yes]");
    is("the next game starts with no notes", await ev(pg, '(function(){ var G=JSON.parse(localStorage.getItem("dugout-pitch-chart-v2")); return G.pitchers.map(function(p){ return (p.note||"")+(p.comments||""); }).join(""); })()'), "");
    await pg.click("#tab-history");
    is("History tab: the filed game is listed", await ev(pg, '!document.getElementById("v-history").hidden && /Ponderosa/.test(document.getElementById("histList").textContent)'), true);
    await ev(pg, '(function(){ var row=[...document.querySelectorAll("#histList .hrow")].find(function(r){ return /Ponderosa/.test(r.textContent); }); [...row.querySelectorAll("button")].find(function(x){ return x.textContent==="Summary"; }).click(); })()');
    is("opens the same Report page for a filed game", await ev(pg, '!document.getElementById("v-report").hidden'), true);
    is("  History stays lit (it came from there)", await ev(pg, 'document.getElementById("tab-history").getAttribute("aria-selected")'), "true");
    is("  live parts hidden; static innings shown", await ev(pg, 'document.getElementById("liveReads").hidden && document.getElementById("liveTools").hidden && document.getElementById("liveInn").hidden !== false ? "hidden" : [document.getElementById("liveReads").hidden, document.getElementById("liveTools").hidden].join()'), "hidden");
    is("  the static inning table", await ev(pg, 'document.querySelectorAll("#sumInn tbody tr").length'), 1);
    is("  numbers are read-only: only the 2 notes are inputs", await ev(pg, '[...document.querySelectorAll("#v-report input, #v-report textarea, #v-report select")].filter(function(e){ return e.offsetParent; }).map(function(e){ return e.getAttribute("data-k"); }).join(",")'), "note,comments");
    await pg.fill('#sumArms textarea[data-k="note"]', "Good tempo. Trust the changeup.");
    const g = await ev(pg, 'JSON.parse(localStorage.getItem("dugout-pitch-chart-archive-v1")).find(function(x){ return x.opp==="Ponderosa"; })');
    is("  an edit is saved on the filed game", g.pitchers[0].note, "Good tempo. Trust the changeup.");
    is("  not yet uploaded, so no separate notes send is queued", !!g.notesDirty, false);
    await pg.click("#btnExport");
    is("  its Export is that filed game, with the edited note", await ev(pg, '(function(){ var t=document.getElementById("exportText").value; return /Ponderosa/.test(t) && /Trust the changeup/.test(t); })()'), true);
    await ev(pg, 'document.getElementById("btnCloseExport").click()');
    await pg.click("#sumBack");
    is("← History returns to the History tab", await ev(pg, '!document.getElementById("v-history").hidden && document.getElementById("v-report").hidden'), true);
    await pg.click("#tab-report");
    is("the Report tab is the live game again, not the filed one", await ev(pg, 'document.getElementById("sumPill").textContent + " | " + document.getElementById("sumBack").hidden'), "in progress | true");
    await pg.click("#tab-chart");
    is("Chart with no level picked lands on Setup", await ev(pg, '!document.getElementById("v-setup").hidden'), true);
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  await b.close();
  console.log("\n" + n + " summary checks" + (fail ? "\nFAILURES: " + fail : "\nall good"));
  process.exit(fail ? 1 : 0);
})();
