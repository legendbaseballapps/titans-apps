/* Titans Coaches Dashboard: the model (dashboard 2.0, Nov 2026)
   ==============================================================
   Turns the season Sheet's rows into one compact MODEL the page draws from. Pure: it only
   reads rows handed to it (get(tabName) -> [{header: value}]) and never touches Google, so
   the Node tests run this exact file on a made-up season.

   Sums, never averages of rates: every rate on the page is worked out from season totals.
   Rules shared with the apps and the cards:
     - Spring games only count when their Records row exists (a half-written upload never counts)
       and the row isn't marked Practice.
     - An at-bat is one RecordID + Spot + AB, credited to the pitcher of its first pitch.
     - Execution = on or next to the called spot (Spot / Close in the Bullpen Chart, SPOT / CLOSE in
       the Pitch Chart). Glove calls and "? Not known" calls are kept out of the grade.
     - Winter bullpens are never graded against the spring goals.
     - Quality at-bats use the Offense Chart's rules (qabReasons, v43), applied to its export rows. */

var MODEL_V = 1;
var GTYPE = {FB: "FB", CT: "FB", SL: "CB", CB: "CB", CH: "CH", SP: "CH"};     /* fastball / breaking ball / change-up */
var BSPOT = {"3,3": 0, "2,3": 1, "2,2": 2, "4,2": 3, "4,3": 4, "4,4": 5, "5,3": 6, "1,3": 7};   /* 1-based row,col -> location 0-7 */
var M_HITS = {"1B": 1, "2B": 2, "3B": 3, "HR": 4};
var M_NOAB = {BB: 1, IBB: 1, HBP: 1, SAC: 1, SF: 1, CI: 1};
var M_TRAJ = {GO: "GB", FC: "GB", DP: "GB", SAC: "GB", SF: "FB", LO: "LD", FO: "FB", HR: "FB", PO: "PU"};
var M_RULES_DEFAULT = {
  Varsity: {max: 110, bands: [[86, 3], [61, 2], [36, 1], [1, 0]], b2b: {day1: 35, total: 60, rest: 1}},
  Sub:     {max: 85,  bands: [[61, 3], [36, 2], [26, 1], [1, 0]], b2b: {day1: 25, total: 35, rest: 2}}
};
/* 2026, when the GameChanger import has no 2026 team totals: nothing (the tiles say "not charted").
   Last season's real numbers live in the season Sheet's GameChanger tab, never in this public code. */
var M_LAST26 = {Varsity: {}, JV: {}, Sophomore: {}, Freshman: {}};

function mBlank_() { return {pitches: 0, strikes: 0, fp: 0, fps: 0, bf: 0, outs: 0, free: 0, k: 0, bb: 0, hits: 0, runs: 0, er: 0, bip: 0, hard: 0, xok: 0, xn: 0}; }
var M_SUMS = ["pitches", "strikes", "fp", "fps", "bf", "outs", "free", "k", "bb", "hits", "runs", "er", "bip", "hard", "xok", "xn"];
function mHblank_() { return {pa: 0, ab: 0, h: 0, tb: 0, bb: 0, hbp: 0, k: 0, sac: 0, sf: 0, qab: 0, why: {}, pitches: 0, ooz: 0, ch: 0, bip: 0, hard: 0, sw: 0, wh: 0, f1: 0, f1sw: 0, endc: {}}; }
function mInc_(o, k, n) { o[k] = (o[k] || 0) + (n == null ? 1 : n); }
function mPair_(o, k, ok) { var a = o[k] || (o[k] = [0, 0]); if (ok) a[0]++; a[1]++; }
function mName_(first, last) { return (String(first || "").trim() + " " + String(last || "").trim()).trim(); }
function mUp_(v) { return String(v == null ? "" : v).trim().toUpperCase(); }
function mCount_(b, s, hitter) {   /* the count a pitch was thrown in; hitter = the hitter's side of it */
  if (b === 0 && s === 0) return "FP";
  if (s === 2) return "K2";
  if (b === s) return "EV";
  return (s > b) === !hitter ? "AH" : "BH";
}

