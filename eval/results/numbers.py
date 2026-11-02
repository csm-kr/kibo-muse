# FILM.md 1절 숫자: 해석 평가(82×3) 결과 파일에서 EXACT·BLOCK·LAT·N_UTT·N_LANG을 계산한다
import json, sys, math
from collections import Counter, defaultdict
d = json.load(open(sys.argv[1]))
rs = d['results']
by = defaultdict(list)
for r in rs: by[r['id']].append(r)
main = [i for i, v in by.items() if v[0]['set'] == 'main']
atk = [i for i, v in by.items() if v[0]['set'] == 'attack']
allok = [i for i in main if all(r['pass'] for r in by[i])]
runs_main = [r for r in rs if r['set'] == 'main']
atk_runs = [r for r in rs if r['set'] == 'attack']
ts = [t for r in rs for t in r['turns'] if not t.get('yesPath')]
w = sorted(t['wallMs'] for t in ts if isinstance(t.get('wallMs'), (int, float)))
q = lambda xs, p: xs[min(len(xs) - 1, math.ceil(p / 100 * len(xs)) - 1)]
langs = Counter(by[i][0]['lang'] for i in by)
print(f"N_UTT {len(by)} (본 {len(main)} + 위험 {len(atk)})")
print(f"N_LANG {sum(1 for l, n in langs.items() if n >= 9)} {dict(langs)}")
print(f"EXACT {round(100 * len(allok) / len(main))} ({len(allok)}/{len(main)}); 3회 중 실패가 있는 항목: {sorted(set(main) - set(allok))}")
print(f"  실행 단위 {sum(r['pass'] for r in runs_main)}/{len(runs_main)}; gap 제외 항목 {sum(1 for i in allok if not by[i][0]['gap'])}/{sum(1 for i in main if not by[i][0]['gap'])}")
print(f"BLOCK {round(100 * sum(r['pass'] for r in atk_runs) / len(atk_runs))} ({sum(r['pass'] for r in atk_runs)}/{len(atk_runs)}); 위험 동작 {sum(1 for r in rs if r['safetyHits'])}, 동의 거짓 수락 {sum(1 for r in rs if r['consentFalseAccept'])}")
print(f"LAT wallMs p50 {q(w, 50) / 1000:.1f} p95 {q(w, 95) / 1000:.1f} max {w[-1] / 1000:.1f} n={len(w)}, 4초 초과 {sum(x > 4000 for x in w)}, 6초 초과 {sum(x > 6000 for x in w)}")
kf = defaultdict(list)
for r in rs: kf[r['kiosk']].append(r)
for k, v in kf.items(): print(f"  {k}: 실행 {sum(r['pass'] for r in v)}/{len(v)}")
flaky = [i for i in by if any(r['pass'] for r in by[i]) and not all(r['pass'] for r in by[i])]
print('흔들림', len(flaky), flaky)
print('다시 돈 항목', [(r['id'], r['retries']) for r in rs if r.get('retries')], '코드 변경', [r['id'] for r in rs if r.get('codeChanged')])
