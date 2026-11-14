"""measure.py: how many real molecules could each board shape build?

A measuring tool for issue #10, NOT part of making the molecule list.
It reads PubChem's CID-SMILES.gz with export.py's rules, but allows up to
10 non-H atoms and more kinds of atom (see HANDS below: F, Br, I, B, Si,
P, and sulfur with 4 or 6 hands), and for every molecule it keeps it
tries two boards:

  square    the board we have: 4 cells beside each cell (fits_grid)
  triangle  a board where each cell touches 6 others (fits_tri below)

It writes one line per molecule (oldest CID wins, like export.py):
  cid <TAB> heavy <TAB> elements <TAB> extra <TAB> square <TAB> triangle <TAB> odd_ring <TAB> smiles|smiles|...
where elements lists its non-H atoms (like "C,N,O"), extra is 1 if it
needs an atom with extra hands (S with 4 or 6, P with 5),
square/triangle are 1 (fits), 0 (doesn't), or T (gave up: too slow),
and odd_ring is 1 if it has a ring of 3, 5 or 7 atoms.

Run:  ./venv/bin/python measure.py CID-SMILES.gz > measure.tsv
"""
import gzip
import re
import sys
from multiprocessing import Pool

from rdkit import Chem

import export

MAX_HEAVY = 10

# Every number of hands each atom may use. The room today has the first six
# (S only with 2); the rest are what we're measuring.
HANDS = {'H': {1}, 'C': {4}, 'N': {3}, 'O': {2}, 'S': {2, 4, 6}, 'Cl': {1},
         'F': {1}, 'Br': {1}, 'I': {1}, 'B': {3}, 'Si': {4}, 'P': {3, 5}}
EXTRA = {'S': {4, 6}, 'P': {5}}

OK_CHARS = re.compile(r'^[CNOSPFIBHcnospbrli\[\]()=#0-9@/\\]+$')
ATOM_TOKEN = re.compile(r'Cl|Br|Si|\[[^\]]*\]|[CNOSPFIBcnospb]')

# Axial coordinates: the 6 cells around a cell on a triangle board.
TRI_SIDES = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1))

# The old square board (export.py used to check this before the triangle board).
SIDES = ((1, 0), (-1, 0), (0, 1), (0, -1))

# The step budgets the 2026-10-28 measurements used.
SQUARE_BUDGET = 200_000
TRI_BUDGET = 200_000


def fits_grid(mol):
    """Can every atom (H's too) sit in its own cell, bonded pairs side by side?"""
    mol = Chem.AddHs(mol)
    n = mol.GetNumAtoms()
    nbrs = [[b.GetIdx() for b in a.GetNeighbors()] for a in mol.GetAtoms()]
    if any(len(x) > 4 for x in nbrs):
        return False
    start = max(range(n), key=lambda i: (mol.GetAtomWithIdx(i).GetAtomicNum() > 1, len(nbrs[i])))
    order, seen = [start], {start}
    for i in order:  # breadth-first: each atom is placed next to one already placed
        for j in sorted(nbrs[i], key=lambda k: -len(nbrs[k])):
            if j not in seen:
                seen.add(j)
                order.append(j)
    pos, used, steps = {start: (0, 0)}, {(0, 0)}, [0]

    def place(k):
        if k == n:
            return True
        steps[0] += 1
        if steps[0] > SQUARE_BUDGET:
            raise TimeoutError
        a = order[k]
        placed = [b for b in nbrs[a] if b in pos]
        x0, y0 = pos[placed[0]]
        for dx, dy in SIDES:
            c = (x0 + dx, y0 + dy)
            if c in used or any(abs(pos[b][0] - c[0]) + abs(pos[b][1] - c[1]) != 1 for b in placed[1:]):
                continue
            pos[a] = c
            used.add(c)
            if place(k + 1):
                return True
            del pos[a]
            used.discard(c)
        return False

    try:
        return place(1)
    except TimeoutError:
        return False


