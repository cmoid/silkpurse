const ref = require('ssb-ref')
const { h, map } = require('mutant')

module.exports = function (api) {
  const i18n = api.intl.sync.i18n
  return {
    'message.html.references': function (msg) {
      if (!ref.type(msg.key)) return []

      const references = api.backlinks.obs.references(msg)

      return [
        map(references, link => {
          return h('a.backlink', {
            href: link.id, title: link.id
          }, [
            h('strong', [
              api.profile.html.person(link.author), i18n(' referenced this message:')
            ]), ' ',
            api.message.obs.name(link.id)
          ])
        }, {
          // treat all items as immutable (mutant cannot detect this as they are objects)
          comparer: (a, b) => a === b
        })
      ]
    }
  }
}
