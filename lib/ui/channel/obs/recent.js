const MutantPullValue = require('../../../mutant-pull-value')

module.exports = function (api) {
  return {
    'channel.obs.recent': function (limit) {
      return MutantPullValue(() => {
        return api.sbot.pull.stream((sbot) => sbot.patchwork.channels.recentStream({ limit: limit || 10 }))
      }, { defaultValue: [], sync: true })
    }
  }
}
