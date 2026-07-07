const ref = require('ssb-ref')
const { h, computed } = require('mutant')
const many = require('../../../many')

module.exports = function (api) {
  const i18n = api.intl.sync.i18n
  return {
    'message.html.forks': function (msg) {
      if (!ref.type(msg.key)) return []

      const forks = api.backlinks.obs.forks(msg)

      return [
        computed(forks, links => {
          if (links && links.length) {
            const authors = new Set(links.map(link => link.author))
            return h('a.backlink', {
              href: msg.key,
              anchor: links[0].id
            }, [
              h('strong', [
                many(authors, api.profile.html.person, i18n), i18n(' forked this discussion:')
              ]), ' ',
              api.message.obs.name(links[0].id),
              ' (', links.length, ')'
            ])
          }
        }, { idle: true })
      ]
    }
  }
}
