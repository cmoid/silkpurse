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
        layout: 'mini',
        actions: false
      }, opts))

      return addContextMenu(element, {
        msg
      })
    }
  }

  function messageContent (msg) {
    const liked = msg.value.content.vote.value > 0
    const link = msg.value.content.vote.link

    if (liked) {
      return [i18n('liked'), ' ', api.message.html.link(link)]
    } else {
      return [i18n('unliked'), ' ', api.message.html.link(link)]
    }
  }

  function isRenderable (msg) {
    return (msg.value.content.type === 'vote' ? true : undefined) && msg.value.content.vote
  }
}
