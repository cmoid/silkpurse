const h = require('mutant/h')
const Value = require('mutant/value')
const extend = require('xtend')
const addContextMenu = require('../../../../message/html/decorate/context-menu')

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
    const content = msg.value.content
    const from = content.from_sequence
    const to = content.to_sequence
    const count = (typeof from === 'number' && typeof to === 'number')
      ? (to - from + 1)
      : null

    const parts = [
      h('span', i18n('Earlier history archived')),
      ' ',
      h('span.archive-range', describe(count, content))
    ]

    if (remoteMode()) parts.push(fetchControl(msg))
    return parts
  }

  function describe (count, content) {
    const bits = []
    if (count !== null) bits.push(i18n('%s messages').replace('%s', count))
    if (typeof content.size === 'number') bits.push(humanSize(content.size))
    if (content.from_timestamp && content.to_timestamp) {
      bits.push(dateRange(content.from_timestamp, content.to_timestamp))
    }
    return bits.length ? `(${bits.join(' · ')})` : ''
  }

  // Only offered when this node might not hold the history. The status is
  // shown in place of the button rather than beside it, so a fetch that is
  // still running cannot be started twice.
  function fetchControl (msg) {
    const status = Value(null)
    const feedId = msg.value.author

    const button = h('button.archive-fetch', {
      'ev-click': () => {
        status.set(i18n('Fetching…'))
        api.sbot.async.archivesFetch(feedId, (err, res) => {
          if (err) return status.set(i18n('Could not fetch: ') + err.message)
          status.set(describeResult(res))
        })
      }
    }, i18n('Fetch earlier history'))

    return h('div.archive-actions', [
      h('span', [status]),
      // once a fetch has been asked for, the button is gone
      computedUnless(status, button)
    ])
  }

  function describeResult (res) {
    if (!res) return i18n('No response')
    switch (res.status) {
      case 'imported':
        return i18n('Earlier history restored and verified.')
      case 'fetching':
        // The blob is being pulled in the background; the import happens
        // on a second call once it has arrived.
        return i18n('Downloading the archive… ask again once it lands.')
      case 'nothing_to_fetch':
        return i18n('Nothing was skipped — you already have this history.')
      case 'failed':
        // Not a network problem. The blob does not join the chain it
        // claims to, which means the history does not match what the
        // author committed to when they published the boundary.
        return i18n('Verification failed: ') + (res.reason || i18n('unknown'))
      default:
        return res.status
    }
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

function humanSize (bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function dateRange (from, to) {
  const f = new Date(from)
  const t = new Date(to)
  const opts = { year: 'numeric', month: 'short' }
  const a = f.toLocaleDateString(undefined, opts)
  const b = t.toLocaleDateString(undefined, opts)
  return a === b ? a : `${a} – ${b}`
}

function isRenderable (msg) {
  return msg.value.content.type === 'archive' ? true : undefined
}
