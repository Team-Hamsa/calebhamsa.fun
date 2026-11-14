# tools/chem-db: making the chemistry room's molecule list

The chemistry room (`chem.html`) names about 245,000 real molecules. That list,
`data/molecules/0.json` … `15.json` (split into 16 parts so the iPad never
reads one huge file), is made here in two steps. You only need to redo this
to change the rules (like allowing 9 atoms), or after changing
`js/chem/canon.js`, because the list's labels come from it.
`tests/chem-data.test.js` fails if the list and `canon.js` disagree.

## 1. export.py: pick the molecules from PubChem (Python + RDKit)

[PubChem](https://pubchem.ncbi.nlm.nih.gov) is the US government's free
chemistry library (public domain). Download its two big lists
(about 3.4 GB; **don't** commit them):

```sh
curl -O https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz
curl -O https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-Title.gz
```

RDKit is a chemistry toolkit. It only runs here, never in the web page:

```sh
python3 -m venv venv
./venv/bin/pip install rdkit
./venv/bin/python export.py CID-SMILES.gz CID-Title.gz > molecules.tsv
```

`export.py` explains which molecules it keeps: only atoms Caleb has (with
sulfur's and phosphorus's extra hands), every hand used, at most 8 non-H
atoms, and it must fit flat on the triangle board (12 × 10 cells). It prints
how many molecules it gave up on (too slow to fit).

## 2. make-db.js: label them the room's way (Node)

From the repo folder:

```sh
node tools/chem-db/make-db.js tools/chem-db/molecules.tsv
```

This reads every molecule with the room's own `smiles.js`, labels it with the
room's own `canon.js`, and writes `data/molecules/` (each label goes in the
part `lookup.js` `partOf()` says, which is where the room looks for it). It prints how many
labels it made, and how many **clashes** it found (two names for one label).
Clashes should be 0. If they're not, `canon.js` or `export.py` has a bug.

Built 2026-11-14 from the 2026-10-28 PubChem files (about 27 minutes on 16 cores):
246,541 molecules fit (249 given up on as too slow), 246,583 labels (some
molecules have two Kekulé forms), 0 clashes, 24 MB on disk in 16 parts,
4.1 MB gzipped.

Compounds PubChem never named (titled just "CID 123…") are left out.
Molecules with more than 8 non-H atoms aren't in the list: the room asks
PubChem about those over the internet (`js/chem/pubchem.js`).

## measure.py and analyze.py

The measuring tools behind issue #10 (how many molecules each board shape
and set of atoms could name). Not needed to make the list.