/* get(tab) -> rows as objects; opt: {settings, today, me, comments: {Varsity: rows, ...}} */
function buildModel_(get, opt) {
  opt = opt || {};
  var S = opt.settings, M = {v: MODEL_V, built: opt.now || "", today: opt.today || "", people: {}, games: [], pit: [], pitx: {}, gcell: {},
                            pens: {}, hit: [], refl: [], notes: {}, scout: {}, gc: {}, base: {}, comments: [], cfg: {}, me: {}};

  /* -------------------------------------------------------------- records and people */
  var recs = {};
  get("Records").forEach(function (r) { recs[s_(r.RecordID)] = {app: s_(r.App), team: s_(r.Team), date: dstr_(r.Date), tpl: s_(r.Template), sid: s_(r.ScriptID)}; });
  function keep(r) { return !!recs[s_(r.RecordID)] && mUp_(r.Practice) !== "Y"; }
  function who(id, first, last) {
    id = s_(id).trim(); if (!id) return null;
    var p = M.people[id];
    if (!p) p = M.people[id] = {id: id, name: mName_(first, last) || id, cl: "", home: "", t: "", b: "", onRoster: false};
    else if (!p.onRoster && !p.name && (first || last)) p.name = mName_(first, last);
    return p;
  }
  get("Players").forEach(function (r) {
    var id = s_(r.PlayerID).trim(); if (!id) return;
    M.people[id] = {id: id, name: mName_(r.First, r.Last), cl: s_(r.Class).trim(), home: levelName_(r.Level), t: "", b: "", onRoster: true};
  });

  /* -------------------------------------------------------------- spring pitching */
  function lvOf(r) { return levelName_(s_(r.Level) || (recs[s_(r.RecordID)] || {}).team); }
  var games = {}, lines = {};
  function line(rid, pid, lv, r) {
    var k = rid + "|" + pid, L = lines[k];
    if (!L) {
      L = lines[k] = mBlank_();
      L.id = pid; L.rid = rid; L.lv = lv; L.date = dstr_(r.Date || (recs[rid] || {}).date); L.opp = s_(r.Opponent);
    }
    return L;
  }
  get("Game_Innings").filter(keep).forEach(function (r) {
    var lv = lvOf(r), rid = s_(r.RecordID), p = who(r.PitcherID, r.PitcherFirst, r.PitcherLast);
    if (!lv || !p) return;
    var L = line(rid, p.id, lv, r);
    L.pitches += num_(r.Pitches); L.strikes += num_(r.Strikes); L.fp += num_(r.FirstPitches); L.fps += num_(r.FirstPitchStrikes);
    L.bf += num_(r.BattersFaced); L.outs += num_(r.Outs); L.free += num_(r.FreeBases); L.k += num_(r.K); L.hits += num_(r.Hits);
    L.runs += num_(r.Runs); L.er += num_(r.Earned);
    var g = games[rid] = games[rid] || {rid: rid, lv: lv, date: L.date, opp: s_(r.Opponent), oppId: s_(r.OpponentID), bf: 0, free: 0};
    g.bf += num_(r.BattersFaced); g.free += num_(r.FreeBases);
  });
  /* pitch by pitch: walks, balls in play, hard contact, execution, and the patterns on his page */
  var abs = {}, order = [];
  get("Game_Pitches").filter(keep).forEach(function (r) {
    var rid = s_(r.RecordID), lv = lvOf(r), p = who(r.PitcherID, r.PitcherFirst, r.PitcherLast);
    if (!lv || !p) return;
    if (!p.t && s_(r.Throws)) p.t = s_(r.Throws);
    var k = rid + "|" + s_(r.Spot) + "|" + s_(r.AB), a = abs[k];
    if (!a) { a = abs[k] = {rid: rid, lv: lv, pid: p.id, result: "", hard: false, b: 0, s: 0, r: r}; order.push(k); }
    if (s_(r.ABResult)) { a.result = s_(r.ABResult); a.hard = mUp_(r.HardContact) === "Y"; }
    var call = s_(r.Call).toLowerCase();
    if (!s_(r.Pitch) && !call) return;                      /* an intentional walk with no pitch */
    var X = M.pitx[p.id] || (M.pitx[p.id] = {miss: {up: 0, down: 0, arm: 0, glove: 0, n: 0}, cnt: {}, mix: {}});
    var cnt = mCount_(a.b, a.s, false), grp = GTYPE[mUp_(r.Type)] || "FB";
    var mx = X.mix[cnt] || (X.mix[cnt] = {FB: 0, CB: 0, CH: 0, n: 0}); mx[grp]++; mx.n++;
    var ex = mUp_(r.Execution), src = mUp_(r.CallSource), graded = (ex === "SPOT" || ex === "CLOSE" || ex === "MISS") && src !== "GLOVE" && src !== "UNKNOWN";
    if (graded) {
      var ok = ex !== "MISS", L = lines[rid + "|" + p.id];
      if (L) { L.xn++; if (ok) L.xok++; }
      mPair_(X.cnt, cnt, ok);
      var spot = BSPOT[s_(r.CalledRow) + "," + s_(r.CalledCol)];
      if (spot != null) mPair_(M.gcell[p.id] || (M.gcell[p.id] = {}), grp + "|" + spot, ok);
      if (!ok) {
        X.miss.n++;
        var v = mUp_(r.MissV), h = mUp_(r.MissH), same = !!p.t && mUp_(r.Hand) === mUp_(p.t);
        /* a miss up and in counts as both: each direction is a share of his misses */
        if (v === "UP") X.miss.up++; else if (v === "DOWN") X.miss.down++;
        if (h) { if ((h === "IN") === same) X.miss.arm++; else X.miss.glove++; }   /* in to a same-side hitter is his arm side */
      }
    }
    if (call === "ball") a.b = Math.min(3, a.b + 1);
    else if (call === "strike" || call === "swing&miss" || (call === "foul" && a.s < 2)) a.s = Math.min(2, a.s + 1);
  });
  order.forEach(function (k) {
    var a = abs[k]; if (!a.result) return;
    var L = lines[a.rid + "|" + a.pid];
    if (!L) return;                                         /* an at-bat with no inning row: the innings decide who pitched */
    if (a.result === "BB" || a.result === "IBB") L.bb++;
    if (INPLAY[a.result]) { L.bip++; if (a.hard) L.hard++; }
  });
  Object.keys(lines).forEach(function (k) { M.pit.push(lines[k]); });
  M.pit.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.rid < b.rid ? -1 : 1; });
  M.games = Object.keys(games).map(function (k) { return games[k]; })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.rid < b.rid ? -1 : 1; });
  /* 2.0.3: the Bullpen Chart's notes too, keyed on the session (To the pitcher, Coach only) */
  get("Bullpen_Notes").filter(keep).forEach(function (r) {
    var t = s_(r.ToPitcher).trim(), c = s_(r.CoachOnly).replace(/^=/, "").trim();
    if (t || c) M.notes[s_(r.SessionID || r.RecordID) + "|" + s_(r.PitcherID)] = {to: t, coach: c};
  });
  get("Game_Notes").filter(keep).forEach(function (r) {
    var t = s_(r.ToPitcher).trim(), c = s_(r.CoachOnly).replace(/^=/, "").trim();
    if (t || c) M.notes[s_(r.RecordID) + "|" + s_(r.PitcherID)] = {to: t, coach: c};
  });

  /* -------------------------------------------------------------- winter bullpens */
  var pens = {};
  get("Bullpen_Pitches").filter(keep).forEach(function (r) {
    var p = who(r.PitcherID, r.PitcherFirst, r.PitcherLast); if (!p) return;
    if (!p.t && s_(r.Throws)) p.t = s_(r.Throws);
    if (!p.cl && s_(r.Class)) p.cl = s_(r.Class);
    var mode = mUp_(r.Mode) === "LIVE" ? "Live" : mUp_(r.Mode) === "FREEFORM" ? "Free" : "Script";
    var sid = s_(r.SessionID || r.RecordID), k = sid + "|" + p.id + "|" + mode, P = pens[k];
    if (!P) P = pens[k] = {sid: sid, id: p.id, d: dstr_(r.Date), mode: mode, tpl: s_(r.Template), n: 0, st: 0, g: 0, ok: 0,
                           w: [0, 0], fb: [0, 0], os: [0, 0], del: {}, sit: {}, miss: {}, cells: {}, abs: {}};
    P.n++; if (mUp_(r.Strike) === "Y") P.st++;
    var res = mUp_(r.Result), src = mUp_(r.CallSource), t = GTYPE[mUp_(r.CalledType)] || "FB", ws = mUp_(r.CalledWS) || "W";
    if ((res === "SPOT" || res === "CLOSE" || res === "MISS") && src !== "GLOVE" && src !== "UNKNOWN") {
      var ok = res !== "MISS";
      P.g++; if (ok) P.ok++;
      if (ws === "W" && mode === "Script") { P.w[1]++; if (ok) P.w[0]++; if (t === "FB") { P.fb[1]++; if (ok) P.fb[0]++; } }
      if (t !== "FB") { P.os[1]++; if (ok) P.os[0]++; }
      mPair_(P.del, ws, ok);
      var sp = s_(r.CalledSpot);
      if (sp !== "") mPair_(P.cells, t + "|" + sp, ok);
      if (!ok) {
        var mm = P.miss[t] || (P.miss[t] = [0, 0, 0, 0, 0]), v = mUp_(r.MissVert), h = mUp_(r.MissHoriz);
        mm[4]++;                                            /* misses; a miss up and in counts as both up and in */
        if (v === "UP") mm[0]++; else if (v === "DOWN") mm[1]++;
        if (h) mm[(h === "IN") === (mUp_(p.t || r.Throws) !== "L") ? 2 : 3]++;   /* in (toward a righty) is a righthander's arm side */
      }
    }
    var si = s_(r.Situation).trim();
    if (si) {
      /* 2-0 is graded on the strike, 2-strike chase on finishing out of the zone, runner reps on the spot */
      if (si === "20") mPair_(P.sit, si, mUp_(r.Strike) === "Y");
      else if (si === "2K") mPair_(P.sit, si, mUp_(r.Strike) === "N");
      else if (res === "SPOT" || res === "CLOSE" || res === "MISS") mPair_(P.sit, si, res !== "MISS");
    }
    if (mode === "Live" && s_(r.AB) && s_(r.AO3plus)) P.abs[s_(r.AB)] = s_(r.AO3plus);
  });
  var reflKey = {};
  get("Reflections").forEach(function (r) {
    var kind = s_(r.Kind).toLowerCase(), pid = s_(r.PlayerID); if (!pid) return;
    reflKey[s_(r.RecordID) + "|" + pid] = {flag: mUp_(r.Flag) === "Y", bother: s_(r.Bothering)};
    M.refl.push({id: pid, kind: kind, rid: s_(r.RecordID), date: dstr_(r.Date), ev: s_(r.Event), lv: levelName_(r.Level),
                 start: s_(r.Start), stop: s_(r.Stop), cont: s_(r.Continue), last: s_(r.LastStart), did: s_(r.DidLastStart),
                 feel: s_(r.Feel), arm: s_(r["Arm/Body"]), flag: mUp_(r.Flag) === "Y", bother: s_(r.Bothering)});
  });
  M.refl.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  Object.keys(pens).forEach(function (k) {
    var P = pens[k], list = M.pens[P.id] || (M.pens[P.id] = []);
    var pts = 0, bf = 0;
    Object.keys(P.abs).forEach(function (a) { bf++; pts += {"++": 2, "+-": 1, "-+": 1}[P.abs[a]] || 0; });
    P.ao3 = bf ? [pts, bf] : null; delete P.abs;
    var rf = reflKey[P.sid + "|" + P.id]; P.refl = !!rf; P.flag = rf && rf.flag ? (rf.bother || "flagged") : "";
    list.push(P);
  });
  Object.keys(M.pens).forEach(function (id) { M.pens[id].sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; }); });

  /* -------------------------------------------------------------- spring hitting */
  var pas = {}, porder = [];
  get("Offense_Pitches").filter(keep).forEach(function (r) {
    var rid = s_(r.RecordID), k = rid + "|" + s_(r.PA), a = pas[k];
    if (!a) { a = pas[k] = {rid: rid, rows: []}; porder.push(k); }
    a.rows.push(r);
  });
  var hl = {};
  porder.forEach(function (k) {
    var a = pas[k], rows = a.rows, first = rows[0], last = rows[rows.length - 1], res = s_(last.PAResult);
    var p = who(first.HitterID, first.HitterFirst, first.HitterLast), lv = lvOf(first);
    if (!res || !p || !lv) return;                          /* still open, or a hitter not on the roster */
    if (!p.b && s_(first.Bats)) p.b = s_(first.Bats);
    var key = a.rid + "|" + p.id, H = hl[key];
    if (!H) { H = hl[key] = mHblank_(); H.id = p.id; H.rid = a.rid; H.lv = lv; H.date = dstr_(first.Date); H.opp = s_(first.Opponent); H.oppId = s_(first.OpponentID); }
    var pitched = rows.filter(function (x) { return s_(x.Pitch) || s_(x.What); });
    var n = pitched.length, bip = mUp_(last.What) === "IN PLAY", traj = mUp_(last.Traj) || M_TRAJ[res] || "";
    H.pa++; H.pitches += n;
    if (!M_NOAB[res]) H.ab++;
    if (M_HITS[res]) { H.h++; H.tb += M_HITS[res]; }
    if (res === "BB" || res === "IBB") H.bb++;
    if (res === "HBP") H.hbp++;
    if (res === "K" || res === "Kc") H.k++;
    if (res === "SAC") H.sac++;
    if (res === "SF") H.sf++;
    if (bip) { H.bip++; if (mUp_(last.HardContact) === "Y") H.hard++; }
    pitched.forEach(function (x, i) {
      var sw = mUp_(x.Swing) === "Y";
      if (mUp_(x.InZone) === "N") { H.ooz++; if (mUp_(x.Chase) === "Y") H.ch++; }
      if (sw) { H.sw++; if (mUp_(x.What) === "SWING & MISS") H.wh++; }
      if (i === 0) { H.f1++; if (sw) H.f1sw++; }
    });
    var why = [];
    if (M_HITS[res]) why.push("H");
    if (bip && traj === "LD") why.push("LD");
    if (res === "BB" || res === "IBB") why.push("BB");
    if (res === "HBP") why.push("HBP");
    if (res === "SAC" || res === "SF") why.push("SAC");
    if (bip && mUp_(last.RunScored) === "Y") why.push("RUN");
    if (n >= 7) why.push("P7");
    if (bip && mUp_(last.MovedRunner) === "Y" && num_(last.Outs) !== 2) why.push("ADV");
    if (bip && n && num_(last.CountS) === 2) why.push("K2");
    if (why.length) { H.qab++; why.forEach(function (w) { mInc_(H.why, w); }); }
    mPair_(H.endc, mCount_(num_(last.CountB), num_(last.CountS), true), why.length > 0);
  });
  Object.keys(hl).forEach(function (k) { M.hit.push(hl[k]); });
  M.hit.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  get("Offense_Notes").filter(keep).forEach(function (r) {
    var t = s_(r.ToHitter).trim(), c = s_(r.CoachOnly).replace(/^=/, "").trim();
    if (t || c) M.notes[s_(r.RecordID) + "|" + s_(r.HitterID)] = {to: t, coach: c};
  });

  /* -------------------------------------------------------------- scouting: their pitchers and hitters, per level and opponent */
  function okey(lv, name, id) { return lv + "|" + (id || String(name || "").trim().toLowerCase()); }
  function sc(lv, name, id, date) {
    var k = okey(lv, name, id), o = M.scout[k] || (M.scout[k] = {lv: lv, opp: name, oppId: id || "", dates: {}, pit: {}, pord: [], hit: {}});
    if (date) o.dates[date] = 1;
    return o;
  }
  porder.forEach(function (k) {
    var a = pas[k], rows = a.rows, first = rows[0], lv = lvOf(first); if (!lv) return;
    var o = sc(lv, s_(first.Opponent), s_(first.OpponentID), dstr_(first.Date));
    rows.forEach(function (x, i) {
      var nm = s_(x.Pitcher).trim() || "Unknown pitcher", P = o.pit[nm];
      if (!P) { P = o.pit[nm] = {name: nm, t: s_(x.PitcherHand), n: 0, str: 0, fp: 0, fps: 0, sw: 0, wh: 0, oz: 0, ozsw: 0, types: {}, cnt: {}, tags: {}, note: "", games: {}, inn: {}, first: {}}; o.pord.push(nm); }
      if (!s_(x.Pitch) && !s_(x.What)) return;
      var what = mUp_(x.What), strike = what === "FOUL" || what === "SWING & MISS" || what === "IN PLAY" || mUp_(x.Call) === "STRIKE", sw = mUp_(x.Swing) === "Y";
      P.n++; if (strike) P.str++;
      if (num_(x.PitchNo) === 1) { P.fp++; if (strike) P.fps++; }
      if (sw) { P.sw++; if (what === "SWING & MISS") P.wh++; }
      if (mUp_(x.InZone) === "N") { P.oz++; if (sw) P.ozsw++; }
      var ty = mUp_(x.Pitch) || "?"; mInc_(P.types, ty);
      var c = mCount_(num_(x.CountB), num_(x.CountS), false), cc = P.cnt[c] || (P.cnt[c] = {}); mInc_(cc, ty);
      s_(x.PitcherTags).split(/\s+/).forEach(function (t) { if (t) P.tags[t.replace(/\*$/, "")] = /\*$/.test(t) ? 1 : (P.tags[t.replace(/\*$/, "")] || 0); });
      if (s_(x.PitcherNotes).trim()) P.note = s_(x.PitcherNotes).trim();
      P.games[a.rid] = 1;
      if (s_(x.Inning)) { P.inn[a.rid + "|" + s_(x.Inning)] = 1; if (num_(x.Inning) === 1 && num_(x.PA) <= 3) P.first[a.rid] = 1; }
    });
  });
  var hab = {};
  order.forEach(function (k) {
    var a = abs[k], r = a.r, lv = a.lv;
    var o = sc(lv, s_(r.Opponent), s_(r.OpponentID), dstr_(r.Date)), spot = num_(r.Spot), nm = s_(r.Batter).trim() || "Batter " + spot;
    var H = o.hit[nm] || (o.hit[nm] = {name: nm, pos: s_(r.PosName), b: s_(r.Hand), spot: spot, last: "", abs: [], sp: [0, 0, 0], oz: 0, ch: 0, f1: 0, f1sw: 0, brk: 0, brkwh: 0});
    var date = dstr_(r.Date);
    if (date >= H.last) { H.last = date; H.spot = spot; if (s_(r.PosName)) H.pos = s_(r.PosName); }
    hab[k] = H;
    if (a.result) {
      H.abs.push({d: date, r: a.result, h: a.hard});
      var x = num_(r.SprayX), y = num_(r.SprayY);
      if (s_(r.SprayX) !== "" && INPLAY[a.result]) {
        var dx = x - 100, side = Math.abs(dx) < 15 ? 1 : ((dx < 0) === (mUp_(H.b) !== "L") ? 0 : 2);   /* left field is a righty's pull side */
        H.sp[side]++;
      }
    }
  });
  get("Game_Pitches").filter(keep).forEach(function (r) {
    var H = hab[s_(r.RecordID) + "|" + s_(r.Spot) + "|" + s_(r.AB)]; if (!H) return;
    var call = s_(r.Call).toLowerCase(), sw = call === "swing&miss" || call === "foul" || call === "in play";
    if (mUp_(r.InZone) === "N") { H.oz++; if (sw) H.ch++; }
    if (num_(r.Pitch) === 1) { H.f1++; if (sw) H.f1sw++; }
    if (GTYPE[mUp_(r.Type)] === "CB" && sw) { H.brk++; if (call === "swing&miss") H.brkwh++; }
  });
  Object.keys(M.scout).forEach(function (k) {
    var o = M.scout[k];
    o.dates = Object.keys(o.dates).sort();
    o.pit = o.pord.map(function (nm) { var P = o.pit[nm]; P.games = Object.keys(P.games).length; P.innings = Object.keys(P.inn).length; P.started = Object.keys(P.first).length; delete P.inn; delete P.first; return P; });
    delete o.pord;
    o.hit = Object.keys(o.hit).map(function (nm) { return o.hit[nm]; }).sort(function (a, b) { return a.last > b.last ? -1 : a.last < b.last ? 1 : a.spot - b.spot; });
  });

  /* -------------------------------------------------------------- GameChanger */
  get("GameChanger").forEach(function (r) {
    var se = s_(r.Season).trim(), lv = levelName_(r.Level); if (!se || !lv) return;
    var S2 = M.gc[se] || (M.gc[se] = {at: "", lv: {}}), L = S2.lv[lv] || (S2.lv[lv] = {team: null, players: {}});
    var at = s_(r.ImportedAt); if (at > S2.at) S2.at = at;
    var v = {};
    Object.keys(r).forEach(function (c) { if (/^(Bat|Pit|Fld|Catch|Outs) /.test(c) && s_(r[c]) !== "") v[c] = num_(r[c]); });
    var st = s_(r.Status).toLowerCase(), pid = s_(r.PlayerID).trim();
    if (st.indexOf("team") >= 0) L.team = v;
    else if (pid) { L.players[pid] = v; who(pid, r.First, r.Last); }
  });

  /* -------------------------------------------------------------- comments, coaches, settings */
  var coaches = get("Coaches"), mine = mCoach_(coaches, opt.me);
  M.me = mine;
  M.comments = mComments_(opt.comments || {}, coaches);
  if (S) {
    M.cfg = {season: s_(S.season), budget: S.budget, saveGoal: S.saveGoal, goals: S.goals, lv: S.lv, ladder: S.ladder, rules: S.rules, hmin: S.hmin};
  }
  /* 2026 team lines: GameChanger when it has them, the season review's numbers when it doesn't */
  var g26 = (M.gc["2026"] || {lv: {}}).lv, tot = {};
  M.base.P = {}; M.base.H = {}; M.base.D = {};
  LEVELS.forEach(function (lv) {
    var t = (g26[lv] || {}).team;
    if (t) Object.keys(t).forEach(function (c) {
      /* rates add up weighted: first-pitch strikes by batters faced, strike % by pitches */
      if (c === "Pit FPS%" || c === "Pit Strike%") { var w = c === "Pit FPS%" ? (t["Pit BF"] || 0) : (t["Pit Pitches"] || t["Pit BF"] || 0); tot[c + "w"] = (tot[c + "w"] || 0) + t[c] * w; tot[c + "n"] = (tot[c + "n"] || 0) + w; }
      else tot[c] = (tot[c] || 0) + t[c];
    });
    M.base.P[lv] = t ? mGcPit_(t) : M_LAST26[lv];
    M.base.H[lv] = t ? mGcBat_(t) : {};
    M.base.D[lv] = t ? mGcDef_(t) : {};
  });
  ["Pit FPS%", "Pit Strike%"].forEach(function (c) { if (tot[c + "n"]) tot[c] = tot[c + "w"] / tot[c + "n"]; });
  mPlayersGc_(M);
  var any = LEVELS.some(function (lv) { return (g26[lv] || {}).team; });
  M.base.P.Program = any ? mGcPit_(tot) : null; M.base.H.Program = any ? mGcBat_(tot) : {}; M.base.D.Program = any ? mGcDef_(tot) : {};
  return M;
}

