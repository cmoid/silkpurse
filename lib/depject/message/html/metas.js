const nest = require('depnest')
const { h, computed, map, send, when, onceTrue } = require('mutant')
const msgs = require('ssb-msgs')

exports.gives = nest('message.html.metas')
exports.needs = nest({
  'message.obs.likeCount': 'first',
  'sheet.profiles': 'first',
  'about.obs.name': 'first',
  'intl.sync.i18n': 'first',
  'intl.sync.i18n_n': 'first',
  'sbot.obs.connection': 'first',
  'about.html.image': 'first'
})

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  const plural = api.intl.sync.i18n_n

  return nest('message.html.metas', function likes (msg) {
    const result = []
    if (msg.value.private) {
      result.push(h('span.private', map(msg.value.content.recps, id => {
        const feed = msgs.link(id, 'feed')
        if (!feed) return
        id = feed.link
        return h('a', {
          href: id,
          title: api.about.obs.name(id)
        }, [
          api.about.html.image(id)
        ])
      })))
    }

    if (msg.value.content && msg.value.content.channel && msg.value.content.type !== 'channel') {
      result.push(h('a.channel', { href: `#${msg.value.content.channel}` }, [`#${msg.value.content.channel}`]))
    }

    if (msg.key) {
      const likeCount = api.message.obs.likeCount(msg.key)
      result.push(
        h('div.counts', [
          when(likeCount,
            h('a.likes', {
              href: '#', 'ev-click': send(displayLikes, msg)
            }, computed(['%s likes', likeCount], plural))
          )
        ])
      )
    }

    return result
  })

  function displayLikes (msg) {
    onceTrue(api.sbot.obs.connection, (sbot) => {
      sbot.patchwork.likes.get({ dest: msg.key }, (err, likes) => {
        if (err) return console.log(err)
        api.sheet.profiles(likes, i18n('Liked by'))
      })
    })
  }
}
