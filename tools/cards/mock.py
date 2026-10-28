# Card mockups for E-011 (Oct 27, 2026). Email-safe HTML: tables and inline styles
# only, no scripts, no SVG, no web fonts, so it renders the same in Gmail, iOS Mail
# and Outlook. Numbers come from the Oct 26 demo game and pens (tools/demo-data.json);
# the season-to-date and last-pen figures are invented to show the layout.
#   python3 tools/cards/mock.py   ->  tools/cards/out/*.html
import base64, os, html, re
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
LOGO = os.environ.get('LOGO', '')
logo_src = ('data:image/png;base64,' + base64.b64encode(open(LOGO, 'rb').read()).decode()) if LOGO else ''

NAVY, ORANGE, INK, MUTED, LINE, BG, SOFT, GOOD = '#16305C', '#C85C1C', '#16233A', '#5A6781', '#D2D9E6', '#ECEFF5', '#F4F6FA', '#1F7A4A'
SANS = "-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif"
COND = "'Avenir Next Condensed','Arial Narrow',Arial,sans-serif"
e = html.escape

def shell(subject, preheader, kind, who, sub, body):
    logo = f'<img src="{logo_src}" width="54" height="46" alt="LT" style="display:block;border:0">' if logo_src else ''
    return f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>{e(subject)}</title></head>
<body style="margin:0;padding:0;background:{BG};font-family:{SANS};color:{INK}">
<div style="display:none;max-height:0;overflow:hidden">{e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG}"><tr><td align="center" style="padding:16px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid {LINE};border-radius:10px;overflow:hidden">
<tr><td style="padding:14px 18px 12px;border-bottom:4px solid {ORANGE}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="62" valign="middle">{logo}</td>
    <td valign="middle" style="font-family:{COND};font-weight:700;font-size:15px;letter-spacing:1.5px;text-transform:uppercase;color:{NAVY}">Legend Titans Baseball<br>
      <span style="font-size:12px;letter-spacing:1.2px;color:{ORANGE}">{e(kind)}</span></td>
  </tr></table></td></tr>
<tr><td style="background:{NAVY};padding:16px 18px">
  <div style="font-family:{COND};font-weight:700;font-size:26px;line-height:1.1;letter-spacing:.5px;text-transform:uppercase;color:#FFFFFF">{e(who)}</div>
  <div style="font-size:14px;color:#BFD0EC;margin-top:4px">{sub}</div></td></tr>
{body}
<tr><td style="padding:14px 18px 18px;border-top:1px solid {LINE};font-size:12.5px;line-height:1.5;color:{MUTED}">
  These are your numbers only. Nobody else gets this card.<br>
  Don't want these emails? Tell a coach and we'll stop them.</td></tr>
</table></td></tr></table></body></html>'''

def section(title, inner, pad='16px 18px 6px'):
    t = f'<div style="font-family:{COND};font-weight:700;font-size:13px;letter-spacing:1.4px;text-transform:uppercase;color:{MUTED};margin-bottom:8px">{e(title)}</div>' if title else ''
    return f'<tr><td style="padding:{pad}">{t}{inner}</td></tr>'

def note(text, who):
    return section('', f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="background:#FDF3EC;border-left:4px solid {ORANGE};border-radius:6px;padding:12px 14px">
    <div style="font-family:{COND};font-weight:700;font-size:12px;letter-spacing:1.3px;text-transform:uppercase;color:{ORANGE};margin-bottom:4px">From {e(who)}</div>
    <div style="font-size:16px;line-height:1.45;color:{INK}">{e(text)}</div></td></tr></table>''', '16px 18px 4px')

def tiles(items):
    # items: (big, label), up to 4 per row. Every tile the same height, so a 2-line
    # label never makes one box taller than its neighbours.
    cells = ''.join(f'''<td width="{100//len(items)}%" valign="top" style="padding:4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="74" align="center" valign="middle" style="background:{SOFT};border-radius:6px;padding:6px 4px">
      <div style="font-family:{COND};font-weight:700;font-size:22px;color:{NAVY};line-height:1.1">{big}</div>
      <div style="font-size:11px;line-height:1.3;letter-spacing:.6px;text-transform:uppercase;color:{MUTED};margin-top:3px">{lab}</div></td></tr></table></td>''' for big, lab in items)
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>{cells}</tr></table>'

def table(head, rows, align=None):
    align = align or (['left'] + ['center'] * (len(head) - 1))
    th = ''.join(f'<td align="{a}" style="padding:6px 6px;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:{MUTED};border-bottom:1px solid {LINE}">{e(h)}</td>' for h, a in zip(head, align))
    tr = ''
    for r in rows:
        tr += '<tr>' + ''.join(f'<td align="{a}" style="padding:8px 6px;font-size:14.5px;border-bottom:1px solid {SOFT}{";white-space:nowrap" if i and len(re.sub("<[^>]+>|&[a-z]+;", "x", c)) <= 16 else ""}">{c}</td>' for i, (c, a) in enumerate(zip(r, align))) + '</tr>'
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>{th}</tr>{tr}</table>'

