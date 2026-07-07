const { h, when, send } = require('mutant')

module.exports = function (api) {
  const i18n = api.intl.sync.i18n
  return {
    'channel.html.subscribeToggle': function (channel) {
      const yourId = api.keys.sync.id()
      const subscribedChannels = api.channel.obs.subscribed(yourId)

      return when(subscribedChannels.has(channel),
        h('a.ToggleButton.-unsubscribe', {
          href: '#',
          title: i18n('Click to unsubscribe'),
          'ev-click': send(unsubscribe, channel)
        }, i18n('Subscribed')),
        h('a.ToggleButton.-subscribe', {
          href: '#',
          'ev-click': send(subscribe, channel)
        }, i18n('Subscribe'))
      )
    }
  }

  function subscribe (id) {
    // confirm
    api.message.async.publish({
      type: 'channel',
      channel: id,
      subscribed: true
    })
  }

  function unsubscribe (id) {
    // confirm
    api.message.async.publish({
      type: 'channel',
      channel: id,
      subscribed: false
    })
  }
}
