const h = require('mutant/h')
const extend = require('xtend')
const ref = require('ssb-ref')
const addContextMenu = require('../../../../message/html/decorate/context-menu')

module.exports = function (api) {
  const i18n = api.intl.sync.i18n
  return {
    'message.html.canRender': isRenderable,

    'message.html.render': function about (msg, opts) {
      if (!isRenderable(msg)) return

      const action = i18n('made changes to')
      const target = msg.value.content.about
      const title = api.about.obs.latestValue(target, 'title')
      const element = api.message.html.layout(msg, extend({
        showActions: true,
        miniContent: [action, ' ', h('a', {
          href: target
        }, title)],
        layout: 'mini'
      }, opts))

      return addContextMenu(element, {
        msg
      })
    }
  }

  function isRenderable (msg) {
    if (msg.value.content.type !== 'about') return
    if (!ref.isMsg(msg.value.content.about)) return
    return true
  }
}