/* GameChanger rows -> the dashboard's measures */
function mGcPit_(v) {
  var bf = v["Pit BF"] || 0, outs = v["Pit Outs"] || 0, bb = v["Pit BB"] || 0, hbp = v["Pit HBP"] || 0, so = v["Pit SO"] || 0;
  return {free: bf ? (bb + hbp) * 100 / bf : null, fps: v["Pit FPS%"] != null ? v["Pit FPS%"] : null, strike: v["Pit Strike%"] != null ? v["Pit Strike%"] : null,
          k: bf ? so * 100 / bf : null, kbb: bb ? so / bb : null, uer: null, hard: null,
          whip: outs ? (bb + (v["Pit H"] || 0)) / (outs / 3) : null, era: outs ? (v["Pit ER"] || 0) * 7 / (outs / 3) : null, outs: outs, bf: bf};
}
function mGcBat_(v) {
  var pa = v["Bat PA"] || 0, ab = v["Bat AB"] || 0, h = v["Bat H"] || 0, bb = v["Bat BB"] || 0, hbp = v["Bat HBP"] || 0, sf = v["Bat SF"] || 0;
  var tb = h + (v["Bat 2B"] || 0) + 2 * (v["Bat 3B"] || 0) + 3 * (v["Bat HR"] || 0), sb = v["Bat SB"] || 0, cs = v["Bat CS"] || 0;
  return {k: pa ? (v["Bat SO"] || 0) * 100 / pa : null, free: pa ? (bb + hbp) * 100 / pa : null, obp: (ab + bb + hbp + sf) ? (h + bb + hbp) / (ab + bb + hbp + sf) : null,
          slg: ab ? tb / ab : null, sb: (sb + cs) ? sb * 100 / (sb + cs) : null, avg: ab ? h / ab : null, pa: pa, sbn: sb, csn: cs};
}
function mGcDef_(v) {
  var tc = v["Fld TC"] || 0, att = v["Catch SB Att"] || 0, co = v["Catch Outs"] || 0;
  return {fpct: tc ? ((v["Fld PO"] || 0) + (v["Fld A"] || 0)) / tc : null, cs: att ? (v["Catch CS"] || 0) * 100 / att : null, pb: co ? (v["Catch PB"] || 0) * 7 / (co / 3) : null};
}

