/* Control sweep — click every interactive control in both apps and assert the
   page actually changed. Three controls were dead for four releases because
   verification only covered what had been edited, not what might have been
   disturbed; a button wired to a missing function is valid JavaScript and fails
   silently. Run before every ship:
       cd titans-apps && python3 -m http.server 8807 &
       node tools/sweep.js
   Exits non-zero if anything is dead. */
const { chromium } = require("playwright");
const { FILL_SETUP } = require("./game-ready.js");
const BASE = process.env.BASE || "http://localhost:8807";
let fails = 0, checks = 0;

/* Serve an app with its erase switch forced ON. From v32 the bullpen SHIPS with
   ALLOW_WIPE = false, and the other two follow before Mar 1, but the erase
   control still exists in the code and its wording and key list still have to
   be proved - so the tests that drive it serve the real file with the switch on.
   Returns true when the page carried the flag at all. */
async function wipeOn(pg, path) {
  let seen = false;
  await pg.route(BASE + path, async route => {
    const res = await route.fetch();
    let body = await res.text();
    seen = /var ALLOW_WIPE = (true|false);/.test(body);
    body = body.replace("var ALLOW_WIPE = false;", "var ALLOW_WIPE = true;");
    route.fulfill({ response: res, body });
  });
  return () => seen;
}

/* v45 / v25: both game apps lock charting until a level is picked for the game,
   every game. Every check that charts picks one first, the way a charter would:
   tap a level on Setup, then go to charting. No-op for the bullpen. */
async function pickLevel(pg, path) {
  if (!/\/(offense|game)\//.test(path)) return;
  await pg.evaluate(() => {
    const b = document.querySelector('[data-lvl="Varsity"]');
    if (b && !b.classList.contains("on")) b.click();
  });
  await pg.waitForTimeout(150);
  /* v29: the Pitch Chart also needs the rest of Setup finished before it charts. */
  if (/\/game\//.test(path)) await pg.evaluate(FILL_SETUP);
  await pg.evaluate((isGame) => {
    /* v28: the Pitch Chart has the same Chart tab as the other two apps. */
    const t = document.getElementById("tab-chart"); if (t) t.click();
  }, /\/game\//.test(path));
  await pg.waitForTimeout(150);
}

async function sweep(b, app, path, controls, opts) {
  const pg = await (await b.newContext({ viewport:{width:1280,height:1100}, serviceWorkers:"block" })).newPage();
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  if (opts && opts.wipeOn) await wipeOn(pg, path);
  await pg.goto(BASE + path, { waitUntil:"load" });
  await pg.waitForTimeout(1400);
  await pickLevel(pg, path);
  console.log("\n" + app);
  for (const [name, sel, probe, setup, expect] of controls) {
    if (setup) { await pg.evaluate(setup); await pg.waitForTimeout(250); }
    if (sel === null) {                      /* presence check, nothing to click */
      const v = await pg.evaluate(probe); checks++;
      const ok = String(v) === String(expect);
      console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(22) + v + " (expected " + expect + ")");
      if (!ok) fails++;
      continue;
    }
    let before;
    try { before = await pg.evaluate(probe); }
    catch(e){ console.log("  x  " + name + " — probe failed: " + e.message); fails++; continue; }
    try { await pg.click(sel, { timeout:3000 }); }
    catch(e){ console.log("  x  " + name + " — cannot click " + sel); fails++; continue; }
    await pg.waitForTimeout(300);
    const after = await pg.evaluate(probe);
    const ok = before !== after; checks++;
    console.log((ok ? "  ok   " : "  DEAD ") + name.padEnd(22) +
                '"' + String(before).slice(0,30) + '" -> "' + String(after).slice(0,30) + '"');
    if (!ok) fails++;
  }
  if (errs.length) { console.log("  page errors: " + errs.join(" | ")); fails += errs.length; }
  await pg.close();
}

/* ---- A CHOICE HAS TO SURVIVE THE REDRAW ----
   Every check above asks "did clicking this change something". None of them asked
   "is the choice still there a moment later", and that gap hid a real bug for
   several releases: the offense lineup dropdown saved the pick to sp.men[0].rid
   while the renderer read sp.rid, so the select snapped back to "- pick -" on
   every redraw. The control was alive. The screen was lying.

   sticks(sel, n) picks the nth real option in a <select>, fires input AND change
   (the redraw hangs off one or the other depending on the app), and then re-reads
   the element FRESH from the DOM - the old reference may have been replaced by the
   redraw, and reading it would prove nothing. */
const sticks = (sel, nth) => `(function(){
  var s = document.querySelectorAll(${JSON.stringify(sel)})[${nth || 0}];
  if(!s) return "no such select";
  var want = null;
  for(var i=0;i<s.options.length;i++) if(s.options[i].value){ want = s.options[i].value; break; }
  if(!want) return "nothing to pick";
  s.value = want;
  s.dispatchEvent(new Event("input",{bubbles:true}));
  s.dispatchEvent(new Event("change",{bubbles:true}));
  var fresh = document.querySelectorAll(${JSON.stringify(sel)})[${nth || 0}];
  if(!fresh) return "the select vanished";
  return fresh.value === want ? "stuck" : "SNAPPED BACK to " + JSON.stringify(fresh.value);
})()`;

const t = s => `(document.querySelector(${JSON.stringify(s)})||{}).textContent||"∅"`;
const c = s => `(document.querySelector(${JSON.stringify(s)})||{}).className||"∅"`;
const n = s => `document.querySelectorAll(${JSON.stringify(s)}).length`;

/* The whole stylesheet once went missing from a playground build. Every control
   still worked, the sweep passed, and the page was unreadable. Appearance is not
   something the control checks can see, so assert it directly: the rules loaded,
   and the navy header bar is actually painted. */
/* The published playground runs in a sandboxed iframe with no allow-modals, so
   window.confirm() returns false instantly and alert() does nothing - silently.
   Every guarded action was dead in the playground for weeks while working on the
   iPad. Nothing may call a native dialog; everything asks through ask(). */
/* Two top-level `function renderHistory()` declarations lived in the game app for
   several releases. The later one silently replaced the earlier, so the batter's
   read panel stopped rendering while every control still worked and every test
   passed. Only TOP-LEVEL declarations are compared - a nested helper named the
   same thing in two closures is fine and common. */
const NO_DUPLICATE_FUNCTIONS =
  '(function(){' +
  ' var src = document.documentElement.innerHTML.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "");' +
  ' var re = /\\nfunction\\s+(\\w+)\\s*\\(/g, seen = {}, dup = [], m;' +
  ' while((m = re.exec(src))){ if(seen[m[1]]) { if(dup.indexOf(m[1])<0) dup.push(m[1]); } else seen[m[1]]=1; }' +
  ' return dup.join(",");' +
  '})()';

const NO_NATIVE_DIALOGS =
  '(function(){' +
  ' var src = document.documentElement.innerHTML;' +
  ' var bad = /[^.\\w](confirm|alert|prompt)\\s*\\(/.test(' +
  '   src.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "") );' +
  ' return (!bad)+"";' +
  '})()';

const styled = sel =>
  '(function(){' +
  ' var n=[].slice.call(document.styleSheets).reduce(function(t,s){' +
  '   try{return t+s.cssRules.length}catch(e){return t} },0);' +
  ' var b=document.querySelector(' + JSON.stringify(sel) + ');' +
  ' var bg=b?getComputedStyle(b).backgroundColor:"";' +
  ' var painted=!!bg && bg!=="transparent" && bg.indexOf("rgba(0, 0, 0, 0)")<0;' +
  ' return (n>80 && painted)+"";' +
  '})()';

/* ---- a game charted on v5 still opens, and still exports ----
   Every other check builds its game through the UI, which means every pitch it
   makes carries an inning. The one case that cannot be built that way is the one
   that will actually be in somebody's iPad on update day: a game charted before
   innings existed. Seeded into localStorage before the page loads, because the
   app reads it once on boot.

   A pre-v6 pitch deliberately gets NO inning - a made-up one is worse than an
   empty cell - so the assertion is that the app opens, charts on, and exports
   that pitch with a blank Inning rather than a guess. */
async function migration(b) {
  const KEY = "dugout-pitch-chart-v2";
  const v5 = {
    v:5, date:"2026-04-02", opp:"Old Build", notes:"",
    pitchers:[{name:"Legacy Arm", rid:"", last:"Arm", first:"Legacy", cls:"Sr", hand:"R",
               ip:"2.0", r:"3", er:"2"},
              {},{},{},{}],
    curP:0, shown:1, curB:0, liveB:0, lastClosed:null,
    outs:1, nextType:"FB", hideLeft:false, spots:9,
    /* Position was free text before v7, so a filed game holds whatever the
       scorer typed. Three shapes that matter: an abbreviation the picker knows
       ("SS"), the same thing in the wrong case ("rf"), and something no dropdown
       can ever show ("Rover"). */
    lineup: Array.from({length:12}, (_, i) => ({
      num:i+1, cur:0,
      men:[{num:i+1, name:"", jersey:"", pos:["SS","rf","Rover"][i] || "",
            notes:"", hand:"R", play:null, tags:{},
            carried:null, cur:0,
            abs:[ i === 0
              ? {pitches:[{r:2,c:2,t:"S",k:"FB",p:0,q:1},{r:1,c:3,t:"B",k:"CH",p:0,q:1}],
                 result:"K", auto:false, spray:null, traj:null, hard:false}
              : {pitches:[], result:null, auto:false, spray:null, traj:null, hard:false} ]}]
    }))
  };
  const ctx = await b.newContext({ viewport:{width:1280,height:1100}, serviceWorkers:"block" });
  await ctx.addInitScript(([k, g]) => {
    try { localStorage.setItem(k, g); } catch(e) {}
  }, [KEY, JSON.stringify(v5)]);
  const pg = await ctx.newPage();
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(BASE + "/game/index.html", { waitUntil:"load" });
  await pg.waitForTimeout(1400);
  await pickLevel(pg, "/game/index.html");
  console.log("\nPITCH CHART · a v5 game on a v23 build");

  const probes = [
    ["it opens at all", '(document.getElementById("fOpp")||{}).value', "Old Build"],
    /* v6 -> v7. The picker can only show values it has options for, so free text
       has to land on one of them or be let go. Keeping "Rover" would leave a
       value in the record that no dropdown will ever display and no export
       column can explain - a quieter kind of wrong than dropping it. */
    /* Reads the STORED RECORD, not the Setup cell. The cell is painted with
       posNormal(b.pos) on every render, so it shows "6" whether or not the
       record was ever migrated - the first version of this check watched that
       cell and stayed green with the migration turned off entirely. The
       migration is about what is on disk; so is the check. */
    ["free text becomes picker values",
      '(function(){ document.getElementById("tab-setup").click();'+
      ' var tr=document.querySelectorAll("#suRows tr")[0];'+
      ' tr.querySelector(\'[data-h="R"]\').click();'+        /* any edit writes the record */
      ' document.getElementById("suDone").click();'+
      ' var p=JSON.parse(localStorage.getItem("dugout-pitch-chart-v2"));'+
      ' return "v"+p.v+" "+p.lineup.slice(0,3).map(function(sp){'+
      '   return JSON.stringify(sp.men[0].pos); }).join(","); })()',
      'v7 "6","9",""'],
    ["the inning box reads 1", '(document.getElementById("innNow")||{}).textContent', "1"],
    /* The old pitch has no inning, so it cannot appear in a ledger keyed by one.
       An empty ledger with a game loaded is the correct answer here, not a bug. */
    ["the ledger does not invent one",
      '(function(){ var t=document.getElementById("innLedger");'+
      ' if(!t) return "no ledger";'+
      ' return document.querySelectorAll("#innLedger tbody tr").length === 0'+
      '        ? "empty" : "INVENTED A ROW"; })()', "empty"],
    ["the summary still reads the pitches",
      '(function(){ var r=document.querySelectorAll("#innSummary tbody tr")[0];'+
      ' return r ? r.cells[2].textContent : "no summary row"; })()', "2"],
    ["the export leaves Inning blank",
      '(function(){ var b=document.getElementById("btnExport"); if(b) b.click();'+
      ' var t=document.getElementById("exportText"); if(!t) return "no textarea";'+
      ' var L=(t.value||"").split(/\\r?\\n/);'+
      ' var hi=-1; for(var i=0;i<L.length;i++) if(/^Inning\\tSpot\\t/.test(L[i])){ hi=i; break; }'+
      ' if(hi<0) return "no pitch-log header";'+
      ' var row=L[hi+1]||"";'+
      ' return row.split("\\t")[0] === "" ? "blank" : "stamped "+row.split("\\t")[0]; })()',
      "blank"],
    /* The point of migrating rather than refusing: charting continues. A pitch
       logged now gets inning 1 and the ledger starts from here. */
    ["charting on from here works",
      /* The seeded at-bat is CLOSED - it has a result - and the app refuses to log
         into a closed at-bat, correctly. Next batter first, which is what the
         charter would do too. */
      '(function(){ document.getElementById("nextBtn").click();'+
      ' document.querySelector(\'#zone .cell:nth-child(13)\').click();'+
      ' var r=document.querySelectorAll("#innLedger tbody tr")[0];'+
      ' return r ? r.cells[0].textContent : "still empty"; })()', "1"],
    /* The step that actually exercises the migration. Everything above survives a
       missing G.innings because every reader guards with (G.innings||[]) - but
       commit() has to PUSH, and pushing onto undefined throws. So close an inning
       on the migrated game: without the migration this is a page error, not a
       wrong number, and a check that never closes one proves nothing. */
    ["an inning can be closed on it",
      '(function(){ document.querySelector(\'#results button[data-res="K"]\').click();'+
      ' document.getElementById("nextBtn").click();'+
      ' [].slice.call(document.querySelectorAll("#outs .outdot"))[2].click();'+
      ' var box=document.querySelector(".askwrap .inbox");'+
      ' if(!box) return "no prompt";'+
      ' document.getElementById("innNoRuns").click();'+
      ' var r=document.querySelectorAll("#innLedger tbody tr")[0];'+
      ' if(!r) return "no ledger row";'+
      ' return "R="+r.cells[6].textContent+" inn="'+
      '        +document.getElementById("innNow").textContent; })()',
      "R=0 inn=2"],
  ];
  for (const [name, probe, want] of probes) {
    let v;
    try { v = await pg.evaluate(probe); }
    catch(e){ v = "probe threw: " + e.message; }
    checks++;
    const ok = String(v) === String(want);
    console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(32) + v + " (expected " + want + ")");
    if (!ok) fails++;
  }
  if (errs.length) { console.log("  page errors: " + errs.join(" | ")); fails += errs.length; }
  await pg.close();
}

/* ---- the erase warning, with something actually filed ----
   On a fresh page the warning takes its EMPTY-History branch, and that branch
   happens to contain the word "History" too - so a check that only ever saw it
   stayed green through a mutation that gutted the branch a real charter sees.
   The filed-count branch has to be RENDERED to be tested, and the archive has to
   exist before the app boots, so it is seeded with addInitScript exactly as the
   v5 migration suite does. Two filed records, neither exported. */
async function wipeWarning(b) {
  const APPS = [
    { name:"BULLPEN CHART", path:"/bullpen/index.html", key:"titans-bullpen-archive-v1" },
    { name:"OFFENSE CHART", path:"/offense/index.html", key:"titans-offense-archive-v1" },
    { name:"PITCH CHART",   path:"/game/index.html",    key:"dugout-pitch-chart-archive-v1" },
  ];
  console.log("\nERASE WARNING · with two unexported records filed");
  for (const app of APPS) {
    const ctx = await b.newContext({ viewport:{width:1280,height:1100}, serviceWorkers:"block" });
    const two = JSON.stringify([
      { filed: Date.now(), sent: false, opp:"Seeded", date:"4-18" },
      { filed: Date.now(), sent: false, opp:"Seeded", date:"4-19" },
    ]);
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch(e) {} }, [app.key, two]);
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    await wipeOn(pg, app.path);
    await pg.goto(BASE + app.path, { waitUntil:"load" });
    await pg.waitForTimeout(1400);
    await pickLevel(pg, app.path);
    let got;
    try {
      got = await pg.evaluate(`(function(){
        var b = document.getElementById("btnWipe");
        if(!b) return "no control";
        b.click();
        var p = document.querySelector(".askwrap .askbox p");
        if(!p) return "no warning";
        var t = p.textContent;
        var counts = /2 filed/.test(t);
        var unsent = /never been exported/.test(t);
        var roster = t.indexOf("roster is not affected") >= 0;
        var no = document.querySelector(".askwrap [data-no]"); if(no) no.click();
        return (counts ? "counts 2" : "NO COUNT")
             + ", " + (unsent ? "warns unsent" : "NO UNSENT WARNING")
             + ", " + (roster ? "roster safe" : "NO ROSTER NOTE");
      })()`);
    } catch(e) { got = "probe threw: " + e.message; }
    checks++;
    const want = "counts 2, warns unsent, roster safe";
    const ok = got === want;
    console.log((ok ? "  ok   " : "  MISS ") + app.name.padEnd(22) + got + (ok ? "" : "   (expected " + want + ")"));
    if (!ok) fails++;
    if (errs.length) { console.log("  page errors: " + errs.join(" | ")); fails += errs.length; }
    await pg.close();
  }
}

