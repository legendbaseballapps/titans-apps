/* Legend Titans — bullpen script templates
   ----------------------------------------
   Four-week winter progression. Every mound loads the same one, which is the
   only reason the Report tab's ranking means anything.

   THE ONE THING TO KNOW: the weeks are strictly cumulative. Every call in
   Week 1 is still in Week 4 — later weeks only ADD. That is what makes a
   pitcher's week-over-week numbers comparable: when his "FB down & away from
   the wind-up" improves, it improved against the same test, not an easier one.
   If you edit a week, carry the change forward into the later weeks or that
   property is gone and nobody will notice until February.

   Shape of every week: location work (no situation) → situational work →
   two-strike compete finish.

   The four routines run IN THE ORDER THEY APPEAR BELOW. The dropdown follows
   this file, so keep them in sequence — the names say what each one works,
   not which week it is:

     1  Fastball Command         25  FB + CH, wind-up only
     2  Breaking Ball & Stretch  30  + the breaking ball, + the stretch
     3  Holding Runners          35  + the slide step
     4  Hitter's Counts          40  + change-up off the slide step,
                                     + 2-0 breaking ball

   The name goes into the Template column of every export row. Since it carries
   no week number, sort a merged file by Date, not by Template.

   Getting loose is NOT in these scripts. The first charted pitch is one he is
   trying to execute, so every number in the report means something. Count his
   warm-up separately against PitchSafe.

   CB covers every breaking ball. A slider guy throws his slider on a CB row —
   it is too pitcher-specific to script. The export cannot tell them apart.

   The 2-0 pitch is called to location 0, middle. In a hitter's count the job
   is a strike, not a corner. It is the only place middle is called on purpose.

   To add your own:
     1. Build the script on an iPad (+ Add pitch / + Repeat last)
     2. Tap "Save as template" — it hands you the finished line
     3. Paste it below and change the name
     4. Upload this file AND bump the version in sw.js, or the iPads
        keep serving the list they already have
*/
window.TITANS_BULLPEN_TEMPLATES = [
  {name:"Fastball Command", code:"TBP1.W1s0LCJGQiIsIlciLDUsIiJdLFs0LCJGQiIsIlciLDMsIiJdLFs0LCJGQiIsIlciLDIsIiJdLFsyLCJDSCIsIlciLDUsIiJdLFsyLCJDSCIsIlciLDMsIiJdLFszLCJDSCIsIlciLDAsIjIwIl0sWzMsIkNIIiwiVyIsNiwiMksiXSxbMywiRkIiLCJXIiw3LCIySyJdXQ"},
  {name:"Breaking Ball & Stretch", code:"TBP1.W1s0LCJGQiIsIlciLDUsIiJdLFs0LCJGQiIsIlciLDMsIiJdLFs0LCJGQiIsIlciLDIsIiJdLFsyLCJDSCIsIlciLDUsIiJdLFsyLCJDSCIsIlciLDMsIiJdLFszLCJDQiIsIlMiLDUsIiJdLFszLCJDSCIsIlciLDAsIjIwIl0sWzIsIkZCIiwiUyIsNSwiUjEiXSxbMywiQ0giLCJXIiw2LCIySyJdLFszLCJGQiIsIlciLDcsIjJLIl1d"},
  {name:"Holding Runners", code:"TBP1.W1s0LCJGQiIsIlciLDUsIiJdLFs0LCJGQiIsIlciLDMsIiJdLFs0LCJGQiIsIlciLDIsIiJdLFsyLCJDSCIsIlciLDUsIiJdLFsyLCJDSCIsIlciLDMsIiJdLFszLCJDQiIsIlMiLDUsIiJdLFszLCJDSCIsIlciLDAsIjIwIl0sWzIsIkZCIiwiUyIsNSwiUjEiXSxbMywiRkIiLCJTUyIsNSwiUjIiXSxbMywiQ0giLCJXIiw2LCIySyJdLFsyLCJDQiIsIlMiLDYsIjJLIl0sWzMsIkZCIiwiVyIsNywiMksiXV0"},
  {name:"Hitter's Counts", code:"TBP1.W1s0LCJGQiIsIlciLDUsIiJdLFs0LCJGQiIsIlciLDMsIiJdLFs0LCJGQiIsIlciLDIsIiJdLFsyLCJDSCIsIlciLDUsIiJdLFsyLCJDSCIsIlciLDMsIiJdLFszLCJDQiIsIlMiLDUsIiJdLFszLCJDSCIsIlNTIiw1LCIiXSxbMywiQ0giLCJXIiwwLCIyMCJdLFsyLCJDQiIsIlMiLDAsIjIwIl0sWzIsIkZCIiwiUyIsNSwiUjEiXSxbMywiRkIiLCJTUyIsNSwiUjIiXSxbMywiQ0giLCJXIiw2LCIySyJdLFsyLCJDQiIsIlMiLDYsIjJLIl0sWzMsIkZCIiwiVyIsNywiMksiXV0"}
];
