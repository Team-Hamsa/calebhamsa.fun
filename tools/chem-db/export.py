"""export.py: makes the chemistry room's molecule list from PubChem.

This runs on a computer, NOT in the web page. It reads PubChem's two big
free download files and writes molecules.tsv, which make-db.js turns
into data/molecules.json (see README.md in this folder).

It keeps a PubChem compound only if Caleb could build it on the board:
  * only H, C, N, O, S, Cl atoms; no charges, no special isotopes; one piece
  * every atom has exactly its number of hands (H 1, C 4, N 3, O 2, S 2, Cl 1)
  * at most MAX_HEAVY atoms that aren't H
  * it fits flat on a square grid, one atom (H's too) per cell, with
    every bonded pair side by side (fits_grid below)

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

# Hands per atom: the same numbers as js/chem/smiles.js.
HANDS = {'H': 1, 'C': 4, 'N': 3, 'O': 2, 'S': 2, 'Cl': 1}

# How hard fits_grid tries before giving up (and saying "doesn't fit").
GRID_BUDGET = 200_000

# Quick text checks, before the slow RDKit ones.
OK_CHARS = re.compile(r'^[CNOSHcnosl\[\]()=#0-9@/\\]+$')
ATOM_TOKEN = re.compile(r'Cl|\[[^\]]*\]|[CNOScnos]')
SIDES = ((1, 0), (-1, 0), (0, 1), (0, -1))


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
        el = atom.GetSymbol()
        if (el not in HANDS or atom.GetFormalCharge() or atom.GetIsotope()
                or atom.GetNumRadicalElectrons() or atom.GetTotalValence() != HANDS[el]):
            return None
    Chem.RemoveStereochemistry(mol)  # the board is flat: no 3D
    return mol


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
        if steps[0] > GRID_BUDGET:
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
    """One CID-SMILES line → (cid, canonical smiles, forms) or None."""
    cid, _, smiles = line.rstrip('\n').partition('\t')
    mol = keep(smiles)
    if mol is None or not fits_grid(mol):
        return None
    return int(cid), Chem.MolToSmiles(mol), kekule_forms(mol)


def main(smiles_file, title_file):
    """Write molecules.tsv to stdout (oldest CID wins for each molecule)."""
    best = {}  # canonical smiles → (cid, forms)
    with gzip.open(smiles_file, 'rt') as lines, Pool() as pool:
        for found in pool.imap(check, lines, chunksize=5000):
            if found and (found[1] not in best or found[0] < best[found[1]][0]):
                best[found[1]] = (found[0], found[2])
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
