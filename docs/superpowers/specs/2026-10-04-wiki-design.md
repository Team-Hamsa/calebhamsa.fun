# The Wiki: "how to play" moves out of the README — Design Spec

**Date:** 2026-10-04
**Status:** Design approved in chat (2026-10-04); this written spec awaits review
**Builds on:** the README's block reference (a picture and a description for every Build block, kept honest by `tests/readme.test.js`).

## Purpose

The README has grown to 563 lines because it tries to explain every block,
every machine, the Chemistry room and the experiments. About 400 of those
lines are "how to play". They move to the repo's GitHub wiki
(<https://github.com/Team-Hamsa/calebhamsa.fun/wiki>), one page per topic
with a menu at the side. The README goes back to being about the code: how
to run it, what's where, and how to publish.

The readers are the same (Caleb and a grown-up reading together), so the
words, the voice and the pictures don't change. **This is a move, not a
rewrite.**

### Success criteria

1. The wiki has a Home page, a side menu, and one page each for Blocks, Water, Power, Gears, Lifting, Machines to build, the Chemistry room and Experiments. Every picture shows.
2. Every sentence and picture in the moved README sections is on a wiki page, unchanged apart from links and picture paths.
3. The README keeps its developer sections and links to the wiki where the moved sections were.
4. `npm test` still fails when a palette block has no picture or no wiki entry, and fails when a wiki page shows a picture that doesn't exist.
5. A push to `main` that changes `wiki/` updates the wiki by itself within a couple of minutes.
6. `node tools/make-block-pictures.cjs` writes the pictures to their new place.

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| How much moves? | Build blocks, Machines to build, the Chemistry room, Experiments to try. The README stays developer-only. |
| Where do the pages live? | In a `wiki/` folder in this repo. A GitHub Action copies them to the wiki. The wiki's own web editor is not used (its edits would be overwritten). |
| Where do the pictures live? | Inside `wiki/`, so the folder is complete by itself and looks the same in the repo as on the wiki. |
| One page per block? | No. One page per palette tab, as the README has it today. |

## The pages

Each page is one Markdown file in `wiki/`. GitHub turns `-` in a file name
into a space in the page title.

| File | Title | Comes from README |
|---|---|---|
| `Home.md` | Home | New. A short welcome, the three tools (🧱 BUILD, ⛏️ DIG, ✋ USE) from the start of "The Build page blocks", and a link to every page. |
| `Blocks.md` | Blocks | `### ⛏️ BLOCKS` |
| `Water.md` | Water | `### 💧 WATER` |
| `Power.md` | Power | `### ⚡ POWER` |
| `Gears.md` | Gears | `### ⚙️ GEARS` |
| `Lifting.md` | Lifting | `### 🏗️ LIFTING` |
| `Machines-to-build.md` | Machines to build | `### 🛠️ Machines to build` |
| `Chemistry-room.md` | Chemistry room | `## 🧪 The Chemistry room` |
| `Experiments.md` | Experiments | `## 🧪 Experiments to try` |
| `_Sidebar.md` | (the side menu) | New. Links to every page, in the order above. |

Rules for the move:

- Text is copied as it is. Headings move up so each page starts at `##`
  below the title GitHub adds.
- Links between moved sections (a README `#anchor`) become wiki page links.
- Links from a wiki page to code (`js/blocks/water.js`) become full
  `https://github.com/Team-Hamsa/calebhamsa.fun/blob/main/...` links, since
  the wiki is a different place from the code.
- `Home.md` ends with one line: these pages are made from the `wiki/`
  folder of the repo, so change them there.

## The pictures

- `docs/blocks/` moves to `wiki/blocks/` and `docs/machines/` moves to
  `wiki/machines/` (`git mv`, so history follows).
- Pages show them with paths from the wiki's top, such as
  `blocks/pipe.png`. That works both in the repo's `wiki/` folder and on
  the published wiki.
- `tools/make-block-pictures.cjs` and `tools/block-pictures.html` are
  changed to write to and talk about the new folders.
- Old specs and plans in `docs/superpowers/` that mention `docs/blocks/`
  are history and are left alone.

**To check while building:** that a picture path like `blocks/pipe.png`
shows on a published wiki page. If GitHub doesn't show it, the pages use
the full `https://raw.githubusercontent.com/wiki/Team-Hamsa/calebhamsa.fun/blocks/pipe.png`
address instead, and the test below matches that form.

## The README

Keeps, unchanged: the intro, Run it on your computer, What's where, Using
it like an app (offline), Remaking the pictures, Checklist for a real
tablet or phone, Publishing.

Changes:

- Lines 73–489 (Build blocks through Experiments) are replaced by one short
  section, "📖 How to play", with a link to each wiki page.
- "What's where" gains two rows: `wiki/` (the how-to-play pages and their
  pictures) and `.github/workflows/wiki.yml` (copies them to the wiki).
- "Remaking the pictures" names the new folders and says the test checks
  the wiki, not the README.
- "Publishing" gains a line: pushing to `main` also publishes the wiki.

## Publishing the wiki

`.github/workflows/wiki.yml`:

- Runs on a push to `main` that changes anything under `wiki/`, and can be
  run by hand (`workflow_dispatch`).
- Needs `permissions: contents: write`. The built-in `GITHUB_TOKEN` is
  enough to push to the same repo's wiki; no secret is needed.
- Steps: check out the repo; clone
  `https://github.com/Team-Hamsa/calebhamsa.fun.wiki.git`; make the clone's
  files match `wiki/` exactly (`rsync -a --delete --exclude .git`); commit
  with the message of the commit that triggered it; push. If nothing
  changed, it stops without committing.
- It mirrors, so a page deleted from `wiki/` is deleted from the wiki, and
  anything typed into the wiki's web editor is replaced on the next run.

**One job by hand, once:** GitHub doesn't make the wiki's git repo until
its first page exists. Josh opens the Wiki tab, clicks "Create the first
page" and saves it. The first run of the Action then replaces that page.

If the Action fails (for example the wiki repo doesn't exist yet), the run
shows red on the Actions tab. The site itself is not affected: the wiki is
separate from GitHub Pages.

## Tests

`tests/readme.test.js` is renamed `tests/wiki.test.js` and reads every
`wiki/*.md` file as one text:

- For every palette block in every pack: `wiki/blocks/<name>.png` exists,
  and some wiki page shows it.
- Every picture any wiki page shows (`blocks/...png` or
  `machines/...png`) exists in `wiki/`.
- Every page in the table above exists, and `_Sidebar.md` links to each
  one.
- The README links to the wiki.

`tests/lifting.test.js` has three tests that read the README for words
about the winch (its catch, nothing floats, the orange ⬆). They read
`wiki/Lifting.md` instead.

The in-game ❓ guide and `tests/guide.test.js` are not touched.

## Side effects

- GitHub Pages serves the whole repo, so the wiki files are also reachable
  at `calebhamsa.fun/wiki/...` as plain files. This is harmless; `docs/` is
  served the same way today.
- The service worker (`sw.js`) doesn't list `docs/` or `wiki/`, so the
  offline app is unchanged.

## Not doing

- Rewriting or adding to the words. New pages (how the physics works, one
  page per block) can come later, as their own piece of work.
- Moving the developer sections of the README to the wiki.
- Letting people edit in the wiki's web editor.
