# Cutting a Silkpurse release

Releases are **manual**. Nothing in CI fires on a tag. (`RELEASE_GUIDE.md`
in this directory is upstream Patchwork's and describes machinery that
does not exist here — ignore it.)

## What gets built

One platform, one architecture: **macOS, Apple silicon**. See
[INSTALL.md](INSTALL.md#what-the-releases-contain) for why Intel is not
included. The Linux and Windows blocks in `electron-builder.yml` are
inherited from Patchwork and are neither built nor tested.

## Steps

**1. Write the changelog entry.** Entries accumulate in
`docs/CHANGELOG.md` under an `## [Unreleased]` heading as you work — copy
the skeleton out of the HTML comment at the top of that file to start a
cycle.

Two things about that heading, both of which fail silently:

- It must have a **blank line before it**. The stamper's regex requires
  two newlines, so a heading written directly under `-->` is never
  stamped and the release notes come out empty.
- The copy inside the HTML comment is deliberately skipped, so leaving it
  there is correct — you want a second, live copy.

**2. Bump the version** in `package.json`. It is the only place the
version is written; electron-builder takes the artifact names from it.

**3. Stamp the changelog**, turning `## [Unreleased]` into
`## v<version> - <today>`:

```shell
npm run changelog
```

(This also runs automatically as npm's `version` lifecycle hook if you
use `npm version <v>` — but note that `npm version` additionally makes a
commit and creates a tag, which the rest of these steps do by hand.)

**4. Generate the release notes:**

```shell
node scripts/release-notes.js > /tmp/silkpurse-notes.md
```

Invoke it directly, not through `npm run`: npm >= 7 writes its
run-script banner to **stdout**, so `npm run release-notes > file`
captures two `>` lines into the top of the notes, where Markdown renders
them as a stray blockquote. (`npm run --silent release-notes` also
suppresses it, if you prefer npm.)

`scripts/release-notes.js` takes everything under the `## v<version>`
heading you just stamped and substitutes it into
`docs/release-notes-template.md` at `$$CHANGES`, with `$$VERSION` filled
in throughout. The template holds the parts every release restates — how
to get past the first-launch warning, the `~/.ssb` guidance, the
configuration table — so the changelog only has to carry what actually
changed.

Read the result before shipping it. If the "What's new" section is empty,
the heading was not stamped; if it runs on past the end, a heading below
it is not `## `-level, which is what terminates collection.

**5. Build.**

```shell
npm run dist
```

Watch for these two lines in the output — they are the ones that matter:

```
• executing custom sign  file=dist/mac-arm64/Silkpurse.app ...
• ad-hoc signature verified
```

If signing were skipped instead, the build would still "succeed" and
produce an app that macOS refuses to open at all. See
[Code signing](#code-signing).

**6. Verify the artifact,** not the build log:

```shell
codesign -dvv dist/mac-arm64/Silkpurse.app
codesign --verify --deep --strict dist/mac-arm64/Silkpurse.app
```

You want `Identifier=org.cmoid.silkpurse`, `Signature=adhoc`, a bound
`Info.plist`, sealed resources, and silence from `--verify`. If you see
`Identifier=Electron`, `Info.plist=not bound` or `Sealed Resources=none`,
signing did not happen — **do not ship it**.

**7. Test a real install.** Build machines lie: a locally built app is not
quarantined, so it launches even when a downloaded copy would not.
Simulate the download:

```shell
mkdir /tmp/gktest && cd /tmp/gktest
ditto -x -k ~/code/ssb-dev/silkpurse/dist/Silkpurse-*-arm64-mac.zip .
xattr -w com.apple.quarantine "0083;00000000;Safari;" Silkpurse.app
open Silkpurse.app
```

You should get *"cannot verify this app is free of malware"*, with an
**Open Anyway** button then available in System Settings → Privacy &
Security. If you instead get **"Silkpurse is damaged and can't be
opened"**, the signature is broken — stop and fix it, because that
message offers the user no way through.

**8. Tag and push.** 

```shell
git tag v0.1.0
git push origin theseus --tags
```

Check `git ls-remote --tags origin` if you are unsure whether a tag ever
reached GitHub. Reusing a tag that *has* been pushed is a different and
much worse problem — pick a new version instead.

**9. Create the GitHub release** and attach both artifacts:

```shell
gh release create v0.1.0 \
  dist/Silkpurse-0.1.0-arm64.dmg \
  dist/Silkpurse-0.1.0-arm64-mac.zip \
  --title "Silkpurse 0.1.0" \
  --notes-file /tmp/silkpurse-notes.md
```

Do not attach `latest-mac.yml` or the `.blockmap` files. Those exist for
electron-updater's auto-update, which Silkpurse does not use; publishing
them implies an update channel that is not there.

## Code signing

Silkpurse has no Apple Developer certificate and does not need one —
people install it the way they installed Patchwork, by allowing an
unidentified developer. But **"no certificate" and "no signature" are not
the same thing**, and the gap between them is a real trap:

Left alone, electron-builder finds no identity, skips signing entirely,
and ships the bundle carrying the signature Electron's *linker* applied
to the bare executable. That signature no longer describes the bundle
once electron-builder has renamed it and added resources, so
`codesign --verify` fails on it. What a downloader then sees is not the
unidentified-developer warning — it is **"Silkpurse is damaged and can't
be opened, you should move it to the Trash"**, which offers no override
and reads as a broken build.

`scripts/adhoc-sign.js` prevents this by signing ad-hoc
(`codesign --sign -`), producing a signature that genuinely describes the
bundle. It carries no identity, so Gatekeeper still warns — but it warns
with the Open Anyway path intact. The hook verifies its own work and
fails the build rather than let an unusable bundle be packaged.

Two things not to do to that configuration:

- **Do not add `mac.identity: null`.** It reads like "we have no
  certificate", but electron-builder checks it *before* the sign hook and
  returns early, silently disabling the hook and restoring the broken
  bundle.
- **Do not move signing to `afterPack`.** That hook runs before Electron
  fuses are flipped, and flipping them modifies the binary — invalidating
  any signature made there. `mac.sign` runs at the correct point.

If a Developer ID certificate is ever obtained, delete `mac.sign` from
`electron-builder.yml` and let electron-builder sign and notarize
normally. Notarizing removes the first-launch warning entirely.

## The changelog and release notes pipeline

Three pieces, and the split between them is the point:

| File | Holds |
|---|---|
| `docs/CHANGELOG.md` | The accumulating record. Hand-written, one section per release. |
| `docs/release-notes-template.md` | The parts every release restates — download, first launch, `~/.ssb`, configuration. |
| `scripts/release-notes.js` | Joins them: pulls one release's section out of the changelog into the template's `$$CHANGES`. |

Nothing here reads git history. `changelog-version` — the tool behind
`npm run changelog` — does one regex substitution and nothing else; it
turns `## [Unreleased]` into a dated version heading. Every word of the
changelog is written by hand.

`scripts/stamp-changelog.js` wraps it only to pass an explicit path.
Upstream's npm script shuffled the file to the repo root and back,
because `changelog-version`'s bin always looks in the working directory —
and that shuffle strands `CHANGELOG.md` in the repo root if the stamp
throws.

Upstream Patchwork's changelog entries are preserved in the same file
below a `## Patchwork changelog` divider, the way `README.md` keeps the
archived Patchwork readme. That divider is `## `-level on purpose: it is
what stops `release-notes.js` from collecting the entire Patchwork
history into a Silkpurse release.
