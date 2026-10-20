/* Finish & file in the header (bullpen v34, game v26, offense v46), the shared
   top bar (game v28 matches offense), the Pitch Chart's Setup lock (v29), the bullpen's
   Ready to chart box, and its "All Bullpens Complete" card.

     cd titans-apps && python3 -m http.server 8807 &
     node tools/header-finish.js

   Google's script hosts are blocked in the browser, so nothing here can reach the
   real receiver; uploads just fail quietly and stay waiting. */
const { chromium } = require("playwright");
const { FILL_SETUP, FILL_OFFENSE } = require("./game-ready.js");
const BASE = process.env.BASE || "http://localhost:8807";
let fail = 0, n = 0;
function is(name, got, want) {
  n++;
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(54) + JSON.stringify(got) + (ok ? "" : "  (expected " + JSON.stringify(want) + ")"));
}
const shown = id => `(function(){ var b=document.getElementById(${JSON.stringify(id)}); return !!b && b.style.display !== "none" && b.offsetParent !== null; })()`;

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
  console.log("\nBULLPEN · Ready to chart, header Finish & file, All Bullpens Complete");
  {
    const pg = await open("/bullpen/index.html");
    is("Export now is gone from the header", await ev(pg, '!document.getElementById("expNow")'), true);
    is("the old Finish bar is gone", await ev(pg, '!document.getElementById("finishBar")'), true);
    is("a fresh iPad: no Finish & file in the header", await ev(pg, shown("hdrFinish")), false);
    is("Ready box: not yet, pick a pitcher", await ev(pg, 'document.getElementById("readyMsg").textContent'), "Not yet. Pick at least 1 pitcher above.");
    is("  and Start charting waits", await ev(pg, 'document.getElementById("btnStart").disabled'), true);
    await ev(pg, '(function(){ var s=document.querySelectorAll(\'#rosterTbl select[data-f="rid"]\')[0]; var R=window.TITANS_ROSTER; s.value=R[0].id; s.dispatchEvent(new Event("input",{bubbles:true})); s.dispatchEvent(new Event("change",{bubbles:true})); })()');
    const who = await ev(pg, '(function(){ var s=document.querySelectorAll(\'#rosterTbl select[data-f="rid"]\')[0]; return s.options[s.selectedIndex].text; })()');
    is("a pitcher with no script: says to load a template", await ev(pg, '/^Not yet\\. Load a template, or set .+ to Freeform or Live ABs\\.$/.test(document.getElementById("readyMsg").textContent)'), true);
    is("  still waiting", await ev(pg, 'document.getElementById("btnStart").disabled'), true);
    await ev(pg, '(function(){ var t=document.getElementById("tplPick"); t.value=t.options[1].value; t.dispatchEvent(new Event("change",{bubbles:true})); document.getElementById("tplLoad").click(); var y=document.querySelector(".askwrap [data-yes]"); if(y) y.click(); })()');
    is("with a template: ready, and says what is set", await ev(pg, 'document.getElementById("readyMsg").textContent'), "✓ Ready. 1 pitcher · Fastball Command · 25 pitches");
    is("  the box turns green", await ev(pg, 'document.getElementById("readyPanel").classList.contains("ready")'), true);
    is("  Start charting is live", await ev(pg, 'document.getElementById("btnStart").disabled'), false);
    await pg.click("#btnStart");
    is("Start charting opens the Chart tab", await ev(pg, '!document.getElementById("v-chart").hidden'), true);
    is("still no header button before a pitch", await ev(pg, shown("hdrFinish")), false);
    await ev(pg, 'document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click()');
    is("1 pitch: Finish & file appears in the header", await ev(pg, shown("hdrFinish")), true);
    await pg.click("#tab-report");
    is("  and stays there on the Report tab", await ev(pg, shown("hdrFinish")), true);
    await pg.click("#tab-chart");
    for (let i = 0; i < 24; i++) await ev(pg, 'document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click()');
    is("the whole script thrown: All Bullpens Complete", await ev(pg, 'document.querySelector("#call .big").textContent'), "All Bullpens Complete");
    is("  with a Finish & file button on the card", await ev(pg, '!!document.getElementById("callFinish")'), true);
    await pg.click("#callFinish");
    is("  it asks before it files", await ev(pg, '!!document.querySelector(".askwrap [data-yes]")'), true);
    await pg.click(".askwrap [data-yes]");
    is("  and files it", await ev(pg, 'JSON.parse(localStorage.getItem("titans-bullpen-archive-v1")||"[]").length'), 1);
    is("after filing the header button goes away", await ev(pg, shown("hdrFinish")), false);
    is("the clean session is ready again (same names, same script)", await ev(pg, '/^✓ Ready\\./.test(document.getElementById("readyMsg").textContent)'), true);
    /* the header button itself, mid-pen */
    await pg.click("#btnStart");
    await ev(pg, 'document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click()');
    await pg.click("#hdrFinish");
    is("header Finish & file asks too", await ev(pg, '!!document.querySelector(".askwrap [data-yes]")'), true);
    await pg.click(".askwrap [data-no]");
    is("  and Cancel files nothing", await ev(pg, 'JSON.parse(localStorage.getItem("titans-bullpen-archive-v1")||"[]").length'), 1);
    /* freeform needs no template */
    const pg2 = await open("/bullpen/index.html");
    await ev(pg2, '(function(){ var s=document.querySelectorAll(\'#rosterTbl select[data-f="rid"]\')[0]; var R=window.TITANS_ROSTER; s.value=R[1].id; s.dispatchEvent(new Event("input",{bubbles:true})); s.dispatchEvent(new Event("change",{bubbles:true})); var m=document.querySelectorAll(\'#rosterTbl [data-f="mode"]\')[0]; m.value="free"; m.dispatchEvent(new Event("input",{bubbles:true})); m.dispatchEvent(new Event("change",{bubbles:true})); })()');
    is("a freeform pitcher is ready with no template", await ev(pg2, 'document.getElementById("readyMsg").textContent'), "✓ Ready. 1 pitcher · 1 freeform");
    is("no page errors", pg.errs.concat(pg2.errs).join("|"), "");
    await pg.ctx.close(); await pg2.ctx.close();
  }

  /* ------------------------------------------------------------ Pitch Chart */
  console.log("\nPITCH CHART · header Finish & file");
  {
    const pg = await open("/game/index.html");
    is("Export is gone from the header", await ev(pg, '!document.getElementById("btnExport2")'), true);
    is("  and sits on the Report tab (v28)", await ev(pg, '!!document.querySelector("#v-report #btnExport")'), true);
    /* v28: the same top bar as the Offense Chart, in the same order */
    is("header order matches the Offense Chart", await ev(pg, '[...document.querySelectorAll(".top .tabs button, .top .topbar2 > *")].map(function(e){ return e.id || e.textContent.trim(); }).join(",")'), "tab-setup,tab-chart,tab-report,tab-history,Guide,hdrFinish");
    is("  the old Setup button is gone", await ev(pg, '!document.getElementById("btnSetup")'), true);
    is("  the old bottom box is gone", await ev(pg, '!document.getElementById("tabs") && !document.querySelector(".p-tabs")'), true);
    is("nothing charted: no header button", await ev(pg, shown("hdrFinish")), false);
    await pg.click('[data-lvl="JV"]');
    /* v29: charting stays locked until all of Setup is done */
    const msg = () => ev(pg, 'document.getElementById("readyMsg").textContent');
    const onSetup = () => ev(pg, '!document.getElementById("v-setup").hidden');
    is("v29 Ready box lists what is missing", await msg(), "Not yet. Still needed: the opponent, the starting pitcher, 9 hitters' names and 9 jersey numbers. Date and opponent are at the top of the screen.");
    is("  Start charting waits", await ev(pg, 'document.getElementById("suDone").disabled'), true);
    await pg.click("#tab-chart");
    is("  the Chart tab sends you back to Setup", await onSetup(), true);
    is("  and the box turns amber", await ev(pg, 'document.getElementById("readyPanel").classList.contains("nag")'), true);
    await ev(pg, 'document.querySelector("#zone .cell:nth-child(13)").click()');
    is("  a zone tap is refused at the source", await ev(pg, 'JSON.parse(localStorage.getItem("dugout-pitch-chart-v2")).lineup[0].men[0].abs[0].pitches.length'), 0);
    await ev(pg, 'document.querySelector(\'#results button[data-res="IBB"]\').click()');
    is("  so is a no-pitch IBB", await ev(pg, 'JSON.parse(localStorage.getItem("dugout-pitch-chart-v2")).lineup[0].men[0].abs[0].result || ""'), "");
    await ev(pg, '(function(){ var s=document.getElementById("suPitcher"); s.value=window.TITANS_ROSTER[0].id; s.dispatchEvent(new Event("change",{bubbles:true})); })()');
    is("the starter is picked on Setup", /starting pitcher/.test(await msg()), false);
    is("  and shows on the mound chip", await ev(pg, '(document.querySelector("#pitchers .pstart")||{}).textContent === window.TITANS_ROSTER[0].name'), true);
    is("  v30: as a read-out, not a picker", await ev(pg, '!document.querySelector("#pitchers .pchip select")'), true);
    await ev(pg, '(function(){ var e=document.getElementById("fDate"); e.value="2027-04-18"; e.dispatchEvent(new Event("change",{bubbles:true})); e=document.getElementById("fOpp"); e.value="Ponderosa"; e.dispatchEvent(new Event("input",{bubbles:true})); })()');
    await ev(pg, '(function(){ var x=document.querySelector(\'#suRows tr [data-su="name"]\'); x.dispatchEvent(new Event("focus")); x.value="Lopez"; x.dispatchEvent(new Event("input",{bubbles:true})); x.dispatchEvent(new Event("change",{bubbles:true})); })()');
    is("  counts down as the lineup fills", await msg(), "Not yet. Still needed: 8 hitters' names and 9 jersey numbers. Date and opponent are at the top of the screen.");
    await ev(pg, FILL_SETUP);
    is("all of it in: ready, and says what is set", await msg(), "✓ Ready. JV · vs Ponderosa · 2027-04-18 · " + await ev(pg, 'window.TITANS_ROSTER[0].name') + " starting · 9 hitters");
    is("  Start charting is live", await ev(pg, 'document.getElementById("suDone").disabled'), false);
    await pg.click("#suDone");
    is("  and opens the Chart tab", await ev(pg, 'document.getElementById("v-chart").style.display'), "");
    await pg.click("#zone .cell:nth-child(13)");
    is("1 pitch: Finish & file appears in the header", await ev(pg, shown("hdrFinish")), true);
    /* measured with Finish & file showing: the widest the bar gets */
    is("  the top row fits on one line at iPad width", await ev(pg, '(function(){ var t=function(id){ return document.getElementById(id).getBoundingClientRect(); }; var a=t("tab-setup"), f=t("hdrFinish"), o=t("fOpp"), br=document.querySelector(".top .brand").getBoundingClientRect(); return f.top < br.bottom && a.top < br.bottom && o.top < br.bottom && f.right <= window.innerWidth; })()'), true);
    await pg.click("#tab-setup");
    is("  and is still there on the Setup tab", await ev(pg, shown("hdrFinish")), true);
    await ev(pg, '(function(){ var x=document.querySelector(\'#suRows tr [data-su="name"]\'); x.dispatchEvent(new Event("focus")); x.value=""; x.dispatchEvent(new Event("input",{bubbles:true})); x.dispatchEvent(new Event("change",{bubbles:true})); })()');
    is("  game under way: a blanked name never locks charting", await ev(pg, '(function(){ document.getElementById("tab-chart").click(); return document.getElementById("v-chart").style.display; })()'), "");
    await pg.click("#tab-setup");
    await pg.click("#tab-report");
    is("  and on the Report tab", await ev(pg, shown("hdrFinish")), true);
    await pg.click("#tab-chart");
    await pg.click('#results button[data-res="GO"]');
    await pg.click("#hdrFinish");
    if (await pg.$("#innNoRuns")) { await pg.click("#innNoRuns"); await pg.waitForTimeout(200); if (await pg.$("#innOk")) await pg.click("#innOk"); }
    await pg.waitForTimeout(200);
    is("it runs the same flow: asks before it files", await ev(pg, '!!document.querySelector(".askwrap [data-yes]")'), true);
    if (await pg.$(".askwrap [data-yes]")) await pg.click(".askwrap [data-yes]");
    await pg.waitForTimeout(200);
    is("  and files the game", await ev(pg, 'JSON.parse(localStorage.getItem("dugout-pitch-chart-archive-v1")||"[]").length'), 1);
    is("  says so at the top of Setup, like the other 2", await ev(pg, '!document.getElementById("setupNote").hidden && document.getElementById("setupNote").textContent'), "Filed. 1 game in History.");
    is("after filing the header button goes away", await ev(pg, shown("hdrFinish")), false);
    is("the next game is locked again (the starter carries over)", await msg(), "Not yet. Still needed: the level, the opponent, 9 hitters' names and 9 jersey numbers. Date and opponent are at the top of the screen.");
    is("  and the box is not amber until someone tries", await ev(pg, 'document.getElementById("readyPanel").classList.contains("nag")'), false);
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  /* ------------------------------------------------------------ Offense Chart */
  console.log("\nOFFENSE CHART v48 · header, Ready to chart, History");
  {
    const pg = await open("/offense/index.html");
    const msg = () => ev(pg, 'document.getElementById("readyMsg").textContent');
    const tabNow = () => ev(pg, '["setup","chart","report","history"].filter(function(t){ return !document.getElementById("v-"+t).hidden; })[0]');
    is("Export is at the bottom of Report, like the other 2", await ev(pg, '!!document.querySelector("#v-report #btnExport") && !document.querySelector("#v-setup #btnExport")'), true);
    is("  and is not in the header", await ev(pg, '!document.querySelector(".topbar2 #btnExport, header #btnExport")'), true);
    is("Finish & file only in the header (no Setup button)", await ev(pg, '!document.getElementById("btnArchive")'), true);
    is("header order (the one the Pitch Chart copies)", await ev(pg, '[...document.querySelectorAll(".top .tabs button, .top .topbar2 > *")].map(function(e){ return e.id || e.textContent.trim(); }).join(",")'), "tab-setup,tab-chart,tab-report,tab-history,Guide,hdrFinish");
    is("the Lineup button hides off the Chart tab", await ev(pg, 'document.getElementById("btnOrder").style.visibility'), "hidden");
    is("nothing charted: no header button", await ev(pg, shown("hdrFinish")), false);
    await pg.click('[data-lvl="JV"]');
    is("v48 Ready box lists what is missing", await msg(), "Not yet. Still needed: the opponent, their starting pitcher and 9 spots in our lineup. Date and opponent are at the top of the screen.");
    is("  Start charting waits", await ev(pg, 'document.getElementById("btnStart").disabled'), true);
    await pg.click("#tab-chart");
    is("  the Chart tab sends you back to Setup", await tabNow(), "setup");
    is("  and the box turns amber", await ev(pg, 'document.getElementById("readyPanel").classList.contains("nag")'), true);
    is("  a pitch is refused at the source", await ev(pg, '(function(){ logPitch(2,2); return countPitches(); })()'), 0);
    is("  so is a no-pitch IBB", await ev(pg, '(function(){ setResult("IBB"); return curPA().result || ""; })()'), "");
    await ev(pg, FILL_OFFENSE);
    is("all of it in: ready, and says what is set", /^✓ Ready\. JV · vs Test Opponent · \d{4}-\d\d-\d\d · Test Starter starting for them · 9 hitters$/.test(await msg()), true);
    await pg.click("#btnStart");
    is("  Start charting opens the Chart tab", await tabNow(), "chart");
    is("  and the Lineup button shows there", await ev(pg, 'document.getElementById("btnOrder").style.visibility'), "");
    await pg.click('#v-chart [data-r="2"][data-c="2"]');
    is("1 pitch: Finish & file appears in the header", await ev(pg, shown("hdrFinish")), true);
    await ev(pg, '(function(){ var s=document.querySelector(\'[data-li="0"] select[data-lf="rid"]\'); document.getElementById("tab-setup").click(); s=document.querySelector(\'[data-li="0"] select[data-lf="rid"]\'); s.value=""; s.dispatchEvent(new Event("input",{bubbles:true})); })()');
    is("  game under way: an emptied spot never locks charting", await (async () => { await pg.click("#tab-chart"); return tabNow(); })(), "chart");
    await pg.click("#tab-history");
    is("  and stays there on History", await ev(pg, shown("hdrFinish")), true);
    await pg.click("#hdrFinish");
    is("it asks before it files", await ev(pg, '!!document.querySelector(".askwrap [data-yes]")'), true);
    await pg.click(".askwrap [data-yes]");
    is("  and files the game", await ev(pg, 'JSON.parse(localStorage.getItem("titans-offense-archive-v1")||"[]").length'), 1);
    is("  says so at the top of Setup, like the other 2", await ev(pg, '!document.getElementById("setupNote").hidden && document.getElementById("setupNote").textContent'), "Filed. 1 game in History.");
    is("after filing the header button goes away", await ev(pg, shown("hdrFinish")), false);
    is("the next game is locked again (our lineup carries over)", /^Not yet\. Still needed: the level, the opponent, their starting pitcher/.test(await msg()), true);
    await pg.click("#tab-history");
    is("History: the filed list comes first", await ev(pg, '(function(){ var h=[...document.querySelectorAll("#hist .phead .lbl")].map(function(x){ return x.textContent; }); return h[0]; })()'), "Filed games");
    is("  and has no Delete", await ev(pg, '!document.querySelector("[data-hdel]")'), true);
    is("  the upload pill matches the other apps (condensed caps)", await ev(pg, '(function(){ var p=document.querySelector("#hist .gamecard .pill.q"); var c=getComputedStyle(p); return c.textTransform + " " + /Condensed|Narrow/.test(c.fontFamily); })()'), "uppercase true");
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  await b.close();
  console.log("\n" + n + " header checks" + (fail ? "\nFAILURES: " + fail : "\nall good"));
  process.exit(fail ? 1 : 0);
})();
