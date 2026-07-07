const h = require('mutant/h')
const extend = require('xtend')
const addContextMenu = require('../../../../message/html/decorate/context-menu')

module.exports = function (api) {
  const i18n = api.intl.sync.i18n
  return {
    'message.html.canRender': isRenderable,

    'message.html.render': function (msg, opts) {
      if (!isRenderable(msg)) return
      const element = api.message.html.layout(msg, extend({
        miniContent: messageContent(msg),
        layout: 'mini'
      }, opts))

      return addContextMenu(element, {
        msg
      })
    }
  }

  function messageContent (msg) {
    const channel = `#${msg.value.content.channel}`
    const subscribed = msg.value.content.subscribed
    return [
      subscribed ? i18n('subscribed to ') : i18n('unsubscribed from '),
      h('a', {
        href: channel
      }, channel)
    ]
  }
}

function isRenderable (msg) {
  return msg.value.content.type === 'channel' ? true : undefined
}
