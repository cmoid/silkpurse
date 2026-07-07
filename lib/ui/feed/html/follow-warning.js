const { when, h } = require('mutant')

module.exports = function (api) {
  const i18n = api.intl.sync.i18n
  return {
    'feed.html.followWarning': function followWarning (condition, explanation) {
      return renderWarningBox(condition, i18n('You are not following anyone'), explanation)
    },

    'feed.html.followerWarning': function followerWarning (condition, explanation) {
      return renderWarningBox(condition, i18n('You have no followers'), explanation)
    }
  }

  function renderWarningBox (condition, header, explanation) {
    const content = h('div', {
      classList: 'NotFollowingAnyoneWarning'
    }, h('section', [
      h('h1', header),
      h('p', explanation),
      h('p', [i18n('For help getting started, see the guide at '),
        h('a', {
          href: 'https://scuttlebutt.nz/get-started'
        }, 'https://scuttlebutt.nz/get-started')
      ])
    ]))

    return when(condition, content)
  }
}
