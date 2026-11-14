"""export.py: makes the chemistry room's molecule list from PubChem.

This runs on a computer, NOT in the web page. It reads PubChem's two big
free download files and writes molecules.tsv, which make-db.js turns
into data/molecules.json (see README.md in this folder).

It keeps a PubChem compound only if Caleb could build it on the board:
  * only H C N O S Cl F Br I B Si P atoms; no charges, no special
    isotopes; one piece
  * every atom uses one of its numbers of hands (HANDS below: sulfur may
    use 2, 4 or 6, phosphorus 3 or 5, every other atom just one number)
  * at most MAX_HEAVY atoms that aren't H
  * it fits flat on the triangle board (each cell touches 6 others), one
    atom (H's too) per cell, every bonded pair side by side, inside the
    board's BOARD_WIDTH x BOARD_HEIGHT cells (fits_tri below)

For each one it writes:   name <TAB> smiles|smiles|...
with EVERY Kekule form (each way the double bonds in a benzene-like ring
can sit), because Caleb might build any of them.

Run:  python export.py CID-SMILES.gz CID-Title.gz > molecules.tsv
"""
import gzip
import re
import sys
from multiprocessing import Pool

from rdkit import Chem, RDLogger

RDLogger.DisableLog('rdApp.*')

# The most non-H atoms a molecule can have. Try this! 9 makes a bigger list.
MAX_HEAVY = 8

# Every number of hands each atom may use: the same numbers as
# js/chem/smiles.js (HANDS, plus EXTRA_HANDS for S and P).
HANDS = {'H': {1}, 'C': {4}, 'N': {3}, 'O': {2}, 'S': {2, 4, 6}, 'Cl': {1},
         'F': {1}, 'Br': {1}, 'I': {1}, 'B': {3}, 'Si': {4}, 'P': {3, 5}}

# The board's size in cells: the same numbers as js/chem/board.js.
BOARD_WIDTH = 12
BOARD_HEIGHT = 10

# How hard fits_tri tries before giving up (and saying "doesn't fit").
# Try this! 200_000 gives up on about 1,300 molecules; this many gives up on
# far fewer (the run prints how many on stderr).
GRID_BUDGET = 2_000_000

# Quick text checks, before the slow RDKit ones.
OK_CHARS = re.compile(r'^[CNOSPFIBHcnospbrli\[\]()=#0-9@/\\]+$')
ATOM_TOKEN = re.compile(r'Cl|Br|Si|\[[^\]]*\]|[CNOSPFIBcnospb]')

# The 6 cells around a cell on the triangle board, in "axial" steps (q, r):
# r is the row, and q moves along the row. (1, -1) and (-1, 1) are the two
# slanted neighbours a square grid doesn't have.
TRI_SIDES = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1))


def keep(smiles):
    """The molecule, stereo removed, if Caleb could make it; else None."""
    if not OK_CHARS.match(smiles):
        return None
    if len([t for t in ATOM_TOKEN.findall(smiles) if t != '[H]']) > MAX_HEAVY:
        return None
    mol = Chem.MolFromSmiles(smiles)
    if mol is None or len(Chem.GetMolFrags(mol)) != 1 or mol.GetNumHeavyAtoms() > MAX_HEAVY:
        return None
    for atom in Chem.AddHs(mol).GetAtoms():
        if (atom.GetTotalValence() not in HANDS.get(atom.GetSymbol(), ()) or atom.GetFormalCharge()
                or atom.GetIsotope() or atom.GetNumRadicalElectrons()):
            return None
    Chem.RemoveStereochemistry(mol)  # the board is flat: no 3D
    return mol


