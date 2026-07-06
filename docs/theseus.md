# Theseus metrics

Tracking how much boat is left as the planks get replaced. Numbers come
from `./scripts/metrics.sh [ref]`:

- **app js** — `index.js` + `lib/**/*.js` (the code someone has to grok)
- **styles** — everything under `styles/`
- **deps** — `package.json` dependencies (+ devDependencies)
- **lock pkgs** — resolved package count in `package-lock.json`

## History

| milestone                    | commit   | app js (files)  | styles | deps    | lock pkgs |
|------------------------------|----------|-----------------|--------|---------|-----------|
| patchwork 3.18.1             | 25572342 | 14,228 (155)    | 4,800  | 84 + 5  | (v1 lock) |
| theseus base (cleanups)      | fc6bfbfa | 14,223 (155)    | 4,800  | 84 + 5  | 1,432     |
| electron 39 + sqlite search + rebrand | f30e7640 | 14,736 (156) | 4,816 | 86 + 5 | 1,564 |
| remove tags                  | 2d04759a | 14,103 (149)    | 4,596  | 84 + 5  | 1,558     |
| remove gatherings            | 7baa86ba | 13,214 (142)    | 4,446  | 82 + 5  | 1,556     |
| remove old ssb-search        | cf83e8a3 | 13,006 (141)    | 4,446  | 81 + 5  | 1,549     |
| remove update banner         | ede43e7b | 12,936 (140)    | 4,446  | 80 + 5  | 1,549     |

Notes:

- The electron/search work *added* ~500 app lines (sqlite indexer, search2
  page) and 2 deps (`@electron/remote`, `sodium-native`); the lockfile grew
  because it was reseeded from PonchoWonky's proven resolutions.
- Tags + gatherings together removed ~1,500 app lines, ~370 style lines,
  4 deps (`scuttle-tag`, `ssb-tags`, `flatpickr`, `spacetime`) and 13 files.
- Lockfile count barely moves on feature removals because most transitive
  deps are shared with the remaining ssb stack; the big wins there will
  come from replacing the embedded ssb-server with erlbutt.

## Older notes (pre-revival, 3.18.1 era)

find . -name "*.js" -print | xargs wc -l
154,874 lines of javascript (including node_modules)

900 node_modules at the top level

find . -type f -name "*.js" | cut -d"/" -f2 | uniq -c
22297 node_modules
   1 index.js
   1 styles
   2 scripts
 154 lib
