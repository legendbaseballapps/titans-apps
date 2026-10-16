# Legend Titans apps — change log

What changed, in what version, for all three iPad apps.

Two jobs, so every entry has two parts:

- **The headline** — one line you can read out, text to the staff, or paste into a group chat.
- **The detail** — what actually changed, for when something behaves differently than you remember.

**Where to find a version:** it's printed in each app's header, right after the app name. If it
shows two numbers in amber (`v23 ≠ v21`), that iPad downloaded an update but is still serving the
old one — tap the amber stamp to fix it.

---

## Where everything stands

| App | Source & folder | Live on GitHub Pages |
|---|---|---|
| **Bullpen Chart** | **v32** | v29 — **v30, v31 and v32 waiting to be pushed** (receiver deployed Oct 15, URL and key in; **push before Jan 8**) |
| **Pitch Chart** (game) | **v25** | **v20** — **v21 to v25 waiting to be pushed** |
| **Offense Chart** | **v45** | v40 — **v41 to v45 waiting to be pushed** |

**The site moved Oct 14, 2026** to the program-owned account: **legendbaseballapps.github.io/titans-apps** (repo transferred from vaughnzj, so the live files, including the real `roster.js`, moved as they were). Every iPad installs from the new link; History saved under the old address does not carry over. The Coach's Guides in the pending builds (bullpen v31, game v23, offense v42) carry the new address, so pushing those builds is what puts it on the iPads.

Verified live Oct 8 against the Pages URLs: bullpen v29, offense v40, game v18, and
`game/roster.js` serving the 66-player release stamped 2026-10-07 with no sample flag.

**All three apps read the roster**, so `roster.js` needs a copy in `bullpen/`, `offense/`
**and `game/`** — the same file, three times. A service worker can only cache files inside its own
folder, so one shared copy at the repo root would work online and vanish the moment an iPad lost
signal.

**Do not overwrite `bullpen/roster.js` or `offense/roster.js`.** The copies already live on GitHub
are the real 66-player release. The copy in the working folder is the 4-player SAMPLE. Push
`game/roster.js`, then copy one of the live files over it — or download a fresh `roster.js` out of
the Roster Manager and drop it into all three folders at once.

**No cache bump is needed for a roster change.** Since v28/v38 the roster is fetched from the
network first, so a corrected roster reaches every iPad on the next open with signal. A cache bump
is only for app code.

---

## Bullpen Chart

### v32 · Oct 15, 2026
**Headline:** Filed pens go to the coaching dashboard on their own, a **Practice session** switch
keeps training pens out of it, and the red **Erase everything** button is switched off for the winter.

- **Upload on its own.** Every filed session is sent to the program's upload receiver (a Google Apps
  Script on the program account that writes into the season Sheet). It sends at filing, 600 ms after
  the app opens, when the iPad gets signal back, and when the app comes back to the front. Oldest
  first, one at a time, and it **stops at the first failure** so a dead connection is not hammered.
- **Never blocks.** Charting, filing and every tab work while a send is in flight. A send that takes
  longer than 20 seconds is abandoned and tried again next time.
- **Marked sent only on the receiver's ok.** A session is stamped `up` only when the receiver says it
  stored it (or already had it). Anything else leaves it queued with the reason. Sending the same
  session twice is harmless: the receiver ignores a RecordID it already has.
- **One status line on History** (*Every filed session is on the dashboard* / *2 sessions waiting
  to upload* / red if the receiver turned something away) and a pill per session: **on dashboard**,
  **waiting**, **practice**. The "unsent" export nag only shows on a build with upload switched off.
- **Practice session** switch on Setup. A practice pen charts and files like any other but is
  **never sent**. A bar on the Chart tab says it is on, it switches itself off at filing so the next
  pen is real, and the export carries a new `Practice` column.
- **Erase everything is off:** `var ALLOW_WIPE = false;`. Hidden, disabled, no handler. The control
  is still in the code, and the suite still proves it by serving the app with the switch forced on.
- **One config spot:** `UPLOAD_URL` and `UPLOAD_KEY`, just under `BUILD`. A blank URL means upload
  is off, the app says so on History, and the old export pills come back. **v32 ships with the real
  receiver's address and key** (deployed by Jim Oct 15 on the program account). The key is not a
  secret, it is in public app code by design; the receiver never returns data.
- **No test can reach the real receiver.** Every suite's browser is launched with Google's script
  hosts unresolvable, and the upload suite rewrites the address to its stand-in and refuses to serve
  the page if the real one survives. `version-audit.py` now checks the URL shape and the key length.
- **How it talks:** a plain-text POST with no custom headers, so the browser sends no preflight
  (Apps Script cannot answer one), following Apps Script's redirect to the reply.
- **Tests:** `tools/receiver/upload.js` (99 checks: the receiver on a stand-in Sheet that turns
  unguarded text into formulas and dates the way Sheets does, then the real app in Chromium against
  it on another origin: filing, practice, no signal, a lost reply, a refusal, a slow receiver, four
  mounds at once). The sweep gained the practice switch and the upload line.

### v31 · Oct 9, 2026
**Headline:** A red **Erase everything on this iPad** button, for testing. It deletes the session in
progress *and everything in History*, which nothing else in the app does.

- **Why:** Jim, testing through the back half of the season — *"if I am testing during a game
  between now and the winter I need to be able to clear and start over."* Every other control
  protects History on purpose; this is the one that does not, and it is the only one.
- **It names the cost before it does anything**, counted from what is actually there: the session in
  progress with its pitch count, how many filed sessions are in History, and **how many of those have
  never been exported** — the only genuinely unrecoverable part. It points at History's Export
  button as the way out, and **Cancel is the button it opens on**.
- **The roster is never touched.** It ships with the app, is read-only, and its storage key is
  *shared with the other two apps* — wiping it here would silently change their banners. Only this
  app's own keys go: `titans-bullpen-v1, titans-bullpen-archive-v1`.
- **It reloads rather than re-renders.** Half the app's state lives in module variables, and a
  render would write them straight back into the storage just emptied.
- Same control, same wording and same warning in all three apps, per the shared-ritual rule.

- **It has a switch, and the switch is the point.** Jim: *"Make this a feature that is easily
  turned on and off for testing purposes. It will NOT exist once we get to the real charting."*
  One line, `var ALLOW_WIPE = true;`, sitting **immediately above `BUILD`** — bumping the version
  is the one ritual that happens before every push, so the flag cannot ship without being read.
- **`false` hides the block, disables the button and never binds the handler.** Jim's call on the
  shape: *"Should just disable the button / and hide it."* Three independent reasons nothing
  happens, so none of them is load-bearing alone, and flipping back to `true` restores the control
  with nothing to put back. The suite proves **both positions** by serving the app with the flag
  actually flipped, rather than by reading the branch and believing it.
- **`tools/version-audit.py` shouts about it.** Any app with the flag on prints
  `!!! ERASE EVERYTHING IS ON` and a reminder, so the pre-push check surfaces it every time.

### v30 · Oct 9, 2026
**Headline:** The version number in the guide's footer was wrong, and had been for
twenty-one releases. Nothing else changed.

- It said **app v8** at the bottom of the guide while the top of the same page said
  **v29**. Two different version numbers on one page is the exact confusion the build
  stamp exists to prevent, so it is worth a release on its own.
- **Why it rotted:** `tools/version-audit.py` checked five version locations and the footer
  was not one of them. Every other location has a symptom when it goes wrong — the app nags,
  or a coach follows the wrong instructions. A footer nobody reads has no symptom at all, so
  nothing ever caught it. **It is the sixth location now**, and it was proved failable before
  being trusted.
- All three apps were stale in the same way at the same time: bullpen said v8, offense v27,
  the Pitch Chart v14. All three are fixed in one push.

### v29 · Oct 7, 2026
**Headline:** The roster list is folded away by default. The banner that tells you *which* roster
this iPad has is still right there — one tap opens the players when you want them.

- **Why.** 66 players is about 2,200 pixels of list, and it sat directly above **Pitchers on this
  mound** — roughly three screens of scrolling between the script and the panel you actually start
  a session with. You pick arms off a dropdown, so the list is reference, not the screen.
- **The banner stays visible.** That was the one thing worth arguing about: it is what catches a
  sample roster, a leftover local one or a stale iPad *before* a session, and a signal behind a tap
  is a signal nobody reads.
- **It opens itself when something is wrong.** Green banner → folded. Amber or red → already open,
  because the list is the next thing you want to see.
