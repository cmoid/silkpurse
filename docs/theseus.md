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
| remove blog rendering        | 9aa99531 | 12,835 (139)    | 4,379  | 79 + 5  | 1,541     |
| remove dht invites           | 08b36e31 | 12,821 (139)    | 4,379  | 78 + 5  | 1,490     |
| remove git-ssb integration   | c670bca9 | 12,748 (138)    | 4,379  | 77 + 5  | 1,472     |
| packaging fixes (require-style et al) | db026ba1 | 12,798 (139) | 4,379 | 76 + 5 | 1,468 |
| remove depject               | a7360a74 | 12,173 (142)    | 4,379  | 73 + 5  | 1,413     |
| rename lib/depject → lib/ui  | 495e4edf | 12,173 (142)    | 4,379  | 73 + 5  | 1,413     |
| erlbutt remote mode          | d42ba27f | 12,434 (143)    | 4,379  | 73 + 5  | 1,413     |
| archive boundaries in the UI | 84d15a14 | 12,987 (147)    | 4,379  | 75 + 5  | 1,419     |
| **drop the embedded server** | 9f078724 | 10,658 (127)    | 4,379  | 49 + 5  | 1,114     |

Notes:

- The electron/search work *added* ~500 app lines (sqlite indexer, search2
  page) and 2 deps (`@electron/remote`, `sodium-native`); the lockfile grew
  because it was reseeded from PonchoWonky's proven resolutions.
- Tags + gatherings together removed ~1,500 app lines, ~370 style lines,
  4 deps (`scuttle-tag`, `ssb-tags`, `flatpickr`, `spacetime`) and 13 files.
- Lockfile count barely moves on feature removals because most transitive
  deps are shared with the remaining ssb stack; the big wins there will
  come from replacing the embedded ssb-server with erlbutt.
- The depject removal cut ~625 lines of gives/needs/nest ceremony while
  *adding* 3 files (plug.js dispatch, the plug-keys.js socket table, and
  a vendored lib/settings.js replacing patch-settings), dropped 3 deps
  (depject, depnest, patch-settings) and 55 lockfile packages. Module
  wiring is now explicit: `grep "api\.sbot\."` shows the exact server
  surface the UI consumes — the input list for the erlbutt backend swap.
- That backend swap is the last row, and it is where the lockfile finally
  moved: −2,329 app lines, −20 files, −26 direct deps, −305 lockfile
  packages. The 20 files are patchwork's server-side plugins — the
  JavaScript reimplementation of threads, channels, likes, backlinks,
  contacts, private feeds, profiles and search, all of which erlbutt's
  silkpurse app now serves over muxrpc. The deps are secret-stack and the
  ssb-server plugin ring it assembled, plus long-unused stragglers;
  `style-resolve` moved the other way, promoted to a direct dep because
  the vendored `lib/require-style.js` uses it and it had been riding in
  transitively.
- What is left of the ssb stack is all client-side: `ssb-client`/muxrpc
  for the wire, `ssb-keys` for identity, `ssb-ref`/`ssb-sort`/
  `ssb-markdown`/`ssb-mentions` as pure message utilities, `ssb-config`
  for config assembly, and `ssb-room` for parsing invite codes.
- The predicted win came in almost exactly as guessed one row earlier:
  the note above expected the lockfile to move only when the embedded
  server went, and it dropped 305 packages when it did.

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
