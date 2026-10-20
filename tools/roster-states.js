/* The roster has three states on an iPad, and the app has to be honest about
   which one it is in. Run alongside sweep.js before every ship:
       cd titans-apps && python3 -m http.server 8807 &
       node tools/roster-states.js
   Exits non-zero on any failure.

   Both checks here have been proved to fail: reinstating saveRoster() in the
   release path turns "NOT written to local storage" red, and reverting moundOpts
   to its old !p.rid test turns "his name is STILL on the slot" red - with the
   slot reading "- pick a pitcher -", which is a coach losing track of whose
   pitches those are, mid-session. The sweep covers the happy path; this covers the other two,
   plus the case that actually loses data if it is wrong: a pitcher charted against
   a player who is no longer in the release.

   roster.js is intercepted, so each state is a real page load of the real file. */
const { chromium } = require("playwright");
const { FILL_SETUP } = require("./game-ready.js");
const BASE = process.env.BASE || "http://localhost:8807";
let fail = 0;
function is(n,g,w){ const ok=String(g)===String(w);
  console.log((ok?"  ok   ":"  FAIL ")+n.padEnd(46)+JSON.stringify(g)+(ok?"":"  (want "+JSON.stringify(w)+")"));
  if(!ok) fail++; }

const RELEASED = `window.TITANS_ROSTER_STAMP = "2026-03-01";
window.TITANS_ROSTER = [
  {id:"rel0001", name:"Zeb Released", cls:"Sr", throws:"R", bats:"L", jersey:"9"},
  {id:"rel0002", name:"Zoe Second",   cls:"Fr", throws:"L", bats:"L", jersey:""}
];
`;
/* What the repo ships before the first real release: a placeholder that flags
   itself. It WORKS, which is the danger - nothing else would stop a coach charting
   a whole session against IDs that join up with nothing. */
const SAMPLE = `window.TITANS_ROSTER_SAMPLE = true;
window.TITANS_ROSTER_STAMP = "sample";
window.TITANS_ROSTER = [
  {id:"sample1", name:"Sample Senior", cls:"Sr", throws:"R", bats:"L", jersey:""}
];
`;
/* The same release with Zeb taken off it - what happens to a session that was
   charted while he was still on. */
const WITHOUT_ZEB = `window.TITANS_ROSTER_STAMP = "2026-04-01";
window.TITANS_ROSTER = [
  {id:"rel0002", name:"Zoe Second", cls:"Fr", throws:"L", bats:"L", jersey:""}
];
`;

async function page(b, app, body){
  /* serviceWorkers blocked so an install never serves a cached roster.js over the
     intercepted one - that would make every result here meaningless. */
  const ctx = await b.newContext({ viewport:{width:1280,height:1200}, serviceWorkers:"block" });
  await ctx.route("**/roster.js", r => {
    if(body === null) return r.fulfill({ status:404, body:"not here" });
    r.fulfill({ status:200, contentType:"application/javascript", body });
  });
  const pg = await ctx.newPage();
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(BASE + app, { waitUntil:"load" });
  await pg.waitForTimeout(1200);
  pg.__errs = errs;
  return pg;
}
const banner = sel => `(function(){ var b=document.getElementById(${JSON.stringify(sel)});
  return b ? b.className+" :: "+b.textContent.replace(/\\s+/g," ").trim().slice(0,70) : "NO BANNER"; })()`;
/* Untruncated. Some of what a banner must say sits past the 70 chars above, and a
   check reading the truncated version passes for the wrong reason. */
