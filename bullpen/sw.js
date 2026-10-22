/* Titans Bullpen Chart - offline cache
   Bump CACHE when you change the APP - index.html, the guide, templates.js - or
   iPads keep the old one. A new roster.js needs no bump: see rosterFirst below. */
var CACHE = "titans-bullpen-v44";
var FILES = [
  "./",
  "./index.html",
  "./guide.html",
  "./manifest.webmanifest",
  "./templates.js",
  "./roster.js",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

/* ---------- roster.js is the one exception to cache-first ----------
   Everything else in FILES is code, and cache-first is what lets this app open in
   a gym with no signal. But it also means a new file on the server reaches nobody
   until CACHE changes.

   A roster is DATA. It changes far more often than the app does - jerseys in the
   spring, a kid added, a spelling corrected - and the old rule made every one of
   those a code release with two version numbers to remember. Forgetting them
   failed silently: the server had the new roster, every iPad kept the old one, and
   nothing on screen said so.

   So this one file is checked on the network first, with the cached copy as the
   fallback. Drop a new roster.js in the folder, push, done.

   THE TIMEOUT IS THE WHOLE TRICK. Network-first on its own would be worse than
   what it replaced: a gym wifi that accepts the connection and then never answers
   would hang the app on its own roster, before the first pitch. Wait this long,
   then serve what we already have. */
var ROSTER_WAIT = 2500;

function isRoster(url){
  return /\/roster\.js(\?|$)/.test(url);
}
function rosterFirst(req){
  return caches.open(CACHE).then(function(c){
    return new Promise(function(resolve){
      var settled = false;
      function serveCached(){
        if(settled) return;
        settled = true;
        c.match(req).then(function(hit){
          /* No cached copy and no network - first run of a build that shipped
             without one. Hand back an empty script rather than a hard failure:
             the app reads "no roster" and says so in red, which is the truth, and
             it does it without a console error for a case it handles. */
          resolve(hit || new Response("/* roster.js could not be reached */", {
            status: 200, headers: {"Content-Type": "application/javascript"}
          }));
        });
      }
      var timer = setTimeout(serveCached, ROSTER_WAIT);
      /* cache:"no-store" so the browser's OWN http cache cannot quietly serve a
         stale roster behind our back. The point of this path is to ask the server. */
      fetch(req, {cache: "no-store"}).then(function(res){
        if(settled) return;
        clearTimeout(timer);
        if(!res || res.status !== 200){ serveCached(); return; }
        settled = true;
        /* Keep the newest for the next time there is no signal. */
        c.put(req, res.clone());
        resolve(res);
      })["catch"](function(){
        clearTimeout(timer);
        serveCached();
      });
    });
  });
}

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(FILES); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ if(k !== CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

/* Cache first: the app must open with no signal, every time. */
self.addEventListener("fetch", function(e){
  if(e.request.method !== "GET") return;
  if(isRoster(e.request.url)){ e.respondWith(rosterFirst(e.request)); return; }
  e.respondWith(
    /* SCOPED TO THIS VERSION'S CACHE. caches.match() with no cacheName searches
       EVERY cache in the origin, so a stale cache that survives for any reason
       keeps being served and the update never lands - the exact "stale app that
       looks perfectly fine" failure this file was written to prevent. */
    caches.match(e.request, {cacheName: CACHE}).then(function(hit){
      if(hit) return hit;
      return fetch(e.request).then(function(res){
        if(res && res.status === 200 && res.type === "basic"){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        }
        return res;
      })["catch"](function(){
        return caches.match("./index.html", {cacheName: CACHE});
      });
    })
  );
});
