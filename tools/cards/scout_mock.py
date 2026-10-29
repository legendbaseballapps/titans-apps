# Scouting sheet mockup (Oct 28, 2026). One opponent, 2 printed pages, letter landscape:
# page 1 their pitchers (for our hitters), page 2 their hitters (for our pitchers and catcher).
# Numbers and reads come from the Oct 26 demo game (tools/demo-data.json), pulled through
# the apps' own functions; the coach notes are invented to show the layout.
#   python3 tools/cards/scout_mock.py  ->  tools/cards/out/scouting-sheet.html
import os, html
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
e = html.escape
NAVY, ORANGE, INK, MUTED, LINE, SOFT, BLUE = '#16305C', '#C85C1C', '#16233A', '#5A6781', '#D2D9E6', '#F2F4F8', '#2B6CB0'
PT = {'FB': 'Fastball', 'CB': 'Curveball', 'SL': 'Slider', 'CH': 'Change-up', 'CT': 'Cutter', 'SP': 'Splitter'}
TYPE_COL = {'FB': '#2B6CB0', 'CB': '#C85C1C', 'SL': '#8A5E17', 'CH': '#1F7A4A'}

def pct(a, b): return f'{round(a*100/b)}%' if b else '&mdash;'

def mixbar(mix, n):
    order = sorted(mix, key=lambda k: -mix[k])
    segs = ''.join(f'<div style="width:{mix[k]*100/n:.1f}%;background:{TYPE_COL.get(k, MUTED)}"></div>' for k in order)
    key = ' &nbsp; '.join(f'<span style="color:{TYPE_COL.get(k, MUTED)}">&#9632;</span> {PT[k]} {pct(mix[k], n)}' for k in order)
    return f'<div class="bar">{segs}</div><div class="key">{key}</div>'

def situ_row(label, d):
    tot = sum(d.values())
    order = sorted(d, key=lambda k: -d[k])
    top = order[0]
    rest = ', '.join(f'{PT[k].lower()} {d[k]}' for k in order[1:])
    lean = d[top] / tot >= .6 and tot >= 4
    read = f'<b>{PT[top]}</b> {d[top]} of {tot}' + (f'<span class="m"> &middot; then {rest}</span>' if rest else '')
    return f'<tr><td class="l">{label}</td><td class="l">{read}</td><td class="c" style="white-space:nowrap">{"<span class=\'lean\'>Sit on it</span>" if lean else "<span class=\'m\'>Mixes</span>"}</td></tr>'

def pitcher(p):
    s = p['st']
    rows = ''.join(situ_row(k, s['situ'][k]) for k in ['First pitch', 'Ahead', 'Even', 'Behind', 'Two strikes'] if k in s['situ'])
    tags = ''.join(f'<span class="tag{" auto" if t[1] else ""}">{e(t[0])}</span>' for t in p['tags']) or '<span class="m">No tags yet</span>'
    return f'''<div class="card">
  <div class="ch"><div><span class="who">{e(p["name"])}</span> <span class="no">#{e(p["jersey"])}</span></div>
    <div class="role">{p["hand"]}HP &middot; {e(p["role"])}</div></div>
  <div class="stats">
    <div><b>{s["n"]}</b><span>Pitches</span></div>
    <div><b>{pct(s["str"], s["n"])}</b><span>Strikes</span></div>
    <div><b>{s["fps"]} of {s["fp"]}</b><span>1st-pitch strikes</span></div>
    <div><b>{s["ozsw"]} of {s["oz"]}</b><span>We chased</span></div>
    <div><b>{s["wh"]} of {s["sw"]}</b><span>We swung and missed</span></div>
  </div>
  <div class="lbl">His mix</div>{mixbar(s["mix"], s["n"])}
  <div class="lbl">What he throws, by count</div>
  <table class="situ"><tr><th class="l" style="width:19%">Count</th><th class="l">Most often</th><th class="c" style="width:19%">Read</th></tr>{rows}</table>
  <div class="tags">{tags}</div>
  <div class="note"><b>Coach&rsquo;s note</b> {e(p["note"])}</div>
</div>'''