/* Each player's GameChanger lines, ready for his page: 2026 (the baseline) and 2027 defense and
   the batting rates the Offense Chart can't chart (OBP, SLG, stolen bases). A player with rows at
   2 levels gets them added together, labelled with both. Also each level's 2027 team defense. */
var M_POS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
/* counts add up; a rate is kept only while there is one row to take it from (two levels' rates can't be added) */
function mAddGc_(a, v) {
  Object.keys(v).forEach(function (c) {
    if (/%|AVG|OBP|SLG|OPS|ERA|WHIP|FPCT/.test(c)) a[c] = a[c] === undefined ? v[c] : null;
    else a[c] = (a[c] || 0) + v[c];
  });
  return a;
}
function mDefX_(v) {
  var x = {tc: v["Fld TC"] || 0, po: v["Fld PO"] || 0, a: v["Fld A"] || 0, e: v["Fld E"] || 0, dp: v["Fld DP"] || 0, inn: {}, outs: 0, c: null};
  M_POS.forEach(function (k) { x.inn[k] = v["Outs " + k] || 0; x.outs += x.inn[k]; });
  x.fpct = x.tc ? (x.po + x.a) / x.tc : null;
  var co = v["Catch Outs"] || x.inn.C || 0, att = v["Catch SB Att"] || ((v["Catch SB"] || 0) + (v["Catch CS"] || 0));
  if (co || att) {
    var cs = v["Catch CS"] || 0, pb = v["Catch PB"] || 0;
    x.c = {outs: co, att: att, cs: cs, sb: att - cs, csp: att ? cs * 100 / att : null, pb: pb, pik: v["Catch PIK"] || 0, pb7: co ? pb * 7 / (co / 3) : null};
  }
  return x;
}
function mPlayersGc_(M) {
  M.gcp = {}; M.def27 = {};
  function each(season, fn) {
    var S = M.gc[season]; if (!S) return;
    LEVELS.forEach(function (lv) { var L = S.lv[lv]; if (!L) return; Object.keys(L.players).forEach(function (pid) { fn(pid, lv, L.players[pid]); }); });
  }
  function slot(pid) { return M.gcp[pid] || (M.gcp[pid] = {}); }
  var acc = {};
  function A(pid, k) { var a = acc[pid] || (acc[pid] = {}); return a[k] || (a[k] = {v: {}, lvs: []}); }
  each("2026", function (pid, lv, v) {
    if (v["Pit BF"]) { var a = A(pid, "p26"); mAddGc_(a.v, v); a.lvs.push(lv); }
    if (v["Bat PA"]) { var b = A(pid, "h26"); mAddGc_(b.v, v); b.lvs.push(lv); }
    if (v["Fld TC"] || v["Catch Outs"]) { var c = A(pid, "d26"); mAddGc_(c.v, v); c.lvs.push(lv); }
  });
  each("2027", function (pid, lv, v) {
    var d = A(pid, "d27"); mAddGc_(d.v, v); d.lvs.push(lv);
    if (v["Bat PA"]) { var b = A(pid, "h27"); mAddGc_(b.v, v); b.lvs.push(lv); }
  });
  Object.keys(acc).forEach(function (pid) {
    var a = acc[pid], o = slot(pid);
    if (a.p26) { var m = mGcPit_(a.p26.v); o.p26 = {lv: a.p26.lvs.join(" + "), outs: m.outs, bf: m.bf, m: m}; }
    if (a.h26) { var h = mGcBat_(a.h26.v); o.h26 = {lv: a.h26.lvs.join(" + "), pa: h.pa, m: h}; }
    if (a.d26) { var x = mDefX_(a.d26.v); o.d26 = {fpct: x.fpct, csp: x.c ? x.c.csp : null, pb7: x.c ? x.c.pb7 : null}; }
    if (a.d27) { o.d27 = mDefX_(a.d27.v); o.d27.lvs = a.d27.lvs; }
    if (a.h27) o.h27 = mGcBat_(a.h27.v);
  });
  /* 2027 level defense: GameChanger's team totals line when it has one (it counts players who aren't on the roster) */
  var S27 = M.gc["2027"], all = {}, anyTeam = false;
  LEVELS.forEach(function (lv) {
    var L = S27 && S27.lv[lv]; if (!L) return;
    var v = L.team;
    if (!v) { v = {}; Object.keys(L.players).forEach(function (pid) { mAddGc_(v, L.players[pid]); }); } else anyTeam = true;
    var x = mDefX_(v);
    M.def27[lv] = {tc: x.tc, po: x.po, a: x.a, e: x.e, dp: x.dp, catt: x.c ? x.c.att : 0, ccs: x.c ? x.c.cs : 0, cpb: x.c ? x.c.pb : 0, couts: x.c ? x.c.outs : 0};
    mAddGc_(all, v);
  });
  /* 2027 batting rates the Offense Chart can't chart (OBP, SLG, stolen bases), by level and for the program */
  M.base.H27 = {};
  var hall = {};
  LEVELS.forEach(function (lv) {
    var L = S27 && S27.lv[lv]; if (!L) return;
    var v = L.team;
    if (!v) { v = {}; Object.keys(L.players).forEach(function (pid) { mAddGc_(v, L.players[pid]); }); }
    if (v["Bat PA"]) { M.base.H27[lv] = mGcBat_(v); mAddGc_(hall, v); }
  });
  if (hall["Bat PA"]) M.base.H27.Program = mGcBat_(hall);
  if (S27) { var px = mDefX_(all); M.def27.Program = {tc: px.tc, po: px.po, a: px.a, e: px.e, dp: px.dp, catt: px.c ? px.c.att : 0, ccs: px.c ? px.c.cs : 0, cpb: px.c ? px.c.pb : 0, couts: px.c ? px.c.outs : 0}; }
  M.gcAt = S27 ? S27.at : "";
  /* 2026 errors per 7 innings by level, for the note under the level table */
  var S26 = M.gc["2026"]; M.e7_26 = {};
  if (S26) LEVELS.forEach(function (lv) { var t = S26.lv[lv] && S26.lv[lv].team; if (t && t["Outs Total"]) M.e7_26[lv] = (t["Fld E"] || 0) * 7 / (t["Outs Total"] / 9 / 3); });
  /* the raw rows have served their purpose; the page never needs them */
  M.gc = {};
}