def read(text):
    return f'<div style="font-size:14.5px;line-height:1.45;color:{INK};margin:8px 2px 4px">{text}</div>'

def buttons(main, second):
    return section('', f'''<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
  <a href="#" style="display:inline-block;background:{ORANGE};color:#FFFFFF;text-decoration:none;font-family:{COND};font-weight:700;font-size:16px;letter-spacing:1.2px;text-transform:uppercase;padding:14px 26px;border-radius:8px">{e(main)}</a>
  <div style="font-size:13px;color:{MUTED};margin-top:8px">Takes 2 minutes. Your coaches read every one.</div>
  <div style="margin-top:12px"><a href="#" style="font-size:14px;color:{NAVY};font-weight:600">{e(second)} &rarr;</a></div></td></tr></table>''', '14px 18px 18px')

def grid(cells, legend):
    # cells[r][c] = (text, bg, border) ; 5x5, the strike zone is the middle 3x3
    rows = ''
    for r in range(5):
        tds = ''
        for c in range(5):
            t, bg, bd = cells[r][c]
            zone = 1 <= r <= 3 and 1 <= c <= 3
            border = bd or (f'1px solid {LINE}')
            tds += f'<td width="44" height="40" align="center" valign="middle" style="background:{bg or (SOFT if zone else "#FFFFFF")};border:{border};font-family:{COND};font-weight:700;font-size:14px;color:{INK}">{t}</td>'
        rows += f'<tr>{tds}</tr>'
    return f'''<table role="presentation" cellpadding="0" cellspacing="2" align="center" style="margin:4px auto 6px">{rows}</table>
      <div style="font-size:12px;color:{MUTED};text-align:center">{legend}</div>'''

CHECK = f'<span style="color:{GOOD};font-weight:700">&#10003;</span>'
NOTYET = f'<span style="color:{MUTED}">&middot;</span>'

# ------------------------------------------------------------- pitcher game card
def goal_row(name, today_n, today_d, pct, goal, met, season):
    return [f'<b>{name}</b><div style="font-size:12px;color:{MUTED}">goal {goal}</div>',
            f'{today_n} of {today_d}<div style="font-size:12px;color:{MUTED}">{pct}</div>',
            met and CHECK or NOTYET, season]

game = shell('Your game card: at Ridgeview, Oct 26',
  'Colten Smith · 4.0 innings, 62 pitches, 4 strikeouts. A note from Coach Vaughn inside.',
  'Pitcher game card', 'Colten Smith',
  'Varsity &middot; at Ridgeview &middot; Mon, Oct 26 &middot; Starter',
  note('Fastball command was there all day: 39 of 62 for strikes. The first pitch is the next step. '
       '9 of 16 is close to the goal, and getting ahead with the curveball would get you there.', 'Coach Vaughn')
  + section('Your outing', tiles([('4.0', 'Innings'), ('62', 'Pitches'), ('16', 'Batters'), ('1 / 1', 'Runs / ER')]))
  + section('Nothing Free: program goals', table(['', 'Today', '', 'Season'], [
      goal_row('First-pitch strikes', 9, 16, '56%', '60%', False, '59%'),
      goal_row('Strikes', 39, 62, '63%', '60%', True, '61%'),
      goal_row('Free bases (BB+HBP)', 2, 16, '13%', '13% or less', True, '11%'),
      goal_row('Strikeouts', 4, 16, '25%', '22%', True, '26%'),
      goal_row('Hard contact', 2, 10, '20%', '20% or less', True, '19%'),
      [f'<b>ERA</b><div style="font-size:12px;color:{MUTED}">goal 3.50</div>', '', '', '2.47'],
      [f'<b>WHIP</b><div style="font-size:12px;color:{MUTED}">goal 1.50</div>', '', '', '1.15'],
    ], ['left', 'center', 'center', 'center'])
    + f'<div style="font-size:12px;color:{MUTED};margin:6px 2px 0">{CHECK} met the goal today. Season: 3 games, 11.1 innings.</div>')
  + section('Hitting your spot', tiles([('21', 'Right on the spot'), ('42 of 62', 'Spot or next to it &middot; 68%')])
    + read('41 pitches missed the exact spot. <b>19 were down</b> and <b>19 went to the arm side</b> (in to a righty).'))
  + section('By pitch', table(['Pitch', 'Thrown', 'Strikes', 'Spot or next'], [
      ['Fastball', '38', '58%', '71%'],
      ['Curveball', '12', '83%', '67%'],
      ['Change-up', '12', '58%', '58%']]))
  + buttons('Write your reflection', 'See all your games and pens'))

