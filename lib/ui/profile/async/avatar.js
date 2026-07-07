const { onceTrue } = require('mutant')

module.exports = function (api) {
  return {
    'profile.async.avatar': function (id, cb) {
      onceTrue(api.sbot.obs.connection, sbot => {
        sbot.patchwork.profile.avatar({ id }, cb)
      })
    }
  }
}
