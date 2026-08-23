// Ad-hoc code signing for macOS builds.
//
// WHY THIS EXISTS
//
// Silkpurse has no Apple Developer certificate, and does not need one:
// people install it the way they installed Patchwork, by telling
// Gatekeeper they accept an unidentified developer.  But "no certificate"
// and "no signature" are not the same thing, and the difference decides
// whether that path is even offered.
//
// Left alone, electron-builder finds no identity in the keychain and
// skips signing entirely (app-builder-lib macPackager: `if (!options.sign
// && identity == null) return false`).  What ships is then the signature
// Electron's linker put on the bare executable -- Identifier=Electron,
// Info.plist not bound, Sealed Resources=none -- which no longer
// describes the bundle after electron-builder renamed it and added our
// resources.  `codesign --verify` fails on it.
//
// The user-visible consequence is not "unidentified developer".  It is
//
//     "Silkpurse is damaged and can't be opened.  You should move it to
//      the Trash."
//
// which offers no override at all, and reads to the downloader as a
// broken build rather than an unsigned one.
//
// Signing ad-hoc (`codesign --sign -`) produces a signature that really
// does describe the bundle.  It carries no identity, so Gatekeeper still
// warns -- but it warns with the "Open Anyway" path intact.  On Apple
// silicon it is also what lets the kernel load the binary at all.
//
// WIRING
//
// electron-builder calls this through `mac.sign` in electron-builder.yml,
// which runs at the right point: after the app is packed and after
// Electron fuses are flipped, before the dmg/zip are built from it.  An
// `afterPack` hook would run BEFORE the fuse flip and could have its
// signature invalidated by it.
//
// Do NOT also set `mac.identity: null` to express "no certificate".  That
// is checked first and returns before the sign hook is ever consulted, so
// it would silently disable this file and put back the broken bundle.
//
// If a real Developer ID certificate ever exists, delete `mac.sign` from
// electron-builder.yml and let electron-builder do the normal thing --
// this hook takes precedence over any identity it may have found.

const { execFileSync } = require("child_process");

module.exports = async function adhocSign(configuration) {
  const app = configuration.app;

  console.log(`  • ad-hoc signing (no Developer ID)  app=${app}`);

  // --deep is deprecated by Apple for distribution signing, but this is
  // ad-hoc: there is no identity to propagate incorrectly, and it is what
  // reaches Electron's nested Frameworks and Helper apps in one pass.
  execFileSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", "--timestamp=none", app],
    { stdio: "inherit" },
  );

  // Verify, and FAIL THE BUILD if it does not hold.  The whole point is
  // that a signature which does not describe the bundle shipped once
  // already and was only discovered by inspecting the artifact by hand.
  try {
    execFileSync(
      "codesign",
      ["--verify", "--deep", "--strict", "--verbose=2", app],
      { stdio: "inherit" },
    );
  } catch (err) {
    throw new Error(
      `ad-hoc signature failed verification for ${app}. ` +
        "Refusing to package a bundle that macOS will call damaged.",
    );
  }

  console.log("  • ad-hoc signature verified");
};
