/* Does a new roster.js actually reach the app without a cache bump — and does the
   app still open when the network is dead or, worse, answering slowly?

   Two things this harness learned the hard way:

   - Service workers are ALLOWED here. Every other suite blocks them; this one is
     about the service worker, so blocking it would test nothing.

   - Playwright's setOffline does NOT apply to fetches made from inside a service
     worker. The first version of step 4 "passed offline" while the worker was
     quietly reaching the network and caching a newer roster. Real offline means
     stopping the server, so this test owns the server process. */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");

/* Copy the app under test into site/ first - see README. Either app works: the
   two differ only in the cache prefix, the build number, and how the Setup screen
   is opened, so those three are read off the files rather than hardcoded. */
const DIR = __dirname;
const SITE = path.join(DIR, "site");
const PORT = 8811;
const BASE = "http://127.0.0.1:" + PORT;
let fail = 0;
function is(n, g, w) {
  const ok = String(g) === String(w);
  console.log((ok ? "  ok   " : "  FAIL ") + n.padEnd(52) + JSON.stringify(g) +
    (ok ? "" : "  (want " + JSON.stringify(w) + ")"));
  if (!ok) fail++;
}

function roster(tag, players) {
  const rows = players.map(p =>
    `  {id:"${p[0]}", last:"${p[1]}", first:"${p[2]}", cls:"${p[3]}", throws:"R", bats:"R", jersey:"", name:"${p[1]}"}`
  ).join(",\n");
  fs.writeFileSync(path.join(SITE, "roster.js"),
    `window.TITANS_ROSTER_STAMP = "${tag}";\nwindow.TITANS_ROSTER = [\n${rows}\n];\n`, "utf8");
}
const DELAY = path.join(DIR, ".delay");
const stall = s => s === null
  ? (fs.existsSync(DELAY) && fs.unlinkSync(DELAY))
  : fs.writeFileSync(DELAY, String(s), "utf8");

/* Which app is in site/, and what build is it? Read it, do not assume - a stale
   hardcoded number here would make step 3's control check pass for the wrong
   reason. */