/* the Coaches tab: who is looking, and which levels he coaches ("All" = every level) */
function mLevels_(raw) { raw = s_(raw); return /all/i.test(raw) ? LEVELS.slice() : raw.split(/[,;\/&]|\band\b/).map(levelName_).filter(Boolean); }
function mCoach_(coaches, me) {
  me = String(me || "").toLowerCase().trim();
  var r = coaches.filter(function (x) { return me && String(x["Google account"] || "").toLowerCase().trim() === me; })[0];
  return {email: me, name: r ? s_(r.Name) : "", levels: r ? mLevels_(r["Level(s)"]) : [], winter: !!(r && pitchCoach_(r))};
}
/* the comments spreadsheet's tabs (4 levels + Winter) -> one list, with each writer's name from the Coaches tab */
function mComments_(byLv, coaches) {
  var names = {}, out = [];
  coaches.forEach(function (r) { var em = String(r["Google account"] || "").toLowerCase().trim(); if (em) names[em] = s_(r.Name); });
  Object.keys(byLv || {}).forEach(function (lv) {
    (byLv[lv] || []).forEach(function (r) {
      var t = s_(r.Comment).trim(), pid = s_(r.PlayerID).trim(); if (!t || !pid) return;
      var by = String(r.By || "").toLowerCase().trim();
      out.push({id: pid, lv: commentLevelName_(lv), role: s_(r.Role).trim(), text: t, by: names[by] || by, at: s_(r.At)});
    });
  });
  return out;
}
