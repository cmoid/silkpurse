const h = require('mutant/h')

module.exports = function (api) {
  return {
    'about.html.image': function (id) {
      return h('img', {
        className: 'Avatar',
        style: { 'background-color': api.about.obs.color(id) },
        src: api.about.obs.imageUrl(id)
      })
    }
  }
}
