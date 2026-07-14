const fs = require("fs");

/*
 * Where erlbutt remote mode (Model A) gets its settings.
 *
 * Two sources, env first so the dev workflow is unchanged:
 *
 *   1. environment    ERLBUTT_SECRET / ERLBUTT_ADDR / ERLBUTT_SHS
 *   2. ~/.silkpurse/config, an "erlbutt" block:
 *        "erlbutt": { "secret": "...", "addr": "host:port", "shs": "..." }
 *
 * The config file matters for a PACKAGED app: a .app launched from Finder
 * inherits no shell environment, so an env-only switch means a
 * double-clicked build silently falls back to the embedded server and
 * talks to ~/.ssb instead of erlbutt.
 *
 * Presence of a secret is what selects remote mode.  No secret (no env
 * var, no erlbutt block) => local mode, exactly as before.
 */
module.exports = function resolveErlbutt(ssbConfig) {
  const fromFile = (ssbConfig && ssbConfig.erlbutt) || {};

  const secret = process.env.ERLBUTT_SECRET || fromFile.secret;
  if (!secret) return null; // local mode

  // A missing secret must be fatal, not silently created: loadOrCreateSync
  // on a typo'd path would mint a NEW identity, and the handshake would
  // then fail against erlbutt for reasons that look nothing like "bad path".
  if (!fs.existsSync(secret)) {
    const e = new Error(`erlbutt secret not found at ${secret}`);
    e.erlbutt = true;
    throw e;
  }

  return {
    secret,
    addr: process.env.ERLBUTT_ADDR || fromFile.addr || "127.0.0.1:8008",
    shs: process.env.ERLBUTT_SHS || fromFile.shs || null,
    source: process.env.ERLBUTT_SECRET ? "env" : "config file",
  };
};
