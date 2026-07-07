const { computed, h } = require('mutant')
const renderProgress = require('../../../../progress/html/render')

module.exports = function (api) {
  return {
    'page.html.render': function channel (path) {
      const indexes = api.progress.obs.indexes()
      const pluginIndexes = api.progress.obs.plugins()
      const peer = api.progress.obs.peer()
      const indexesJson = computed([indexes, pluginIndexes], (indexes, plugins) => {
        return JSON.stringify({ indexes, plugins }, null, 4)
      })
      const statusObj = computed([peer], (peer) => {
        return JSON.stringify(peer, null, 4)
      })

      if (path !== '/status') return
      const i18n = api.intl.sync.i18n

      const prepend = [
        h('PageHeading', [
          h('h1', [
            h('strong', i18n('Status'))
          ])
        ])
      ]

      return h('Scroller', { style: { overflow: 'auto' } }, [
        h('div.wrapper', [
          h('section.prepend', prepend),
          h('section.content', [
            h('h2', i18n('Indexes')),
            h('pre', [indexesJson]),
            h('h2', i18n('Extra Statuses')),
            h('pre', [statusObj])
          ])
        ])
      ])
    }
  }
}
