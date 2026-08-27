# Installing Silkpurse

## What the releases contain

Releases are published on the [GitHub releases page][releases]. There are
four, covering two architectures in two equivalent formats:

| File | Notes |
|---|---|
| `Silkpurse-<version>-arm64.dmg` | Apple silicon. Open it and drag Silkpurse to Applications. |
| `Silkpurse-<version>-arm64-mac.zip` | Apple silicon, same `.app` in a zip. |
| `Silkpurse-<version>-x64.dmg` | Intel. |
| `Silkpurse-<version>-x64-mac.zip` | Intel, same `.app` in a zip. |

If you are unsure which you need:  → **About This Mac**. "Apple M1"
or later means `arm64`; "Intel Core" means `x64`.

Intel took a while to arrive, and the reason is worth stating because it
was not a decision. Silkpurse used to embed an ssb-server, and one of its
dependencies (`leveldown`) published no Apple silicon binary, so it was
compiled during install; `node-gyp-build` prefers a locally compiled
binary over a shipped one, which meant an Intel package built on an Apple
silicon machine carried the arm64 binary inside it and died on launch.
Two architectures needed two separate machines.

Removing the embedded server removed `leveldown`. Nothing compiles at
install time now and every remaining native dependency ships prebuilt
binaries for both, so one checkout builds both.

**The Intel build is the less-tested of the two.** It is verified under
Rosetta on an Apple silicon machine — the binary is `x86_64`, the
`darwin-x64` prebuilds are the ones unpacked, and the crypto stack loads
and signs correctly as x64 — but it has not been run on real Intel
hardware. It should be fine. It has simply had less use than the arm64
build, and is worth reporting bugs against rather than assuming they are
your own setup.

Linux and Windows targets are configured but unbuilt and untested. Treat
them as source-only for now.

## First launch

**macOS will refuse to open Silkpurse the first time, and you have to
allow it deliberately.** This is expected. Silkpurse is signed, but not
with a paid Apple Developer certificate, so macOS cannot tell you who
built it.

1. Drag `Silkpurse.app` into **Applications**.
2. Double-click it. macOS says it *"cannot verify that this app is free
   of malware"*. Click **Done** — not "Move to Trash".
3. Open **System Settings → Privacy & Security**, scroll down to the
   Security section, and click **Open Anyway** next to the message about
   Silkpurse.
4. Confirm. Every launch after this one is normal.

> On macOS 15 and later, the old right-click → Open shortcut no longer
> works for this. System Settings is the only route through the UI.

If you prefer the terminal, this does the same thing in one step:

```shell
xattr -dr com.apple.quarantine /Applications/Silkpurse.app
```

If you ever see **"Silkpurse is damaged and can't be opened"** instead of
the message above, that is a different problem — the download is
corrupt or incomplete. Download it again rather than working around it.

## Silkpurse needs erlbutt

Silkpurse has no database of its own. It is a client: an
[erlbutt][erlbutt] node holds the messages, does the replicating, and owns
the identity you post as. Silkpurse connects to it over the network and
renders what it finds.

That erlbutt can be on this machine or another one — the same build talks
to either, and switching between them is a matter of pointing it
somewhere else.

**So there is nothing to install until you have an erlbutt node running**,
and nothing useful happens without one: Silkpurse will tell you what it
needs and quit. See erlbutt's own documentation for setting one up, and
`doc/ops/ssb-conversion.md` there if you are moving an existing feed
across from a JavaScript client.

### What it does keep locally

A directory of its own — `~/.silkpurse/` unless `ssb_appname` says
otherwise — holding two things:

| Path | Contents |
|---|---|
| `full-text-search.<id>.sqlite` | The search index, built from erlbutt over muxrpc. Disposable: deleting it costs a rebuild and nothing else. |
| `secret` | Created on first run and **never used**. Silkpurse authenticates as erlbutt's identity, not this one. It exists because the config library expects a keypair to be there. |

Nothing else. Your messages, blobs, follows and identity all live in
erlbutt, so a Silkpurse install is disposable — losing it costs you a
search index.

The search index is named after the identity it indexed, so pointing the
same install at two different erlbutt nodes keeps two indexes rather than
mixing them.

## Settings

Silkpurse reads its configuration through [`rc`][rc], via `ssb-config`.
The application name — `silkpurse` unless you override it — determines
both the data directory and where settings come from.