- The button says **Show all 66** so you know the size before you tap, and **Hide the roster** once
  it is open.
- Closed again every time the app opens — predictable rather than clever — but once you have
  tapped it open it stays open while you work, even as the screen redraws.

### v28 · Oct 7, 2026
**Headline:** Releasing a roster is now just dropping the file in and pushing. No version numbers
to bump, nothing to remember.

- `roster.js` is the **one file the app checks the server for first**, falling back to the copy it
  already has. Everything else is still cache-first, which is what makes the app open with no
  signal.
- **Why it changed.** A roster is data and changes far more often than the app does — jerseys in
  the spring, a kid added, a spelling fixed. Under the old rule every one of those was a code
  release with two version numbers to bump, and forgetting them failed *silently*: the server had
  the new roster, every iPad kept the old one, and nothing on screen said so.
- **It will not hang on bad wifi.** The network gets **2.5 seconds**, then the app serves the
  roster it already has and carries on. That matters more than it sounds: a gym wifi that accepts
  the connection and never answers would otherwise freeze the app on its own roster, before the
  first pitch. Measured: usable in **2.6s** against a server stalling for 6.
- A response that arrives after the app gave up is **not** saved. Storing it would mean the next
  session showed a roster this one declined to use.
- **Still bump the cache for an app change** — index.html, the guide, templates.js. That part is
  unchanged.

### v27 · Oct 7, 2026
**Headline:** Last and first name are separate now, which fixes a real bug: two players
with the same last name used to import as **one person**. On screen a player still reads as
just his last name — he only picks up an initial when there's a second one of him.

- **The bug.** Uploading a roster with a senior Dieker and a freshman Dieker produced **one**
  player. The second overwrote the first's class and throwing hand, the Roster Manager reported
  "1 updated" — indistinguishable from a normal re-upload — the duplicate guard said *"every name
  unique"*, and the release was not blocked. One kid's winter silently became another kid's.
  The guard could never have caught it: the collision happened during the import, before there
  were two rows to compare.
- **The fix.** Identity is now **last + first**. Two Diekers are two people with two IDs.
- **What you see on an iPad is unchanged for almost everybody:** a player reads as
  **"Dieker"**. He only becomes **"Dieker, T"** when somebody else on the roster shares that
  last name, and **"Dieker, Tom"** if the initial collides as well. Nothing to type, nothing to
  remember — and no more hand-typed "Dieker, T" baked into every export forever.
- **The roster read-out** on Setup gained a **Shows as** column, so you can see exactly what the
  app will print before you release.
- **Export is 37 columns** — `PitcherLast` and `PitcherFirst` added. `Pitcher` is still the
  display name, and it is now explicitly *for reading, not grouping*: it can change between
  releases when a brother joins. **Group on `PitcherID`.**
- A record from an older session is read as a last name, or split on a comma if it has one.
  Nothing guesses at "Tom Dieker" — the order would be a coin flip.

### v26 · Oct 7, 2026
**Headline:** The roster now ships with the app. You can read it on Setup; you can't change it.
Wrong or missing name — tell Jim and it's fixed in the next update.

- **The roster is a read-out.** No Add, no upload, no paste, no "move everyone up a class". The
  panel lists the released team — name, class, throws, bats — sorted seniors first.
- **Why it stopped being editable.** Every export joins on `PitcherID`. While each iPad kept its
  own roster, the same kid typed on two iPads got two different IDs, and his winter split into two
  pitchers the moment the files were stacked up. One released list is the fix, and it is the
  identity problem actually solved rather than deferred.
- **A banner says which roster this iPad has**, in four states:
  - Green **Released roster** with the release date — what you want.
  - Red **SAMPLE roster — not the real team** — the placeholder that ships until the first real
    roster is released. It *works*, which is the whole danger: nothing else would stop a coach
    charting an entire session against IDs that join up with nothing. The banner says so plainly.
  - Amber **Leftover local roster** — the iPad is still showing a list somebody typed into it
    before releases existed. It charts fine, but its IDs match nobody else's, so get that iPad
    onto the current version before the next session.
  - Red **No roster** — the build arrived without one.
- **Nothing you charted is affected by a roster change.** A session stores the name and hand it was
  charted under, so a filed bullpen still reads correctly years later. A pitcher who has since come
  off the roster keeps his name on the mound slot, marked *(not on the roster)*.
- A released roster is **never** copied into the iPad's own storage. That sounds like a detail; it's
  what stops a future build that shipped without `roster.js` from serving a frozen old release and
  looking exactly like a current one.
- `roster.js` joins `templates.js` in the service worker's file list, so the roster is there with
  no signal.

### v25 · Oct 7, 2026
**Headline:** Upload the roster as a .csv straight out of Excel. Plus two hidden ID columns in the
export so a merged season groups correctly.

- **Upload a .csv.** Header row in any order and any capitalisation (`Name, Class, Throws, Bats`),
  or no header with the name in the first column. Class accepts `Jr`, `Junior` or `11`. Commas
  inside a quoted name are handled — `"Hasche, J",Jr,R` lands as one person.
- Re-uploading a corrected file **updates and never duplicates**, so you can drop a fixed export
  straight over the top of the old roster.
- **Paste a list** stays for a handful of names, and is the fallback if a locked-down iPad refuses
  to open a file picker.
- **`SessionID` and `PitcherID`** on every exported row. You never see or type them. They exist
  because **a name is not a key**: two kids share a last name, a spelling gets corrected in
  February, and a merged season quietly becomes two people or one. Fixing a name does not change
  the ID. `SessionID` does the same for sessions — Mound + Date isn't unique, so a morning and an
  afternoon group on the same mound would otherwise merge into one.
- The export is now **35 columns**.

### v24 · Oct 7, 2026
**Headline:** Type the team once. One roster now backs the Bullpen Chart and the Offense Chart,
with class year and throwing arm on it, and you pick each arm for a session off a list instead of
typing a name.

- **A roster panel** on Setup, above the mound list. **Paste a list** is the fast way in — one per
  line, `Name` alone works, `Hasche, Jr, R` gives you class and throwing hand in either order. A
  name already on the roster is **updated, not duplicated**. Nobody types fifty kids on an iPad.
- **Shared between the Bullpen Chart and the Offense Chart.** They live on the same origin, so
  they read the same saved roster. Whatever the Offense Chart already had is adopted automatically —
  nothing to retype. Fixing a spelling once fixes it everywhere, including in sessions already filed.
  **The Pitch Chart is not wired in yet** — it still types our pitchers free-form. Same origin, so
  it's a small change, but it hasn't been made. *(Done in Pitch Chart v18, Oct 7.)*
- **Class** is Fr / So / Jr / Sr, a picked list. This is the field a peer comparison needs: a
  sophomore measured against sophomores says far more than one measured against the program.
  **Move everyone up a class** handles June. *(Changed Oct 7: the bump now removes graduating
  seniors — see **The roster** below.)*
- **Throws and Bats are separate fields.** One "hand" would have been wrong in one app or the
  other — plenty of kids throw right and hit left.
- **The mound list is one picker per slot.** Class and throwing hand print beside it as a read-out,
  because the roster owns them; two places to edit one fact is how they drift apart. A kid can only
  be on one slot per session, so a name already picked drops out of the other lists.
- **Jersey number is gone** from the bullpen. A bullpen needs a name. The export carries `Class`,
  `ClassName` and `Throws` where `Jersey` used to be.
- A pitcher charted before the roster existed keeps his name, marked **(not on the roster)**.
  Nothing already charted loses its owner.

**Not yet built, and worth knowing:** the peer comparison *report* can't live in the app. One iPad
only holds its own mound's sessions, so a ranking against the whole class would be computed from a
quarter of the data and look authoritative. The export now carries class on every row, so the
comparison is computable in Excel today and in the roll-up (E-005) when it exists.

### v23 · Oct 6, 2026
**Headline:** The Chart tab now moves to the next pitcher on its own when the one on screen
finishes his card.

- Setting a pitcher up on Setup never moved the Chart tab to him, so you could enter your second
  arm, tap Chart, and still be looking at the first one's finished card with nothing saying so.
- The pitcher strip at the top is now labelled **"Who's throwing — tap a name to switch."**
  Unlabelled it read like a header.
- A pitcher who has finished his card is **dimmed and struck through** on the strip.
- His card now carries a **"Vance is up →"** button. The old copy said "Next pitcher" and wasn't
  a button.