PITCHERS = [
  {'name': 'Cole Barrett', 'jersey': '14', 'hand': 'R', 'role': 'Started, 5 innings',
   'st': {'n': 67, 'str': 42, 'fps': 13, 'fp': 20, 'sw': 28, 'wh': 7, 'oz': 31, 'ozsw': 6,
          'mix': {'FB': 40, 'CH': 15, 'CB': 12},
          'situ': {'First pitch': {'FB': 10, 'CB': 6, 'CH': 4}, 'Ahead': {'FB': 5, 'CH': 1, 'CB': 1},
                   'Even': {'FB': 6, 'CH': 1, 'CB': 1}, 'Behind': {'FB': 13, 'CH': 4, 'CB': 1},
                   'Two strikes': {'FB': 6, 'CH': 5, 'CB': 3}}},
   'tags': [('First-pitch strikes', True), ('Runnable', False)],
   'note': 'Fastball when he is behind, 13 of 18. Make him get ahead. Slow to the plate from the stretch.'},
  {'name': 'Drew Lindqvist', 'jersey': '27', 'hand': 'L', 'role': 'Relieved, 6th and 7th',
   'st': {'n': 39, 'str': 24, 'fps': 6, 'fp': 10, 'sw': 21, 'wh': 5, 'oz': 22, 'ozsw': 7,
          'mix': {'FB': 25, 'SL': 9, 'CH': 5},
          'situ': {'First pitch': {'FB': 9, 'SL': 1}, 'Ahead': {'FB': 3, 'SL': 1}, 'Even': {'FB': 4, 'SL': 2},
                   'Behind': {'FB': 4, 'SL': 1}, 'Two strikes': {'FB': 5, 'CH': 5, 'SL': 4}}},
   'tags': [('Quick', False)],
   'note': 'First pitch is a fastball, 9 of 10. Be ready to hit it. Slider is his chase pitch with 2 strikes.'},
]

POS = {'1': 'P', '2': 'C', '3': '1B', '4': '2B', '5': '3B', '6': 'SS', '7': 'LF', '8': 'CF', '9': 'RF', 'DH': 'DH'}
RES = {'GO': 'ground out', 'FO': 'fly out', 'LO': 'line out', 'PO': 'pop out', 'K': 'K swinging', 'Kc': 'K looking',
       'BB': 'walk', 'HBP': 'hit by pitch', '1B': 'single', '2B': 'double', 'E': 'reached on error', 'SF': 'sac fly',
       'FC': "fielder's choice", 'DP': 'double play'}
HITTERS = [  # name, no, pos, bats, at-bats (result, hard), where, tags, read, note
  ('Mason Reyes', '2', '8', 'R', [('GO', 0), ('2B', 1), ('E', 0), ('1B', 0)], 'Pull, 4 of 4', ['Chases', 'Battles with 2K'],
   'Has hit the breaking ball. Hit the fastball. Chased 2 out of the zone.', 'Leadoff. Jumps on the first-pitch fastball. Start him soft.'),
  ('Tyler Okafor', '7', '6', 'R', [('K', 0), ('GO', 0), ('SF', 0), ('K', 0)], 'Opposite field, 2 of 2', [],
   'Misses away in the zone. Late on the fastball. Chased 1 out of the zone.', ''),
  ('Jake Brennan', '24', '3', 'L', [('1B', 0), ('K', 0), ('GO', 0), ('Kc', 0)], 'Pull 1, middle 1', ['First-pitch swinger', 'Chases'],
   'Missed his only swing at a breaking ball. Late on the fastball. Chased 2 out of the zone.', 'Best bat in their order. Pull hitter; chased the curveball down twice.'),
  ('Caleb Ortiz', '33', '5', 'R', [('FO', 0), ('GO', 0), ('BB', 0)], 'Pull, 2 of 2', ['Chases', 'Battles with 2K'],
   'Chased 2 out of the zone.', 'Big swing, long arms. Hard in, then soft away.'),
  ('Noah Whitfield', '18', '7', 'L', [('BB', 0), ('HBP', 0), ('K', 0)], 'No balls in play', ['Bad on breaking balls'],
   'Misses up in the zone. Missed 2 of 2 swings at breaking balls. Missed the off-speed.', ''),
  ('Ethan Kowalski', '11', '2', 'R', [('K', 0), ('FO', 0), ('FC', 0)], 'Pull, 2 of 2', ['First-pitch swinger'],
   'Swings at pitch one.', ''),
  ('Logan Pierce', '5', '4', 'R', [('DP', 0), ('LO', 1), ('PO', 0)], 'Middle 2, pull 1', ['First-pitch swinger', 'Chases', 'Battles with 2K'],
   'Chased 3 out of the zone. Swings at pitch one.', ''),
  ('Gavin Hughes', '21', '9', 'L', [('1B', 0), ('K', 0), ('2B', 1)], 'Pull, 2 of 2', [],
   'Has hit the breaking ball. Hit the fastball. Missed the off-speed.', ''),
  ('Owen Marsh', '9', 'DH', 'R', [('Kc', 0), ('1B', 0), ('GO', 0)], 'Middle, 2 of 2', ['First-pitch swinger'],
   'Missed his only swing at a breaking ball. Hit the fastball. Swings at pitch one.', ''),
]
HIT = {'1B', '2B', '3B', 'HR'}