const SW = fs.readFileSync(path.join(SITE, "sw.js"), "utf8");
const IDX = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const PREFIX = (SW.match(/var CACHE = "(titans-[a-z]+-)/) || [])[1];
const BUILD = (IDX.match(/var BUILD = "([^"]+)"/) || [])[1];
if (!PREFIX || !BUILD) { console.log("site/ does not look like one of the apps"); process.exit(1); }
/* A HALF-COPIED site/ is the trap here, and it does not look like one. The worker's
   addAll() rejects as a unit, so one missing file means the install fails, the page
   is never controlled, and the suite reports step 3 as "index.html came from the
   server" - a cache-first failure that is really a copy that forgot guide.html.
   Check the worker's own manifest against the folder before any of that. */
{
  const want = (SW.match(/var FILES = \[([^\]]*)\]/) || ["", ""])[1]
    .split(",").map(s => s.trim().replace(/^["']|["']$/g, ""))
    .filter(f => f && f !== "./");
  const missing = want.filter(f => !fs.existsSync(path.join(SITE, f.replace(/^\.\//, ""))));
  if (missing.length) {
    console.log("site/ is missing " + missing.join(", ") +
      "\nThe worker caches these as a unit - copy the WHOLE app folder:\n" +
      "  rm -rf tools/swcache/site && mkdir -p tools/swcache/site && cp " +
      PREFIX.replace(/^titans-|-$/g, "") + "/* tools/swcache/site/");
    process.exit(1);
  }
}
const APP = PREFIX.replace(/^titans-|-$/g, "");
/* The offense app exposes showTab(); the bullpen and (since v28) the Pitch Chart
   have a Setup tab button. */
const OPEN_SETUP = APP === "offense" ? 'showTab("setup")'
                 :                     'document.getElementById("tab-setup").click()';
console.log("testing " + APP + " " + BUILD);

let srv = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function up() {
  return new Promise(resolve => {
    const s = net.connect(PORT, "127.0.0.1");
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
  });
}
async function startServer() {
  srv = spawn("python3", [path.join(DIR, "server.py"), String(PORT)], { stdio: "ignore", detached: true });
  for (let i = 0; i < 40; i++) { if (await up()) return; await sleep(100); }
  throw new Error("server did not start");
}
async function stopServer() {
  if (!srv) return;
  try { process.kill(-srv.pid, "SIGKILL"); } catch (e) { try { srv.kill("SIGKILL"); } catch (e2) {} }
  srv = null;
  for (let i = 0; i < 40; i++) { if (!(await up())) return; await sleep(100); }
  throw new Error("server did not stop");
}

const R1 = [["id001", "Aaa", "Al", "Sr"]];
const R2 = [["id001", "Aaa", "Al", "Sr"], ["id002", "Bbb", "Bob", "Jr"]];
const R3 = [["id001", "Aaa", "Al", "Sr"], ["id002", "Bbb", "Bob", "Jr"], ["id003", "Ccc", "Cal", "Fr"]];

(async () => {
  stall(null);
  roster("v1-stamp", R1);
  await startServer();

  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    /* The shipped bullpen carries the REAL receiver URL. No test may ever reach it:
       Google's script hosts do not resolve inside this browser. */
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "allow" });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));

  const stamp = () => pg.evaluate('(function(){ try{ return window.TITANS_ROSTER_STAMP || "none"; }catch(e){ return "err"; } })()');
  const count = () => pg.evaluate('(function(){ try{ return (window.TITANS_ROSTER||[]).length; }catch(e){ return -1; } })()');
  /* Open Setup first: both apps draw the roster panel when its screen opens, not
     at boot, so reading the banner before that gets the bare class and means
     nothing. The two apps name the green state differently - "flag ok" and
     "rossrc ok" - so normalise to the part that matters. */
  const banner = async () => {
    await pg.evaluate(OPEN_SETUP).catch(() => {});
    await sleep(250);
    return pg.evaluate(`(function(){
      var b=document.getElementById("rosSrc");
      if(!b) return "no banner";
      var c=b.className;
      if(/\\bok\\b/.test(c)) return "green";
      if(/\\bwarn\\b/.test(c)) return "amber";
      if(/\\bbad\\b/.test(c)) return "red";
      return "not drawn: "+c; })()`);
  };
  const build = () => pg.evaluate('(document.getElementById("buildStamp")||{}).textContent || "none"');

  console.log("\n1 — FIRST LOAD, the worker installs and caches roster v1");
  await pg.goto(BASE + "/index.html", { waitUntil: "load" });
  await pg.waitForFunction("!!navigator.serviceWorker.controller", null, { timeout: 15000 }).catch(() => {});
  await sleep(600);
  is("the page is controlled by the worker", await pg.evaluate('!!navigator.serviceWorker.controller'), true);
  await pg.reload({ waitUntil: "load" });
  await sleep(700);
  is("roster v1 loaded", await stamp(), "v1-stamp");
  is("  one player", await count(), 1);
  is("  roster.js is in the worker's cache", await pg.evaluate(`
     caches.keys().then(function(ks){
       var mine = ks.filter(function(k){ return k.indexOf("${PREFIX}")===0; });
       if(!mine.length) return "no cache";
       return caches.open(mine[0]).then(function(c){
         return c.keys().then(function(reqs){
           return reqs.some(function(r){ return /roster\\.js/.test(r.url); }) ? "yes" : "no";
         }); });
     })`), "yes");

  console.log("\n2 — A NEW ROSTER, NO CACHE BUMP  (this is the whole point)");
  roster("v2-stamp", R2);
  await pg.reload({ waitUntil: "load" });
  await sleep(900);
  is("the app sees the NEW roster", await stamp(), "v2-stamp");
  is("  two players now", await count(), 2);
  is("  banner still says released", await banner(), "green");

  console.log("\n3 — APP CODE IS STILL CACHE-FIRST  (the control)");
  const idx = path.join(SITE, "index.html");
  const original = fs.readFileSync(idx, "utf8");
  fs.writeFileSync(idx, original.replace('var BUILD = "' + BUILD + '";', 'var BUILD = "vTAMPERED";'), "utf8");
  await pg.reload({ waitUntil: "load" });
  await sleep(800);
  is("index.html came from cache, not the server", await build(), BUILD);
  fs.writeFileSync(idx, original, "utf8");

  console.log("\n4 — REAL OFFLINE: the server is stopped");
  roster("v3-stamp", R3);        /* on disk, but unreachable */
  await stopServer();
  await pg.reload({ waitUntil: "load" });
  await sleep(900);
  is("the app still opens", await pg.evaluate('document.readyState'), "complete");
  is("  on the last roster it actually had", await stamp(), "v2-stamp");
  is("  two players", await count(), 2);
  is("  banner is green, not an error", await banner(), "green");

  console.log("\n5 — THE GYM WIFI THAT ANSWERS TOO LATE  (6s stall, 2.5s budget)");
  stall(6);
  await startServer();
  const t0 = Date.now();
  await pg.reload({ waitUntil: "load" });
  await pg.waitForFunction(
    '!!document.getElementById("rosSrc") && document.getElementById("rosSrc").className !== ""',
    null, { timeout: 12000 }).catch(() => {});
  const took = Date.now() - t0;
  console.log("     the roster panel was live after " + took + "ms");
  is("opened well inside the stall", took < 5500, true);
  is("  served the CACHED roster, not the stalled one", await stamp(), "v2-stamp");
  is("  which means two players, not three", await count(), 2);
  /* And a stalled response must NOT be written to the cache behind us - the app
     already moved on without it, so quietly storing it would mean the NEXT open
     showed a roster this one decided not to use. */
  await sleep(6000);
  is("  the late response was not cached", await pg.evaluate(`
     caches.keys().then(function(ks){
       var mine = ks.filter(function(k){ return k.indexOf("${PREFIX}")===0; })[0];
       return caches.open(mine).then(function(c){
         return c.keys().then(function(reqs){
           var r = reqs.filter(function(x){ return /roster\\.js/.test(x.url); })[0];
           return c.match(r).then(function(res){ return res.text(); })
             .then(function(t){ return /v2-stamp/.test(t) ? "still v2" : t.slice(0,40); });
         }); });
     })`), "still v2");

  console.log("\n6 — STALL GONE: the new roster lands, still no cache bump");
  stall(null);
  await pg.reload({ waitUntil: "load" });
  await sleep(1200);
  is("roster v3 picked up", await stamp(), "v3-stamp");
  is("  three players", await count(), 3);
  is("  and the app is still " + BUILD, await build(), BUILD);

  const real = errs.filter(e => !/roster\.js|Failed to fetch|NetworkError/.test(e));
  if (real.length) { console.log("\n  PAGE ERRORS: " + real.join(" | ")); fail += real.length; }
  console.log(fail ? "\n" + fail + " FAILED" : "\nall good");
  await b.close();
  await stopServer();
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.log("HARNESS ERROR: " + e.message); await stopServer(); process.exit(1); });
