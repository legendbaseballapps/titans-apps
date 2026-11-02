# Writes demo/index.html with tools/demo-data.json baked in. Run after demo-build.js.
import json, html
d = json.load(open('/home/claude/ta/tools/demo-data.json'))
tpl = open('/home/claude/ta/tools/demo-page.tpl.html').read()
J = lambda o: json.dumps(o, separators=(',', ':')).replace('</', '<\\/')
out = tpl.replace('/*DATA*/null', J(d['keys'])).replace('/*LIVE*/null', J(d.get('live', {}).get('keys')))
open('/home/claude/ta/demo/index.html', 'w').write(out)
print('demo/index.html', len(out), 'bytes')