def hitter_row(i, h):
    name, no, pos, bats, abs_, where, tags, read, note = h
    ab = ', '.join(('<b>' if r in HIT else '') + RES[r] + (' (hard)' if hard else '') + ('</b>' if r in HIT else '') for r, hard in abs_)
    tg = ''.join(f'<span class="tag auto">{e(t)}</span>' for t in tags)
    nt = f'<div class="hn">{e(note)}</div>' if note else ''
    return f'''<tr><td class="c n">{i}</td><td class="l"><b class="hname">{e(name)}</b><div class="m">#{no} &middot; {POS[pos]} &middot; bats {bats}</div></td>
  <td class="l">{ab}</td><td class="l">{e(where)}</td><td class="l">{tg}<div class="rd">{e(read)}</div>{nt}</td></tr>'''

CSS = f'''
@page {{ size: letter landscape; margin: 0.45in 0.5in; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: {INK}; font-size: 10.5pt; }}
.page {{ width: 10in; height: 7.6in; display: flex; flex-direction: column; page-break-after: always; position: relative; }}
.page:last-child {{ page-break-after: auto; }}
.hd {{ display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 3px solid {ORANGE}; padding-bottom: 6px; }}
.hd h1 {{ margin: 0; font-family: "Avenir Next Condensed", "Arial Narrow", Arial, sans-serif; font-size: 22pt; letter-spacing: .5px; text-transform: uppercase; color: {NAVY}; }}
.hd .side {{ font-family: "Avenir Next Condensed", "Arial Narrow", Arial, sans-serif; font-weight: 700; font-size: 11pt; letter-spacing: 1.2px; text-transform: uppercase; color: {ORANGE}; }}
.hd .src {{ text-align: right; color: {MUTED}; font-size: 9.5pt; line-height: 1.35; }}
.ft {{ position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; border-top: 1px solid {LINE}; padding-top: 4px; color: {MUTED}; font-size: 8.5pt; }}
.body {{ flex: 1; padding-top: 10px; }}
.two {{ display: flex; gap: 14px; }}
.card {{ flex: 1; border: 1px solid {LINE}; border-left: 6px solid {BLUE}; border-radius: 6px; padding: 10px 12px; }}
.ch {{ display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid {LINE}; padding-bottom: 5px; }}
.who {{ font-family: "Avenir Next Condensed", "Arial Narrow", Arial, sans-serif; font-weight: 700; font-size: 16pt; text-transform: uppercase; color: {NAVY}; }}
.no {{ color: {MUTED}; font-weight: 600; }}
.role {{ color: {MUTED}; font-size: 9.5pt; }}
.stats {{ display: flex; gap: 6px; margin: 8px 0 6px; }}
.stats div {{ flex: 1; background: {SOFT}; border-radius: 4px; padding: 5px 4px; text-align: center; }}
.stats b {{ display: block; font-size: 12.5pt; color: {NAVY}; }}
.stats span {{ font-size: 7.5pt; text-transform: uppercase; letter-spacing: .4px; color: {MUTED}; }}
.lbl {{ font-family: "Avenir Next Condensed", "Arial Narrow", Arial, sans-serif; font-weight: 700; font-size: 9pt; letter-spacing: 1.1px; text-transform: uppercase; color: {MUTED}; margin: 8px 0 3px; }}
.bar {{ display: flex; height: 10px; border-radius: 3px; overflow: hidden; }}
.key {{ font-size: 9pt; margin-top: 3px; }}
table {{ width: 100%; border-collapse: collapse; }}
th {{ font-size: 7.5pt; text-transform: uppercase; letter-spacing: .5px; color: {MUTED}; font-weight: 600; text-align: center; padding: 3px 5px; border-bottom: 1px solid {LINE}; }}
td {{ padding: 4px 5px; border-bottom: 1px solid {SOFT}; vertical-align: top; text-align: center; }}
.l {{ text-align: left; }} .c {{ text-align: center; }}
.m {{ color: {MUTED}; }}
.lean {{ font-weight: 700; color: {ORANGE}; }}
.tags {{ margin: 7px 0 5px; }}
.tag {{ display: inline-block; border: 1px solid {NAVY}; border-radius: 10px; padding: 0 7px; font-size: 8.5pt; font-weight: 600; color: {NAVY}; margin: 0 4px 3px 0; }}
.tag.auto {{ border-style: dashed; }}
.note {{ background: #FDF3EC; border-left: 3px solid {ORANGE}; padding: 5px 8px; font-size: 9.5pt; border-radius: 3px; }}
.note b {{ color: {ORANGE}; text-transform: uppercase; font-size: 8pt; letter-spacing: .8px; margin-right: 4px; }}
.hit th {{ background: {NAVY}; color: #fff; border: 0; }}
.hit td {{ font-size: 9.5pt; padding: 5px 6px; border-bottom: 1px solid {LINE}; }}
.hit td.n {{ font-weight: 700; color: {NAVY}; font-size: 12pt; }}
.hname {{ font-size: 10.5pt; }}
.rd {{ margin-top: 2px; }}
.hn {{ margin-top: 3px; color: {ORANGE}; font-weight: 600; }}
.write {{ margin-top: 8px; border: 1px solid {LINE}; border-radius: 6px; padding: 8px 12px 4px; }}
.ln {{ border-bottom: 1px solid {LINE}; height: 22px; }}
.legend {{ margin-top: 6px; color: {MUTED}; font-size: 8.5pt; }}
.sample {{ display: inline-block; border: 1px solid {ORANGE}; color: {ORANGE}; border-radius: 10px; padding: 0 7px; font-size: 8pt; font-weight: 700; margin-left: 6px; vertical-align: middle; }}
'''

