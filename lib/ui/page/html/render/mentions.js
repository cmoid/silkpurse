module.exports = function (api) {
  return {
    'page.html.render': function mentions (path) {
      if (path !== '/mentions') return

      const getStream = api.sbot.pull.resumeStream((sbot, opts) => {
        return sbot.patchwork.mentionsFeed.roots(opts)
      }, { limit: 40, reverse: true })

      return api.feed.html.rollup(getStream, {
        compactFilter, // compact context messages
        updateStream: api.sbot.pull.stream(sbot => sbot.patchwork.mentionsFeed.latest())
      })
    }
  }

  function compactFilter (msg) {
    const id = api.keys.sync.id()
    return !(Array.isArray(msg.value.content.mentions) && msg.value.content.mentions.some(mention => {
      return mention && mention.link === id
    }))
  }
}
