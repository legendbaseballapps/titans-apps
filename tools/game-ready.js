/* Pitch Chart v29: charting is locked until Setup is finished (level, date,
   opponent, starting pitcher, a name and a jersey number in every lineup spot).
   Suites that just need to get to charting run this in the page. It only fills
   what is still blank, so a suite that set its own date, opponent or starter keeps
   them, and it leaves the app on whatever tab it found. */
module.exports.FILL_SETUP = `(function(){
  var set = function(id, v){ var e = document.getElementById(id);
    if(e && !e.value){ e.value = v; e.dispatchEvent(new Event("input", {bubbles:true})); } };
  set("fDate", "4-18"); set("fOpp", "Test Opponent");
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
