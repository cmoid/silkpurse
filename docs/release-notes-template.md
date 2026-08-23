**Thanks for downloading Silkpurse!**

Silkpurse is a desktop client for [Secure Scuttlebutt][ssb], forked from
[Patchwork][patchwork] after Patchwork was retired.

## Download

**macOS on Apple silicon only.** Either artifact works; they contain the
same app.

- `Silkpurse-$$VERSION-arm64.dmg`
- `Silkpurse-$$VERSION-arm64-mac.zip`

There is no Intel build. One of the native dependencies has no prebuilt
Apple silicon binary and is compiled at install time, so a package built
here would carry an arm64 binary into an Intel build and crash on launch.
Intel needs a separate build — please [build from source][install] if you
need it.

## First launch — please read this

**macOS will refuse to open Silkpurse the first time.** This is expected,
and you have to allow it deliberately:

1. Drag Silkpurse into **Applications**.
2. Double-click it. macOS says it *"cannot verify that this app is free
   of malware"*. Click **Done** — not "Move to Trash".
3. Open **System Settings → Privacy & Security**, scroll down to the
   Security section, and click **Open Anyway** beside the message about
   Silkpurse.
4. Confirm. Every launch after this one is normal.

On macOS 15 and later the old right-click → Open shortcut does not work
for this; System Settings is the way through. Or, from a terminal:

```shell
xattr -dr com.apple.quarantine /Applications/Silkpurse.app
```

This happens because Silkpurse is not signed with a paid Apple Developer
certificate, so macOS cannot tell you who built it. Patchwork was
distributed the same way.

## Your data, and your existing `~/.ssb`

Silkpurse stores everything in **`~/.silkpurse/`** and **does not read or
write `~/.ssb`**. If you already run Patchwork or ssb-server, installing
Silkpurse leaves that install alone — Silkpurse starts as a new identity
in its own directory.

You *can* point it at an existing `~/.ssb` with `ssb_appname=ssb`. If you
do, **back that directory up first**, especially `~/.ssb/secret`. Your
messages are not at risk — an SSB log is append-only — but Silkpurse will
run its own embedded server against that database with its own plugins,
which can rebuild indexes in ways your other client did not expect, and
rebuilding a large database is slow in both directions.

Unless you have a specific reason to share a directory, don't. Let
Silkpurse use `~/.silkpurse` and treat it as a fresh install.

Once you are set up, **back up `~/.silkpurse/secret`**. It is your
identity; if it is lost, your feed cannot be continued by anyone,
including you.

## What's new in $$VERSION
$$CHANGES

## Configuration

Full detail in [INSTALL.md][install]. The short version:

| Variable | Default | Effect |
|---|---|---|
| `ssb_appname` | `silkpurse` | Data directory (`~/.<appname>`), settings file, and env prefix. |
| `silkpurse_*` | — | Any `ssb-config` key, e.g. `silkpurse_port=9001`. |
| `ERLBUTT_SECRET` | unset | Switches to [erlbutt][erlbutt] remote mode. |
| `ERLBUTT_ADDR` | `127.0.0.1:8008` | erlbutt node address, remote mode only. |
| `ERLBUTT_SHS` | unset | Network key, if not the default network. |

**An app launched from Finder inherits no shell environment.** Exporting
variables in `.zshrc` will not affect a double-clicked Silkpurse — put
settings in `~/.silkpurse/config` instead, which is read for exactly this
reason.

Setting `ERLBUTT_SECRET` is what enables erlbutt remote mode; setting
only `ERLBUTT_ADDR` does nothing, and looks confusingly like remote mode
failing to connect.

## Known limitations

- Apple silicon only.
- macOS shows the unidentified-developer warning on first launch, as
  above.
- No auto-update. New versions are downloaded from the releases page.
- Linux and Windows build targets are configured but unbuilt and
  untested.

[patchwork]: https://github.com/ssbc/patchwork
[ssb]: https://scuttlebutt.nz
[erlbutt]: https://github.com/cmoid/erlbutt
[install]: https://github.com/cmoid/silkpurse/blob/theseus/docs/INSTALL.md