- Leaving the Chart tab and coming back moves to the first **named** pitcher with nothing charted.
  The five blank rows a fresh session ships with are skipped — they aren't people until you name
  them.
- If you tap a name yourself, that choice sticks. Going back to a finished pitcher to look at his
  zone is deliberate, so tabbing to Report and back won't steer you away.

### v22 · Oct 6, 2026
**Headline:** Live ABs. Set a pitcher to **Live ABs** on Setup and you can chart him facing hitters
— count, at-bat result and AO3+.

- A **count** at the top of the at-bat, worked out from where you plot each pitch. In the zone is a
  strike. Nothing to enter.
- **At-bat chips** across the top, one per AB, each with its result and pitch count. Tap one to fix
  a mis-tapped result.
- **Sixteen results**, the same list as the Pitch Chart. Tapping one closes the at-bat and opens
  the next, so the next hitter costs no extra tap. A closed at-bat refuses another pitch and says
  so rather than quietly appending.
- **The called spot is optional in here** — there's a `— no spot called` button. Those pitches are
  **left out of the execution numbers, not counted as misses.** A competitive inning where nobody
  called spots would otherwise read as the worst command of the winter. The KPI label says
  `Spot · of 12 graded` when some are ungraded, and the zone pip is outlined instead of coloured.
- **AO3+**, the same two-character code as the Pitch Chart and last winter's spreadsheet:
  `++` ahead and got the out (2 pts) · `+-` ahead, no out (1) · `-+` behind, got the out (1) ·
  `--` behind, no out (0). The report shows all four counts rather than one percentage.
- **Export:** `Mode=Live` plus four new columns — `AB`, `ABResult`, `ABOut`, `AO3plus`.
  `Result` (the execution grade) is now **blank** for an ungraded pitch where it used to say `Miss`.
- **Fixed:** a pitch with no called spot made the call card dereference a target that wasn't there
  and threw, which killed the whole render — the pitch went into the data and the screen froze with
  no error. Worst kind of bug; now guarded, with a test that goes red if it comes back.

### v21 · Oct 5, 2026
**Headline:** Four winter routines, a reset button, no more sample, and a build stamp you can tap
to fix a stuck update.

- **Four cumulative routines** in `templates.js` — Fastball Command (25), Breaking Ball & Stretch
  (30), Holding Runners (35), Hitter's Counts (40). Every call in week 1 is still in week 4, which
  is what makes a pitcher's week-over-week numbers comparable. See
  `claude/bullpen-winter-scripts.md`.
- **Situations are a picked list** — Runner on 1B, Runner on 2B, 2 strikes chase, 2-0 O/S strike —
  exported as both code and label. Typed notes never group in Excel.
- **Slide step (`SS`)** added to the delivery column; the header reads W/S/SS. `SS` not `SL`,
  because SL is already the Slider.
- **Script columns reordered** to W/S/SS · Pitch · Location · Situation, and *Spot* renamed
  *Location*.
- **The sample session was removed**, and old saved copies of it are discarded on load. Its
  hand-built script had a ScriptID matching no routine, so a coach running it broke the four-mound
  comparison silently.
- **Reset this session** added, with a confirmation that names the pitch count.
- **Fixed:** a stale cache could serve the old app forever. The amber build stamp is now a
  **button** — `v23 ≠ v21 · tap to fix` — that clears the saved copy and reloads, leaving your
  charted data alone.
- **Fixed:** every confirmation dialog was dead in the shared playground link (the sandbox has no
  native dialogs), so Finish & file, Delete and Reset did nothing there. Replaced with in-page
  confirms. They always worked on an installed iPad.

### v11–v20 · late Sept – Oct 5, 2026
Not logged at the time. This file starts here; earlier history is only in the conversation
transcripts. The headline for the stretch: **Finish & file plus a History tab** (so a second real
session became possible at all — before that the only reset lived inside the sample banner, which
disappeared the moment you cleared the sample), the velo strip, the called-spot grid and Chebyshev
execution grading.

---

## Pitch Chart (game)

### v25 · Oct 15, 2026
**Headline:** Every game needs its **level** before charting, and filed games go to the coaching
dashboard on their own: the pitch log and the inning log.

- **The level, required every game (Jim, Oct 15).** Varsity, JV, Sophomore or Freshman, picked at the
  top of Setup. It starts blank every game, **charting stays locked until it is picked**, and it goes back
  to blank when the game is filed. It can be changed any time before filing. It is what puts each game in
  the right level on the dashboard; the roster can't, because kids move between levels.
- **Dashboard upload**, the Bullpen Chart's engine and rules: sent at filing, on open, when signal comes
  back and when the app returns to the front; oldest first, one at a time, stop at the first failure;
  stamped uploaded only on the receiver's ok; never blocks anything. Same receiver and key as the bullpen,
  and the receiver needed **no change** (it maps columns by name).
- **Each game has a permanent id** (`rid`) so a retry can never double it in the Sheet.
- **Practice game** switch on Setup: charts and files normally, never sent, a bar while charting, off
  again after filing.
- **Never sent: games filed before this build.** They have no level, and on a testing iPad they are test
  games. History marks them *kept here*.
- **History:** one status line and a pill per game (on dashboard, waiting, practice, kept here). The old
  "export them" nag only shows when upload is off.
- **Erase everything is off** (`ALLOW_WIPE = false`).
- **What is sent:** the PITCH LOG and the INNING LOG, each row stamped with the game's `Level`, `Date`
  and `Opponent` so the Sheet reads on its own. Both blocks were lifted out of the text export into
  `pitchLogTable()` and `inningLogTable()`, which the export now prints and the upload sends: one source.
  The text export was checked byte-identical to v24 on the same game.
- **The lock is on the Setup screen:** the app opens there with no level; *Charting* refuses and the note
  turns amber; a zone tap is refused at the source too.
- **Tests:** `tools/receiver/upload.js` gained a Pitch Chart section (the lock, the level reaching
  `Records` and every row, the inning log, practice, pre-v25 games). Every existing suite now picks a
  level first, the way a charter would. Each new guard was proved by breaking it.

### v24 · Oct 15, 2026
**Headline:** An at-bat can't end without a pitch on the zone, and **IBB** records the no-pitch
intentional walk. Same rule as the Offense Chart v44.

- **Why:** Jim, testing v43: *"I can indicate an outcome of an at bat without ever selecting where the
  pitch was. We need to force that you can't advance to the next hitter without both the pitch
  type/location and result."* Pitch type is sticky, so a plotted pitch always carries one; the rule is
  "no result without a pitch".
- **3 guards:** the result buttons, the field / spray chart and the Next button all refuse until a pitch
  is on the zone. Next is guarded separately on purpose: a game already in progress from before this
  build can hold a pitchless result, which the result guard never sees.
