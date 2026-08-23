# Installing Silkpurse

## What the releases contain

Releases are published on the [GitHub releases page][releases] as two
equivalent artifacts — take whichever you prefer:

| File | Notes |
|---|---|
| `Silkpurse-<version>-arm64.dmg` | Disk image. Open it and drag Silkpurse to Applications. |
| `Silkpurse-<version>-arm64-mac.zip` | Zip of the same `.app`. |

**macOS on Apple silicon only.** There is no Intel build, and that is a
technical limitation rather than a decision: one of Silkpurse's native
dependencies (`leveldown`) publishes no prebuilt Apple silicon binary, so
it is compiled during install, and a package built on an Apple silicon
machine would carry that arm64 binary into an Intel build and crash on
launch. Supporting Intel means a separate build on an Intel machine. If
you need it, build from source — see below.

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

## Where Silkpurse keeps its data

By default, everything lives in **`~/.silkpurse/`**:

| Path | Contents |
|---|---|
| `~/.silkpurse/secret` | Your identity keypair. **This is the thing to back up.** Lose it and the feed cannot be continued by anyone, including you. |
| `~/.silkpurse/flume/` | The message database and its indexes. |
| `~/.silkpurse/blobs/` | Images and file attachments. |
| `~/.silkpurse/full-text-search.<id>.sqlite` | Search index. Disposable — deleting it costs a re-index, nothing more. |
| `~/.silkpurse/conn.json` | Known peers. |
| `~/.silkpurse/config` | Optional settings file, see below. |

**Silkpurse does not read or write `~/.ssb`.** If you have an existing
Patchwork or ssb-server install, it is untouched unless you deliberately
point Silkpurse at it — see [Sharing a directory with another
client](#sharing-a-directory-with-another-client).

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
silkpurse_port=9001 open -a Silkpurse
```

```json
{ "port": 9001 }
```

### Environment variables

| Variable | Default | Effect |
|---|---|---|
| `ssb_appname` | `silkpurse` | Sets the app name, and so the data directory (`~/.<appname>`), the settings file (`~/.<appname>/config`) and the env prefix (`<appname>_`). |
| `silkpurse_*` | — | Any `ssb-config` key, e.g. `silkpurse_port`. The prefix follows `ssb_appname`. |
| `ERLBUTT_SECRET` | unset | Path to an erlbutt identity's `secret`. **Setting this switches Silkpurse into erlbutt remote mode.** |
| `ERLBUTT_ADDR` | `127.0.0.1:8008` | `host:port` of the erlbutt node. Only consulted in remote mode. |
| `ERLBUTT_SHS` | unset | Base64 network key, if the erlbutt node runs on a non-default network. |

And one command-line flag:

| Flag | Effect |
|---|---|
| `-g`, `--use-global-ssb` | Do not start the embedded server; connect to an already-running one instead. Only meaningful together with `ssb_appname` — on its own it looks for a server in `~/.silkpurse` that nothing is running. |

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

## erlbutt remote mode

Instead of running its own embedded SSB server, Silkpurse can act as a
front end for an [erlbutt][erlbutt] node, authenticating as that node's
own identity.

Three things are worth knowing before you try it:

- **The secret is what turns remote mode on, not the address.** Setting
  only `ERLBUTT_ADDR` does nothing at all — you stay in local mode, which
  looks very much like erlbutt mode failing to connect. If the log does
  not say `[erlbutt] remote mode`, you are not in it.

- **Remote mode never falls back to the embedded server.** Once a secret
  is set, the embedded server is not started, whatever the address points
  at. `ERLBUTT_ADDR=127.0.0.1:...` means "connect to whatever is
  listening there", not "use the local embedded server" — the two are
  separate things and the embedded server is not reachable that way.

- **Your local database is not touched in remote mode.** No embedded
  server is constructed, so nothing opens `flume`. The only thing written
  under the data directory is the search index, which is named after the
  identity being indexed, so a remote identity and a local one can
  coexist in one directory without corrupting each other's index.

A missing secret file is treated as fatal and reported in a dialog,
rather than silently creating a new identity at the typo'd path.

## Sharing a directory with another client

You can point Silkpurse at another client's directory, most obviously the
`~/.ssb` used by Patchwork and ssb-server. **Back up the directory
first** — in particular `~/.ssb/secret`.

There are two quite different versions of this:

**Connecting to a server you are already running** — comparatively safe.
Silkpurse starts no server of its own and just talks to yours:

```shell
ssb_appname=ssb /Applications/Silkpurse.app/Contents/MacOS/Silkpurse -g
```

**Opening the directory directly** — riskier. Silkpurse starts its *own*
embedded server against that database, with its own set of plugins, which
can rewrite indexes in ways the other client did not expect:

```shell
ssb_appname=ssb /Applications/Silkpurse.app/Contents/MacOS/Silkpurse
```

Your messages are not at risk — an SSB log is append-only and your
identity lives in `secret` — but indexes may be rebuilt, the other client
may then want to rebuild them again, and the round trip can take a long
time on a large database.

If you have no specific reason to share a directory, **don't**. Let
Silkpurse use its own `~/.silkpurse` and treat it as a fresh install.

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