def header(side):
    return f'''<div class="hd"><div><div class="side">{side}</div><h1>Ridgeview <span class="sample">Sample data</span></h1></div>
  <div class="src">Scouting sheet &middot; Varsity &middot; for Fri, Apr 23<br>From 1 game: Mon, Oct 26 at Ridgeview (we won 5-3)</div></div>'''

def footer(n):
    return f'<div class="ft"><span>Legend Titans Baseball &middot; Scouting sheet &middot; built from our charted games</span><span>Page {n} of 2</span></div>'

page1 = f'''<div class="page">{header("Their pitchers &middot; for our hitters")}
<div class="body"><div class="two">{pitcher(PITCHERS[0])}{pitcher(PITCHERS[1])}</div>
<div class="legend">Counts are pitches. &ldquo;Sit on it&rdquo; means 60% or more of his pitches in that count were one pitch, with at least 4 seen. Dashed tags were worked out by the app; solid tags were set by a coach.</div>
<div class="write"><div class="lbl" style="margin-top:0">Notes for today</div><div class="ln"></div><div class="ln"></div></div></div>
{footer(1)}</div>'''

page2 = f'''<div class="page">{header("Their hitters &middot; for our pitchers and catcher")}
<div class="body"><table class="hit"><tr><th class="c" style="width:4%">#</th><th class="l" style="width:17%">Hitter</th><th class="l" style="width:24%">Last time against us</th>
<th class="l" style="width:13%">Where he hits it</th><th class="l" style="width:42%">Reads and notes</th></tr>
{"".join(hitter_row(i + 1, h) for i, h in enumerate(HITTERS))}</table>
<div class="legend">Lineup is last game&rsquo;s order; check today&rsquo;s card. Pull and opposite field are by how he bats. Reads come from the chart; orange lines are coach notes.</div></div>
{footer(2)}</div>'''

doc = f'<!doctype html><html><head><meta charset="utf-8"><title>Scouting sheet: Ridgeview</title><style>{CSS}</style></head><body>{page1}{page2}</body></html>'
open(os.path.join(OUT, 'scouting-sheet.html'), 'w').write(doc)
print('wrote', os.path.join(OUT, 'scouting-sheet.html'))
