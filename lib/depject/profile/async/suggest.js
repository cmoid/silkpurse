const { onceTrue } = require('mutant')
const fallbackImageUrl = 'data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

module.exports = function (api) {
  return {
    'profile.async.suggest': function () {
      return function (text, defaultIds, cb) {
        if (arguments.length === 2 && typeof defaultIds === 'function') {
          cb = defaultIds
          defaultIds = null
        }
        onceTrue(api.sbot.obs.connection, sbot => {
          sbot.patchwork.suggest.profile({ text, defaultIds, limit: 20 }, (err, items) => {
            if (err) return cb(err)
            cb(null, getSuggestions(items))
          })
        })
      }
    }
  }

  function getSuggestions (items) {
    return items.map(item => {
      return {
        title: item.name,
        id: item.id,
        subtitle: item.id.substring(0, 10),
        value: `[@${item.name}](${item.id})`,
        cls: item.following ? 'following' : null,
        image: item.image ? api.blob.sync.url(item.image) : fallbackImageUrl,
        showBoth: true
      }
    })
  }
}