- **IBB, the intentional walk, is the one exception** (Jim's call). High school allows one with no
  pitch thrown. It is a walk everywhere a walk counts, and it can also be tapped after a pitch or two.
- **Who an IBB is charged to.** Every at-bat is charged to the pitcher and inning of its first pitch, and
  a no-pitch IBB has none, so it is stamped with the pitcher and inning on screen when tapped
  (`ibbP`, `ibbInn`). It adds a batter faced and a BB to his line and a free base to the inning ledger,
  and is **not** counted as an at-bat done in 3 pitches or fewer: that is the coach's decision, not the
  pitcher's efficiency. Undo takes a mis-tapped one back.
- **Pitch log:** a no-pitch IBB gets one row with the pitch columns blank, so the log never drops a walk
  the pitcher line counts. The game row's BB total includes IBB.
- Not changed: the Pitch Chart has no SF (sac fly) result. That was added to the Offense Chart for
  quality at-bats only.
- **Tests:** new `tools/pa-guard.js` (both apps, 39 checks), every guard proved by removing it.

### v23 · Oct 9, 2026
**Headline:** A jersey number and a fielding position each belong to **one spot** in the lineup.
Put one on a second spot and the app puts it back and tells you where the other one is — **enter
it again and it stays.** Position is now a drop-down of the scorecard numbers.

- **Why:** Jim, on Setup — *"you can enter multiple players with the same number in the starting
  lineup; that isn't allowed, also, we need to make the position a dropdown (also unique values)."*
- **Refuse, then allow — and that shape is the whole feature.** Jim again: *"This can really only
  happen in the situation of a sub entering with the same number, so I guess we need to refuse but
  allow override."* So it is a speed bump, not a validator. The first attempt is put back and
  **named** — "#12 is already on spot 1 — enter it again to keep it" — and the second goes
  through. A hard block would have been the app refusing to chart a game that was actually
  happening.
- **Both spots then wear amber**, the same amber the inning ledger uses for "this needs you", so
  the duplicate is visible on the card rather than only in the moment you agreed to it.
- **A blank never collides with a blank.** Nine empty jersey cells are the normal state of a fresh
  card; a rule that fired there would fire on the first thing a scorer does.
- **Position is numbers, not `1B`/`2B`/`3B`.** Those three are already *at-bat results* on the pad
  two inches away, and this app has been bitten by a shared namespace before. The picker prints
  the abbreviation beside each number — `6 · SS` — so nobody is counting on their fingers. `DH` is
  on the list.
- **On the charting screen the position is a read-out**, not a picker. A `<select>` in that row
  would sit on top of the batter selector and eat the tap that picks the hitter — the row *is* the
  control.
- **The export gained two columns**, `Pos` and `PosName`, after `Hand`: the number to group a
  pivot on, the abbreviation to read in the cell. Thirty columns in the pitch log now.
- **Old games migrate.** Position used to be free text, so a filed game holds whatever was typed.
  `SS` and `rf` map onto `6` and `9`; anything the picker cannot show (`Rover`) is let go rather
  than kept as a value no drop-down will ever display.
- **Fixed on the way past:** `load()` ended with a leftover `p.v = 5` that overwrote the schema
  stamp it had just set, so a brand-new game was stamped 7 and *every game ever opened* was
  stamped back down to 5. Nothing reads the field yet — which is exactly why it sat there. The
  stamp now lives in one place, `SCHEMA`, and is written last, after every migration has run.
- **Checks:** nine new ones — the picker's values *and its labels*, the refusal and the spot it
  names, the override, the amber on both spots, blank-vs-blank, the read-only lineup cell, the two
  export columns, and the migration *read back off disk* rather than off the screen. Ten mutations
  run against them, all ten caught. Two of those checks were wrong first: one watched the Setup
  cell, which is repainted through `posNormal()` on every render and so reads correctly with the
  migration turned off entirely; the other counted amber flags to prove a blank is not a
  duplicate, and flags are computed by a different function from the one that decides a refusal.

### v22 · Oct 9, 2026
**Headline:** A red **Erase everything on this iPad** button, for testing. It deletes the game in
progress *and everything in History*, which nothing else in the app does.

- **Why:** Jim, testing through the back half of the season — *"if I am testing during a game
  between now and the winter I need to be able to clear and start over."* Every other control
  protects History on purpose; this is the one that does not, and it is the only one.
- **It names the cost before it does anything**, counted from what is actually there: the game in
  progress with its pitch count, how many filed games are in History, and **how many of those have
  never been exported** — the only genuinely unrecoverable part. It points at History's Export
  button as the way out, and **Cancel is the button it opens on**.
- **The roster is never touched.** It ships with the app, is read-only, and its storage key is
  *shared with the other two apps* — wiping it here would silently change their banners. Only this
  app's own keys go: `dugout-pitch-chart-v2, dugout-pitch-chart-archive-v1`.
- **It reloads rather than re-renders.** Half the app's state lives in module variables, and a
  render would write them straight back into the storage just emptied.
- Same control, same wording and same warning in all three apps, per the shared-ritual rule.

- **It has a switch, and the switch is the point.** Jim: *"Make this a feature that is easily
  turned on and off for testing purposes. It will NOT exist once we get to the real charting."*
  One line, `var ALLOW_WIPE = true;`, sitting **immediately above `BUILD`** — bumping the version
  is the one ritual that happens before every push, so the flag cannot ship without being read.
- **`false` hides the block, disables the button and never binds the handler.** Jim's call on the
  shape: *"Should just disable the button / and hide it."* Three independent reasons nothing
  happens, so none of them is load-bearing alone, and flipping back to `true` restores the control
  with nothing to put back. The suite proves **both positions** by serving the app with the flag
  actually flipped, rather than by reading the branch and believing it.
- **`tools/version-audit.py` shouts about it.** Any app with the flag on prints
  `!!! ERASE EVERYTHING IS ON` and a reminder, so the pre-push check surfaces it every time.

### v21 · Oct 9, 2026
**Headline:** The outs count themselves. Tap a strikeout or a ground out on the result pad and a
dot lights up — you no longer have to remember to tap the dots as well, and the third out opens
the inning prompt on its own.

- **Why:** the first person to use v19 charted three outs, saw no prompt, and reported the feature
  as broken. It wasn't — the dots were manual by design — but *"I charted three outs and nothing
  happened"* is indistinguishable from broken, and that is the only verdict that counts.
- **All nine out results advance the count**, `DP` by two. Jim's call, made knowing that two of
  them can be worth nothing.
- **The prompt waits for Next Batter.** The first cut of this opened it the moment the result was
  tapped, which on a batted ball lands on top of the spray chart the charter still has to tap —
  Jim, within the hour: *"it advances to the pop-up before I am able to enter in the spray chart."*
  A result tap is not the end of the at-bat; **Next Batter is**, and that is where the inning now
  ends. Tapping the third out **dot** still opens it immediately, because that gesture says *the
  inning is over* rather than saying what one at-bat did.
- **The two the app cannot judge**, both now named in the guide:
  - **A dropped third strike.** You tap `K`, the catcher doesn't hold it, the batter reaches. Still
    a strikeout for the pitcher — leave the result and tap the lit dot to take the out back off.
  - **A fielder's choice where nobody is retired.** Same fix.

  Everything else is honest: a muffed grounder or a dropped fly is scored `E`, not `GO` or `FO`.
- **The dots stay in charge.** They set the count directly, tapping the dot that already *is* the
  count takes it back one, and **undoing a result takes its out back off**. A prompt opened by a
  wrong count still has *Wrong — back to 2 outs*.
- **It moves by the difference, never by an increment.** Tapping `GO`, then `1B`, then `FO` on the
  same at-bat ends on **one** out, not three. Each at-bat records what it has already put on the
  board, so a result that is changed, undone or reclassified by a mod button moves the count by the
  delta. There is a sweep check for exactly that sequence.
- **`DP` is worth 2 in one place now.** `OUT_RESULT` said `DP:1` while two call sites carried their
  own `(result === "DP" ? 2 : 1)`. The map is the single source of truth, so the dots, the inning
  ledger and computed IP cannot disagree about a double play.
- **Removed on the way:** an inning guard inside the new code that nothing could reach — result
  edits are refused while reviewing, so an at-bat from a closed inning cannot be changed at all —
  and which sat *before* the add, so bumping the inning mid-at-bat silently stopped auto-advance.
  It prevented less than it broke. **A guard that cannot fire is the same mistake as a check that
  cannot fail.**

**AO3+ deliberately keeps the out.** A dropped third strike stays a plus even after you tap the
dot back off, and so does an all-safe FC. Jim's call: *"I'm ok with crediting an AO3+ out there.
The pitcher did their job."* It is the same principle as priority #3 in the review deck — the error
belongs to the defense, not to the arm.

So the two numbers answer different questions and **are not meant to reconcile**: the dots and IP
count outs that *happened*; AO3+ counts at-bats the pitcher *finished*. Anybody totalling strikeouts
against the inning log's `Outs` column will find a gap, and the gap is the point. Said plainly in
the guide for the same reason it is said here — otherwise the first person to notice it files it as
a bug.

This also retires the *K, reached* 17th result that was floated for it: the only thing left for it
to fix is the inning out count, which one tap on a dot already handles.

### v20 · Oct 9, 2026
**Headline:** The version number in the guide's footer was wrong, and had been for
five releases. Nothing else changed.

- It said **app v14** at the bottom of the guide while the top of the same page said
  **v19**. Two different version numbers on one page is the exact confusion the build
  stamp exists to prevent, so it is worth a release on its own.
- **Why it rotted:** `tools/version-audit.py` checked five version locations and the footer
  was not one of them. Every other location has a symptom when it goes wrong — the app nags,
  or a coach follows the wrong instructions. A footer nobody reads has no symptom at all, so
  nothing ever caught it. **It is the sixth location now**, and it was proved failable before
  being trusted.
- All three apps were stale in the same way at the same time: bullpen said v8, offense v27,
  the Pitch Chart v14. All three are fixed in one push.

### v19 · Oct 9, 2026
**Headline:** The app knows about innings. The third out stops you and asks how many runs scored
and how many were earned; **IP, R and ER are no longer typed in at the end** — they are computed,
or entered one inning at a time while you still remember the inning.

- **The third out opens a blocking prompt.** Jim's call, and the reason is the honest one: *"it will
  force that data to be entered and not forgotten."* A scoreless inning is **one tap** — `NO RUNS`
  — which is most innings. Runs are a tap on the number; **Earned pre-fills to match**, because
  most runs are earned, so the common case is tap-and-confirm. Earned can never exceed runs and the
  buttons above it go grey rather than disappearing.
- **More than one arm in the inning gets a row each,** with steppers, and **the list is built from
  who actually threw** — every pitch already carries its pitcher, so nobody chooses it. The inning
  total underneath is a read-out: it is the sum of the rows, so there is no second place a number
  can be typed and disagree with itself.
- **`Wrong — back to 2 outs` is not optional.** A blocking overlay with no exit is a trap, and the
  charter *will* tap to three outs mid-correction. It restores two outs, leaves the inning alone and
  writes nothing; escape and a tap outside the box do the same. There is a sweep check whose whole
  job is to never let that regress.
- **Games that end mid-inning still get asked.** Walk-off, run rule, time limit — the third out
  never comes, so `Finish & file` asks about the last inning first, headed *Final inning (partial)*.
  Cancelling files nothing.
- **The IP/R/ER card is gone from the Game tab,** replaced by two tables: an **inning ledger** at
  inning × pitcher (pitches, strike %, first-pitch strikes, free bases, R, ER) and **each arm's
  line** — IP, pitches, **P/IP**, R, ER and a 7-inning ERA. All computed. Fifteen hand-typed
  numbers became zero. Tap any ledger row to correct an inning after the game.
- **IP is outs ÷ 3** — the actual definition — with a `DP` counting two. **Known limit, and it is
  in the guide:** outs that are not plate appearances (caught stealing, a pickoff, a runner thrown
  out) are not captured, so IP can read a third low. The ledger shows the outs it has, so the gap is
  visible rather than silent, and for the record the scorebook wins.
- **Our R/ER and GameChanger's will differ, and we are not reconciling them.** Official scoring
  charges a run to whoever let the runner reach — a bookkeeping rule, applied by whoever has the
  iPad in the stands. The dugout coach watched it happen. Jim: *"In all likelihood the coach in the
  dugout tracking R/ER will do a better job than the parent in the stands, but I'll live with
  potential inconsistencies at this point."* So **GameChanger stays the official record** and
  **this app's number drives the analysis**. The guide says so plainly, or the first discrepancy
  anybody notices gets filed as a bug.
- **An inning closed with no runs entered shows amber,** the same nag as an unsent game in History.
  It should only be reachable through the escape hatch or a game charted on an older build. The
  inning being charted *right now* also has no entry and deliberately does **not** nag — it is not
  late, it is in progress.

**Export — this is a schema change.**

- The pitch log gains **`Inning`** as its first column, 27 → **28**.
- A fourth block, **`INNING LOG`**, one row per inning × pitcher: `Inning Partial Pitcher
  PitcherID PitcherLast PitcherFirst Pitches Strikes StrikePct FirstPitches FirstPitchStrikes
  BattersFaced Outs FreeBases K Hits Runs Earned Unearned`. Inning totals are a sum of these rows
  and a pitcher's game line is a sum of these rows, so both pivots are trivial and neither is
  stored twice. `Unearned` is computed. `PitcherID` carries through, so an inning row joins to the
  bullpen's winter files on the same key as everything else.
- The alternative — stamping `InnRuns`/`InnER` onto every pitch row — was rejected: it repeats one
  fact across twenty rows, and one hand-edit would silently disagree with the rest.
- **A blank `Runs`/`Earned` means that inning was never entered.** A zero means entered as none.
  Those must not look alike in a spreadsheet somebody is going to total.

**Schema `v:5` → `v:6`.** A game charted on an older build still opens, still charts on and still
exports — its existing pitches get **no inning rather than a guessed one**, so their `Inning` cell
is blank. A made-up inning is worse than an empty cell. There is a sweep check that boots the app
with a v5 game seeded in storage.

**Three bits of dead weight went with it:** the `.iphead`/`.iprow` styles, the `#ipRows` entry in
the return-key chains (the app has no text field outside the lineup now), and `n1()`, which existed
only to render a possibly-blank typed number.

**One collision worth recording:** the first draft styled the steppers as `.step`. The charting
panel already has four `<span class="lbl step">` section labels, and a bare `.step` rule would have
made every one of them a flex container with a gap — a visual regression on the main screen,
nowhere near the feature. Renamed `.instep`. Check the class name against the file before taking it.

### v18 · Oct 7, 2026
**Headline:** You pick your pitchers off the roster now instead of typing their names — and the
sample game is gone, so the app opens ready to chart. The app is now just **Pitch Chart**.

- **Renamed from "Dugout Pitch Chart" to "Pitch Chart."** The header, the home-screen name and the
  guide already said Pitch Chart; the page title, the landing page and the install prompt still
  said Dugout. Now they all agree.
- **Two things the rename deliberately did NOT touch.** The saved game and the filed History live
  under storage keys that still read `dugout-pitch-chart-…`. Those are addresses, not labels —
  renaming one doesn't move anything, it points the app at an empty slot, so every iPad would
  silently lose its game in progress and its whole History on first open. Nobody ever sees them.
- An already-installed home-screen icon **keeps whatever name it was given.** iOS doesn't rename
  an installed app when the manifest changes. If a coach's icon says Dugout Pitch Chart he can
  rename it by long-pressing it, or just leave it — nothing is wrong with it.

- **The mound chips are drop-downs.** Tap the chip, pick the arm; his class and throwing hand come
  with him. A pitcher already on another chip drops off the list, so the same kid can't be charted
  twice in one game.
- **Roster-only, on purpose.** There is no name field to fall back on. With the whole roster in the
  app there is nothing a typed name can do except spell somebody wrong, and a misspelling is how a
  pitcher's winter work stops lining up with his spring.
- **The export carries `PitcherID`,** plus `PitcherLast`, `PitcherFirst`, `Class`, `ClassName` and
  `Throws`. `Pitcher` is still there but it is the display label — group a season roll-up on
  `PitcherID`, which is the same ID the bullpen chart files. This is the join that answers *does
  what we build in January show up in April*, and until now it needed spellings matched by hand.
- **An `Our pitchers` panel on Setup** says which roster this iPad is holding — green for the real
  release, red for the SAMPLE, amber for a leftover from another app, red for none at all. Same
  four states and the same wording as the other two apps.
- **A pitcher dropped from a later roster keeps his name and his pitches.** His chip reads
  *"Dieker (not on the roster)"* and the export still carries his ID, so the session still joins up
  with the work he did while he was on it.
- **The sample game is gone.** It opens on a clean game that saves from the first pitch. A saved
  sample left on an iPad that never tapped *Start real game* is discarded rather than loaded. Same
  call as the bullpen in v21 and the Offense Chart in v40, same reason: a released roster
  demonstrates the app better than invented names, and the sample was the thing standing between
  opening the app and charting.
- The guide gained a section on all of this, and the two places it still claimed the next game
  overwrites the last one — untrue since History was added in v16 — are fixed.

### v17 · Oct 5, 2026
**Headline:** Enter the other team's lineup before first pitch, and pull it forward from the last
time you played them — scouting notes and tags included.

- A **pre-game setup screen** for their lineup: spot, hitter, jersey, position, bats. Add or remove
  spots, so the second meeting can carry an extra kid.
- **Pull a lineup** from a filed game — games against the same opponent are offered first.
- **Carried reads.** Tags, position and notes follow a hitter forward and are labelled
  *"Reads carried in from Northview, 4/18. Check them against what you see today"* on screen and in
  the export. An unlabelled carried read is indistinguishable from something somebody watched that
  afternoon.
- **Fixed:** a second function had been given a name already in use, so the **batter read panel had
  been blank for several releases** — the read line, the mini zone and the header all silently
  stopped drawing while the panel still appeared. Renamed, and the sweep now refuses duplicate
  top-level function names.

### v16 · Oct 5, 2026
**Headline:** Record the pitch that was *called*, not just the one that was thrown.

- A **5×5 called-spot grid** matching the location grid tap for tap, so you can separate a pitcher
  who executed a bad call from one who missed a good one.
- Grading is the bullpen's, unchanged — `0 = spot`, `1 = close`, `≥2 = miss` — so pen and game
  numbers are comparable without a conversion.
- **Hard contact:** a one-tap "he squared it up" flag on any ball in play.
- **A colour key** under CATCHER'S VIEW in both grids. The pitch-type colours meant nothing to
  anyone who hadn't built the app.
- **Export:** `CalledRow`, `CalledCol`, `Execution`, `MissV`, `MissH`, `HardContact`.
- Skipping the called spot grades as **ungraded**, not as a miss.
- **Finish & file + History**, same as the other two apps.
- **Fixed:** a silent `G = emptyGame()` in the render error handler meant any render error
  anywhere would wipe the game with no message.

### v1–v15 · Sept – Oct 5, 2026
Not logged at the time.

---

## Offense Chart

### v45 · Oct 15, 2026
**Headline:** Every game needs its **level** before charting, and filed games go to the coaching
dashboard on their own.

- **The level, required every game (Jim, Oct 15).** Varsity, JV, Sophomore or Freshman, picked at the
  top of Setup. It starts blank every game, **charting stays locked until it is picked**, and it goes back
  to blank when the game is filed. It can be changed any time before filing. It is what puts each game in
  the right level on the dashboard; the roster can't, because kids move between levels.
- **Dashboard upload**, the Bullpen Chart's engine and rules: sent at filing, on open, when signal comes
  back and when the app returns to the front; oldest first, one at a time, stop at the first failure;
  stamped uploaded only on the receiver's ok; never blocks anything. Same receiver and key as the bullpen,
  and the receiver needed **no change** (it maps columns by name).
- **Each game has a permanent id** (`rid`) so a retry can never double it in the Sheet.
- **Practice game** switch on Setup: charts and files normally, never sent, a bar while charting, off
  again after filing.
- **Never sent: games filed before this build.** They have no level, and on a testing iPad they are test
  games. History marks them *kept here*.
- **History:** one status line and a pill per game (on dashboard, waiting, practice, kept here). The old
  "export them" nag only shows when upload is off.
- **Erase everything is off** (`ALLOW_WIPE = false`).
- **What is sent:** the same rows as the CSV export, built once by `tableOf()` and used by both. The CSV
  gains two columns at the end, `Level` and `Practice`; every other column is unchanged (checked
  byte-identical to v44 apart from those two).
- **The lock is the Chart tab:** a game with no level opens on Setup, the Chart tab sends you back there
  with an amber note, and a pitch is refused at the source too.
- **Tests:** an Offense Chart section in `tools/receiver/upload.js` (the lock, the level reaching
  `Records` and every row, practice, pre-v45 games, no signal then signal). Each new guard was proved by
  breaking it.

### v44 · Oct 15, 2026
**Headline:** An at-bat can't end without a pitch on the grid, and **IBB** records the no-pitch
intentional walk.

- **Why:** Jim, testing v43: *"I can indicate an outcome of an at bat without ever selecting where the
  pitch was. We need to force that you can't advance to the next hitter without both the pitch
  type/location and result."* Pitch type is sticky, so a plotted pitch always carries one; the rule is
  "no result without a pitch".
- **3 guards:** the result buttons, the field / spray chart and the Next button all refuse until a pitch
  is on the zone. Next is guarded separately on purpose: a game already in progress from before this
  build can hold a pitchless result, which the result guard never sees.
- **IBB, the intentional walk, is the one exception** (Jim's call). High school allows one with no
  pitch thrown. It is a walk everywhere a walk counts, and it can also be tapped after a pitch or two.
- **IBB in the numbers:** a walk in the hitters' BB column and a quality at-bat (the walk rule). The dot in
  the lineup reads as on base.
- **Export:** a no-pitch IBB gets one row with the pitch columns blank and the count 0-0, so the export
  never drops a walk the report counts. Before v44 a pitchless PA was skipped by the export; any old one
  still is, except an IBB.
- **Tests:** new `tools/pa-guard.js` (both apps, 39 checks), every guard proved by removing it. The QAB
  suite still passes unchanged.

### v43 · Oct 15, 2026
**Headline:** **Quality at-bats**, by the program's own definition. The app works out whether each
at-bat was a QAB and why, from what is already charted plus two new optional taps.

- **The definition (Jim, Oct 15).** A QAB is any one of: a hit; a line drive, even if caught; a walk;
  HBP; a sac bunt or sac fly; a run scoring on his ball in play; 7 or more pitches; moving a runner into
  scoring position with fewer than 2 outs; a ball in play with 2 strikes. Reaching on an error is not a
  QAB by itself. Any run counts (RBI, error, FC, DP). A moved runner counts even if the hitter is out.
- **Not GameChanger's QAB.** GC has one with different rules (6+ pitches, extra-base hits, hard-hit
  balls, no HBP or line-drive outs). The numbers will not match, and should not be compared.
- **SF is a new result**, beside SAC. SAC is now specifically the sac bunt (it already implied a
  ground ball); SF implies a fly ball. Both buttons have a tooltip with the full name.
- **2 chips under Hard contact: Run scored and Moved a runner.** Shown only once the ball is in play,
  because the app cannot see runners or the scoreboard. Off unless tapped. They clear themselves if the
  at-bat stops being a ball in play (undo, or the last pitch re-marked as a whiff), and the app refuses
  them on a strikeout or walk rather than store a fact the rules ignore.
- **A live line under the chips:** *Quality at-bat · moved a runner, 2-strike contact*, or *Not a
  quality at-bat*. The charter never decides it.
- **Report:** a **Quality at-bats** panel on the At the plate view (total, percentage, and how many
  at-bats each rule caught) and a **QAB** column in Our hitters ("3 of 4").
- **Export:** two columns appended at the end, `RunScored` and `MovedRunner`: Y or N on the last row of
  an at-bat put in play, blank on every other row. Every older column keeps its position. **There is no
  QAB column on purpose:** the export carries the facts and the dashboard applies the rules, so a change
  to the definition recalculates every past game.
- **Older games** read as no run scored and no runner moved, because those facts were never asked.
- **Tests:** new `tools/qab.js`, 59 checks: all 9 rules on hand-built at-bats, Jim's 3 rulings, the
  not-a-QAB side, the chips on the real Chart tab, the report and the export columns. Proved failable
  by breaking 5 rules one at a time. It also checks the app's own "Something went wrong" banner, because
  render() catches its errors: a clash with a local variable named `inPlay` hid the chips during this
  build without ever reaching the browser's error log.

### v42 · Oct 9, 2026
**Headline:** A red **Erase everything on this iPad** button, for testing. It also fixes a warning
that was quietly weaker in this app than in the other two. It deletes the game in
progress *and everything in History*, which nothing else in the app does.

- **Why:** Jim, testing through the back half of the season — *"if I am testing during a game
  between now and the winter I need to be able to clear and start over."* Every other control
  protects History on purpose; this is the one that does not, and it is the only one.
- **It names the cost before it does anything**, counted from what is actually there: the game in
  progress with its pitch count, how many filed games are in History, and **how many of those have
  never been exported** — the only genuinely unrecoverable part. It points at History's Export
  button as the way out, and **Cancel is the button it opens on**.
- **The roster is never touched.** It ships with the app, is read-only, and its storage key is
  *shared with the other two apps* — wiping it here would silently change their banners. Only this
  app's own keys go: `titans-offense-v1, titans-offense-archive-v1, titans-offense-lineup-v1`.
- **It reloads rather than re-renders.** Half the app's state lives in module variables, and a
  render would write them straight back into the storage just emptied.
- Same control, same wording and same warning in all three apps, per the shared-ritual rule.

- **It has a switch, and the switch is the point.** Jim: *"Make this a feature that is easily
  turned on and off for testing purposes. It will NOT exist once we get to the real charting."*
  One line, `var ALLOW_WIPE = true;`, sitting **immediately above `BUILD`** — bumping the version
  is the one ritual that happens before every push, so the flag cannot ship without being read.
- **`false` hides the block, disables the button and never binds the handler.** Jim's call on the
  shape: *"Should just disable the button / and hide it."* Three independent reasons nothing
  happens, so none of them is load-bearing alone, and flipping back to `true` restores the control
  with nothing to put back. The suite proves **both positions** by serving the app with the flag
  actually flipped, rather than by reading the branch and believing it.
- **`tools/version-audit.py` shouts about it.** Any app with the flag on prints
  `!!! ERASE EVERYTHING IS ON` and a reminder, so the pre-push check surfaces it every time.

- **Fixed, and found by the test rather than by reading:** this app's erase warning never told you
  that filed games had **never been exported** — the one genuinely unrecoverable part. It called
  `unsentCount()`, which is the bullpen's and the game's name for that count and **does not exist
  here**, inside a `try/catch`. The `ReferenceError` was swallowed and the count silently stayed 0.
  Two filed games that had never left the iPad, and the control that destroys them said nothing.
  It counts `A.filter(g => g.sent === false)` now, like the History nag already did.
- **Why it hid:** the warning test only ever saw the *empty-History* branch, because a fresh test
  page has nothing filed — and that branch happens to contain the word "History" too, so the check
  looked like it was reading the real wording. The suite now seeds two unexported records with
  `addInitScript` before the app boots, so the branch a charter actually sees is the branch tested.
  **A check that only ever renders the empty state is testing the empty state.**

### v41 · Oct 9, 2026
**Headline:** The version number in the guide's footer was wrong, and had been for
thirteen releases. Nothing else changed.

- It said **app v27** at the bottom of the guide while the top of the same page said
  **v40**. Two different version numbers on one page is the exact confusion the build
  stamp exists to prevent, so it is worth a release on its own.
- **Why it rotted:** `tools/version-audit.py` checked five version locations and the footer
  was not one of them. Every other location has a symptom when it goes wrong — the app nags,
  or a coach follows the wrong instructions. A footer nobody reads has no symptom at all, so
  nothing ever caught it. **It is the sixth location now**, and it was proved failable before
  being trusted.
- All three apps were stale in the same way at the same time: bullpen said v8, offense v27,
  the Pitch Chart v14. All three are fixed in one push.

### v40 · Oct 7, 2026
**Headline:** Fixed — picking a name in a lineup spot now stays picked. And the sample game is
gone, so the app opens ready to chart with last game's order already in it.

- **The lineup bug.** Tap a spot's drop-down on Setup, pick a kid, and he snapped straight back to
  *— pick —*. The counter also sat on *0 of 9 set* no matter what you picked, and the rule that
  stops the same kid being put in two spots had quietly stopped working.

  What happened: in **v31** a lineup spot stopped being one player and became a list, so that a
  pinch hitter could not inherit the starter's at-bats. The migration moved the old field into the
  new list correctly — but three places that *read* it were never updated, and had been reading a
  field that nothing has written since. It rendered perfectly and was wrong. There is now one
  function that answers "who is the starter in this spot", all three call it, and the sweep has a
  new kind of check — *a choice survives the redraw* — in all three apps, because every check it
  had only ever proved a control **changed** something, not that the change **stuck**.

- **The sample game is gone.** It opens on a clean game with **last game's batting order already
  loaded**, which is the one thing the sample was genuinely useful for showing. A saved sample on
  an iPad that never tapped *Start a real game* is discarded rather than loaded.
- **History is the real archive, full stop.** It used to fall back to a demo archive whenever the
  sample was loaded and nothing had been filed, which meant the History tab, the carried reads
  *and* the Pull button could all have been reading invented games.
- Worth saying plainly: the sample is part of why the lineup bug lived as long as it did. A spot
  holding a **typed** name — the sample's shape — went through different code than a roster pick,
  so the broken path was never the one on screen when the app opened.

### v39 · Oct 7, 2026
**Headline:** Same as the bullpen — the roster list is folded away, the banner stays.

- On this screen the roster was pushing **Our lineup** off the bottom, which is the panel that
  actually gets set before a game.
- Same rules: banner always visible, folded when the roster is fine, already open when it isn't,
  and the button names the count.

### v38 · Oct 7, 2026
**Headline:** Same as the bullpen — a new roster reaches the app with no version bump.

- `roster.js` is checked on the server first with a 2.5-second budget, then falls back to the
  cached copy. Everything else stays cache-first.
- Verified against this app too: new roster picked up with no bump, app code still served from
  cache, opens offline with the server stopped, and opens in under 3s against a 6-second stall.

### v37 · Oct 7, 2026
**Headline:** Same as the bullpen — last and first name split apart, so two players with the
same last name are two people. A hitter still reads as just his last name unless there's a
second one of him.

- The **Titans roster** read-out shows `Last, First` and the derived **Shows as** label beside it.
- **Export** gained `HitterLast`, `HitterFirst` and `HitterID`. `Hitter` remains the display
  name — for reading, not grouping, since it changes when a same-surname player joins. **Group
  on `HitterID`.**
- Those three are stamped onto the plate appearance when it's created, same as the name already
  was, so a filed game still reads correctly after the roster changes.

### v36 · Oct 7, 2026
**Headline:** The roster now ships with the app, same as the Bullpen Chart. Read-only on the iPad;
Jim releases changes with the update.

- **The Titans roster panel is a read-out** — name, number, class, and which way he bats *and*
  throws, sorted seniors first. The *+ Add player* button is gone, and so is editing a row.
- **The lineup still picks off it**, exactly as before. Nothing about setting a lineup changed.
- **Same four-state banner** as the bullpen: green *Released roster* with the date, red *SAMPLE
  roster — not the real team* for the placeholder that ships until the first real release, amber
  *Leftover local roster* for an iPad still on its own list, red *No roster* if the build arrived
  without one.
- Anything typed into this app before is still shown and still usable — labelled as leftover — until
  the iPad picks up the update.
- `roster.js` is in the service worker's file list, so it's there with no signal.

### v35 · Oct 7, 2026
**Headline:** The roster is now the shared one, with class year and a separate Throws column.

- Reads and writes the same saved roster as the other two apps. Your existing roster was carried
  over automatically on first open.
- **Class** (Fr/So/Jr/Sr) and **Throws** added. Throws is separate from Bats on purpose — the
  bullpen needs the arm, this app needs the bat, and a kid can be left-handed at one and not the
  other.
- Nothing else changed. The lineup, subs, pitcher tags and the count grid all behave as they did.

### v34 · Oct 6, 2026
**Headline:** A pitcher's tags now sit on the **WHAT TO EXPECT** header, in the game report as well
as in History.

- Moved the tag chips onto the panel header next to his name — they *are* what to expect. Notes and
  provenance sit on a thin line underneath; a sentence in a header line wrecks the wrap.
- The same header appears on the **Report** tab during a game, for whoever is on the mound.
- Wording now distinguishes the two cases: History says **"Last written down Northview, 4/18"**;
  the live report says **"Reads carried in from Northview, 4/18 — check them against today."**

### v33 · Oct 6, 2026
**Headline:** The History tab shows the tags and notes you've put on a pitcher, read-only.

- Under **Scouting a pitcher**: his tags, your notes, and which game they came from.
- A **Reads** column in the *Pitchers we have seen* table does the same at a glance for everybody.
- Read-only on purpose. If a tag could be set in two places there'd be no answer to which copy is
  current — entry stays on Setup.

### v32 · Oct 6, 2026
**Headline:** Tag and take notes on the other team's pitcher, and pull him forward the second time
you face him.

- **Seven tags** per pitcher: POUNDS, WILD, FPS, BB-STR, NO GIVE, RUNNABLE, QUICK — all of them
  things that change what a hitter does in the box.
- **POUNDS, WILD and FPS light up on their own** from the charted pitches once there's enough to
  mean something, and are drawn dashed with a dot so nobody mistakes them for somebody's judgement.
  One tap overrules off, a second claims it as yours, a third releases it back. **Your tap always
  wins.**
- POUNDS and WILD are opposites; turning one on turns the other off.
- **A notes box** per pitcher, free-form.
- **Pull** — pick him out of the list of everyone you've charted and his hand, number, notes and
  your tags come back. Pitch data is never copied; today starts clean. Only his most recent look
  comes across.
- **Export:** `PitcherTags`, `PitcherNotes`, `PitcherCarried`. A detected tag carries a `*`.

### v31 · Oct 5, 2026
**Headline:** Pinch hitters and re-entries, and a Lineup column you can collapse.

- A lineup spot now holds **every man who has occupied it**, so a pinch hitter can't inherit the
  starter's at-bats and an NFHS re-entry isn't a second person.
- A sub picker with **"Back in"** for a re-entry and **"From the roster"** for a new man.
- **AB dots** per spot in the Lineup column — the count of plate appearances told you nothing;
  0-for-3 and 3-for-3 looked identical.
- `◀ Lineup` collapses the column during an at-bat, in the same place as the Pitch Chart's.
- **Fixed:** the export resolved each hitter at export time, so **one pinch hitter moved a
  starter's whole line.** Identity is now stamped on the plate appearance when it's created. This
  was the worst correctness bug in the app.

### v29 and earlier · Oct 1–5, 2026
Not logged at the time. The app was built Oct 1 and the headline for that stretch is the
**"What to expect" count grid** — all twelve counts, the most common pitch in each, split by
batter hand — plus the archive, the umpire map and the spray chart. See
`claude/offense-chart-app.md`, which documents the whole app rather than its history.

---

## The roster

Not an app version, but it ships the same way and belongs in the same log.

**The master roster is read-only on the iPads.** It ships as `roster.js` next to each app, the way
`templates.js` already does, and nothing in any app can change it. Jim edits it in the **Roster
Manager** and releases a new file.

**The Roster Manager is not in this repo** — it's `Software\Titans Roster Manager.html`, one folder up
from `titans-apps`, opened by double-clicking it. It is deliberately not on the Pages site: there,
any coach who found the URL could generate a `roster.js`, which contradicts the roster being
released rather than edited, and gives them a file they can't deploy. One copy only — a second,
private web copy was deleted Oct 7 after it fell two versions behind unnoticed.

**Why read-only, and why it ships with the app:** four iPads each keeping their own roster drift
apart within a week, and worse, each device mints its own `PitcherID` — so the same kid gets four
different IDs and a merged season is back to matching on names. A shipped file gives every mound
the same IDs for the same people, which is the identity problem actually solved rather than
deferred.

**Releasing a roster — three steps, no version numbers** *(since Bullpen v28 / Offense v38)*:

1. Edit in the Roster Manager and download `roster.js`.
2. Drop it into `bullpen/`, `offense/` **and** `game/` in the repo and push. All three, every
   time: a folder that gets missed keeps the roster it already had, says so only in its own
   banner, and its exports stop joining to the other two.
3. Add a line to the table below saying what changed and why.

That's it. The apps check the server for `roster.js` before falling back to their saved copy, so a
new one lands the next time an iPad opens with signal. **No cache bump, no build number.**

*An iPad that has been offline since before the release keeps the roster it had, says so in the
banner, and picks the new one up the first time it opens with signal.*

**Bumping the cache is still required for an APP change** — `index.html`, `guide.html`,
`templates.js`. Those are code and stay cache-first. Five things move together there; see
*Keeping this up to date* at the bottom.

**The IDs are permanent.** The Roster Manager loads the released file first and only mints an ID
for a name it has never seen. Regenerating one orphans every export already collected under the
old value, so the tool refuses to release a file with a duplicate name or a blank row — those are
the two ways a roster silently becomes two people or one.

### Last name and first name are separate

**Changed Oct 7, 2026**, because that is how a program roster is actually kept in Excel — and
because asking the question turned up a live data-loss bug.

**What was wrong.** The roster had one `name` field, and the importer matched on it. Upload a
spreadsheet containing two players who share a last name and you got **one player**: the second
overwrote the first, the tool said "1 updated", the duplicate-name guard reported *"every name
unique"*, and nothing blocked the release. Verified by test before fixing.

**What it is now.** Identity is the **pair**. `roster.js` carries `last` and `first`; `name` is
**derived** and the apps recompute it on load rather than trusting the file.

**The display rule**, in one place, byte-identical in the Roster Manager and all three apps:

| Situation | Shows as |
|---|---|
| Only one Dieker on the roster | `Dieker` |
| Two Diekers, different initials | `Dieker, T` and `Dieker, J` |
| Two Diekers, both T (Tom and Tim) | `Dieker, Tom` and `Dieker, Tim` |
| Same first *and* last name | **Blocked** — the release refuses it |

A player's label can therefore change when a brother joins. That is the trade for never having to
hand-type a disambiguation, and it is why the exports carry the stable fields as well: **`Pitcher`
and `Hitter` are for reading, `PitcherID` and `HitterID` are for grouping.**

**Timing mattered.** Nothing real had been released, so no IDs were in the wild and no exports
referenced any names. In February this would have meant reconciling IDs against files already
collected.

**Also fixed in passing:** the Roster Manager's redraw-on-blur handler still keyed on the old
`name` field, so a typed last name never refreshed the Shows-as column or the flags — a true
duplicate sat there unflagged. Both halves of the name are wired now.

### A later upload fills in what you did not know yet

The season order is **names first, the rest as you learn it** — Jim won't know spring jerseys until
spring. Uploading a file later works the way you'd want, and it is tested:

- **Every ID survives.** A name already on the roster is matched on last + first and *updated*, so
  nothing already charted or exported is orphaned.
- **A column the file does not contain is left alone.** A jersey-only file with no Class column
  cannot wipe the class years typed in between. Verified: 78 players in, classes and throwing hands
  set by hand, a 7-player jersey file uploaded, all 78 IDs identical and every hand-set value intact.
- **A column the file *does* contain wins.** A jersey in the new file overwrites an old one — which
  is what makes a correction possible.
- Leading zeros survive, so `05` stays `05`.

**The one thing to be careful about: the match key is the name.** Correct a spelling *in the Roster
Manager*, where the ID comes forward. If you instead upload a file with the corrected spelling, that
is a name the tool has never seen and it mints a **new** ID.

### The June bump graduates seniors off the roster

**Move everyone up a class** moves Fr → So → Jr → Sr **and removes the seniors.** A player with no
class set is left alone.

Jim's call, and the reasoning is worth keeping: a graduated senior has no relevance going forward,
and **every export already carries his name, class, throwing hand and the rest on the row** — so
last winter's files still read correctly without him, all the analysis still works, and the roster
file doesn't carry four years of alumni into the mound picker.

What it costs, knowingly:

- **This is the only irreversible thing the tool does.** An ID removed here is gone. A name re-added
  later is a name the tool has never seen, so it mints a **new** ID that joins to none of his old
  files. So: take the **.csv backup** before a bump if you want a record of who left.
- The confirmation **names every player coming off** before it does anything, and the result line
  lists them again so you can paste them into the roster table below.
- **A session already charted against a removed player keeps his name**, marked *(not on the
  roster)* on the mound slot. Nothing charted loses its owner.

**The order matters and is tested.** The seniors are removed *before* the classes are bumped. Do it
the other way round and this year's juniors become seniors and are then swept out in the same pass
— a kid deleted from the roster for having been promoted. `tadmin` has a check that goes red if the
order is ever flipped back.

### Roster releases

| Date | Players | What changed |
|---|---|---|
| 2026-10-07 | — | *No real roster released yet.* Each app ships a **sample** `roster.js` so it has something to read; it flags itself and the app shows a red **SAMPLE roster — not the real team** banner telling coaches not to chart against it. The first real release goes on the next line. |

---

## Keeping this up to date

Add an entry **in the same pass that bumps the version** — it's part of shipping, not paperwork
afterwards. **Six** places move together (`index.html`'s `BUILD`, `sw.js`'s `CACHE`, the guide's
`App v__` line, the version inside the guide's "Which version am I on?" callout, **the guide's own
footer**, and this file — both its standings table and a new entry). The footer was the one nobody
was checking, and it had gone stale in all three apps at once; `version-audit.py` covers it now. All three apps list `roster.js` in `sw.js`; the bullpen
also lists `templates.js`.

**`BUILD` and `CACHE` must match exactly.** The app compares the number baked into `index.html`
against the cache name it is being served from, so bumping one without the other shows a permanent
amber `v27 ≠ v28 · tap to fix` on every iPad that tapping cannot clear.

**Before you push, run the test scripts** — the sweep alone is not enough:

```
python3 tools/version-audit.py   # all five version locations, all three apps
cd titans-apps && python3 -m http.server 8807 &
node tools/sweep.js              # every control still does something
node tools/roster-states.js      # the four roster states, in all three apps
```

`sweep.js` stays green through a bug that silently breaks roster identity, which is exactly why
`roster-states.js` exists. After touching any `sw.js`, also run `tools/swcache/` — once per app.
Every check in all of them has been proved to fail by reintroducing the bug it covers.

Write the **headline** for a coach who has never seen the code: what he can now do, or what stopped
being wrong. Put the version numbers and column names in the detail bullets underneath.

**Say when something is a fix, and say what it did.** "Fixed the render" tells a coach nothing;
"a pitch with no called spot froze the screen with no error" tells him why his iPad behaved that
way last Tuesday, and whether his data from that day is any good.