def fits_tri(mol):
    """Can every atom (H's too) sit in its own cell of the triangle board,
    bonded pairs side by side, all inside BOARD_WIDTH x BOARD_HEIGHT?

    Raises TimeoutError after GRID_BUDGET tries (check() counts those)."""
    mol = Chem.AddHs(mol)
    n = mol.GetNumAtoms()
    nbrs = [[b.GetIdx() for b in a.GetNeighbors()] for a in mol.GetAtoms()]
    if any(len(x) > 6 for x in nbrs):
        return False
    start = max(range(n), key=lambda i: (mol.GetAtomWithIdx(i).GetAtomicNum() > 1, len(nbrs[i])))
    order, seen = [start], {start}
    for i in order:  # breadth-first: each atom is placed next to one already placed
        for j in sorted(nbrs[i], key=lambda k: -len(nbrs[k])):
            if j not in seen:
                seen.add(j)
                order.append(j)
    pos, used, steps = {start: (0, 0)}, {(0, 0)}, [0]

    def fits_board():
        # Across: 2q + r is twice the cell's real left-right place (rows are
        # shifted half a cell). Two cells 2*(BOARD_WIDTH-1) apart still fit
        # in one row. Down: the rows used.
        across = [2 * q + r for q, r in pos.values()]
        rows = [r for _, r in pos.values()]
        return (max(across) - min(across) <= 2 * (BOARD_WIDTH - 1)
                and max(rows) - min(rows) <= BOARD_HEIGHT - 1)

    def place(k):
        if k == n:
            return True
        steps[0] += 1
        if steps[0] > GRID_BUDGET:
            raise TimeoutError
        a = order[k]
        placed = [b for b in nbrs[a] if b in pos]
        x0, y0 = pos[placed[0]]
        for dx, dy in TRI_SIDES:
            c = (x0 + dx, y0 + dy)
            if c in used or any((pos[b][0] - c[0], pos[b][1] - c[1]) not in TRI_SIDES for b in placed[1:]):
                continue
            pos[a] = c
            used.add(c)
            if fits_board() and place(k + 1):
                return True
            del pos[a]
            used.discard(c)
        return False

    return place(1)


def kekule_forms(mol):
    """Every Kekule form, as kekule SMILES (only ring single/double bonds swap)."""
    base = Chem.Mol(mol)
    Chem.Kekulize(base, clearAromaticFlags=True)
    ring = [b for b in mol.GetBonds() if b.GetIsAromatic()
            and base.GetBondWithIdx(b.GetIdx()).GetBondType() in (Chem.BondType.SINGLE, Chem.BondType.DOUBLE)]
    if not ring:
        return [Chem.MolToSmiles(base, kekuleSmiles=True)]
    need = set()  # atoms that hold a ring double bond
    for b in ring:
        if base.GetBondWithIdx(b.GetIdx()).GetBondType() == Chem.BondType.DOUBLE:
            need.update((b.GetBeginAtomIdx(), b.GetEndAtomIdx()))
    edges = [(b.GetIdx(), b.GetBeginAtomIdx(), b.GetEndAtomIdx()) for b in ring
             if b.GetBeginAtomIdx() in need and b.GetEndAtomIdx() in need]
    forms = set()

    def pair_up(left, chosen):
        if not left:
            form = Chem.RWMol(base)
            for b in ring:
                form.GetBondWithIdx(b.GetIdx()).SetBondType(Chem.BondType.SINGLE)
            for idx in chosen:
                form.GetBondWithIdx(idx).SetBondType(Chem.BondType.DOUBLE)
            forms.add(Chem.MolToSmiles(form, kekuleSmiles=True))
            return
        a = min(left)
        for idx, x, y in edges:
            other = y if x == a else x if y == a else None
            if other is not None and other in left:
                pair_up(left - {a, other}, chosen + [idx])

    pair_up(frozenset(need), [])
    return sorted(forms)


def check(line):
    """One CID-SMILES line → (cid, canonical smiles, forms), 'gave up', or None."""
    cid, _, smiles = line.rstrip('\n').partition('\t')
    mol = keep(smiles)
    if mol is None:
        return None
    try:
        if not fits_tri(mol):
            return None
    except TimeoutError:
        return 'gave up'
    return int(cid), Chem.MolToSmiles(mol), kekule_forms(mol)


def main(smiles_file, title_file):
    """Write molecules.tsv to stdout (oldest CID wins for each molecule)."""
    best = {}  # canonical smiles → (cid, forms)
    with gzip.open(smiles_file, 'rt') as lines, Pool() as pool:
        gave_up = 0
        for found in pool.imap(check, lines, chunksize=5000):
            if found == 'gave up':
                gave_up += 1
            elif found and (found[1] not in best or found[0] < best[found[1]][0]):
                best[found[1]] = (found[0], found[2])
    print(f'{len(best):,} molecules fit; gave up on {gave_up:,}', file=sys.stderr)
    wanted = {cid: forms for cid, forms in best.values()}
    names = {}
    with gzip.open(title_file, 'rt') as lines:
        for line in lines:
            cid, _, title = line.rstrip('\n').partition('\t')
            if cid.isdigit() and int(cid) in wanted:
                names[int(cid)] = title
    for cid in sorted(wanted):
        if cid in names:
            print(f"{names[cid]}\t{'|'.join(wanted[cid])}")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
