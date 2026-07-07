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
      const keyPath = Path.join(config.path, 'secret')
      keys = Keys.loadOrCreateSync(keyPath)
    }
    return keys
  }
}
