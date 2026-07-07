const { computed, when } = require('mutant')
const renderProgress = require('../../../progress/html/render')

module.exports = function (api) {
  return {
    'progress.html.peer': function (id) {
      const progress = api.progress.obs.peer(id)
      const feeds = api.progress.obs.replicate().feeds
      const value = computed([progress, feeds], (pending, feeds) => {
        return (feeds - pending) / feeds
      })

      return renderProgress(value, when(progress, '-pending'))
    }
  }
}
