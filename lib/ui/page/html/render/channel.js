const { h } = require('mutant')
const normalizeChannel = require('ssb-ref').normalizeChannel

module.exports = function (api) {
  const i18n = api.intl.sync.i18n
  return {
    'page.html.render': function channel (path) {
      if (path[0] !== '#') return

      const id = api.keys.sync.id()
      const contact = api.profile.obs.contact(id)

      const channel = normalizeChannel(path.substr(1))

      const prepend = [
        h('PageHeading', [
          h('h1', `#${channel}`),
          h('div.meta', [
            api.channel.html.subscribeToggle(channel)
          ])
        ]),
        api.message.html.compose({
          meta: { type: 'post', channel },
          placeholder: i18n('Write a message in this channel')
        }),
        noVisibleNewPostsWarning()
      ]

      const filters = api.settings.obs.get('filters')

      const getStream = api.sbot.pull.resumeStream((sbot, opts) => {
        return sbot.patchwork.channelFeed.roots(opts)
      }, { limit: 15, reverse: true, channel })

      const channelView = api.feed.html.rollup(getStream, {
        prepend,
        updateStream: api.sbot.pull.stream(sbot => sbot.patchwork.channelFeed.latest({ channel }))
      })

      // call reload whenever filters changes
      filters(channelView.reload)

      return channelView

      function noVisibleNewPostsWarning () {
        const warning = i18n('You may not be able to see new channel content until you follow some users or pubs.')
        return api.feed.html.followWarning(contact.isNotFollowingAnybody, warning)
      }
    }
  }
}