Sources, **later ones winning**:

1. `~/.config/silkpurse/config`
2. `~/.silkpurse/config`  ← the usual place
3. `~/.silkpurserc`
4. Environment variables prefixed `silkpurse_`
5. Command-line arguments

So any `ssb-config` key can be set either way. These are equivalent:

```shell
silkpurse_blobsPort=9001 open -a Silkpurse
```

```json
{ "blobsPort": 9001 }
```

Most `ssb-config` keys are inert here — they configure a server, and
Silkpurse does not run one. The ones that matter are the `ERLBUTT_*`
settings below, which say which node to talk to.

### Environment variables

| Variable | Default | Effect |
|---|---|---|
| `ssb_appname` | `silkpurse` | Sets the app name, and so the data directory (`~/.<appname>`), the settings file (`~/.<appname>/config`) and the env prefix (`<appname>_`). |
| `silkpurse_*` | — | Any `ssb-config` key, e.g. `silkpurse_blobsPort`. The prefix follows `ssb_appname`. |
| `ERLBUTT_SECRET` | unset | **Required.** Path to the erlbutt node's `secret` — the identity Silkpurse authenticates and posts as. Without it Silkpurse says so and quits. |
| `ERLBUTT_ADDR` | `127.0.0.1:8008` | `host:port` of the erlbutt node. |
| `ERLBUTT_SHS` | unset | Base64 network key, if the node is not on the default network. Get this wrong and the handshake fails against a node that is otherwise fine. |

### Environment variables and the packaged app

**An app launched from Finder or Spotlight inherits no shell
environment.** Exporting a variable in `.zshrc` has no effect on a
double-clicked Silkpurse.

For a packaged install, put settings in `~/.silkpurse/config` instead —
including the erlbutt block, which is read from there precisely so that
this works:

```json
{
  "erlbutt": {
    "secret": "/Users/you/.ssb-keys/earlbutt/secret",
    "addr": "pub.example.org:8008",
    "shs": "1KHLiKZvAvjbY1ziZEHMXawbCEIM6qwjCDm3VYRan/s="
  }
}
```

Environment variables still work, and still take precedence, if you
launch from a terminal:

```shell
ERLBUTT_SECRET=~/.ssb-keys/earlbutt/secret \
ERLBUTT_ADDR=pub.example.org:8008 \
  /Applications/Silkpurse.app/Contents/MacOS/Silkpurse
```

## Connecting to erlbutt

Silkpurse authenticates as the erlbutt node's own identity — it *is* that
node's face, not a separate peer talking to it. So the secret it needs is
erlbutt's, and anything you post is published to erlbutt's feed.

Two things are worth knowing:

- **A missing or mistyped secret is fatal, and says so.** It will not
  quietly mint a new identity at the path you typed, which would look
  like erlbutt having lost everything.

- **The network key has to match.** `ERLBUTT_SHS` defaults to the main
  SSB network. A node on a different one — erlbutt's development network,
  say — will complete no handshake at all, and the failure looks like the
  node being down rather than being on another network.

Since the identity is erlbutt's, two people pointing their own Silkpurse
at the same node are the same author. That is a reasonable thing to do
deliberately and a surprising thing to discover by accident.

## Pointing it at a different erlbutt

The same install can front more than one node — your own on this machine,
a pub you run elsewhere. Give each a distinct `ssb_appname` so their
search indexes stay separate:

```shell
ssb_appname=silkpurse-home    ERLBUTT_ADDR=127.0.0.1:8008 ...
ssb_appname=silkpurse-pub     ERLBUTT_ADDR=pub.example.org:8008 ...
```

Each gets its own `~/.silkpurse-<name>/`. Since the identity comes from
`ERLBUTT_SECRET`, you post as whoever that node is — which is worth
keeping straight when one of them is a pub.

## Building from source

Requires Node.js (active LTS), npm, and the usual toolchain for native
modules (`brew install libtool automake` on macOS).

```shell
git clone https://github.com/cmoid/silkpurse
cd silkpurse
npm install
npm start
```

To produce a package:

```shell
npm run dist
```

Artifacts land in `dist/`. See [RELEASE.md](RELEASE.md) for what a real
release involves.

[releases]: https://github.com/cmoid/silkpurse/releases
[rc]: https://github.com/dominictarr/rc
[erlbutt]: https://github.com/cmoid/erlbutt
