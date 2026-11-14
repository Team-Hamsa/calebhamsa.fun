"""analyze.py: turn measure.py's measure.tsv into the tables for issue #10.

Only molecules PubChem has a real name for count (like the real list:
"CID 123" titles are left out). For each set of atoms, each size limit
and each board, it prints how many named molecules could be built, and
guesses how big data/molecules.json would get.

Run:  ./venv/bin/python analyze.py measure.tsv CID-Title.gz
"""
import gzip
import json
import re
import sys
from collections import Counter
from pathlib import Path

NO_NAME = re.compile(r'^CID \d+$')
TODAY = {'C', 'N', 'O', 'S', 'Cl'}
EASY = TODAY | {'F', 'Br', 'I', 'B', 'Si', 'P'}
ATOM_SETS = (
    ('today (C N O S Cl)', lambda els, extra: els <= TODAY and not extra),
    ('+ F Br I B Si P', lambda els, extra: els <= EASY and not extra),
    ('+ extra hands (S 4/6, P 5)', lambda els, extra: True),
)
LIMITS = (8, 9, 10)


def read_measure(path):
    rows = []
    with open(path) as lines:
        for line in lines:
            cid, heavy, els, extra, sq, tri, odd, forms = line.rstrip('\n').split('\t')
            rows.append({'cid': int(cid), 'heavy': int(heavy), 'els': set(els.split(',')) if els else set(),
                         'extra': extra == '1', 'square': sq == '1', 'triangle': tri == '1',
                         'tri_gave_up': tri == 'T', 'odd': odd == '1', 'forms': len(forms.split('|'))})
    return rows


def named_cids(title_file, wanted):
    named = set()
    with gzip.open(title_file, 'rt') as lines:
        for line in lines:
            cid, _, title = line.rstrip('\n').partition('\t')
            if cid.isdigit() and int(cid) in wanted and not NO_NAME.match(title):
                named.add(int(cid))
    return named


def bytes_per_entry():
    """Average size of one data/molecules.json entry, by non-H atom count."""
    db = json.loads((Path(__file__).parent / '../../data/molecules.json').read_text())
    total, count = Counter(), Counter()
    for label, name in db.items():
        heavy = len(label.split('|')[0].split(','))
        total[heavy] += len(json.dumps(label)) + len(json.dumps(name)) + 2
        count[heavy] += 1
    sizes = {h: total[h] / count[h] for h in count}
    # Past 8, grow by the same step as 7 → 8.
    for h in (9, 10):
        sizes[h] = sizes[h - 1] + (sizes[8] - sizes[7])
    return sizes


def main(measure_path, title_file):
    rows = read_measure(measure_path)
    named = named_cids(title_file, {r['cid'] for r in rows})
    rows = [r for r in rows if r['cid'] in named]
    size = bytes_per_entry()
    gzip_ratio = 0.84 / 6.7  # today's list: 6.7 MB on disk, 0.84 MB gzipped

    print(f'{len(rows):,} named molecules kept (any atoms, up to 10, either board)\n')
    print('Named molecules each board can build (and the guessed list size, gzipped):\n')
    print(f"{'atoms':30} {'limit':>5} {'square':>16} {'triangle':>16} {'triangle gave up':>17}")
    for label, allowed in ATOM_SETS:
        for limit in LIMITS:
            some = [r for r in rows if allowed(r['els'], r['extra']) and r['heavy'] <= limit]
            cells = []
            for board in ('square', 'triangle'):
                fits = [r for r in some if r[board]]
                mb = sum(size[max(r['heavy'], 1)] * r['forms'] for r in fits) * gzip_ratio / 1e6
                cells.append(f'{len(fits):>7,} ({mb:4.2f} MB)')
            gave_up = sum(r['tri_gave_up'] for r in some)
            print(f'{label:30} {limit:>5} {cells[0]:>16} {cells[1]:>16} {gave_up:>17,}')
        print()

    print('Why the triangle board helps (today\'s atoms, up to 10):')
    today = [r for r in rows if ATOM_SETS[0][1](r['els'], r['extra'])]
    only_tri = [r for r in today if r['triangle'] and not r['square']]
    odd = sum(r['odd'] for r in only_tri)
    print(f'  {len(only_tri):,} fit only the triangle board; {odd:,} of them have an odd ring')
    neither = [r for r in today if not r['triangle'] and not r['tri_gave_up']]
    print(f'  {len(neither):,} fit neither board')

    print('\nWhich new atoms bring the most (named, triangle board, up to 10):')
    gains = Counter()
    for r in rows:
        if r['triangle'] and not (r['els'] <= TODAY and not r['extra']):
            for el in r['els'] - TODAY:
                gains[el] += 1
            if r['extra']:
                gains['extra hands'] += 1
    for el, n in gains.most_common():
        print(f'  {el:12} {n:>7,}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
