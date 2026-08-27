module.exports = (api) => {
  let keys

  return {
    'keys.sync.load': load,
    'keys.sync.id': id
  }

  function id () {
    return load().id
  }

  function load () {
    if (!keys) {
      const config = api.config.sync.load()
      // The identity always comes from the config, which setupContext
      // built from erlbutt's secret before this window existed.
      //
      // This used to fall back to loadOrCreateSync(config.path/secret),
      // which is the worst thing it could do: minting a brand new keypair
      // means the app carries on with an identity that is not the one
      // erlbutt replicates, so anything signed here is signed by a
      // stranger and nothing explains why.  There is no local database to
      // fall back to any more — if the keys are missing, the right answer
      // is to say so.
      if (!config.keys) {
        throw new Error(
          'no identity on the config: erlbutt keys were not loaded at startup'
        )
      }
      keys = config.keys
    }
    return keys
  }
}
