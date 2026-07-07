const { onceTrue } = require('mutant')

module.exports = function (api) {
  return {
    'about.async.latestValues': function (dest, keys, cb) {
      onceTrue(api.sbot.obs.connection, sbot => {
        sbot.about.latestValues({ dest, keys }, cb)
      })
    }
  }
}
