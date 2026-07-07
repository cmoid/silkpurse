const h = require('mutant/h')

module.exports = function (api) {
  return {
    'about.html.link': function (id, text = null) {
      return h('a', { href: id, title: id }, text || ['@', api.about.obs.name(id)])
    }
  }
}