def keep(smiles):
    """export.keep with the wider HANDS: (molecule, elements, extra) or None."""
    if not OK_CHARS.match(smiles):
        return None
    if len([t for t in ATOM_TOKEN.findall(smiles) if t != '[H]']) > MAX_HEAVY:
        return None
    mol = Chem.MolFromSmiles(smiles)
    if mol is None or len(Chem.GetMolFrags(mol)) != 1 or mol.GetNumHeavyAtoms() > MAX_HEAVY:
        return None
    elements, extra = set(), False
    for atom in Chem.AddHs(mol).GetAtoms():
        el, hands = atom.GetSymbol(), atom.GetTotalValence()
        if (hands not in HANDS.get(el, ()) or atom.GetFormalCharge() or atom.GetIsotope()
                or atom.GetNumRadicalElectrons()):
            return None
        if el != 'H':
            elements.add(el)
        extra = extra or hands in EXTRA.get(el, ())
    Chem.RemoveStereochemistry(mol)
    return mol, ','.join(sorted(elements)), int(extra)


def tri_touching(p, q):
    """Are two triangle-board cells side by side?"""
    dx, dy = p[0] - q[0], p[1] - q[1]
    return (dx, dy) in TRI_SIDES


def fits_tri(mol):
    """Like fits_grid, on a board where each cell touches 6 others."""
    mol = Chem.AddHs(mol)
    n = mol.GetNumAtoms()
    nbrs = [[b.GetIdx() for b in a.GetNeighbors()] for a in mol.GetAtoms()]
    if any(len(x) > 6 for x in nbrs):
        return False
    start = max(range(n), key=lambda i: (mol.GetAtomWithIdx(i).GetAtomicNum() > 1, len(nbrs[i])))
    order, seen = [start], {start}
    for i in order:
        for j in sorted(nbrs[i], key=lambda k: -len(nbrs[k])):
            if j not in seen:
                seen.add(j)
                order.append(j)
    pos, used, steps = {start: (0, 0)}, {(0, 0)}, [0]

    def place(k):
        if k == n:
            return True
        steps[0] += 1
        if steps[0] > TRI_BUDGET:
            raise TimeoutError
        a = order[k]
        placed = [b for b in nbrs[a] if b in pos]
        x0, y0 = pos[placed[0]]
        for dx, dy in TRI_SIDES:
            c = (x0 + dx, y0 + dy)
            if c in used or not all(tri_touching(pos[b], c) for b in placed[1:]):
                continue
            pos[a] = c
            used.add(c)
            if place(k + 1):
                return True
            del pos[a]
            used.discard(c)
        return False

    return place(1)


def tri_result(mol):
    try:
        return '1' if fits_tri(mol) else '0'
    except TimeoutError:
        return 'T'

def odd_ring(mol):
    return int(any(len(r) % 2 for r in mol.GetRingInfo().AtomRings()))

def check(line):
    cid, _, smiles = line.rstrip('\n').partition('\t')
    kept = keep(smiles)
    if kept is None:
        return None
    mol, elements, extra = kept
    # fits_grid counts "gave up" as "doesn't fit", just like the real list.
    square = '1' if fits_grid(mol) else '0'
    # The triangle board has the square's 4 sides plus 2 more, so whatever
    # fits the square fits it too: only search when the square said no.
    triangle = '1' if square == '1' else tri_result(mol)
    return (int(cid), Chem.MolToSmiles(mol), mol.GetNumHeavyAtoms(), elements, extra,
            square, triangle, odd_ring(mol), export.kekule_forms(mol))

def main(smiles_file):
    best = {}
    with gzip.open(smiles_file, 'rt') as lines, Pool() as pool:
        for count, found in enumerate(pool.imap(check, lines, chunksize=5000), 1):
            if count % 5_000_000 == 0:
                print(f'{count:,} read, {len(best):,} kept', file=sys.stderr, flush=True)
            if found and (found[1] not in best or found[0] < best[found[1]][0]):
                best[found[1]] = found
    for cid, _, heavy, elements, extra, sq, tri, odd, forms in sorted(best.values()):
        print(f"{cid}\t{heavy}\t{elements}\t{extra}\t{sq}\t{tri}\t{odd}\t{'|'.join(forms)}")

if __name__ == '__main__':
    main(sys.argv[1])
