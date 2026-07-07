const ref = require('ssb-ref')
const MutantPullValue = require('../../../mutant-pull-value')

module.exports = function (api) {
  const activeLikes = new Set()
  return {
    'sbot.hook.publish': (msg) => {
      if (!(msg && msg.value && msg.value.content)) return
      if (typeof msg.value.content === 'string') {
        msg = api.message.sync.unbox(msg)
        if (!msg) return
      }

      const c = msg.value.content
      if (c.type !== 'vote') return
      if (!c.vote || !c.vote.link) return

      activeLikes.forEach((likes) => {
        if (likes.id === c.vote.link) {
          likes.push(msg)
        }
      })
    },

    'message.obs.doesLike': (id) => {
      const yourId = api.keys.sync.id()
      return MutantPullValue(() => {
        return api.sbot.pull.stream((sbot) => sbot.patchwork.likes.feedLikesMsgStream({ msgId: id, feedId: yourId }))
      })
    },

    'message.obs.likeCount': (id) => {
      if (!ref.isLink(id)) throw new Error('an id must be specified')
      return MutantPullValue(() => {
        return api.sbot.pull.stream((sbot) => sbot.patchwork.likes.countStream({ dest: id }))
      }, { defaultValue: 0 })
    }
  }
}
