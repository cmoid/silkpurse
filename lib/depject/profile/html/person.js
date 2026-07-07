const h = require('mutant/h')

module.exports = function (api) {
  return {
    'profile.html.person': person
  }

  function person (id, altName) {
    return h('a ProfileLink', { href: id }, [
      altName || api.about.obs.name(id)
    ])
  }
}
