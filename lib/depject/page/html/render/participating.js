const { h, when } = require('mutant')

module.exports = function (api) {
  const i18n = api.intl.sync.i18n
  return {
    'page.html.render': page
  }

  function page (path) {
    if (path !== '/participating') return // "/" is a sigil for "page"

    const includeParticipating = api.settings.obs.get('patchwork.includeParticipating', false)

    const prepend = [
      when(includeParticipating, null, h('PageHeading', [
        h('h1', [
          i18n('Participating')
        ])
      ]))
    ]

    const getStream = api.sbot.pull.resumeStream((sbot, opts) => {
      return sbot.patchwork.participatingFeed.roots(opts)
    }, { limit: 10, reverse: true })

    const yourId = api.keys.sync.id()

    const feedView = api.feed.html.rollup(getStream, {
      prepend,
      searchSpinner: true,
      groupSummaries: false,
      compactFilter: (msg) => msg.value.author === yourId, // condense your messages
      updateStream: api.sbot.pull.stream(sbot => sbot.patchwork.participatingFeed.latest())
    })

    const result = h('div.SplitView', [
      h('div.main', feedView)
    ])

    result.pendingUpdates = feedView.pendingUpdates
    result.reload = feedView.reload

    return result
  }
}
