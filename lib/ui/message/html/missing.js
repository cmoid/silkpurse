const h = require('mutant/h')
const computed = require('mutant/computed')
const ref = require('ssb-ref')

module.exports = function (api) {
  const i18n = api.intl.sync.i18n
  return {
    'message.html.missing': function (id, hintMessage) {
      if (!ref.isMsg(id)) return
      const msg = api.message.obs.get(id, hintMessage)
      return computed(msg, msg => {
        if (msg && msg.value && msg.value.missing) {
          // TODO: handle out-of-order resolved message, or message resolved later
          return messageMissing(msg, hintMessage)
        }
      })
    }
  }

  function messageMissing (msg, hintMessage) {
    const element = h('Message -missing -reply', [
      h('header', [
        h('div.main', [
          h('div.main', [
            h('div.name', [
              '⚠️ ',
              msg.value.author
                ? [api.profile.html.person(msg.value.author), ' ', i18n('(missing message)')]
                : h('strong', i18n('Missing message')),
              i18n(' via '), api.profile.html.person(hintMessage.value.author)]),
            h('div.meta', [h('a', { href: msg.key }, msg.key)])
          ])
        ]),
        h('div.meta', [
          api.message.html.metas(msg)
        ])
      ]),
      h('section', [
        h('p', [i18n('The author of this message could be outside of your follow range or they may be blocked.')])
      ])
    ])

    element.msg = msg
    return element
  }
}