# ------------------------------------------------------------- hitter game card
def zone_hitter():
    c = [[('', None, None) for _ in range(5)] for _ in range(5)]
    sw, tk, ch = '&#9679;', '&#9675;', '#FBE3D2'
    marks = {(1,3): [tk, sw], (0,1): [sw, tk], (3,1): [sw, sw], (2,1): [tk], (4,3): [sw], (1,4): [tk], (2,0): ['HBP']}
    for (r, cc), m in marks.items():
        chase = not (1 <= r <= 3 and 1 <= cc <= 3) and sw in m
        c[r][cc] = (' '.join(m) if m != ['HBP'] else '<span style="font-size:11px">HBP</span>', ch if chase else None, f'2px solid {ORANGE}' if chase else None)
    return grid(c, f'Catcher&rsquo;s view &middot; &#9679; swung &middot; &#9675; took &middot; orange = chased off the plate')

hit = shell('Your game card: at Ridgeview, Oct 26',
  'Troy Hazen · 2 doubles and a hit-by-pitch. 3 of 3 quality at-bats.',
  'Hitter game card', 'Troy Hazen',
  'Varsity &middot; at Ridgeview &middot; Mon, Oct 26 &middot; Batting 4th',
  note('Both doubles came on pitches you could drive, and the first one was with 2 strikes. '
       'That is the swing. Same plan on the first pitch next game.', 'Coach Vaughn')
  + section('Your at-bats', table(['', 'How it ended', 'Pitches'], [
      ['1', f'<b>Double</b> on an 0-2 change-up, hit hard<div style="font-size:12px;color:{MUTED}">ran in a run</div>', '3'],
      ['2', '<b>Double</b> on a first-pitch curveball, line drive, hit hard', '1'],
      ['3', '<b>Hit by pitch</b> on a 2-2 fastball', '6']], ['center', 'left', 'center']))
  + section('Quality at-bats', tiles([('3 of 3', 'Quality at-bats'), ('3.3', 'Pitches per at-bat')])
    + read('Counted for: <b>hits</b> (2), <b>line drive</b>, <b>hit by pitch</b>, <b>run scored</b>, <b>2-strike contact</b>.'))
  + section('Your swings', tiles([('2 of 5', 'Chased'), ('2 of 2', 'Hit hard'), ('0', 'Strikeouts'), ('1', 'Free bases')])
    + zone_hitter())
  + buttons('Write your reflection', 'See all your games'))

# ------------------------------------------------------------- pen card
def zone_pen():
    counts = [[0,0,2,0,0],[0,3,2,1,1],[0,1,3,3,0],[0,4,1,7,4],[1,1,2,2,2]]
    spots = {(2,2):'0',(0,2):'1',(1,1):'2',(3,1):'3',(3,3):'4',(4,4):'5'}
    c = []
    for r in range(5):
        row = []
        for cc in range(5):
            n = counts[r][cc]
            shade = ['#FFFFFF', '#E3EAF6', '#C5D3EC', '#9CB4DE', '#6F8FCB'][min(4, (n + 1) // 2)] if n else None
            spot = spots.get((r, cc))
            dark = n >= 5
            t = (f'<span style="color:#FFFFFF">{n}</span>' if dark else (str(n) if n else '')) + (f'<div style="font-size:10px;color:{"#FFFFFF" if dark else ORANGE}">spot {spot}</div>' if spot else '')
            row.append((t, shade, f'2px solid {ORANGE}' if spot else None))
        c.append(row)
    return grid(c, 'Catcher&rsquo;s view &middot; how many pitches landed in each box &middot; orange boxes are the called spots')

pen = shell('Your pen card: Oct 26, Hitter\'s Counts',
  'Colten Smith · 18 of 40 on the spot, up from 15 last pen.',
  'Bullpen card', 'Colten Smith',
  'Winter bullpen &middot; Mon, Oct 26 &middot; Hitter&rsquo;s Counts &middot; 40 pitches',
  note('The change-up was on the spot 4 of 13. Finish it out front and it plays. '
       'Fastball down and away from the stretch looked good.', 'Coach Vaughn')
  + section('Hitting your spot', tiles([('18', 'On the spot'), ('29', 'Spot or next to it'), ('25', 'Strikes')])
    + table(['', 'Today', 'Last pen', 'Change'], [
      ['On the spot', '45%', '38%', f'<b style="color:{GOOD}">+7</b>'],
      ['Spot or next to it', '73%', '70%', f'<b style="color:{GOOD}">+3</b>'],
      ['Strikes', '63%', '64%', '&minus;1']], ['left', 'center', 'center', 'center'])
    + read('22 pitches missed the spot. <b>10 went to the arm side</b> (in to a righty).'))
  + section('By pitch', table(['Pitch', 'Thrown', 'Spot', 'Spot or next', 'Velo avg / top'], [
      ['Fastball', '20', '9', '13', '91 / 93'],
      ['Curveball', '7', '5', '5', '74 / 76'],
      ['Change&#8209;up', '13', '4', '11', '82 / 85']]))
  + section('Where it went', zone_pen())
  + buttons('Write your reflection', 'See all your pens'))

for name, page in [('pitcher-game', game), ('hitter-game', hit), ('pen', pen)]:
    open(os.path.join(OUT, name + '.html'), 'w').write(page)
print('wrote', OUT)