/* ---- the switch in its OFF position, end to end ----
   gateWipe() lives inside the IIFE in two of the three apps, so it cannot be
   called from a probe, and asserting on the source would only prove the source.
   Instead each app is SERVED with ALLOW_WIPE flipped to false - the real file,
   the real boot - and the result is read off the page. This is the position the
   apps ship in for the spring, so it is the one worth proving.

   Jim's call on what OFF means: "Should just disable the button" / "and hide
   it." So: hidden, disabled, and no handler behind it. */
async function wipeOff(b) {
  const APPS = [
    { name:"BULLPEN CHART", path:"/bullpen/index.html" },
    { name:"OFFENSE CHART", path:"/offense/index.html" },
    { name:"PITCH CHART",   path:"/game/index.html" },
  ];
  console.log("\nALLOW_WIPE = false · served with the switch off");
  for (const app of APPS) {
    const ctx = await b.newContext({ viewport:{width:1280,height:1100}, serviceWorkers:"block" });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    let flipped = false;
    await pg.route(BASE + app.path, async route => {
      const res = await route.fetch();
      let body = await res.text();
      const before = body;
      body = body.replace("var ALLOW_WIPE = true;", "var ALLOW_WIPE = false;");
      /* the bullpen already ships OFF (v32); the others are flipped here */
      flipped = body.indexOf("var ALLOW_WIPE = false;") >= 0;
      route.fulfill({ response: res, body });
    });
    await pg.goto(BASE + app.path, { waitUntil:"load" });
    await pg.waitForTimeout(1400);
    await pickLevel(pg, app.path);
    let got;
    if (!flipped) { got = "the flag was never flipped - anchor missed"; }
    else {
      try {
        got = await pg.evaluate(`(function(){
          var box = document.getElementById("wipeBox");
          var btn = document.getElementById("btnWipe");
          if(!box || !btn) return "control missing entirely";
          /* box.hidden is the property the gate actually sets, and it has to be
             asserted directly. Rendered-visibility alone is useless here: in two
             of the apps #wipeBox lives on the Setup tab, which is already not
             rendered when the app opens, so "not visible" was true whether or
             not OFF did anything - and a mutation that dropped the hide slipped
             straight through. Both are checked now: the flag, and the pixels. */
          var shown = (box.hidden !== true)
                   || box.offsetParent !== null || box.getClientRects().length > 0;
          var clicked = false;
          btn.addEventListener("click", function(){ clicked = true; }, {once:true});
          /* a real tap: a disabled button must not even deliver the event */
          try { btn.click(); } catch(e) {}
          return (shown ? "STILL SHOWING" : "hidden")
               + ", " + (btn.disabled ? "disabled" : "STILL ENABLED")
               + ", " + (document.querySelector(".askwrap") ? "IT OPENED THE DIALOG" : "no dialog");
        })()`);
      } catch(e) { got = "probe threw: " + e.message; }
    }
    checks++;
    const want = "hidden, disabled, no dialog";
    const ok = got === want;
    console.log((ok ? "  ok   " : "  MISS ") + app.name.padEnd(22) + got + (ok ? "" : "   (expected " + want + ")"));
    if (!ok) fails++;
    if (errs.length) { console.log("  page errors: " + errs.join(" | ")); fails += errs.length; }
    await pg.close();
  }
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    /* The shipped bullpen carries the REAL receiver URL. No test may ever reach it:
       Google's script hosts do not resolve inside this browser. */
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });

  await sweep(b, "PITCH CHART", "/game/index.html", [
    ["no duplicate fns",  null,              NO_DUPLICATE_FUNCTIONS, null, ""],
    ["no native dialogs", null,              NO_NATIVE_DIALOGS, null, "true"],
    ["stylesheet",       null,                            styled('.top'), null, "true"],
    ["call pad cell",    "#callPad button:nth-child(3)",  t("#callHint")],
    ["call pad toggle",  "#callPad button:nth-child(3)",  t("#callHint")],
    ["zone cell",        "#zone .cell:nth-child(13)",     t("#seq")],
    ["pitch type",       "#types button:nth-child(2)",    t("#types button.on")],
    ["mod button",       "#mods button:nth-child(2)",     t("#seq")],
    ["trajectory",       "#trajRow button:nth-child(1)",  c("#trajRow button:nth-child(1)")],
    ["hard contact",     "#hardBtn",                      c("#hardBtn")],
    ["result",           "#results button:nth-child(5)",  t("#results button.on")],
    ["undo",             "#btnUndo",                      t("#seq")],
    /* Button 1 is ALREADY the batter at the plate on a fresh game, so clicking it
       changes nothing and the check read as dead - which is what it did the moment
       the sample game (which had the lineup part-way through) was removed. Probe
       button 2: it carries no class until it is picked. No fixture needed, which
       makes it a better check than the one that leaned on the demo. */
    ["batter strip",     "#scoutPick button:nth-child(2)", c("#scoutPick button:nth-child(2)")],
    ["scout tag",        "#tagsP button:nth-child(1)",    c("#tagsP button:nth-child(1)")],
    ["position seg",     "#posSeg button:nth-child(3)",   c("#posSeg button:nth-child(3)")],
    /* v28: Setup, Chart, Report, History tabs in the header, like the Offense Chart. */
    ["report tab",       "#tab-report",                   'document.getElementById("v-report").hidden+""'],
    ["history tab",      "#tab-history",                  'document.getElementById("v-history").hidden+""'],
    ["chart tab",        "#tab-chart",                    'document.getElementById("v-chart").style.display'],
    ["lineup toggle",    "#btnLeft",                      c(".wrap")],
    ["colour key",       null,                            n(".zonekey span"), null, 4],
    ["finish & file",    null,                            n("#btnFinish"), null, 1],
    ["history pane",     null,                            n("#v-history #histList"), null, 1],
    /* LAST: the read panel must be checked before Setup hides the charting
       screen, and Setup must be last because it hides it. */
    ["batter read panel", null,
       '((document.getElementById("readLine")||{}).textContent||"").length > 0 ? "filled" : "EMPTY"',
       null, "filled"],
    ["setup screen",      "#tab-setup",                    'document.getElementById("v-setup").hidden+""'],
    ["setup rows",        null,                            n("#suRows tr"), null, 9],
    /* ---- the released roster (v18) ---- */
    /* The last app to stop typing our own players. Until now the game-side export
       could not be joined to the bullpen's PitcherID without matching spellings by
       hand - and that join is what answers "does January show up in April". */
    ["roster.js shipped",  null,
       '(function(){ var r=window.TITANS_ROSTER;'+
       ' return (r && r.length) ? "yes" : "NO ROSTER FILE"; })()', null, "yes"],
    /* v30: the starter is picked on Setup (#suPitcher); relievers on the chips. */
    ["pitcher chips are pickers", null,
       '(function(){ var sel=document.querySelectorAll("#suPitcher, #pitchers select[data-pick]");'+
       ' var txt=document.querySelectorAll("#pitchers input");'+
       ' if(!sel.length) return "no picker";'+
       ' return txt.length ? "a text field is still there" : "picker only"; })()',
       null, "picker only"],
    ["picker offers the release", null,
       '(function(){ var sel=document.getElementById("suPitcher");'+
       ' if(!sel) return "no picker";'+
       ' var ids={}; for(var i=0;i<sel.options.length;i++) if(sel.options[i].value) ids[sel.options[i].value]=1;'+
       ' var miss=window.TITANS_ROSTER.filter(function(p){ return !ids[p.id]; });'+
       ' return miss.length ? "not offered: "+miss.map(function(p){return p.name}).join(",") : "all"; })()',
       null, "all"],
    /* The same display rule as the other two apps, checked against what this app
       renders into the picker rather than against the file's own `name` field. */
    ["derived names match the rule", null,
       '(function(){'+
       ' var R2=window.TITANS_ROSTER;'+
       ' function k(x){ return String(x==null?"":x).trim().toLowerCase(); }'+
       ' function want(p){'+
       '   var last=String(p.last||"").trim(), first=String(p.first||"").trim();'+
       '   if(!last) return first;'+
       '   if(!first) return last;'+
       '   var sl=0, si=0, li=first.charAt(0).toLowerCase();'+
       '   R2.forEach(function(q){ if(q.id===p.id) return;'+
       '     if(k(q.last)!==k(last)) return; sl++;'+
       '     if(String(q.first||"").trim().charAt(0).toLowerCase()===li) si++; });'+
       '   if(!sl) return last;'+
       '   if(!si) return last+", "+first.charAt(0).toUpperCase();'+
       '   return last+", "+first; }'+
       ' var sel=document.getElementById("suPitcher");'+
       ' var bad=[];'+
       ' R2.forEach(function(p){'+
       '   var found=null;'+
       '   for(var i=0;i<sel.options.length;i++) if(sel.options[i].value===p.id) found=sel.options[i].text;'+
       '   if(found==null){ bad.push(p.last+" not offered"); return; }'+
       '   if(found.indexOf(want(p))!==0) bad.push(found+" want "+want(p)); });'+
       ' return bad.length ? bad.join(" ; ") : "yes"; })()',
       null, "yes"],
    ["pitcher pick sticks", null, sticks('#suPitcher'), null, "stuck"],
    ["no double-booking an arm", null,
       '(function(){'+
       /* "+ Reliever" is the only way to a second chip from out here. */
       ' var add=document.querySelector("#pitchers .addp");'+
       ' if(add) add.click();'+
       ' var sels=[document.getElementById("suPitcher"), document.querySelector(\'#pitchers select[data-pick="1"]\')];'+
       ' if(!sels[1]) return "need two chips";'+
       ' var taken=sels[0].value;'+
       ' if(!taken) return "chip 1 is not set";'+
       ' for(var i=0;i<sels[1].options.length;i++)'+
       '   if(sels[1].options[i].value===taken) return "STILL OFFERED";'+
       ' return "gone"; })()',
       null, "gone"],
    ["banner matches the file", null,
       '(function(){ var b=document.getElementById("rosSrc");'+
       ' if(!b) return "no banner";'+
       ' var t=b.textContent.replace(/\\s+/g," ");'+
       ' if(window.TITANS_ROSTER_SAMPLE){'+
       '   if(b.className.indexOf("bad")<0) return "sample file but class "+b.className;'+
       '   return /SAMPLE roster/.test(t) ? "yes" : t.slice(0,50); }'+
       ' if(b.className.indexOf("ok")<0) return "class "+b.className;'+
       ' return /Released roster/.test(t) ? "yes" : t.slice(0,50); })()',
       'document.getElementById("tab-setup").click();', "yes"],
    ["export carries the pitcher ID", null,
    /* exportText() is inside the IIFE too. Open the export panel and read the
       textarea it fills - the same trick the bullpen suite uses. */
       '(function(){'+
       ' var b=document.getElementById("btnExport"); if(b) b.click();'+
       ' var t=document.getElementById("exportText");'+
       ' if(!t) return "no export textarea";'+
       /* The pitch-log header gained Inning in front of Spot in v19, so this used
          to anchor on /^Spot\t/ and found nothing. Anchor on the column that is
          actually the subject of the check instead of the one that happens to be
          first. */
       ' var h=(t.value||"").split(/\\r?\\n/).filter(function(l){ return /\\tPitcherID\\t/.test(l) && /ZoneRow/.test(l); })[0]||"";'+
       ' return (h.indexOf("PitcherID")>=0 && h.indexOf("PitcherLast")>=0 &&'+
       '         h.indexOf("ClassName")>=0) ? "yes" : (h.slice(0,120)||"no pitch-log header"); })()',
       null, "yes"],
    /* Carried reads have to be visibly marked as carried, or the charter treats
       a read from six weeks ago as something somebody saw this afternoon. */
    ["carried-read bar",  null,                            '(!!document.getElementById("carriedBar"))+""', null, "true"],
  ]);

  /* Several of these refuse once the at-bat is closed, which is correct - so each
     one that needs a live at-bat gets a clean one first, rather than the sweep
     reporting the app's own guards as dead controls. */
  const freshPA = 'O.pas=[newPA(0,0)]; O.cur=O.pas.length-1; render();';
  const onePitch = freshPA + ' logPitch(2,2); render();';
  await sweep(b, "OFFENSE CHART", "/offense/index.html", [
    ["no duplicate fns",  null,              NO_DUPLICATE_FUNCTIONS, null, ""],
    ["no native dialogs", null,              NO_NATIVE_DIALOGS, null, "true"],
    /* Subs: a lineup spot holds every man who has occupied it, so a pinch hitter
       cannot inherit the starter's at-bats and a re-entry is not a second person. */
    ["sub + order buttons", null,
       '(!!document.getElementById("btnSub") && !!document.getElementById("btnOrder"))+""',
       null, "true"],
    ["stylesheet",       null,                            styled('.top'), null, "true"],
    /* presence, not change: these must always be on screen */
    ["fielder numbers",  null,                            n("#diamond text"), 'showTab("chart");', 9],
    ["colour key",       null,                            n(".zonekey span"), null, 3],
    ["pitch type",       "#types button:nth-child(3)",    t("#types button.on"), 'showTab("chart");'],
    ["zone cell",        "#zone .cell:nth-child(13)",     t("#seq"),  freshPA],
    ["mod button",       "#mods button:nth-child(2)",     t("#seq"),  onePitch],
    ["trajectory",       "#trajRow button:nth-child(1)",  c("#trajRow button:nth-child(1)"), onePitch],
    ["hard contact",     "#hardBtn",                      c("#hardBtn"), onePitch],
    ["result",           "#results button:nth-child(5)",  t("#results button.on"), onePitch],
    ["spray scope",      '[data-spray] [data-sv="A"]',    t("#sprayNote")],
    /* needs an at-bat to exist at that spot to jump to */
    ["lineup spot",      "[data-spot='2']",               t("#paWho"),
       'O.pas=[newPA(2,0), newPA(0,0)]; O.cur=1; render();'],
    /* Two opposing pitchers to switch between. The sample used to supply them;
       now the check builds its own, which is the better test anyway - it no
       longer depends on a demo fixture existing. */
    ["mound chip",       "#pChips [data-cp='1']",         t("#pChips .pchip.on"),
       'O.pitchers=[newPitcher("Zed Keller"),newPitcher("Zed Vance")]; O.cp=0; render();'],
    ["tab: report",      "#tab-report",                   'document.getElementById("v-report").hidden+""'],
    ["tab: history",     "#tab-history",                  'document.getElementById("v-history").hidden+""'],
    /* History mirrors the Setup tab's tags and notes. It must be a MIRROR - the
       moment an entry control appears here there are two places to set a tag and
       no answer to which one is current. */
    /* The History reads panel needs a FILED game whose pitcher carries a tag.
       That used to come from the demo archive, which arch() served whenever the
       sample was loaded - so these four checks were reading invented games. They
       now file a real one first: chart a pitch, tag the pitcher, file it. */
    ["reads on the header", null,
       `(function(){ var h = document.querySelector("#hist .phead.withreads");
          return h && h.querySelector(".rtag") && /What to expect/.test(h.textContent)
            ? "yes" : "NO"; })()`,
       `(function(){
          O.opp = "Zed Opponent";
          O.pitchers = [newPitcher("Zed Keller")];
          O.pitchers[0].tags = {POUNDS:true};
          O.pitchers[0].notes = "sits fastball early";
          O.cp = 0;
          O.pas = [newPA(0,0)];
          O.cur = 0;
          logPitch(2,2);
          archiveGame(true);
          showTab("history");
        })()`, "yes"],
    ["header may wrap",   null,
       `getComputedStyle(document.querySelector("#hist .phead.withreads")).flexWrap`,
       null, "wrap"],
    ["reads are read-only", null,
       'document.querySelectorAll("#hist .readsbar button, #hist .readsbar input, '+
       '#hist .readsbar textarea, #hist .readsbar select, #hist [data-ptag], '+
       '#hist .rtag button").length+""',
       null, "0"],
    ["reads column",      null,
       'Array.prototype.map.call(document.querySelectorAll("#hist table.grid th"),'+
       'function(e){return e.textContent;}).indexOf("Reads")>=0 ? "yes":"NO"', null, "yes"],
    /* Scouting an opposing pitcher. Every one of these lives on the Setup tab,
       so they run together and the chart screen is restored afterwards. */
    ["pitcher tag count",null,                            n("#pRows [data-pi='0'] .ptag"),
       'showTab("setup");', 7],
    ["pitcher notes",    null,                            n("#pRows [data-pi='0'] textarea[data-pf='notes']"), null, 1],
    ["pull button",      null,                            '(!!document.querySelector("[data-ppull]"))+""',
       null, "true"],
    /* A tag the coach sets by hand must stick as HIS, not get recomputed away by
       the auto layer on the next render. */
    ["pitcher tag",      "#pRows [data-pi='0'] .ptag[data-ptag='NOGIVE']",
       c("#pRows [data-pi='0'] .ptag[data-ptag='NOGIVE']")],
    ["tag is stored",    null,  'O.pitchers[0].tags.NOGIVE+""', null, "1"],
    /* POUNDS and WILD are opposites and BOTH can be auto-detected, so the
       exclusion has to hold in ptagOn, not just in the tap handler. For one
       release the panel could show a pitcher as both. */
    ["pounds/wild exclusive", null,
       '(function(){ var p=O.pitchers[0]; p.tags={POUNDS:1};'+
       ' var r=ptagOn(O,0,"POUNDS")+"/"+ptagOn(O,0,"WILD"); p.tags={WILD:1};'+
       ' r+=" "+ptagOn(O,0,"POUNDS")+"/"+ptagOn(O,0,"WILD"); p.tags={}; return r; })()',
       null, "true/false false/true"],
    ["export carries tags", null,
       '(csvOf(O).split("\\n")[0].indexOf("PitcherTags")>=0 && '+
       'csvOf(O).split("\\n")[0].indexOf("PitcherCarried")>=0)+""', null, "true"],
    /* LAST in this list on purpose: it leaves the Order column hidden, which
       would break any check below it that clicks a lineup spot. */
    /* An earlier check files a game, which clears the level (v45), so pick one. */
    ["order collapses",  "#btnOrder",                     c("#chartCols"), 'if(!O.level) setLevel("Varsity"); showTab("chart");'],
    /* ---- the released roster (v36) ---- */
    /* Same file, same rule as the bullpen: roster.js ships with the app and is a
       read-out here. window.TITANS_ROSTER is a global set before the app's own
       script, so every expectation is derived from the shipped file. */
    ["roster.js shipped",  null,
       '(function(){ var r=window.TITANS_ROSTER;'+
       ' return (r && r.length) ? "yes" : "NO ROSTER FILE"; })()',
       'showTab("setup");', "yes"],
    ["roster came from it", null,
       '(function(){ if(R.length!==window.TITANS_ROSTER.length) return R.length+" vs "+window.TITANS_ROSTER.length;'+
       ' var ids={}; R.forEach(function(p){ ids[p.id]=1; });'+
       ' var miss=window.TITANS_ROSTER.filter(function(p){ return !ids[p.id]; });'+
       ' return miss.length ? "missing "+miss.map(function(p){return p.name}).join(",") : "yes"; })()',
       null, "yes"],
    ["banner matches the file", null,
       '(function(){ var b=document.getElementById("rosSrc");'+
       ' if(!b) return "no banner";'+
       ' var t=b.textContent.replace(/\\s+/g," ");'+
       ' if(window.TITANS_ROSTER_SAMPLE){'+
       '   if(b.className.indexOf("bad")<0) return "sample file but class "+b.className;'+
       '   return /SAMPLE roster/.test(t) ? "yes" : t.slice(0,50); }'+
       ' if(b.className.indexOf("ok")<0) return "class "+b.className;'+
       ' if(!/Released roster/.test(t)) return t.slice(0,40);'+
       ' return (t.indexOf(window.TITANS_ROSTER_STAMP)>=0) ? "yes" : "no stamp"; })()',
       null, "yes"],
    ["sample is called out",  null,
       '(function(){ if(!window.TITANS_ROSTER_SAMPLE) return "not a sample file";'+
       ' var t=document.getElementById("rosSrc").textContent;'+
       ' return /[Dd]o not chart/.test(t) ? "yes" : "no warning"; })()',
       null, "yes"],
    /* READ-ONLY, not "mostly". One stray input is a way for an iPad to drift off
       the released list, which is the whole thing this prevents. */
    ["roster is read-only", null,
       'document.querySelectorAll("#rosRows input, #rosRows select, #rosRows button, '+
       '#rosRows textarea, #rosRows [contenteditable]").length+""', null, "0"],
    ["add-player is gone", null,
       '(!!document.getElementById("rosAdd"))+""', null, "false"],
    ["every released player listed", null,
       '(function(){ var n=document.querySelectorAll("#rosRows .rosrow").length;'+
       ' return n===window.TITANS_ROSTER.length ? "all" : n+" of "+window.TITANS_ROSTER.length; })()',
       null, "all"],
    /* bats and throws are separate fields and both have to show, because this app
       needs the bat and the bullpen needs the arm off the same record. */
    ["lineup pick sticks", null, sticks('[data-lf="rid"]'), 'showTab("setup");', "stuck"],
    /* And the one-spot-per-hitter rule rides on the same accessor, so it belongs
       in the same place: a kid placed in spot 1 must not be offered in spot 2. */
    ["no double-booking a hitter", null,
       '(function(){ var a=document.querySelectorAll(\'[data-lf="rid"]\')[0];'+
       ' var b=document.querySelectorAll(\'[data-lf="rid"]\')[1];'+
       ' if(!a||!b) return "need two spots";'+
       ' if(!a.value) return "spot 1 is not set";'+
       ' for(var i=0;i<b.options.length;i++) if(b.options[i].value===a.value) return "STILL OFFERED";'+
       ' return "gone"; })()',
       null, "gone"],
    /* Count from the MODEL, not from the selects. The first version of this check
       compared the counter against the dropdowns and stayed GREEN with the bug in:
       both sides read empty, so they agreed on being wrong. A check whose two
       sides share the same failure is not a check. */
    ["the set counter agrees", null,
       '(function(){'+
       ' var set=0;'+
       ' (O.lineup||[]).forEach(function(sp){'+
       '   var r = (sp && sp.men && sp.men[0]) ? (sp.men[0].rid||"") : (sp && sp.rid || "");'+
       '   if(r) set++; });'+
       ' var txt=document.getElementById("luInfo").textContent;'+
       ' return txt.indexOf(set+" of ")===0 ? "agrees"'+
       '   : txt+" but the model has "+set+" set"; })()',
       null, "agrees"],
    /* Same collapse in this app: the lineup is what gets set on this screen, and
       the roster was pushing it off the bottom. */
    ["roster list collapse", null,
       '(function(){ var b=document.getElementById("rosBody");'+
       ' if(!b) return "no collapsible body";'+
       ' var s=document.getElementById("rosSrc");'+
       ' var green=/\\bok\\b/.test(s?s.className:"");'+
       ' return (b.hidden === green) ? "matches the banner" : (green?"green but SHOWING":"warning but HIDDEN"); })()',
       'showTab("setup");', "matches the banner"],
    ["banner is outside the collapse", null,
       '(function(){ var b=document.getElementById("rosBody"), s=document.getElementById("rosSrc");'+
       ' if(!b||!s) return "missing";'+
       ' return b.contains(s) ? "INSIDE - it would be hidden" : "outside"; })()',
       null, "outside"],
    ["the toggle works",  "#rosToggle",
       '(document.getElementById("rosBody")||{}).hidden+""', 'showTab("setup");'],
    /* The same display rule, checked against what this app renders. The offense
       roster row prints "Last, First" in bold and the derived name beside it. */
    ["derived names match the rule", null,
       '(function(){'+
       ' var R2=window.TITANS_ROSTER;'+
       ' function k(s){ return String(s==null?"":s).trim().toLowerCase(); }'+
       ' function want(p){'+
       '   var last=String(p.last||"").trim(), first=String(p.first||"").trim();'+
       '   if(!last) return first;'+
       '   if(!first) return last;'+
       '   var sl=0, si=0, li=first.charAt(0).toLowerCase();'+
       '   R2.forEach(function(q){'+
       '     if(q.id===p.id) return;'+
       '     if(k(q.last)!==k(last)) return;'+
       '     sl++;'+
       '     if(String(q.first||"").trim().charAt(0).toLowerCase()===li) si++; });'+
       '   if(!sl) return last;'+
       '   if(!si) return last+", "+first.charAt(0).toUpperCase();'+
       '   return last+", "+first; }'+
       ' var bad=[];'+
       ' R2.forEach(function(p){'+
       '   var hit=null;'+
       '   Array.prototype.forEach.call(document.querySelectorAll("#rosRows .rosrow"),function(d){'+
       '     var b=d.querySelector("b"), sa=d.querySelector(".sa");'+
       '     if(!b||!sa) return;'+
       '     if(b.textContent.trim()===p.last+(p.first?", "+p.first:"")) hit=sa.textContent.trim(); });'+
       '   if(hit==null){ bad.push(p.last+" not listed"); return; }'+
       '   if(hit!==want(p)) bad.push(p.last+" shows "+hit+" want "+want(p)); });'+
       ' return bad.length ? bad.join(" ; ") : "yes"; })()',
       null, "yes"],
    ["an initial is actually in use", null,
       '(function(){'+
       ' var counts={};'+
       ' window.TITANS_ROSTER.forEach(function(p){'+
       '   var k=String(p.last||"").toLowerCase(); counts[k]=(counts[k]||0)+1; });'+
       ' if(!Object.keys(counts).some(function(k){ return counts[k]>1; }))'+
       '   return "VACUOUS: no shared last name in this release";'+
       ' var any=false;'+
       ' Array.prototype.forEach.call(document.querySelectorAll("#rosRows .rosrow .sa"),'+
       '   function(sa){ if(/,/.test(sa.textContent)) any=true; });'+
       ' return any ? "yes" : "no name carries an initial"; })()',
       null, "yes"],
    ["export carries hitter last and first", null,
       '(function(){ var h=csvOf(O).split(/\\r?\\n/)[0];'+
       ' return (h.indexOf("HitterLast")>=0 && h.indexOf("HitterFirst")>=0 &&'+
       '         h.indexOf("HitterID")>=0) ? "yes" : h.slice(0,110); })()',
       null, "yes"],
    ["both hands shown",  null,
       '(function(){ var p=window.TITANS_ROSTER.filter(function(x){ return x.bats!==x.throws; })[0];'+
       ' if(!p) return "no mixed-handed player in the release";'+
       ' var rows=document.querySelectorAll("#rosRows .rosrow");'+
       ' for(var i=0;i<rows.length;i++){'+
       '   if(rows[i].textContent.indexOf(p.name)<0) continue;'+
       '   var t=rows[i].textContent.replace(/\\s+/g," ");'+
       '   var want="bats "+p.bats+" · throws "+p.throws;'+
       '   return t.indexOf(want)>=0 ? "yes" : t+" (want "+want+")"; }'+
       ' return "row for "+p.name+" not found"; })()',
       null, "yes"],
    /* The lineup picker is the consumer: it has to offer the released names. */
    ["lineup picks off the release", null,
       '(function(){ var sel=document.querySelectorAll(\'[data-lf]\')[0];'+
       ' if(!sel) return "no lineup picker";'+
       ' var ids={}; for(var i=0;i<sel.options.length;i++) if(sel.options[i].value) ids[sel.options[i].value]=1;'+
       ' var off=window.TITANS_ROSTER.filter(function(p){ return ids[p.id]; });'+
       ' return off.length ? "yes" : "none of the released players are offered"; })()',
       null, "yes"],
  ]);

  await sweep(b, "BULLPEN CHART", "/bullpen/index.html", [
    ["no duplicate fns",  null,              NO_DUPLICATE_FUNCTIONS, null, ""],
    ["no native dialogs", null,              NO_NATIVE_DIALOGS, null, "true"],
    ["stylesheet",       null,                            styled('.bar'), null, "true"],
    ["tab: chart",       "#tab-chart",                    'document.getElementById("v-chart").hidden+""'],
    ["tab: report",      "#tab-report",                   'document.getElementById("v-report").hidden+""'],
    ["tab: history",     "#tab-hist",                     'document.getElementById("v-hist").hidden+""'],
    ["back to setup",    "#tab-setup",                    'document.getElementById("v-setup").hidden+""'],
    /* The demo pitcher was removed in v18. A fresh app opens EMPTY — no script,
       no names — so these two guard against a seeded session creeping back in,
       and every check below has to make its own row first. */
    ["no sample banner",  null,
       '(!document.getElementById("sampleBar") && !document.getElementById("clearSample"))+""',
       null, "true"],
    ["fresh start is empty", null,
       n('#scriptTbl tbody [data-f="type"]'), null, 0],
    /* count the row CONTROLS: an empty-state row is still one <tr>, so rows alone
       cannot tell "no script" from "one pitch". */
    ["add pitch",        "#addPitch",                     n('#scriptTbl tbody [data-f="type"]')],
    /* Delivery codes. SS is the slide step; SL is the Slider pitch type and must
       never leak into this list. */
    ["delivery options",  null,
       '[].map.call(document.querySelectorAll(\'#scriptTbl tbody select[data-f="ws"]\')[0].options,'+
       'function(o){return o.value}).join("/")', null, "W/S/SS"],
    /* Situations are a picked list on purpose — typed notes never group. */
    ["situation options", null,
       '[].map.call(document.querySelectorAll(\'#scriptTbl tbody select[data-f="sit"]\')[0].options,'+
       'function(o){return o.value}).join("/")', null, "/R1/R2/2K/20"],
    ["script header",     null,
       '[].map.call(document.querySelectorAll("#scriptTbl thead th"),'+
       'function(o){return o.textContent.trim()}).join("|")', null, "#|W/S/SS|Pitch|Location|Situation|"],
    /* Headers and cells are written in two different places, so a reorder can move
       one and not the other and still look plausible. Assert they agree. */
    ["column order",      null,
       '[].map.call(document.querySelectorAll(\'#scriptTbl tbody tr[data-i="0"] [data-f]\'),'+
       'function(o){return o.getAttribute("data-f")}).join("|")', null, "ws|type|spot|sit"],
    /* The four routines are the only scripts that ship now. */
    /* The only control in the app that destroys data. It must exist, and it must
       be the guarded kind - a bare click with no dialog would be the bug. */
    ["reset button",      null,
       '(!!document.getElementById("btnReset"))+""', null, "true"],
    ["templates listed",  null,
       '[].map.call(document.querySelectorAll("#tplPick option"),'+
       'function(o){return o.textContent.trim()}).slice(1).join(" / ")', null,
       "Fastball Command / Breaking Ball & Stretch / Holding Runners / Hitter\'s Counts"],
    /* ---- live AB mode (v22). LAST in this list: it switches the pitcher out of
       script mode, which changes the whole chart screen. ---- */
    ["three modes",       null,
       '[].map.call(document.querySelectorAll(\'[data-f="mode"]\')[0].options,'+
       'function(o){return o.value}).join("/")', null, "script/free/live"],
    ["live AB panel",     null,
       'document.getElementById("abbar").hidden+""',
       'document.querySelectorAll(\'[data-f="mode"]\')[0].value="live";'+
       'document.querySelectorAll(\'[data-f="mode"]\')[0]'+
       '.dispatchEvent(new Event("input",{bubbles:true}));'+
       'document.getElementById("tab-chart").click();', "false"],
    ["result pad",        null,  n("#abRes button"), null, 16],
    /* The called spot is OPTIONAL in a live AB, and a skipped call must stay
       distinguishable from a called spot that was missed. */
    ["no-spot offered",   null,
       '(!!document.querySelector(\'#f-spot button[data-s="x"]\'))+""', null, "true"],
    /* An uncalled spot once threw inside drawCall and took the entire render down
       with it - the pitch landed in the model and the screen never moved. */
    ["no-spot still renders", null,
       '(function(){ document.querySelector(\'#f-spot button[data-s="x"]\').click();'+
       ' document.querySelector(\'#zone button[data-r="0"][data-c="0"]\').click();'+
       ' var k=document.querySelectorAll("#liveKpis .kpi");'+
       ' return (k.length && k[0].querySelector(".v").textContent==="1") ? "logged":"DEAD"; })()',
       null, "logged"],
    /* ...and it must not be graded as a miss. One ungraded pitch, nothing graded,
       so the spot percentage has no denominator rather than reading 0%. */
    /* The Chart tab used to always land on whoever was selected last, which in
       practice meant pitcher 1 forever: set a second arm up, tap Chart, and you got
       the first one's finished card with nothing saying so. The strip is the only
       way across and it reads like a header unless it is labelled. */
    ["strip says it switches", null,
       '/tap a name to switch/.test((document.querySelector(".striplbl")||{}).textContent||"")+""',
       null, "true"],
    ["ungraded is not a miss", null,
       '(function(){ var t=document.getElementById("liveRead").textContent||"";'+
       ' return /no spot called/.test(t) ? "ungraded":t.slice(0,40); })()',
       null, "ungraded"],
    /* ---- the released roster (v26) ---- */
    /* The roster SHIPS with the app as roster.js and is read-only on the iPad.
       window.TITANS_ROSTER is a global set before the app's IIFE, so every
       expectation below is derived from the shipped file itself rather than
       hardcoded - the point is that the app reads what was released, whatever
       was released. */
    ["roster.js shipped",  null,
       '(function(){ var r=window.TITANS_ROSTER;'+
       ' return (r && r.length) ? "yes" : "NO ROSTER FILE"; })()',
       'document.getElementById("tab-setup").click();', "yes"],
    /* The banner has to match the file. The repo ships the SAMPLE placeholder, so
       red-and-shouting is the correct state here; roster-states.js covers a real
       release, a missing file and a leftover local list. */
    ["banner matches the file", null,
       '(function(){ var b=document.getElementById("rosSrc");'+
       ' if(!b) return "no banner";'+
       ' var t=b.textContent.replace(/\\s+/g," ");'+
       ' if(window.TITANS_ROSTER_SAMPLE){'+
       '   if(b.className.indexOf("bad")<0) return "sample file but class "+b.className;'+
       '   return /SAMPLE roster/.test(t) ? "yes" : t.slice(0,50); }'+
       ' if(b.className.indexOf("ok")<0) return "class "+b.className;'+
       ' if(!/Released roster/.test(t)) return t.slice(0,40);'+
       ' return (t.indexOf(window.TITANS_ROSTER_STAMP)>=0) ? "yes" : "no stamp: "+t.slice(0,60); })()',
       null, "yes"],
    ["sample is called out",  null,
       '(function(){ if(!window.TITANS_ROSTER_SAMPLE) return "not a sample file";'+
       ' var t=document.getElementById("rosSrc").textContent;'+
       ' return /[Dd]o not chart/.test(t) ? "yes" : "no warning"; })()',
       null, "yes"],
    ["mound pick sticks",  null, sticks('#rosterTbl [data-f="rid"]'),
       'document.getElementById("tab-setup").click();', "stuck"],
    /* v32: practice mode. The switch must stick, raise the bar on the Chart tab,
       and land in the export, so a practice pen is never mistaken for a real one. */
    ["practice switch",    "#s-practice",
       '(function(){ var b=document.getElementById("practiceBar"); return b ? String(b.hidden) : "no bar"; })()',
       'document.getElementById("tab-setup").click(); document.getElementById("s-practice").checked=false;'],
    ["practice is stored", null,
       '(function(){ var s=JSON.parse(localStorage.getItem("titans-bullpen-v1")||"{}");'+
       ' var on=s.practice===true; var c=document.getElementById("s-practice");'+
       ' c.click(); var off=JSON.parse(localStorage.getItem("titans-bullpen-v1")||"{}").practice===false;'+
       ' return on && off ? "on, then off" : "on="+on+" off="+off; })()',
       null, "on, then off"],
    ["upload line explains itself", null,
       '(function(){ document.getElementById("tab-hist").click(); var u=document.getElementById("upLine");'+
       ' var t=u?u.textContent:""; document.getElementById("tab-setup").click();'+
       ' if(u && u.hidden) return "quiet until a session is filed";'+
       ' return /not set up/.test(t) ? "UPLOAD IS OFF IN THIS BUILD" : "line: "+t; })()',
       null, "quiet until a session is filed"],
    /* The panel is collapsed by default. Sixty-six players is ~2,200px of list
       sitting directly above the mound list a coach starts a session with, and you
       pick arms off a dropdown - so the list is reference, not the screen. */
    ["roster list collapse", null,
       '(function(){ var b=document.getElementById("rosBody");'+
       ' if(!b) return "no collapsible body";'+
       /* The shipped file is the SAMPLE roster, which auto-expands on purpose, so
          "collapsed by default" cannot be asserted against it. Assert the rule
          instead: hidden when the banner is green, showing when it is not. */
       ' var s=document.getElementById("rosSrc");'+
       ' var green=/\\bok\\b/.test(s?s.className:"");'+
       ' return (b.hidden === green) ? "matches the banner" : (green?"green but SHOWING":"warning but HIDDEN"); })()',
       'document.getElementById("tab-setup").click();', "matches the banner"],
    /* The banner is NOT in the collapse. It is what catches a sample or stale
       roster before a session, and a signal behind a tap is a signal nobody reads. */
    ["banner is outside the collapse", null,
       '(function(){ var b=document.getElementById("rosBody"), s=document.getElementById("rosSrc");'+
       ' if(!b||!s) return "missing";'+
       ' return b.contains(s) ? "INSIDE - it would be hidden" : "outside"; })()',
       null, "outside"],
    ["the toggle labels itself", null,
       '(function(){ var t=document.getElementById("rosToggle");'+
       ' if(!t) return "no toggle";'+
       ' var open=t.getAttribute("aria-expanded")==="true";'+
       ' if(open) return /Hide/.test(t.textContent) ? "labelled" : t.textContent;'+
       ' return t.textContent.indexOf(String(window.TITANS_ROSTER.length))>=0'+
       '   ? "labelled" : t.textContent; })()',
       null, "labelled"],
    ["the toggle works",  "#rosToggle",
       '(document.getElementById("rosBody")||{}).hidden+""'],
    ["roster header",     null,
       '[].map.call(document.querySelectorAll("#teamTbl thead th"),'+
       'function(o){return o.textContent.trim()}).join("|")', null,
       "#|Name|Shows as|Class|Throws|Bats"],
    /* READ-ONLY, not "mostly read-only". A single stray input is a way for one iPad
       to drift off the released list, which is the whole thing this prevents. */
    ["roster is read-only", null,
       'document.querySelectorAll("#teamTbl input, #teamTbl select, #teamTbl button, '+
       '#teamTbl textarea, #teamTbl [contenteditable]").length+""', null, "0"],
    ["editing controls are gone", null,
       '["addPlayer","csvPick","csvFile","pasteOpen","pasteGo","bumpCls"]'+
       '.filter(function(k){ return !!document.getElementById(k); }).join(",") || "none"',
       null, "none"],
    ["every released player listed", null,
       '(function(){ var rows=document.querySelectorAll("#teamTbl tbody tr").length;'+
       ' return rows===window.TITANS_ROSTER.length ? "all" : rows+" of "+window.TITANS_ROSTER.length; })()',
       null, "all"],
    /* A read-out can afford the full word, and "Senior" is read faster across a
       gym than "Sr". It also proves the row is rendered text, not a select. */
    /* THE DISPLAY RULE. Last name alone; an initial only where two players share a
       last name; the full first name when the initial collides too.

       These compare the RENDERED Shows-as column against the rule computed here
       from last/first. The first version of this check read window.TITANS_ROSTER's
       own `name` field, which is written by the Roster Manager - so it passed with
       the app's rule flattened to "always the last name". It was testing the file,
       not the app. */
    ["derived names match the rule", null,
       '(function(){'+
       ' var R2=window.TITANS_ROSTER;'+
       ' function k(s){ return String(s==null?"":s).trim().toLowerCase(); }'+
       ' function want(p){'+
       '   var last=String(p.last||"").trim(), first=String(p.first||"").trim();'+
       '   if(!last) return first;'+
       '   if(!first) return last;'+
       '   var sl=0, si=0, li=first.charAt(0).toLowerCase();'+
       '   R2.forEach(function(q){'+
       '     if(q.id===p.id) return;'+
       '     if(k(q.last)!==k(last)) return;'+
       '     sl++;'+
       '     if(String(q.first||"").trim().charAt(0).toLowerCase()===li) si++; });'+
       '   if(!sl) return last;'+
       '   if(!si) return last+", "+first.charAt(0).toUpperCase();'+
       '   return last+", "+first; }'+
       ' var rows=document.querySelectorAll("#teamTbl tbody tr");'+
       ' if(!rows.length) return "no roster rendered";'+
       ' var shown={};'+
       ' Array.prototype.forEach.call(rows,function(tr){'+
       '   var td=tr.children;'+
       '   if(td.length<3) return;'+
       '   shown[td[1].textContent.trim()]=td[2].textContent.trim(); });'+
       ' var bad=[];'+
       ' R2.forEach(function(p){'+
       '   var key=p.last+(p.first?", "+p.first:"");'+
       '   var got=shown[key];'+
       '   if(got==null){ bad.push(key+" not listed"); return; }'+
       '   if(got!==want(p)) bad.push(key+" shows "+got+" want "+want(p)); });'+
       ' return bad.length ? bad.join(" ; ") : "yes"; })()',
       null, "yes"],
    /* And the rule has to be doing something: the shipped file contains a shared
       last name on purpose, so at least one name must carry an initial. If this
       goes green on a release with no collision it is vacuous - it says so. */
    ["an initial is actually in use", null,
       '(function(){'+
       ' var counts={};'+
       ' window.TITANS_ROSTER.forEach(function(p){'+
       '   var k=String(p.last||"").toLowerCase(); counts[k]=(counts[k]||0)+1; });'+
       ' var shared=Object.keys(counts).filter(function(k){ return counts[k]>1; });'+
       ' if(!shared.length) return "VACUOUS: no shared last name in this release";'+
       ' var cells=document.querySelectorAll("#teamTbl tbody tr");'+
       ' var any=false;'+
       ' Array.prototype.forEach.call(cells,function(tr){'+
       '   var td=tr.children;'+
       '   if(td.length>=3 && /,/.test(td[2].textContent)) any=true; });'+
       ' return any ? "yes" : "no name carries an initial"; })()',
       null, "yes"],
    ["picker shows the derived name", null,
       '(function(){ var sel=document.querySelectorAll(\'#rosterTbl [data-f="rid"]\')[0];'+
       ' if(!sel) return "no picker";'+
       ' var want=window.TITANS_ROSTER.filter(function(p){ return p.name!==p.last; })[0];'+
       ' if(!want) return "no collision in the release";'+
       ' for(var i=0;i<sel.options.length;i++)'+
       '   if(sel.options[i].value===want.id)'+
       '     return sel.options[i].text.indexOf(want.name)===0 ? "yes" : sel.options[i].text;'+
       ' return "not offered"; })()',
       null, "yes"],
    ["export carries last and first", null,
       '(function(){ document.getElementById("tab-report").click();'+
       ' document.getElementById("expText").value="";'+
       ' document.getElementById("expCsv").click();'+
       ' var h=(document.getElementById("expText").value||"").split(/\\r?\\n/)[0];'+
       ' return (h.indexOf("PitcherLast")>=0 && h.indexOf("PitcherFirst")>=0) ? "yes" : h.slice(0,90); })()',
       null, "yes"],
    ["class spelled out",  null,
       '(function(){ var t=document.getElementById("teamTbl").textContent;'+
       ' var want={Fr:"Freshman",So:"Sophomore",Jr:"Junior",Sr:"Senior"}, miss=[];'+
       ' window.TITANS_ROSTER.forEach(function(p){'+
       '   if(p.cls && t.indexOf(want[p.cls])<0) miss.push(p.cls); });'+
       ' return miss.length ? "missing "+miss.join("/") : "yes"; })()',
       null, "yes"],
    /* The mound picker offers the released roster and nothing else. */
    ["mound picks off roster", null,
       '[].map.call(document.querySelectorAll("#rosterTbl thead th"),'+
       'function(o){return o.textContent.trim()}).join("|")',
       null, "#|Pitcher|PitchSafe 0–100|Stretch only|Runs|"],
    ["no jersey field",   null,
       'document.querySelectorAll(\'#rosterTbl [data-f="num"]\').length+""', null, "0"],
    ["picker offers the release", null,
       '(function(){ var sel=document.querySelectorAll(\'#rosterTbl [data-f="rid"]\')[0];'+
       ' if(!sel) return "no picker";'+
       ' var ids={}; for(var i=0;i<sel.options.length;i++) if(sel.options[i].value) ids[sel.options[i].value]=1;'+
       ' var miss=window.TITANS_ROSTER.filter(function(p){ return !ids[p.id]; });'+
       ' return miss.length ? "not offered: "+miss.map(function(p){return p.name}).join(",") : "all"; })()',
       null, "all"],
    /* Picking a name has to bring his class and arm with it, off the released file. */
    ["picking carries class", null,
       '(function(){ var sel=document.querySelectorAll(\'#rosterTbl [data-f="rid"]\')[0];'+
       ' if(!sel) return "no picker";'+
       ' var p=window.TITANS_ROSTER[0];'+
       ' sel.value=p.id; sel.dispatchEvent(new Event("input",{bubbles:true}));'+
       ' var w=document.querySelector("#rosterTbl .whoami");'+
       ' if(!w) return "no read-out";'+
       ' var got=w.textContent.replace(/\\s+/g," ").trim();'+
       ' var want=p.cls+" · "+p.throws+"HP";'+
       ' return got===want ? "yes" : got+" (want "+want+")"; })()',
       null, "yes"],
    /* The same kid cannot be charted twice in one session. */
    ["no double-booking", null,
       '(function(){ var sels=document.querySelectorAll(\'#rosterTbl [data-f="rid"]\');'+
       ' if(sels.length<2) return "need two slots";'+
       ' var taken=window.TITANS_ROSTER[0].id;'+
       ' for(var i=0;i<sels[1].options.length;i++)'+
       '   if(sels[1].options[i].value===taken) return "still offered";'+
       ' return "gone"; })()',
       null, "gone"],
    /* SessionID and PitcherID are the join keys a roll-up needs. A name is not a key. */
    ["ids in the export", null,
       '(function(){ document.getElementById("tab-report").click();'+
       ' document.getElementById("expText").value="";'+
       ' document.getElementById("expCsv").click();'+
       ' var h=(document.getElementById("expText").value||"").split(/\\r?\\n/)[0];'+
       ' return (h.indexOf("SessionID")>=0 && h.indexOf("PitcherID")>=0) ? "yes" : h.slice(0,80); })()',
       null, "yes"],
    ["class in the export", null,
       '(function(){ document.getElementById("tab-report").click();'+
       ' document.getElementById("expText").value="";'+
       ' document.getElementById("expCsv").click();'+
       ' var h=(document.getElementById("expText").value||"").split(/\\r?\\n/)[0];'+
       ' return (h.indexOf("Class")>=0 && h.indexOf("Jersey")<0) ? "yes" : h.slice(0,80); })()',
       'document.getElementById("tab-chart").click();'+
       'document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click();',
       "yes"],
    /* LAST: finishing a scripted card has to lead somewhere. Two arms off the
       roster, run the first out of card, leave the tab and come back. */
    ["follows the mound",  null,
       '(function(){'+
       ' document.getElementById("tab-setup").click();'+
       ' function pickInto(slot, id){'+
       '   var sel=document.querySelectorAll(\'#rosterTbl [data-f="rid"]\')[slot];'+
       '   if(!sel) return false;'+
       '   for(var i=0;i<sel.options.length;i++) if(sel.options[i].value===id){'+
       '     sel.value=id;'+
       '     sel.dispatchEvent(new Event("input",{bubbles:true})); return true; }'+
       '   return false; }'+
       ' var R2=window.TITANS_ROSTER;'+
       ' if(R2.length<3) return "need three on the roster";'+
       ' if(!pickInto(1,R2[1].id)) return "slot 1 failed";'+
       ' if(!pickInto(2,R2[2].id)) return "slot 2 failed";'+
       ' var ms=document.querySelectorAll(\'[data-f="mode"]\');'+
       ' for(var m=0;m<3;m++){ if(!ms[m]) continue;'+
       '   ms[m].value="script"; ms[m].dispatchEvent(new Event("input",{bubbles:true})); }'+
       ' document.getElementById("tab-chart").click();'+
       ' function pick(i){ document.querySelectorAll("#strip .pcard")[i].click(); }'+
       ' function on(){ return document.querySelector("#strip .pcard[aria-pressed=true] .nm").textContent; }'+
       ' pick(0);'+
       ' var n=document.querySelectorAll(\'#scriptTbl tbody [data-f="type"]\').length || 1;'+
       ' for(var i=0;i<=n;i++) document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click();'+
       ' var nb=document.getElementById("nextArm");'+
       ' if(!nb) return "no hand-off on a finished card, on "+on();'+
       ' nb.click();'+
       ' if(on()!==R2[1].name) return "hand-off landed on "+on();'+
       ' for(var j=0;j<=n;j++) document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click();'+
       ' document.getElementById("tab-report").click();'+
       ' document.getElementById("tab-chart").click();'+
       ' return (on()===R2[2].name) ? "yes" : "landed on "+on()+", wanted "+R2[2].name; })()',
       null, "yes"],
  ]);


  /* ====================== INNINGS (game v19) ======================
     Its own sweep() call, which means its own browser context and a clean
     localStorage - the checks build ONE game up in order and each asserts the
     state at its point in that game, so they are not independent and must not be
     reordered. That is deliberate: the bug this feature can actually have is a
     sequence bug (the third out opening an overlay while the out dots keep their
     own idea of the count), and a suite of isolated checks is exactly the shape
     that misses it.

     Everything goes through the DOM. The app is inside an IIFE so there is no G
     to poke at from out here - and that is the right way round: a fixture that
     set G directly would have passed over the out-dot handler entirely. */
  const GINN = `window.__T = (function(){
    function q(s){ return document.querySelector(s); }
    function qa(s){ return [].slice.call(document.querySelectorAll(s)); }
    function arm(chip, nth){
      var s = chip ? q('#pitchers select[data-pick="' + chip + '"]') : q("#suPitcher");   /* v30 */
      if(!s) return "no chip " + chip;
      var id = window.TITANS_ROSTER[nth].id;
      s.value = id;
      s.dispatchEvent(new Event("change",{bubbles:true}));
      return "ok";
    }
    function addArm(){ var a = q("#pitchers .addp"); if(a) a.click(); }
    function pitch(){ q('#zone .cell:nth-child(13)').click(); }
    function res(k){ var b = q('#results button[data-res="' + k + '"]'); if(b) b.click(); }
    function next(){ var b = q("#nextBtn"); if(b) b.click(); }
    function ab(k, n){ for(var i=0;i<(n||3);i++) pitch(); res(k); next(); }
    function outs(n){ qa("#outs .outdot")[n-1].click(); }
    function outsOn(){ return qa("#outs .outdot.on").length; }
    function inn(){ return (q("#innNow")||{}).textContent; }
    function box(){ return q(".askwrap .inbox"); }
    function head(){ var b = box(); return b ? b.querySelector(".inhead").textContent : ""; }
    function rows(sel){
      return qa(sel + " tbody tr").map(function(tr){
        return [].slice.call(tr.cells).map(function(td){ return td.textContent; });
      });
    }
    function ledger(){ return rows("#innLedger .inntbl"); }
    function summary(){ return rows("#innSummary .sumtbl"); }
    /* The overlay's pads and steppers both label themselves, so one accessor
       reaches either shape - which is what lets the layout-switch check and the
       cap check be about behaviour rather than about markup. */
    function field(label, armRow){
      var scope = (armRow == null) ? box()
                : qa(".inrow").filter(function(r){ return r.querySelector("b").textContent === armRow; })[0];
      if(!scope) return null;
      var pads = [].slice.call(scope.querySelectorAll(".inpad"))
        .filter(function(d){ return d.querySelector(".lab").textContent === label; })[0];
      if(pads) return {kind:"pad", el:pads};
      var st = [].slice.call(scope.querySelectorAll(".instep"))
        .filter(function(d){ return d.querySelector(".sl").textContent === label; })[0];
      return st ? {kind:"step", el:st} : null;
    }
    function set(label, v, armRow){
      var f = field(label, armRow);
      if(!f) return "no " + label + " field";
      if(f.kind === "pad"){
        var b = [].slice.call(f.el.querySelectorAll("button"))
          .filter(function(x){ return x.getAttribute("data-v") === String(v); })[0];
        if(!b) return "no " + label + " button " + v;
        if(b.disabled) return label + " " + v + " is disabled";
        b.click(); return "ok";
      }
      /* Re-query the stepper on every click. draw() rebuilds the whole body, so
         the node we are holding is detached the moment we use it once - the same
         trap Convention 19 is about, in the fixture rather than the app. */
      var guard = 0;
      while(cur(label, armRow) < v && guard++ < 40){
        var up = field(label, armRow); if(!up) return label + " field vanished";
        up.el.querySelectorAll("button")[1].click();
      }
      while(cur(label, armRow) > v && guard++ < 40){
        var dn = field(label, armRow); if(!dn) return label + " field vanished";
        dn.el.querySelectorAll("button")[0].click();
      }
      return cur(label, armRow) === v ? "ok" : label + " stuck at " + cur(label, armRow);
    }
    function cur(label, armRow){
      var f = field(label, armRow);
      if(!f) return -1;
      if(f.kind === "step") return parseInt(f.el.querySelector(".v").textContent, 10);
      var on = f.el.querySelector("button.on");
      return on ? parseInt(on.getAttribute("data-v"), 10) : -1;
    }
    function capped(label, above, armRow){
      var f = field(label, armRow);
      if(!f) return "no field";
      if(f.kind === "pad"){
        var bad = [].slice.call(f.el.querySelectorAll("button")).filter(function(x){
          return parseInt(x.getAttribute("data-v"),10) > above && !x.disabled; });
        return bad.length ? "still live: " + bad.map(function(x){return x.textContent}).join(",") : "capped";
      }
      return f.el.querySelectorAll("button")[1].disabled ? "capped" : "plus still live";
    }
    /* The end-of-inning prompt opens on a deferred tick, so the handler that
       charted the third out can finish its own render and save first. A probe
       that fires it and reads it in one synchronous pass reads too early - this
       is the wait, and pg.evaluate resolves the promise for us. */
    function after(fn){ return new Promise(function(res){ setTimeout(function(){ res(fn()); }, 60); }); }
    function exported(){
      var b = q("#btnExport"); if(b) b.click();
      var t = q("#exportText");
      return t ? (t.value || "") : "";
    }
    /* Pull one tab-separated block out of the export by its header line, so a
       check can assert on the INNING LOG without matching the pitch rows too. */
    function block(title){
      var L = exported().split(/\\r?\\n/), out = [], on = false;
      for(var i=0;i<L.length;i++){
        if(!on){ if(L[i].indexOf(title) === 0) on = true; continue; }
        if(/^[A-Z][A-Z ]{3,}/.test(L[i]) && L[i].indexOf("\\t") < 0) break;
        if(L[i].indexOf("\\t") >= 0) out.push(L[i].split("\\t"));
      }
      return out;
    }
    return {q:q, qa:qa, arm:arm, addArm:addArm, pitch:pitch, res:res, next:next, ab:ab,
            outs:outs, outsOn:outsOn, inn:inn, box:box, head:head,
            ledger:ledger, summary:summary, set:set, cur:cur, capped:capped,
            field:field, exported:exported, block:block, after:after};
  })(); "ready"`;

  await sweep(b, "PITCH CHART · innings", "/game/index.html", [
    /* Inning 1: one arm, three strikeouts. Three at-bat outs, so computed IP is
       exactly 1.0 and anything else in the summary strip is arithmetic on it. */
    ["fixture builds inning 1", null,
      /* TWO outs, not three. In v21 charting the third would fire the prompt
         here, inside the fixture, instead of in the check that tests it. */
      '(function(){ __T.arm(0,0); __T.ab("K"); __T.ab("K");'+
      ' var L=__T.ledger();'+
      ' return (L.length===1 && L[0][0]==="1" && L[0][6]==="\\u2014") ? "yes"'+
      '      : JSON.stringify(L); })()',
      GINN, "yes"],
    /* The in-progress inning has no entry either, and must NOT nag. This is the
       distinction the first build got wrong: amber meant "no entry", which is
       true of the inning being charted right now. */
    ["the live inning is not amber", null,
      '(function(){ var t=__T.q("#innLedger").textContent;'+
      ' return (__T.qa("#innLedger tr.open").length===0 && t.indexOf("in amber")<0)'+
      '        ? "quiet" : "NAGGING"; })()',
      null, "quiet"],
    /* v21: CHARTING the third out is the trigger a charter actually uses. The
       dots are still a trigger too - "NO RUNS closes it in one tap" below gets
       to three by tapping - so both ways into the prompt stay covered. */
    ["third out fires the prompt", null,
      '(function(){ __T.ab("GO"); return __T.after(function(){'+
      '   return __T.box() ? "overlay" : "NOTHING OPENED"; }); })()',
      null, "overlay"],
    /* Convention 18: the playground sandbox has no allow-modals, so a native
       dialog would be a dead button there and work perfectly on the iPad. */
    ["the prompt is in-page, not native", null,
      '(function(){ var b=__T.box();'+
      ' return (b && b.className.indexOf("askbox")>=0 && b.closest(".askwrap"))'+
      '        ? "in-page" : "not an ask() overlay"; })()',
      null, "in-page"],
    ["one pitcher gets pads", null,
      '(function(){ var r=__T.field("Runs"), e=__T.field("Earned");'+
      ' return (r&&e&&r.kind==="pad"&&e.kind==="pad") ? "pads"'+
      '      : ("runs="+(r?r.kind:"none")+" earned="+(e?e.kind:"none")); })()',
      null, "pads"],
    ["earned pre-selects the runs", null,
      '(function(){ __T.set("Runs",2); return __T.cur("Earned")===2 ? "2"'+
      '      : "earned is "+__T.cur("Earned"); })()',
      null, "2"],
    ["earned cannot exceed runs", null,
      '__T.capped("Earned", 2)', null, "capped"],
    /* ---- THE ONE THAT MUST NEVER REGRESS ----
       A blocking overlay with no way out is a trap. The charter WILL tap to three
       outs by mistake, mid-correction. Back must restore two outs, leave the
       inning where it was, and write nothing - including nothing from the runs
       that were tapped in before the mis-tap was noticed. */
    ["Wrong — back to 2 outs", null,
      '(function(){ __T.q("#innBack").click();'+
      ' var L=__T.ledger();'+
      ' return [ __T.box() ? "overlay still up" : "closed",'+
      '          "outs=" + __T.outsOn(),'+
      '          "inn=" + __T.inn(),'+
      '          "R=" + (L[0]||[])[6] ].join(" "); })()',
      null, "closed outs=2 inn=1 R=—"],
    ["NO RUNS closes it in one tap", null,
      '(function(){ __T.outs(3);'+
      ' if(!__T.box()) return "the prompt did not come back";'+
      ' __T.q("#innNoRuns").click();'+
      ' var L=__T.ledger();'+
      ' return [ __T.box() ? "still up" : "closed", "R="+(L[0]||[])[6],'+
      '          "ER="+(L[0]||[])[7], "outs="+__T.outsOn(), "inn="+__T.inn()'+
      '        ].join(" "); })()',
      null, "closed R=0 ER=0 outs=0 inn=2"],
    /* Inning 2: the starter throws to one hitter, a reliever finishes it. The
       rows have to be BUILT from who actually threw, not chosen by anyone. */
    ["two pitchers get a row each", null,
      '(function(){ __T.ab("K");'+
      ' __T.addArm(); __T.arm(1,1); __T.ab("GO"); __T.ab("FO");'+
      /* the FO is the third out and opens the prompt by itself in v21 */
      ' return __T.after(function(){'+
      '   if(!__T.box()) return "no overlay";'+
      '   var names=__T.qa(".inrow b").map(function(x){ return x.textContent; });'+
      '   var want=[window.TITANS_ROSTER[0].name, window.TITANS_ROSTER[1].name];'+
      '   return names.join(",")===want.join(",") ? "both"'+
      '        : "rows: "+names.join(",")+" want "+want.join(","); }); })()',
      null, "both"],
    ["two pitchers get steppers", null,
      '(function(){ var n=window.TITANS_ROSTER[0].name;'+
      ' var f=__T.field("Runs", n);'+
      ' return (f && f.kind==="step") ? "steppers" : "got "+(f?f.kind:"nothing"); })()',
      null, "steppers"],
    /* The inning total is the SUM of the rows and nothing else - no input, no
       second place a number can be typed and disagree with itself. */
    ["the inning total is a read-out", null,
      '(function(){ var a=window.TITANS_ROSTER[0].name, c=window.TITANS_ROSTER[1].name;'+
      ' __T.set("Runs",1,a); __T.set("Earned",1,a);'+
      ' __T.set("Runs",2,c); __T.set("Earned",0,c);'+
      ' var t=__T.q(".intot").textContent;'+
      ' var inputs=__T.box().querySelectorAll(".intot input, .intot select").length;'+
      ' return (inputs===0 && /3 runs/.test(t) && /1 earned/.test(t)) ? "3/1"'+
      '      : t + " (" + inputs + " inputs)"; })()',
      null, "3/1"],
    ["per-arm earned cannot exceed runs", null,
      '(function(){ var a=window.TITANS_ROSTER[0].name;'+
      ' return __T.capped("Earned", 1, a); })()',
      null, "capped"],
    /* Confirming inning 2 is also the fixture for everything below it. */
    ["confirm files both lines", null,
      '(function(){ __T.q("#innOk").click();'+
      ' var a=window.TITANS_ROSTER[0].name, c=window.TITANS_ROSTER[1].name;'+
      ' var two=__T.ledger().filter(function(r){ return r[0]==="2"; });'+
      ' var got=two.map(function(r){ return r[1]+" "+r[6]+"/"+r[7]; }).join(" | ")'+
      '         + " inn=" + __T.inn();'+
      ' var want=a+" 1/1 | "+c+" 2/0 inn=3";'+
      ' return got===want ? "filed" : got+"  WANT  "+want; })()',
      null, "filed"],
    /* The book disagrees sometimes, and it disagrees AFTER the game. Tapping a
       ledger row re-opens that inning without touching the live count - and
       without stamping Partial on an inning that was never partial. */
    ["the ledger is editable after the fact", null,
      '(function(){ __T.qa("#innLedger tbody tr")[0].click();'+
      ' if(!__T.box()) return "row did not open";'+
      ' if(!/^Inning 1/.test(__T.head())) return "headed: "+__T.head();'+
      ' __T.set("Runs",1); __T.q("#innOk").click();'+
      ' var L=__T.ledger();'+
      ' return "R="+L[0][6]+" inn="+__T.inn()+" outs="+__T.outsOn(); })()',
      null, "R=1 inn=3 outs=0"],
    /* IP is outs/3 - the actual definition - so a double play has to count two.
       Inning 3: a DP from the reliever takes him from 0.2 to 1.1 innings. */
    ["DP counts two outs", null,
      '(function(){ var before=__T.summary().filter(function(r){'+
      '   return r[0]===window.TITANS_ROSTER[1].name; })[0][1];'+
      ' __T.ab("DP");'+
      ' var after=__T.summary().filter(function(r){'+
      '   return r[0]===window.TITANS_ROSTER[1].name; })[0][1];'+
      ' return before+" -> "+after; })()',
      null, "0.2 -> 1.1"],
    /* P/IP and the 7-inning ERA are computed off the same two numbers the strip
       already shows, so they cannot be allowed to drift from them. */
    ["the summary agrees with itself", null,
      '(function(){ var bad=[];'+
      ' __T.summary().forEach(function(r){'+
      '   var ip=parseInt(r[1].split(".")[0],10) + parseInt(r[1].split(".")[1],10)/3;'+
      '   var p=+r[2], er=+r[5];'+
      '   if(!ip) return;'+
      '   if(r[3] !== (p/ip).toFixed(1)) bad.push(r[0]+" P/IP "+r[3]+" want "+(p/ip).toFixed(1));'+
      '   if(r[6] !== (er*7/ip).toFixed(2)) bad.push(r[0]+" ERA "+r[6]+" want "+(er*7/ip).toFixed(2));'+
      ' });'+
      ' return bad.length ? bad.join(" ; ") : "agrees"; })()',
      null, "agrees"],
    ["the pitch log carries Inning", null,
      '(function(){ var rows=__T.block("PITCH LOG");'+
      ' if(!rows.length) return "no pitch log";'+
      ' if(rows[0][0] !== "Inning") return "first column is "+rows[0][0];'+
      ' var blank=rows.slice(1).filter(function(r){ return !r[0]; });'+
      ' return blank.length ? blank.length+" pitches with no inning" : "stamped"; })()',
      null, "stamped"],
    /* One row per inning x pitcher: inning totals are a sum of these rows and a
       pitcher's game line is a sum of these rows, so both pivots are trivial and
       neither is stored twice. Unearned is computed, never entered. */
    ["the INNING LOG is inning x pitcher", null,
      '(function(){ var rows=__T.block("INNING LOG");'+
      ' if(rows.length<2) return "no inning log";'+
      ' var h=rows[0], body=rows.slice(1);'+
      ' if(h[0]!=="Inning" || h.indexOf("PitcherID")<0 || h.indexOf("Unearned")<0)'+
      '   return "header: "+h.join(",");'+
      ' var keys={}, dup=0;'+
      ' body.forEach(function(r){ var k=r[0]+"|"+r[2]; if(keys[k]) dup++; keys[k]=1; });'+
      ' if(dup) return dup+" duplicate inning/pitcher rows";'+
      ' var ri=h.indexOf("Runs"), ei=h.indexOf("Earned"), ui=h.indexOf("Unearned");'+
      ' var idi=h.indexOf("PitcherID"), bad=[];'+
      ' body.forEach(function(r){'+
      '   if(!r[idi]) bad.push("inning "+r[0]+" "+r[2]+" has no PitcherID");'+
      '   if(r[ri]==="") return;'+
      '   if(+r[ui] !== (+r[ri] - +r[ei])) bad.push("inning "+r[0]+" unearned "+r[ui]); });'+
      /* One row per inning x pitcher: inning 1 is the starter alone, inning 2 is
         both arms, inning 3 is the reliever alone. Four rows, and the check says
         so rather than asserting a number somebody has to re-derive. */
      ' if(body.length !== 4) return body.length+" rows, wanted 4: "'+
      '   + body.map(function(r){ return r[0]+"/"+r[2]; }).join(" ");'+
      ' return bad.length ? bad.join(" ; ") : "inning x pitcher"; })()',
      null, "inning x pitcher"],
    /* Most games end mid-inning - walk-off, run rule, time limit - so the third
       out never comes and the last inning would never be asked about. Cancelling
       that prompt must leave the game unfiled: a half-filed game is worse. */
    ["Finish & file asks about the partial inning", null,
      '(function(){ var before=__T.qa("#histList .hrow").length;'+
      ' __T.q("#btnFinish").click();'+
      ' if(!__T.box()) return "no prompt";'+
      ' if(!/Final inning \\(partial\\)/.test(__T.head())) return "headed: "+__T.head();'+
      ' __T.q("#innBack").click();'+
      ' if(__T.box()) return "cancel did not close it";'+
      ' return (__T.qa("#histList .hrow").length === before) ? "asked, unfiled"'+
      '      : "IT FILED ANYWAY"; })()',
      null, "asked, unfiled"],
  ]);

  /* ====== THE OUT COUNT FOLLOWS THE RESULT PAD (game v21) ======
     Its own sweep() call and its own clean game, because these checks are about
     the out count itself and the innings block above spends it.

     Why this exists: through v20 the dots were tapped by hand and a charted
     strikeout moved nothing. Jim, first time through: the prompt "doesn't seem
     to work" - he charted three outs and nothing happened, which is
     indistinguishable from broken. Auto-advance on all nine out results was his
     call, knowing two of them can be worth zero (a dropped third strike and an
     all-safe FC) and are corrected on the dots. */
  await sweep(b, "PITCH CHART · outs follow the result pad", "/game/index.html", [
    ["an out result moves the dots", null,
      '(function(){ __T.arm(0,0); __T.ab("K"); return "outs=" + __T.outsOn(); })()',
      GINN, "outs=1"],
    ["a hit moves nothing", null,
      '(function(){ __T.ab("1B"); return "outs=" + __T.outsOn(); })()',
      null, "outs=1"],
    /* DP is worth two, and that number now lives in ONE place - OUT_RESULT - so
       the dots, the inning ledger and computed IP cannot disagree about it. It
       used to be a ternary at each call site, with the map itself saying 1. */
    ["a double play is worth two", null,
      '(function(){ var mid=__T.outsOn(); __T.ab("DP");'+
      ' return mid + " + DP = " + __T.outsOn(); })()',
      null, "1 + DP = 3"],
    ["reaching three that way fires the prompt", null,
      '(function(){ return __T.box() ? "overlay" : "NOTHING"; })()',
      null, "overlay"],
    ["the ledger agrees with the dots", null,
      '(function(){ __T.q("#innNoRuns").click();'+
      ' var r=__T.ledger()[0];'+
      ' return "P=" + r[2] + " outs=" + __T.outsOn() + " inn=" + __T.inn(); })()',
      null, "P=9 outs=0 inn=2"],
    /* Undo is the other half of auto-advance: taking the result back has to take
       the out back off the board, or a corrected mis-tap leaves a phantom out. */
    ["undo takes the out back off", null,
      '(function(){ __T.pitch(); __T.pitch(); __T.pitch(); __T.res("GO");'+
      ' var after=__T.outsOn(); __T.q("#btnUndo").click();'+
      ' return after + " then " + __T.outsOn(); })()',
      null, "1 then 0"],
    /* A mis-tap corrected to another result moves by the DIFFERENCE. This is the
       whole reason it is a delta and not an increment: tapping GO, then 1B, then
       FO must end on one out, not three. */
    ["changing the result moves by the difference", null,
      '(function(){ __T.res("GO"); var a=__T.outsOn();'+
      ' __T.res("1B"); var b2=__T.outsOn(); __T.res("FO");'+
      ' return a + " -> " + b2 + " -> " + __T.outsOn(); })()',
      null, "1 -> 0 -> 1"],
    ["the dots still override by hand", null,
      '(function(){ __T.qa("#outs .outdot")[0].click();'+
      ' return "outs=" + __T.outsOn(); })()',
      null, "outs=0"],
    /* ---- THE PROMPT WAITS FOR THE REST OF THE AT-BAT ----
       The bug v21 shipped with for about an hour: tapping GO for the third out
       opened the overlay immediately, on top of the spray chart the charter
       still had to tap. Jim: "it advances to the pop-up before I am able to
       enter in the spray chart." A batted ball is not finished when the result
       is tapped - the spray point and the trajectory come after it - so the
       inning now ends at Next Batter. */
    /* Three batted-ball outs, and the THIRD one must not open anything: the spray
       chart and the trajectory are still to be tapped on that at-bat. */
    ["a third out on a batted ball waits", null,
      '(function(){'+
      ' __T.next(); __T.pitch(); __T.pitch(); __T.res("GO");'+
      ' __T.next(); __T.pitch(); __T.pitch(); __T.res("FO");'+
      ' __T.next(); __T.pitch(); __T.pitch(); __T.res("LO");'+
      /* WAIT a tick before asserting the absence. The first version read the
         overlay synchronously and stayed green when the trigger was put back on
         the result tap, because that fires on a deferred tick - it was asserting
         "not yet" and calling it "never". Proving a NEGATIVE needs the wait more
         than proving a positive does. */
      ' return __T.after(function(){'+
      '   return "outs=" + __T.outsOn()'+
      '        + (__T.box() ? " OVERLAY TOO EARLY" : " no overlay")'+
      '        + (__T.q("#diamond") ? " spray reachable" : " spray gone"); }); })()',
      null, "outs=3 no overlay spray reachable"],
    ["and opens on Next Batter", null,
      '(function(){ __T.next();'+
      ' return __T.box() ? "overlay" : "NEVER OPENED"; })()',
      null, "overlay"],
    ["dismissing it leaves two outs", null,
      '(function(){ __T.q("#innBack").click();'+
      ' return "outs=" + __T.outsOn() + " inn=" + __T.inn(); })()',
      null, "outs=2 inn=2"],

    /* The correction a dropped third strike actually needs: the K counted an out,
       the batter reached, and one tap on the dots puts it right - without
       reopening the at-bat or losing the strikeout from the pitcher's line. */
    /* Stated as a DELTA, not as absolute counts: this check inherits whatever the
       checks above it left on the dots, and an absolute number here would only be
       testing the fixture. */
    ["a dropped third strike is one tap to fix", null,
      '(function(){ __T.next(); __T.pitch(); __T.pitch(); __T.pitch(); __T.res("K");'+
      ' var before=__T.outsOn();'+
      /* tapping the dot that already IS the count takes it back one */
      ' __T.qa("#outs .outdot")[before-1].click();'+
      ' var after=__T.outsOn();'+
      ' var still=__T.summary().filter(function(r){ return +r[2] > 0; }).length;'+
      ' return "K put on 1, tap took off "+(before-after)+", pitcherRows="+still; })()',
      null, "K put on 1, tap took off 1, pitcherRows=1"],
    /* ---- AO3+ KEEPS THE OUT, AND THAT IS A DECISION, NOT A BUG ----
       Jim: "I'm ok with crediting an AO3+ out there. The pitcher did their job."
       The dot above was just tapped back off, so the INNING has no out - and the
       pitcher must still hold the ++. The two numbers answer different questions
       and are not meant to reconcile; this check is here so that nobody "fixes"
       the disagreement later without first changing that call. */
    /* Asserts the INVARIANT, not a running total: the ++ count is cumulative for
       the pitcher, so the thing to prove is that taking the inning's out back
       does not move it. A raw number here would only be testing the fixture. */
    ["AO3+ keeps the out the inning gave back", null,
      /* Reads ++ BEFORE the strikeout as well as after. The first version only
         compared across the dot tap, which is unchanged whether or not a K is
         credited - true, but not the thing the check is named after, and it
         stayed green through the exact mutation it exists to stop. */
      '(function(){'+
      ' function pp(){ var e=document.querySelector("#ao3pp b"); return e ? +e.textContent : -1; }'+
      ' var start=pp();'+
      ' __T.next(); __T.pitch(); __T.pitch(); __T.pitch(); __T.res("K");'+
      ' var scored=pp(), o1=__T.outsOn();'+
      ' __T.qa("#outs .outdot")[o1-1].click();'+     /* hand the inning its out back */
      ' var after=pp(), o2=__T.outsOn();'+
      ' return "K scored " + (scored - start) + " plusplus"'+
      '      + ", kept " + (after - start)'+
      '      + ", outs gave back " + (o1 - o2); })()',
      null, "K scored 1 plusplus, kept 1, outs gave back 1"],
  ]);

  /* ====== ONE JERSEY, ONE POSITION (game v23) ======
     Jim: "you can enter multiple players with the same number in the starting
     lineup; that isn't allowed, also, we need to make the position a dropdown
     (also unique values)."

     And then the shape of the rule, which is the whole design: "This can really
     only happen in the situation of a sub entering with the same number, so I
     guess we need to refuse but allow override." So this is NOT a validator. It
     is a speed bump - the first attempt is put back and named, the second goes
     through, and both spots then wear amber so the scorer can see what he
     agreed to. A suite that only proved "duplicates are refused" would be
     testing half of it, and the half Jim did not ask for. */
  const GLINE = `window.__L = (function(){
    function q(s){ return document.querySelector(s); }
    function qa(s){ return [].slice.call(document.querySelectorAll(s)); }
    function done(){ var b=q("#suDone"); if(b) b.click(); }
    function fld(i, key){
      var tr = qa("#suRows tr")[i];
      return tr ? tr.querySelector('[data-su="'+key+'"]') : null;
    }
    /* focus, then input, then change - in that order, because the app hangs
       three different things off them. focus is how the field remembers what to
       put back; input is what SAVES the value; change is what checks it against
       the other eight spots. A fixture that fired only change wrote into a field
       the app never read, so every spot stayed blank and nothing collided with
       anything - eight green checks proving the fixture, which is how this one
       first came out. */
    function put(i, key, v){
      var f = fld(i, key); if(!f) return "no spot " + i;
      f.dispatchEvent(new Event("focus"));
      f.value = v;
      f.dispatchEvent(new Event("input",{bubbles:true}));
      f.dispatchEvent(new Event("change",{bubbles:true}));
      return "ok";
    }
    /* re-read FRESH: renderSetup() rebuilds the row on every one of these, so
       the node we just wrote to is detached (Convention 19). */
    function val(i, key){ var f = fld(i, key); return f ? f.value : "∅"; }
    function warn(){ var w=q("#suWarn"); return w ? w.textContent : "∅"; }
    function flags(){ return qa("#suRows .dup").length; }
    /* value AND label. The value is what gets stored and exported; the label is
       the only thing the scorer actually sees, and the first version of this
       check read values alone - so a mutation that relabelled the picker
       "1B/2B/3B" sailed through the check whose whole job is Jim's choice of
       encoding. */
    function opts(){
      var s = fld(0,"pos"); if(!s) return "no picker";
      return s.tagName + ":" + [].slice.call(s.options).map(function(o){
        return o.value + "=" + o.textContent; }).join(",");
    }
    function arm(chip, nth){
      var s = chip ? q('#pitchers select[data-pick="' + chip + '"]') : q("#suPitcher");   /* v30 */
      if(!s) return "no chip " + chip;
      s.value = window.TITANS_ROSTER[nth].id;
      s.dispatchEvent(new Event("change",{bubbles:true}));
      return "ok";
    }
    function pitch(){ q('#zone .cell:nth-child(13)').click(); }
    function res(k){ var b = q('#results button[data-res="' + k + '"]'); if(b) b.click(); }
    function logRow(){
      var b = q("#btnExport"); if(b) b.click();
      var t = q("#exportText"), L = (t ? (t.value||"") : "").split(/\\r?\\n/);
      for(var i=0;i<L.length;i++){
        if(L[i].indexOf("PITCH LOG") !== 0) continue;
        for(var j=i+1;j<L.length;j++){
          if(L[j].indexOf("\\t") < 0) continue;
          if(L[j].indexOf("Inning\\tSpot") === 0) continue;   /* the header */
          return L[j].split("\\t");
        }
      }
      return [];
    }
    return {q:q, qa:qa, done:done, put:put, val:val, warn:warn, flags:flags,
            opts:opts, arm:arm, pitch:pitch, res:res, logRow:logRow};
  })(); document.getElementById("tab-setup").click();
  /* v29: pickLevel finished Setup with a jersey in every spot; these checks are
     about the jersey rule, so they start from blank numbers again (the game has
     no pitch yet, so nothing is lost). */
  for(var __i=0; __i<9; __i++) __L.put(__i, "jersey", ""); "ready"`;

  await sweep(b, "PITCH CHART · one jersey, one position", "/game/index.html", [
    /* Numbers, not 1B/2B/3B. Those three are already AT-BAT RESULTS on the pad
       two inches away, and this app has been bitten by a shared namespace
       before. The scorecard number is what every other baseball tool means by
       "position" anyway, and the picker spells the abbreviation out beside it. */
    ["the position is a picker", null, '__L.opts()',
      GLINE,
      "SELECT:=—,1=1 · P,2=2 · C,3=3 · 1B,4=4 · 2B,5=5 · 3B," +
      "6=6 · SS,7=7 · LF,8=8 · CF,9=9 · RF,DH=DH"],
    /* The refusal has to NAME the spot. "Already used" would send the scorer
       hunting through nine rows mid-inning; this is the one moment the app
       knows exactly where the other one is. */
    ["a taken jersey is put back, and named", null,
      '(function(){ __L.put(0,"jersey","12"); __L.put(3,"jersey","12");'+
      ' return JSON.stringify(__L.val(3,"jersey")) + " | " + __L.warn(); })()',
      null,
      '"" | #12 is already on spot 1 — enter it again to keep it.'],
    /* The override, which is the half Jim asked for: a sub really does come in
       wearing a number already on the card, and the app must not be the thing
       standing in the way of charting him. */
    ["entering it again keeps it, and flags both", null,
      '(function(){ __L.put(3,"jersey","12");'+
      ' return JSON.stringify(__L.val(3,"jersey")) + " | flags=" + __L.flags(); })()',
      null, '"12" | flags=2'],
    /* Nine empty jersey cells are the normal state of a fresh card, so blank
       must never collide with blank - otherwise the rule fires on the first
       thing a scorer does. */
    /* Watches the WARNING, not the flags. The first version read the flag count,
       which is computed by markDups() - a different function from the one that
       decides a refusal - so pulling the blank guard out of dupSpot left the app
       scolding a scorer for clearing an empty cell and the check stayed green. */
    ["two blanks are not a duplicate", null,
      '(function(){ var before = __L.warn();'+
      ' __L.put(5,"jersey",""); __L.put(6,"jersey","");'+
      ' return "flags=" + __L.flags() +'+
      '   (__L.warn() === before ? " quiet" : " SCOLDED: " + __L.warn()); })()',
      null, "flags=2 quiet"],
    ["a taken position is put back, and named", null,
      '(function(){ __L.put(0,"pos","6"); __L.put(1,"pos","6");'+
      ' return JSON.stringify(__L.val(1,"pos")) + " | " + __L.warn(); })()',
      null,
      '"" | SS is already on spot 1 — enter it again to keep it.'],
    /* Overridable too, and for the same reason: a double switch puts two men at
       one spot on the card for as long as it takes to write the second one down. */
    ["a position overrides the same way", null,
      '(function(){ __L.put(1,"pos","6");'+
      ' return JSON.stringify(__L.val(1,"pos")) + " | flags=" + __L.flags(); })()',
      null, '"6" | flags=4'],
    /* On the charting screen the position is a read-out. A <select> in that row
       would sit on top of the batter selector and eat the tap that picks the
       hitter - the row is the control. */
    ["the lineup shows it, read-only", null,
      FILL_SETUP + ';(function(){ __L.done();'+
      ' var r = __L.qa("#lineup .slot-posr");'+
      ' return r.length + " readouts, " + __L.qa("#lineup select").length + " selects, first=" +'+
      '   (r[0] ? r[0].textContent : "∅"); })()',
      null, "9 readouts, 0 selects, first=SS"],
    /* Both columns, because they answer different questions: Pos is the join key
       a pivot groups on, PosName is what a human reads in the cell. */
    ["the export carries Pos and PosName", null,
      '(function(){ __L.arm(0,0); __L.pitch(); __L.res("K");'+
      ' var r = __L.logRow();'+
      ' return r.length ? ("spot=" + r[1] + " Pos=" + r[4] + " PosName=" + r[5])'+
      '                 : "NO PITCH ROW"; })()',
      null, "spot=1 Pos=6 PosName=SS"],
  ]);

  /* ====== ERASE EVERYTHING ON THIS IPAD (all three apps) ======
     The only control in any of them that destroys FILED records, so it gets its
     own page per app and is driven to the point of the confirm WITHOUT tapping
     it - the dialog's wording is the product here, and a check that actually
     erased would also be testing Playwright's storage rather than the app.

     The one thing that IS exercised for real is the key list: it must clear this
     app's own keys and leave the shared roster key and the other apps' data
     alone. That is done directly against localStorage, which is what the handler
     does too. */
  for (const app of [
    { name:"BULLPEN CHART", path:"/bullpen/index.html", noun:"session",
      archive:"titans-bullpen-archive-v1",
      mine:["titans-bullpen-v1","titans-bullpen-archive-v1"] },
    { name:"OFFENSE CHART", path:"/offense/index.html", noun:"game",
      archive:"titans-offense-archive-v1",
      mine:["titans-offense-v1","titans-offense-archive-v1","titans-offense-lineup-v1"] },
    { name:"PITCH CHART",   path:"/game/index.html",    noun:"game",
      archive:"dugout-pitch-chart-archive-v1",
      mine:["dugout-pitch-chart-v2","dugout-pitch-chart-archive-v1"] },
  ]) {
    await sweep(b, app.name + " · erase everything", app.path, [
      ["the control is there", null,
        '(function(){ var b=document.getElementById("btnWipe");'+
        ' return b ? b.textContent.trim() : "MISSING"; })()',
        null, "Erase everything on this iPad"],
      /* Convention 18: a native dialog would be a dead button in the playground. */
      ["it warns through ask(), not a native dialog", null,
        '(function(){ document.getElementById("btnWipe").click();'+
        ' var w=document.querySelector(".askwrap .askbox");'+
        ' return w ? "overlay" : "NOTHING OPENED"; })()',
        null, "overlay"],
      ["the warning names what goes", null,
        '(function(){ var t=document.querySelector(".askwrap .askbox p").textContent;'+
        ' var want=["Erase everything on this iPad?","History","Gone for good",'+
        '           "roster is not affected"];'+
        ' var miss=want.filter(function(w){ return t.indexOf(w)<0; });'+
        ' return miss.length ? "missing: "+miss.join(" | ") : "says it all"; })()',
        null, "says it all"],
      /* The key list, exercised for real against localStorage - the same thing
         the handler does - rather than by tapping Confirm and reloading. */
      ["the roster key and the other apps survive", null,
        '(function(){'+
        /* seed a shared roster and one key belonging to each OTHER app */
        '  localStorage.setItem("titans-roster-v1","ROSTER");'+
        '  localStorage.setItem("titans-bullpen-archive-v1","B");'+
        '  localStorage.setItem("titans-offense-archive-v1","O");'+
        '  localStorage.setItem("dugout-pitch-chart-archive-v1","G");'+
        '  var mine=' + JSON.stringify(app.mine) + ';'+
        '  mine.forEach(function(k){ try{ localStorage.removeItem(k); }catch(e){} });'+
        '  var survivors=["titans-roster-v1","titans-bullpen-archive-v1",'+
        '                 "titans-offense-archive-v1","dugout-pitch-chart-archive-v1"]'+
        '    .filter(function(k){ return mine.indexOf(k)<0 && localStorage.getItem(k)===null; });'+
        '  var left=mine.filter(function(k){ return localStorage.getItem(k)!==null; });'+
        '  if(left.length) return "not cleared: "+left.join(",");'+
        '  return survivors.length ? "WIPED TOO: "+survivors.join(",") : "roster and siblings intact"; })()',
        null, "roster and siblings intact"],
      /* WIPE_KEYS is the list the handler actually uses. Read it off the source
         so the check cannot drift from the code it is about - two of the three
         apps wrap everything in an IIFE, so it is not reachable as a variable. */
      ["WIPE_KEYS matches this app, and holds no roster key", null,
        '(function(){'+
        '  var m=document.documentElement.innerHTML.match(/var WIPE_KEYS = (\\[[^\\]]*\\])/);'+
        '  if(!m) return "no WIPE_KEYS";'+
        '  var got=JSON.parse(m[1].replace(/\x27/g,\'"\'));'+
        '  var want=' + JSON.stringify(app.mine) + ';'+
        '  if(got.join(",")!==want.join(",")) return "got "+got.join(",");'+
        '  return got.some(function(k){ return /roster/.test(k); })'+
        '       ? "A ROSTER KEY IS IN THE LIST" : "exact"; })()',
        null, "exact"],
      /* ---- THE SWITCH ----
         Jim: "Make this a feature that is easily turned on and off for testing
         purposes. It will NOT exist once we get to the real charting." So the
         flag has to be one line, findable, and OFF has to mean gone from the
         page rather than merely hidden - a destructive control that is only
         display:none is still a tap target and still a node in the DOM. */
      ["ALLOW_WIPE is one findable line", null,
        '(function(){'+
        '  var m=document.documentElement.innerHTML.match(/var ALLOW_WIPE = (true|false);/g);'+
        '  return m ? (m.length===1 ? "one flag" : m.length+" of them") : "NO FLAG"; })()',
        null, "one flag"],
      ["it sits against BUILD, where releases look", null,
        '(function(){'+
        '  var src=document.documentElement.innerHTML;'+
        '  var f=src.indexOf("var ALLOW_WIPE"), b=src.indexOf("var BUILD =");'+
        '  if(f<0||b<0) return "missing";'+
        '  return (b>f && b-f < 1400) ? "adjacent" : "far apart ("+(b-f)+" chars)"; })()',
        null, "adjacent"],

    ], { wipeOn: true });
  }

  await wipeWarning(b);
  await wipeOff(b);

  await migration(b);

  await b.close();
  console.log("\n" + checks + " controls checked");
  console.log(fails ? "FAILURES: " + fails : "ALL CONTROLS LIVE");
  process.exit(fails ? 1 : 0);
})();
