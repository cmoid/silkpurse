const ref = require('ssb-ref')

module.exports = function (api) {
  return {
    'page.html.render': function (path) {
      if (typeof path !== 'string' || (path !== '/private' && path.trim() !== '?is:private')) return

      const i18n = api.intl.sync.i18n
      const id = api.keys.sync.id()
      const compose = api.message.html.compose({
        meta: { type: 'post' },
        draftKey: 'private',
        isPrivate: true,
        prepublish: function (msg) {
          msg.recps = [id]

          msg.mentions.forEach(mention => {
            mention = typeof mention === 'string' ? mention : mention.link
            if (ref.isFeed(mention) && !msg.recps.includes(mention)) {
              msg.recps.push(mention)
            }
          })

          return msg
        },
        placeholder: i18n('Write a private message')
      })

      const getStream = api.sbot.pull.resumeStream((sbot, opts) => {
        return sbot.patchwork.privateFeed.roots(opts)
      }, { limit: 20, reverse: true })

      const view = api.feed.html.rollup(getStream, {
        prepend: [compose],
        groupSummaries: false,
        updateStream: api.sbot.pull.stream(sbot => sbot.patchwork.privateFeed.latest())
      })

      view.setAnchor = function (data) {
        if (data && data.compose && data.compose.to) {
          const name = api.about.obs.name(data.compose.to)
          compose.setText(`[@${name()}](${data.compose.to})\n\n`, true)
          window.requestAnimationFrame(() => {
            compose.focus()
          })
        }
      }

      return view
    }
  }
}
