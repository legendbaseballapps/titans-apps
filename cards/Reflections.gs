/* Titans Reflections (coaches' page)
   ==================================
   A second, small Apps Script web app: every player reflection, newest first, with
   a filter by level and player, and the list of cards still waiting on one. It
   folds into the coaching dashboard when that is built.

   It runs AS THE COACH who opens it, not as the program account, so two things
   must both be true for a coach to see anything:
     1. the season Sheet is shared with his Google account (Google enforces this), and
     2. his Google account is on the Coaches tab (this script checks).
   A player's private link can never open it.

   Setup, once (full steps in claude/player-cards-setup.md):
     1. script.google.com > New project "Titans Reflections" > paste this over Code.gs
     2. Script property SEASON_SHEET_ID, the same ID the cards script uses
     3. Deploy > New deployment > Web app. Execute as: User accessing the web app.
        Who has access: Anyone with a Google account.
     4. Put the /exec URL in the cards script's REFLECTIONS_URL property, so the
        heads-up emails link here. Each coach approves a one-time Google prompt. */

var VERSION = "reflections 1 (Oct 2026)";

function doGet(e) {
  var q = (e && e.parameter) || {};
  var me = "";
  try { me = String(Session.getActiveUser().getEmail() || "").toLowerCase().trim(); } catch (x) {}
  var ss;
  try { ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SEASON_SHEET_ID")); }
  catch (x) { return page_("No access", '<div class="box"><h1>No access</h1><p>The season Sheet is not shared with ' +
    e_(me || "this account") + ". Ask Jim to share it.</p></div>"); }
  var coaches = rows_(ss, "Coaches").filter(function (r) {
    return String(r["Google account"] || "").toLowerCase().trim() === me && me; });
  if (!coaches.length) return page_("No access", '<div class="box"><h1>No access</h1><p>' + e_(me || "This account") +
    " is not on the Coaches tab. Ask Jim to add it.</p></div>");
  var level = String(q.level || ""), player = String(q.player || ""), flagged = q.flag === "1";
  var all = rows_(ss, "Reflections");
  all.sort(function (a, b) { return String(a.When) < String(b.When) ? 1 : -1; });
  var levels = uniq_(all.map(function (r) { return String(r.Level || ""); }).filter(String));
  var players = uniq_(all.map(function (r) { return String(r.Player || ""); }).filter(String));
  var list = all.filter(function (r) {
    return (!level || String(r.Level) === level) && (!player || String(r.Player) === player) && (!flagged || String(r.Flag));
  });
  var base = ScriptApp.getService().getUrl();
  function sel(name, opts, cur, all) {
    return '<select name="' + name + '" onchange="this.form.submit()"><option value="">' + all + "</option>" + opts.map(function (o) {
      return '<option' + (o === cur ? " selected" : "") + ' value="' + e_(o) + '">' + e_(o) + "</option>"; }).join("") + "</select>";
  }
  var filters = '<form class="filters" method="get" action="' + e_(base) + '" target="_top">' +
    sel("level", levels, level, "Every level") + sel("player", players, player, "Every player") +
    '<label><input type="checkbox" name="flag" value="1"' + (flagged ? " checked" : "") + ' onchange="this.form.submit()"> Flagged only</label></form>';
  var cards = list.map(function (r) {
    var flag = String(r.Flag || "");
    return '<div class="r' + (flag ? " flag" : "") + '"><div class="top"><b>' + e_(r.Player) + "</b>" +
      '<span class="ev">' + e_(r.Level) + " &middot; " + e_(r.Event) + "</span>" +
      (flag ? '<span class="tag">' + e_(flag) + "</span>" : "") + "</div>" +
      '<div class="nums"><span>' + (r.Kind === "hit" ? "Body" : "Arm") + " <b>" + e_(r["Arm/Body"]) + "</b>/5</span><span>Feel <b>" + e_(r.Feel) + "</b>/5</span>" +
      (r.LastStart ? "<span>Last START: " + e_(r.LastStart) + " &rarr; <b>" + e_(r.DidLastStart || "no answer") + "</b></span>" : "") + "</div>" +
      line_("START", r.Start) + line_("STOP", r.Stop) + line_("CONTINUE", r.Continue) + line_("Bothering him", r.Bothering) +
      '<div class="when">' + e_(String(r.When).replace("T", " ").slice(0, 16)) + " UTC" +
      (r.FlaggedTo ? " &middot; heads-up to " + e_(r.FlaggedTo) : "") + "</div></div>";
  }).join("");
  /* Cards out in the last 14 days with no reflection yet. */
  var since = new Date(Date.now() - 14 * 86400000).toISOString();
  var waiting = rows_(ss, "Cards").filter(function (c) {
    return /^(sent|test)$/.test(String(c.Status)) && !c.ReflectionAt && String(c.SentAt) >= since;
  });
  var names = {};
  rows_(ss, "Players").forEach(function (p) { names[String(p.PlayerID)] = (p.First + " " + p.Last).trim(); });
  var wait = waiting.filter(function (c) { return !player || names[String(c.PlayerID)] === player; }).map(function (c) {
    return "<li><b>" + e_(names[String(c.PlayerID)] || c.PlayerID) + "</b> &middot; " + e_(c.Event) + "</li>"; }).join("");
  return page_("Reflections", '<div class="head"><div class="org">Legend Titans Baseball</div><h1>Reflections</h1>' +
    "<p>" + list.length + " shown, newest first. Flags emailed the coaches when they came in.</p>" + filters + "</div>" +
    (cards || '<div class="box"><p>No reflections match.</p></div>') +
    (wait ? '<div class="box"><h2>Still waiting, last 14 days</h2><ul>' + wait + "</ul></div>" : ""));
}

function rows_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), h = v[0].map(function (x) { return String(x).trim(); });
  return v.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { if (k) o[k] = r[i] instanceof Date ? r[i].toISOString() : r[i]; }); return o; });
}
function uniq_(a) { var o = {}; a.forEach(function (x) { o[x] = 1; }); return Object.keys(o).sort(); }
function line_(l, v) { return v === "" || v == null ? "" : '<div class="ln"><span>' + l + "</span>" + e_(v) + "</div>"; }
function e_(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function page_(title, inner) {
  var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>" + e_(title) + '</title><base target="_top"><style>' +
    "body{margin:0;background:#ECEFF5;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#16233A}" +
    ".wrap{max-width:760px;margin:0 auto;padding:12px 10px 40px}.head,.box,.r{background:#fff;border:1px solid #D2D9E6;border-radius:10px;padding:14px 16px;margin-top:10px}" +
    ".org{font-weight:700;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#C85C1C}h1{font-size:26px;text-transform:uppercase;color:#16305C;margin:4px 0}" +
    "h2{font-size:17px;text-transform:uppercase;color:#16305C;margin:0 0 8px}.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}" +
    "select{font:inherit;padding:6px;border:1px solid #D2D9E6;border-radius:6px}.r.flag{border-left:5px solid #C85C1C}" +
    ".top{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}.ev{color:#5A6781;font-size:14px}.tag{background:#FBE3D2;color:#C85C1C;font-weight:700;font-size:12px;padding:2px 8px;border-radius:10px;text-transform:uppercase}" +
    ".nums{display:flex;flex-wrap:wrap;gap:14px;margin:8px 0;font-size:14px}.ln{margin:4px 0;font-size:15px}.ln span{display:inline-block;width:110px;font-size:12px;font-weight:700;letter-spacing:1px;color:#5A6781;text-transform:uppercase}" +
    ".when{font-size:12px;color:#5A6781;margin-top:6px}ul{margin:0;padding-left:18px}li{margin:4px 0}" +
    '</style></head><body><div class="wrap">' + inner + "</div></body></html>";
  return HtmlService.createHtmlOutput(html).setTitle("Titans Reflections").addMetaTag("viewport", "width=device-width, initial-scale=1");
}
