# tools/chem-db: making the chemistry room's molecule list

The chemistry room (`chem.html`) names about 69,000 real molecules. That list,
`data/molecules.json`, is made here in two steps. You only need to redo this
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

This takes about 7 minutes on a 20-core machine. `export.py` explains which
molecules it keeps: only atoms Caleb has, every hand used, at most 8 non-H
atoms, and it must fit flat on the grid.

## 2. make-db.js: label them the room's way (Node)

From the repo folder:

```sh
node tools/chem-db/make-db.js tools/chem-db/molecules.tsv
```

This reads every molecule with the room's own `smiles.js`, labels it with the
room's own `canon.js`, and writes `data/molecules.json`. It prints how many
labels it made, and how many **clashes** it found (two names for one label).
Clashes should be 0. If they're not, `canon.js` or `export.py` has a bug.

Built 2026-10-03: 69,460 labels (68,913 named molecules, some with two
Kekulé forms), 0 clashes, 6.7 MB on disk, 0.84 MB gzipped. Compounds
PubChem never named (titled just "CID 123…") are left out.
