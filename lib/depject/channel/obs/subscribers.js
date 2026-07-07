const MutantPullReduce = require('mutant-pull-reduce')

module.exports = function (api) {
  return {
    'channel.obs.subscribers': function (channel) {
      const stream = api.sbot.pull.stream(sbot => sbot.patchwork.subscriptions({ live: true, channel }))
      return MutantPullReduce(stream, (state, msg) => {
        if (msg.value) {
          if (!state.includes(msg.from)) {
            state.push(msg.from)
          }
        } else {
          const index = state.indexOf(msg.from)
          if (index >= 0) {
            state.splice(index, 1)
          }
        }
        return state
      }, {
        startValue: [],
        nextTick: true,
        sync: true
      })
    }
  }
}
