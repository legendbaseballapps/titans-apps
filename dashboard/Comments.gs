/* Titans Coaches Dashboard: coach comments (dashboard 2.0, Nov 2026)
   ===================================================================
   The plan (Oct 12, Jim): "Only coaches of the level(s) the player played for can write; every coach can
   read." The season Sheet stays view-only for coaches, so comments live in their own spreadsheet:

     one tab per level (Varsity, JV, Sophomore, Freshman), columns PlayerID | Player | Role | Comment | By | At
     each tab protected so only that level's coaches (the Coaches tab) can edit it

   The dashboard runs as the coach who opens it, so a save is made with HIS Google account and Google itself
   enforces the protection, even for someone who opens the comments spreadsheet directly. This script also
   checks the Coaches tab before it writes, so a refused save says why.

   Setup, once, as Jim (the program account owns it): Apps Script editor > select setupComments > Run.
   It makes "Titans Exit Comments <season>" (or reuses COMMENTS_SHEET_ID), the 4 tabs and the protections, shares it with
   every coach, and saves COMMENTS_SHEET_ID. Run it again whenever the Coaches tab changes.

   Role: blank for a player who only pitched or only hit; "Pitching" or "Hitting" for a two-way player, who gets
   a comment for each side. One comment per player, level and role: a save replaces the last one. */

var COMMENT_HEAD = ["PlayerID", "Player", "Role", "Comment", "By", "At"];
var COMMENT_MAX = 1500;

function coachLevels_(coaches) {
  var o = {};
  coaches.forEach(function (r) { var em = String(r["Google account"] || "").toLowerCase().trim(); if (em) o[em] = mLevels_(r["Level(s)"]); });
  return o;
}
function commentsBook_() {
  var id = PropertiesService.getScriptProperties().getProperty("COMMENTS_SHEET_ID");
  return id ? SpreadsheetApp.openById(id) : null;
}
/* every level's comments, for the page; {} when comments aren't set up or this coach can't open them */
function commentsFor_(coaches) {
  var out = {};
  try {
    var book = commentsBook_(); if (!book) return out;
    LEVELS.forEach(function (lv) { out[lv] = rows_(book, lv); });
  } catch (x) {}
  return out;
}

/* Called from the page (google.script.run.saveComment). c: {id, lv, role, text, player} */
function saveComment(c) {
  c = c || {};
  var me = "";
  try { me = String(Session.getActiveUser().getEmail() || "").toLowerCase().trim(); } catch (x) {}
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SEASON_SHEET_ID"));
  var lv = levelName_(c.lv), id = String(c.id || "").trim(), role = /^(Pitching|Hitting)$/.test(c.role) ? c.role : "";
  var text = String(c.text == null ? "" : c.text).replace(/\r\n?/g, "\n").trim();
  if (!lv || !id) throw new Error("Which player and level is missing.");
  var mine = coachLevels_(rows_(ss, "Coaches"))[me] || [];
  if (mine.indexOf(lv) < 0) throw new Error("Only " + lv + " coaches can write " + lv + " comments. Ask Jim to add " + lv + " to your row on the Coaches tab.");
  if (text.length > COMMENT_MAX) throw new Error("Keep it under " + COMMENT_MAX + " characters.");
  var book = commentsBook_();
  if (!book) throw new Error("Comments aren't set up yet. Jim runs setupComments once.");
  var sh = book.getSheetByName(lv);
  if (!sh) throw new Error("The comments spreadsheet has no " + lv + " tab. Jim runs setupComments again.");
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var last = sh.getLastRow(), at = new Date().toISOString(), row = -1;
    if (last >= 2) {
      var v = sh.getRange(2, 1, last - 1, 3).getValues();
      for (var i = 0; i < v.length; i++) if (String(v[i][0]) === id && String(v[i][2]) === role) { row = i + 2; break; }
    }
    if (!text) { if (row > 0) sh.deleteRow(row); return {id: id, lv: lv, role: role, text: "", by: "", at: at}; }
    /* text stays text: a comment that starts with = or + is never a formula */
    var vals = [["'" + id, "'" + String(c.player || ""), role, "'" + text, me, at]];   /* the apostrophe keeps text as text, never a formula or a date */
    if (row > 0) sh.getRange(row, 1, 1, 6).setValues(vals); else sh.appendRow(vals[0]);
    var name = (rows_(ss, "Coaches").filter(function (r) { return String(r["Google account"] || "").toLowerCase().trim() === me; })[0] || {}).Name;
    return {id: id, lv: lv, role: role, text: text, by: s_(name) || me, at: at};
  } finally { lock.releaseLock(); }
}

/* Jim runs this once, and again whenever the Coaches tab changes. */
function setupComments() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty("SEASON_SHEET_ID"));
  var book = commentsBook_();
  if (!book) {
    book = SpreadsheetApp.create("Titans Exit Comments " + (settings_(ss).season || ""));
    props.setProperty("COMMENTS_SHEET_ID", book.getId());
  }
  var levels = coachLevels_(rows_(ss, "Coaches")), everyone = Object.keys(levels);
  LEVELS.forEach(function (lv) {
    var sh = book.getSheetByName(lv) || book.insertSheet(lv);
    if (sh.getLastRow() < 1) sh.getRange(1, 1, 1, COMMENT_HEAD.length).setValues([COMMENT_HEAD]);
    sh.getRange("D:D").setNumberFormat("@");
    var who = everyone.filter(function (em) { return levels[em].indexOf(lv) >= 0; });
    var prot = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0] || sh.protect();
    prot.setDescription(lv + " coaches only");
    var now = prot.getEditors().map(function (u) { return u.getEmail().toLowerCase(); });
    var drop = now.filter(function (em) { return who.indexOf(em) < 0; });
    if (drop.length) prot.removeEditors(drop);
    if (who.length) prot.addEditors(who);
    if (prot.canDomainEdit && prot.canDomainEdit()) prot.setDomainEdit(false);
  });
  var first = book.getSheets()[0];
  if (book.getSheets().length > LEVELS.length && first && LEVELS.indexOf(first.getName()) < 0 && first.getLastRow() === 0) book.deleteSheet(first);
  /* every coach can open it (to read on the page); the tab protections decide who can write */
  if (everyone.length) book.addEditors(everyone);
  Logger.log("Comments ready: " + book.getUrl() + " . Writers: " + LEVELS.map(function (lv) {
    return lv + " " + everyone.filter(function (em) { return levels[em].indexOf(lv) >= 0; }).length; }).join(", "));
}