const bannerFull = sel => `(function(){ var b=document.getElementById(${JSON.stringify(sel)});
  return b ? b.textContent.replace(/\\s+/g," ").trim() : ""; })()`;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    /* The shipped bullpen carries the REAL receiver URL. No test may ever reach it:
       Google's script hosts do not resolve inside this browser. */
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });

  /* Both apps draw the roster panel when its screen is opened, not at boot. */
  const OPEN = {
    "/bullpen/index.html": 'document.getElementById("tab-setup").click();',
    "/offense/index.html": 'showTab("setup");'
  };
  for (const [app, path, sel, rows, store] of [
        ["BULLPEN", "/bullpen/index.html", "rosSrc", "#teamTbl tbody tr", "titans-roster-v1"],
        ["OFFENSE", "/offense/index.html", "rosSrc", "#rosRows .rosrow",  "titans-roster-v1"]]) {

    console.log("\n" + app + " — roster.js is there");
    let pg = await page(b, path, RELEASED);
    let ev = js => pg.evaluate(js);
    await ev(OPEN[path]); await pg.waitForTimeout(350);
    is("reads the released file", await ev('window.TITANS_ROSTER.length'), 2);
    is("  banner is green", /^rossrc ok|^flag ok/.test(await ev(banner(sel))), true);
    is("  names the release date", /2026-03-01/.test(await ev(banner(sel))), true);
    is("  both players rendered", await ev(`document.querySelectorAll(${JSON.stringify(rows)}).length`), 2);
    /* The released roster must NOT be copied into local storage. If it were, a
       later build shipped without roster.js would serve a frozen old release and
       look exactly like a current one. */
    is("  NOT written to local storage", await ev(`localStorage.getItem(${JSON.stringify(store)})`), null);
    /* The sweep can only see the sample roster, which auto-expands on purpose, so
       the green-and-collapsed case is asserted here where a real release is driven.
       This is the normal state on every iPad all winter. */
    is("  the list is COLLAPSED on a good roster", await ev(
       '(function(){ var b=document.getElementById("rosBody");'+
       ' return b ? (b.hidden ? "collapsed" : "SHOWING") : "no collapsible body"; })()'), "collapsed");
    is("  but the banner is still visible", await ev(
       '(function(){ var s=document.getElementById("rosSrc");'+
       ' if(!s) return "no banner";'+
       ' var r=s.getBoundingClientRect();'+
       ' return (r.width>0 && r.height>0) ? "visible" : "hidden too"; })()'), "visible");
    is("  and one tap shows the players", await ev(
       `(function(){ document.getElementById("rosToggle").click();
          return document.querySelectorAll(${JSON.stringify(rows)}).length; })()`), 2);
    is("  no page errors", pg.__errs.join("|"), "");
    await pg.context().close();

    console.log("\n" + app + " — roster.js is the shipped SAMPLE");
    pg = await page(b, path, SAMPLE); ev = js => pg.evaluate(js);
    await ev(OPEN[path]); await pg.waitForTimeout(350);
    is("the sample loads", await ev('window.TITANS_ROSTER.length'), 1);
    is("  banner is RED, not green", /rossrc bad|flag bad/.test(await ev(banner(sel))), true);
    is("  says it is a sample", /SAMPLE roster/.test(await ev(banner(sel))), true);
    is("  tells them not to chart it", /[Dd]o not chart/.test(await ev(bannerFull(sel))), true);
    is("  no page errors", pg.__errs.join("|"), "");
    await pg.context().close();

    console.log("\n" + app + " — roster.js is missing");
    pg = await page(b, path, null); ev = js => pg.evaluate(js);
    await ev(OPEN[path]); await pg.waitForTimeout(350);
    is("app still loads", await ev('document.readyState'), "complete");
    is("  banner says no roster", /^rossrc bad|^flag bad/.test(await ev(banner(sel))), true);
    is("  and says so in words", /No roster/.test(await ev(banner(sel))), true);
    is("  no page errors", pg.__errs.join("|"), "");
    await pg.context().close();

    console.log("\n" + app + " — roster.js missing, something typed in before");
    pg = await page(b, path, null); ev = js => pg.evaluate(js);
    await ev(`localStorage.setItem(${JSON.stringify(store)}, JSON.stringify(
      [{id:"loc001", name:"Zed Local", cls:"Jr", throws:"R", bats:"R", jersey:""}]));`);
    await pg.reload({ waitUntil:"load" }); await pg.waitForTimeout(1100);
    await ev(OPEN[path]); await pg.waitForTimeout(350);
    is("the local list is still shown", await ev(`document.querySelectorAll(${JSON.stringify(rows)}).length`), 1);
    is("  banner warns in amber", /^rossrc warn|^flag warn/.test(await ev(banner(sel))), true);
    is("  and calls it leftover", /[Ll]eftover local/.test(await ev(banner(sel))), true);
    await pg.context().close();
  }

  /* The Pitch Chart has no roster TABLE - just the banner on the Setup screen and
     the pickers on the mound chips - so it gets its own block rather than a fifth
     parameter on the loop above. Same four states, same four colours. */
  {
    const open = 'document.getElementById("tab-setup").click();';
    const opts = '(function(){ var s=document.querySelector(\'#pitchers select[data-pick]\');'+
      ' if(!s) return "no picker";'+
      ' var n=0; for(var i=0;i<s.options.length;i++) if(s.options[i].value) n++;'+
      ' return n; })()';

    console.log("\nGAME — roster.js is there");
    let pg = await page(b, "/game/index.html", RELEASED);
    let ev = js => pg.evaluate(js);
    is("reads the released file", await ev('window.TITANS_ROSTER.length'), 2);
    is("  both arms are on the picker", await ev(opts), 2);
    await ev(open); await pg.waitForTimeout(300);
    is("  banner is green", /^rossrc ok/.test(await ev(banner("rosSrc"))), true);
    is("  names the release date", /2026-03-01/.test(await ev(banner("rosSrc"))), true);
    /* Same rule as the other two: a release is never copied into local storage, or
       a later build shipped without roster.js serves a frozen one and looks current. */
    is("  NOT written to local storage", await ev('localStorage.getItem("titans-roster-v1")'), null);
    is("  no page errors", pg.__errs.join("|"), "");
    await pg.context().close();

    console.log("\nGAME — roster.js is the shipped SAMPLE");
    pg = await page(b, "/game/index.html", SAMPLE); ev = js => pg.evaluate(js);
    await ev(open); await pg.waitForTimeout(300);
    is("the sample loads", await ev('window.TITANS_ROSTER.length'), 1);
    is("  banner is RED, not green", /rossrc bad/.test(await ev(banner("rosSrc"))), true);
    is("  says it is a sample", /SAMPLE roster/.test(await ev(banner("rosSrc"))), true);
    is("  tells them not to chart it", /[Dd]o not chart/.test(await ev(bannerFull("rosSrc"))), true);
    is("  no page errors", pg.__errs.join("|"), "");
    await pg.context().close();

    /* Roster-only was Jim's call, which means no roster is now no pitcher at all -
       there is no text field to fall back on. The banner has to say that much. */
    console.log("\nGAME — roster.js is missing");
    pg = await page(b, "/game/index.html", null); ev = js => pg.evaluate(js);
    is("app still loads", await ev('document.readyState'), "complete");
    is("  the picker is empty", await ev(opts), 0);
    await ev(open); await pg.waitForTimeout(300);
    is("  banner says no roster", /^rossrc bad/.test(await ev(banner("rosSrc"))), true);
    is("  and says there is nobody to pitch", /[Nn]obody to put on the mound/.test(await ev(bannerFull("rosSrc"))), true);
    is("  no page errors", pg.__errs.join("|"), "");
    await pg.context().close();

    console.log("\nGAME — roster.js missing, another app left a list on this iPad");
    pg = await page(b, "/game/index.html", null); ev = js => pg.evaluate(js);
    await ev(`localStorage.setItem("titans-roster-v1", JSON.stringify(
      [{id:"loc001", last:"Local", first:"Zed", cls:"Jr", throws:"R", bats:"R", jersey:""}]));`);
    await pg.reload({ waitUntil:"load" }); await pg.waitForTimeout(1100);
    is("the leftover arm is offered", await ev(opts), 1);
    await ev(open); await pg.waitForTimeout(300);
    is("  banner warns in amber", /^rossrc warn/.test(await ev(banner("rosSrc"))), true);
    is("  and calls it leftover", /[Ll]eftover roster/.test(await ev(banner("rosSrc"))), true);
    is("  no page errors", pg.__errs.join("|"), "");
    await pg.context().close();

    /* The data-losing case, Pitch Chart edition: pitches charted against an arm who
       is off the next release. His name stays on the chip; the pitches stay his. */
    console.log("\nGAME — a pitcher dropped from a later release");
    pg = await page(b, "/game/index.html", RELEASED); ev = js => pg.evaluate(js);
    await ev(`(function(){ var s=document.querySelector('#pitchers select[data-pick]');
      s.value="rel0001"; s.dispatchEvent(new Event("change",{bubbles:true})); })()`);
    await pg.waitForTimeout(300);
    /* v25: charting is locked until the game's level is picked - pick it the way a
       charter would, then return to charting. */
    await ev(`(function(){ document.querySelector('[data-lvl="Varsity"]').click(); })()`);
    await ev(FILL_SETUP);   /* v29: the rest of Setup too */
    await ev('document.getElementById("tab-chart").click()');
    await pg.waitForTimeout(200);
    await ev('(function(){ var z=document.querySelectorAll("#zone button"); z[4].click(); z[12].click(); })()');
    await pg.waitForTimeout(400);
    const gsaved = await ev('localStorage.getItem("dugout-pitch-chart-v2")');
    is("two pitches charted", await ev('(document.getElementById("sPitches")||{}).textContent||"none"'), "2");
    is("  stored against his ID", /rel0001/.test(String(gsaved)), true);

    const gctx = await b.newContext({ viewport:{width:1280,height:1200}, serviceWorkers:"block" });
    await gctx.route("**/roster.js", r => r.fulfill({ status:200, contentType:"application/javascript", body:WITHOUT_ZEB }));
    pg = await gctx.newPage();
    const gerrs = []; pg.on("pageerror", e => gerrs.push(String(e)));
    await pg.goto(BASE + "/game/index.html", { waitUntil:"load" });
    await pg.waitForTimeout(600);
    ev = js => pg.evaluate(js);
    await ev(`localStorage.setItem("dugout-pitch-chart-v2", ${JSON.stringify(gsaved)});`);
    await pg.reload({ waitUntil:"load" }); await pg.waitForTimeout(1200);
    is("he is off the new release", await ev('window.TITANS_ROSTER.length'), 1);
    is("  his name is STILL on the chip", await ev(
       '(function(){ var s=document.querySelector(\'#pitchers select[data-pick]\');'+
       ' return s ? s.options[s.selectedIndex].text.replace(/\\s+/g," ").trim() : "no picker"; })()'),
       "Zeb Released (not on the roster)");
    is("  his pitches are still there", await ev(
       '(document.getElementById("sPitches")||{}).textContent||"none"'), "2");
    /* And the export still carries the ID, so the session joins up with the bullpen
       work he did while he WAS on the roster. */
    is("  the export still has his ID", await ev(
       '(function(){ var b=document.getElementById("btnExport"); if(b) b.click();'+
       ' var t=document.getElementById("exportText");'+
       ' return (t && (t.value||"").indexOf("rel0001")>=0) ? "yes" : "GONE"; })()'), "yes");
    is("  no page errors", gerrs.join("|"), "");
    await gctx.close();
  }

  /* The one that actually loses work. Chart a pitcher, then come back on a release
     he is no longer part of: his name must still be on the slot. */
  console.log("\nBULLPEN — a pitcher dropped from a later release");
  let pg = await page(b, "/bullpen/index.html", RELEASED);
  let ev = js => pg.evaluate(js);
  await ev(`(function(){
    document.getElementById("tab-setup").click();
    var sel=document.querySelectorAll('#rosterTbl [data-f="rid"]')[0];
    sel.value="rel0001"; sel.dispatchEvent(new Event("input",{bubbles:true}));
    /* Freeform, so one zone tap is one charted pitch. In script mode an empty
       script has no call to execute and a tap is correctly ignored - which is
       what made the first version of this test prove nothing. */
    var m=document.querySelectorAll('#rosterTbl [data-f="mode"]')[0];
    m.value="free"; m.dispatchEvent(new Event("input",{bubbles:true}));
  })()`);
  await pg.waitForTimeout(400);
  is("charted against the release", await ev(
     '(document.querySelector("#rosterTbl .whoami")||{}).textContent||"none"'), "Sr · RHP");
  await ev(`(function(){ document.getElementById("tab-chart").click();
    document.querySelector('#zone button[data-r="2"][data-c="2"]').click(); })()`);
  await pg.waitForTimeout(400);
  const saved = await ev('localStorage.getItem("titans-bullpen-v1")');
  /* The PITCH, not just the id - the first version of this check only looked for
     "rel0001" and passed on a session with nothing charted in it. */
  is("  the pitch was stored", /"pitches":\[\{/.test(String(saved)), true);
  is("  and shows in the log", /FB/.test(await ev(
     '(document.getElementById("log")||{}).textContent||""')), true);
  await pg.context().close();

  /* Same browser state, new release without him. */
  const ctx = await b.newContext({ viewport:{width:1280,height:1200}, serviceWorkers:"block" });
  await ctx.route("**/roster.js", r => r.fulfill({ status:200, contentType:"application/javascript", body:WITHOUT_ZEB }));
  pg = await ctx.newPage();
  const errs2=[]; pg.on("pageerror", e=>errs2.push(String(e)));
  await pg.goto(BASE + "/bullpen/index.html", { waitUntil:"load" });
  await pg.waitForTimeout(600);
  ev = js => pg.evaluate(js);
  await ev(`localStorage.setItem("titans-bullpen-v1", ${JSON.stringify(saved)});`);
  await pg.reload({ waitUntil:"load" }); await pg.waitForTimeout(1200);
  await ev('document.getElementById("tab-setup").click();');
  await pg.waitForTimeout(300);
  is("he is off the new release", await ev('window.TITANS_ROSTER.length'), 1);
  is("  his name is STILL on the slot", await ev(
     '(function(){ var s=document.querySelectorAll(\'#rosterTbl [data-f="rid"]\')[0];'+
     ' return s ? s.options[s.selectedIndex].text.replace(/\\s+/g," ").trim() : "no picker"; })()'),
     "Zeb Released (not on the roster)");
  is("  his pitch is still there", await ev(
     '(function(){ document.getElementById("tab-chart").click();'+
     ' var t=(document.getElementById("log")||{}).textContent||"";'+
     ' return /FB/.test(t) ? "logged" : "EMPTY: "+t.slice(0,40); })()'), "logged");
  is("  no page errors", errs2.join("|"), "");
  await ctx.close();

  await b.close();
  console.log(fail ? "\n" + fail + " FAILED" : "\nall good");
  process.exit(fail ? 1 : 0);
})();
