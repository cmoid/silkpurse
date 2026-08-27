**Thanks for downloading Silkpurse!**

Silkpurse is a desktop client for [Secure Scuttlebutt][ssb], forked from
[Patchwork][patchwork] after Patchwork was retired.

## Download

**macOS, Apple silicon and Intel.** The dmg and the zip hold the same
app; take whichever you prefer.

Apple silicon (**About This Mac** says "Apple M1" or later):

- `Silkpurse-$$VERSION-arm64.dmg`
- `Silkpurse-$$VERSION-arm64-mac.zip`

Intel (**About This Mac** says "Intel Core"):

- `Silkpurse-$$VERSION-x64.dmg`
- `Silkpurse-$$VERSION-x64-mac.zip`

The Intel build is the less-tested of the two — verified under Rosetta on
an Apple silicon machine, but not run on real Intel hardware. Please
report anything odd rather than assuming it is your setup.

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

## Silkpurse needs an erlbutt node

This release has no database of its own. Silkpurse is a client:
[erlbutt][erlbutt] holds the messages, does the replicating, and owns the
identity you post as. Point Silkpurse at one — on this machine or
elsewhere — and it renders what it finds.

**Without one it will tell you what it needs and quit.** If you are
upgrading from a release that ran its own server, that is the change: set
up erlbutt first, and move your feed across with its
`doc/ops/ssb-conversion.md` if you have an existing one.

What stays on this machine is your settings and a search index, both
disposable. Everything that matters lives in erlbutt, so back that up
rather than this.

## What's new in $$VERSION
$$CHANGES

## Configuration

Full detail in [INSTALL.md][install]. The short version: Silkpurse is a
client, so the settings that matter are the ones naming the node it talks
to.

| Variable | Default | Effect |
|---|---|---|
| `ERLBUTT_SECRET` | unset | **Required.** Path to erlbutt's `secret` — the identity Silkpurse authenticates and posts as. Without it, it says so and quits. |
| `ERLBUTT_ADDR` | `127.0.0.1:8008` | `host:port` of the erlbutt node. |
| `ERLBUTT_SHS` | unset | Network key, if the node is not on the default network. |
| `ssb_appname` | `silkpurse` | Data directory (`~/.<appname>`), settings file, and env prefix. |
| `silkpurse_*` | — | Any `ssb-config` key, e.g. `silkpurse_blobsPort=9001`. Most are inert — they configure a server, and there is not one here. |

**An app launched from Finder inherits no shell environment.** Exporting
variables in `.zshrc` will not affect a double-clicked Silkpurse — put
settings in `~/.silkpurse/config` instead, which is read for exactly this
reason:

```json
{
  "erlbutt": {
    "secret": "/Users/you/erlbutt-ssb/.ssberl/secret",
    "addr": "127.0.0.1:8008"
  }
}
```

## Known limitations

- Requires a running erlbutt node; there is no standalone mode.
- macOS shows the unidentified-developer warning on first launch, as
  above.
- No auto-update. New versions are downloaded from the releases page.
- Linux and Windows build targets are configured but unbuilt and
  untested.

[patchwork]: https://github.com/ssbc/patchwork
[ssb]: https://scuttlebutt.nz
[erlbutt]: https://github.com/cmoid/erlbutt
[install]: https://github.com/cmoid/silkpurse/blob/theseus/docs/INSTALL.md
