/* Pitch Chart v29: charting is locked until Setup is finished (level, date,
   opponent, starting pitcher, a name and a jersey number in every lineup spot).
   Suites that just need to get to charting run this in the page. It only fills
   what is still blank, so a suite that set its own date, opponent or starter keeps
   them, and it leaves the app on whatever tab it found. */
module.exports.FILL_SETUP = `(function(){
  var set = function(id, v){ var e = document.getElementById(id);
    if(e && !e.value){ e.value = v; e.dispatchEvent(new Event("input", {bubbles:true})); } };
  set("fDate", "2027-04-18"); set("fOpp", "Test Opponent");
  var sp = document.getElementById("suPitcher");
  if(sp && !sp.value){
    var opt = [].slice.call(sp.options).find(function(o){ return o.value; });
    if(opt){ sp.value = opt.value; sp.dispatchEvent(new Event("change", {bubbles:true})); }
  }
  [].slice.call(document.querySelectorAll("#suRows tr")).forEach(function(tr, i){
    ["name", "jersey"].forEach(function(f){
      var x = tr.querySelector('[data-su="' + f + '"]');
      if(!x || x.value) return;
      x.dispatchEvent(new Event("focus"));
      x.value = f === "name" ? "Hitter " + (i + 1) : String(40 + i);
      x.dispatchEvent(new Event("input", {bubbles:true}));
      x.dispatchEvent(new Event("change", {bubbles:true}));
    });
  });
  return "filled";
})()`;

/* Offense Chart v48: the same lock. Fills only what is blank: the opponent, their
   starter, and a different roster hitter in every open spot of our order (the date
   defaults to today). Each pick redraws the rows, so every pass re-reads them. */
module.exports.FILL_OFFENSE = `(function(){
  var set = function(id, v){ var e = document.getElementById(id);
    if(e && !e.value){ e.value = v; e.dispatchEvent(new Event("input", {bubbles:true}));
                       e.dispatchEvent(new Event("change", {bubbles:true})); } };
  set("fDate", "2027-04-18"); set("fOpp", "Test Opponent");
  var tab = document.getElementById("tab-setup");
  if(document.getElementById("v-setup").hidden && tab) tab.click();
  var p = document.querySelector('[data-pi="0"] input[data-pf="name"]');
  if(p && !p.value){ p.value = "Test Starter"; p.dispatchEvent(new Event("input", {bubbles:true})); }
  for(var guard = 0; guard < 20; guard++){
    var rows = [].slice.call(document.querySelectorAll('select[data-lf="rid"]'));
    var open = rows.filter(function(s){ return !s.value; })[0];
    if(!open) break;
    var used = {}; rows.forEach(function(s){ if(s.value) used[s.value] = 1; });
    var opt = [].slice.call(open.options).filter(function(o){ return o.value && !used[o.value]; })[0];
    if(!opt) break;
    open.value = opt.value;
    open.dispatchEvent(new Event("input", {bubbles:true}));
    open.dispatchEvent(new Event("change", {bubbles:true}));
  }
  return "filled";
})()`;
