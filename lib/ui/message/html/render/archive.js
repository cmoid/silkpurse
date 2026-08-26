const h = require('mutant/h')
const Value = require('mutant/value')
const extend = require('xtend')
const addContextMenu = require('../../../../message/html/decorate/context-menu')
const summary = require('../../../../archive-summary')
const archiveFetch = require('../../../../archive-fetch')

// An `archive` message is the author saying "everything before this point
// is frozen into a blob". It is an ordinary message with an unregistered
// type, so without this renderer it lands in zzz-fallback and shows as
// nothing anyone can read.
//
// TWO MODES, AND THE DIFFERENCE MATTERS.
//
// With an embedded server, this node replicates whole feeds and already
// holds everything the archive refers to. The message is a signpost and
// nothing more, so offering to "fetch the earlier history" would be
// offering something you already have.
//
// Talking to erlbutt, the node may genuinely have started the feed at the
// boundary and hold nothing below it. Then the offer is real, and the
// price is in the message itself — the author records the blob's size and
// the range it covers precisely so a client can quote the cost without
// downloading anything first.
module.exports = function (api) {
  const i18n = api.intl.sync.i18n

  return {
    'message.html.canRender': isRenderable,

    'message.html.render': function (msg, opts) {
      if (!isRenderable(msg)) return

      const element = api.message.html.layout(msg, extend({
        miniContent: messageContent(msg),
        layout: 'mini'
      }, opts))

      return addContextMenu(element, { msg })
    }
  }

  function remoteMode () {
    try {
      return !!api.config.sync.load().erlbutt
    } catch (_err) {
      return false
    }
  }

  function messageContent (msg) {
    const detail = summary.fromContent(msg.value.content, i18n)
    const parts = [
      h('span', i18n('Earlier history archived')),
      ' ',
      h('span.archive-range', detail ? `(${detail})` : '')
    ]

    if (remoteMode()) parts.push(fetchControl(msg))
    return parts
  }

  // Only offered when this node might not hold the history. The status is
  // shown in place of the button rather than beside it, so a fetch that is
  // still running cannot be started twice.
  function fetchControl (msg) {
    const status = Value(null)
    const feedId = msg.value.author

    const button = h('button.archive-fetch', {
      'ev-click': () => archiveFetch.start({ api, i18n, feedId, status })
    }, i18n('Fetch earlier history'))

    return h('div.archive-actions', [
      h('span', [status]),
      // once a fetch has been asked for, the button is gone
      computedUnless(status, button)
    ])
  }

  // Show `element` only while the observable is empty. Mutant listeners
  // are not called on bind, so the current value has to be applied once by
  // hand or the button never appears at all.
  function computedUnless (obs, element) {
    const holder = h('span')
    const update = (value) => {
      holder.innerHTML = ''
      if (!value) holder.appendChild(element)
    }
    update(obs())
    obs(update)
    return holder
  }
}

function isRenderable (msg) {
  return msg.value.content.type === 'archive' ? true : undefined
}
