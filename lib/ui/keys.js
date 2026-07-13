const Path = require('path')
const Keys = require('ssb-keys')

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
      // Honour a keypair already on the config (set by setupContext, and
      // overridden to erlbutt's identity in erlbutt remote mode) rather
      // than always re-loading config.path/secret.
      if (config.keys) {
        keys = config.keys
      } else {
        const keyPath = Path.join(config.path, 'secret')
        keys = Keys.loadOrCreateSync(keyPath)
      }
    }
    return keys
  }
}
