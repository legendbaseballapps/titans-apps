#!/usr/bin/env python3
"""Every place a version number is written, checked against every other place.

Why this exists: a version lives in SIX places per app, and two of them have to
agree exactly or the app shows a permanent amber `v27 != v28 - tap to fix` that
tapping cannot clear - stampBuild() compares BUILD against the cache-name suffix,
so bumping one without the other is a bug you ship to every iPad. The other three
are documentation, and a guide that describes the wrong build is how a coach ends
up following steps for a screen he does not have.

The sixth, the guide's own footer, was added Oct 9 2026 after it turned out to be
stale in ALL THREE apps simultaneously - by fifteen, thirteen and five releases.
It had no symptom, which is why it rotted: every other location is either read by
the app or read by a coach. A check only covers what it looks at.

    python3 tools/version-audit.py          (from the repo root)

Exits non-zero on any disagreement.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS = [("bullpen", "Bullpen Chart"), ("offense", "Offense Chart"), ("game", "Pitch Chart")]
fail = []


def read(*p):
    f = os.path.join(ROOT, *p)
    return io.open(f, encoding="utf-8").read() if os.path.exists(f) else None


def check(label, got, want):
    ok = got == want
    print(("  ok   " if ok else "  FAIL ") + label.ljust(40) + str(got) +
          ("" if ok else "   (want %s)" % want))
    if not ok:
        fail.append(label)


testing = []
chlog = read("CHANGELOG.md") or ""
readme = read("README.txt") or ""

for folder, name in APPS:
    idx = read(folder, "index.html")
    sw = read(folder, "sw.js")
    gd = read(folder, "guide.html")
    if idx is None or sw is None:
        fail.append(folder + " missing")
        print("  FAIL " + folder + ": no index.html or sw.js")
        continue

    build = (re.search(r'var BUILD = "([^"]+)"', idx) or [None, None])[1]
    print("\n%s - source says %s" % (name, build))
    if not build:
        fail.append(folder + " has no BUILD")
        print("  FAIL no BUILD in index.html")
        continue

    # 1-2. The pair that MUST match or the app nags forever.
    cache = (re.search(r'var CACHE = "(titans-[a-z]+-)([^"]+)"', sw) or [None, None, None])
    check("sw.js cache name", cache[2], build)
    check("  cache prefix is this app", cache[1], "titans-%s-" % folder)

    # 3-4. The guide's masthead and its "which version am I on" callout.
    if gd is None:
        check("guide.html", "missing", "present")
    else:
        mast = re.search(r'App v([0-9]+)', gd)
        check("guide masthead", "v" + mast.group(1) if mast else None, build)
        callout = re.search(r'describes <b>v([0-9]+)</b>', gd)
        check("guide version callout", "v" + callout.group(1) if callout else None, build)
        # 5. The guide's own footer. This was NOT checked until Oct 9 and had gone
        #    stale in all three apps at once - bullpen v8 against a source of v29,
        #    offense v27 against v40, game v14 against v19. Nobody reads a footer,
        #    which is exactly why it rotted: it is the only version location with
        #    no symptom. Two different version numbers on one page is the precise
        #    confusion the build stamp exists to prevent.
        foot = re.search(r'<footer>[^<]*?app v([0-9]+)', gd)
        check("guide footer", "v" + foot.group(1) if foot else None, build)

    # 6. The changelog's standings table, which is what Jim reads before a push.
    row = re.search(r'\*\*%s\*\*[^|]*\|([^|]*)\|' % re.escape(name), chlog)
    said = re.search(r'v([0-9]+)', row.group(1)) if row else None
    check("changelog standings row", "v" + said.group(1) if said else None, build)
    # And that the version has its own entry, not just a table cell.
    check("changelog has a %s entry" % build, ("### %s ·" % build) in chlog, True)

    # TESTING FLAG. Not a failure - it is meant to be on right now - but it must
    # never be pushed for a real game unnoticed, and the version bump is the one
    # ritual that happens before every push. So it is reported here, loudly.
    wipe = re.search(r'var ALLOW_WIPE = (true|false);', idx)
    if wipe and wipe.group(1) == "true":
        testing.append(name)
        print("  !!!  ERASE EVERYTHING IS ON".ljust(46) +
              "testing only - flip ALLOW_WIPE to false before a real game")
    elif wipe:
        print("  ok   erase-everything is off".ljust(46) + "ALLOW_WIPE = false")
    else:
        check("ALLOW_WIPE present", False, True)

    # DASHBOARD UPLOAD. Only reported for an app that has the switch (bullpen from
    # v32; the other two before Mar 1). A blank URL is legal - the app says upload
    # is off - but shipping one by accident means nothing reaches the dashboard.
    up = re.search(r'var UPLOAD_URL = "([^"]*)";', idx)
    if up:
        key = re.search(r'var UPLOAD_KEY = "([^"]*)";', idx)
        k = key.group(1) if key else ""
        if not up.group(1):
            print("  !!!  DASHBOARD UPLOAD IS OFF".ljust(46) + "UPLOAD_URL is blank")
        else:
            check("upload URL is an Apps Script /exec", bool(re.match(r'https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$', up.group(1))), True)
            check("upload key is 40 hex characters", bool(re.match(r'^[0-9a-f]{40}$', k)), True)

    # The roster file every app now needs a copy of, inside its own folder.
    check("roster.js in the folder", os.path.exists(os.path.join(ROOT, folder, "roster.js")), True)
    check("  and in the worker's file list", '"./roster.js"' in sw, True)

print("\n" + ("%d MISMATCHED: %s" % (len(fail), ", ".join(fail)) if fail else "every version location agrees"))
if testing:
    print("!!! ERASE EVERYTHING IS ON in: " + ", ".join(testing))
    print("    Fine for testing. Flip ALLOW_WIPE to false in each before the first real game.")
sys.exit(1 if fail else 0)
