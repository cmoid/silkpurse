// The panel that stands in for a feed this node has not replicated.
//
// At hops+1 there are tens of thousands of feeds and nothing to show for
// any of them: no posts, no name, no picture — a profile page for one is
// a public key and empty space. A glimpse is the author's own summary of
// their feed, relayed by a peer that does carry it, and this renders it.
// See doc/research/feed-glimpses.md in erlbutt.
//
// WHAT IS IN ONE. The author's profile and a statement they wrote, and
// nothing else: no recent posts, no channel list, nothing the publishing
// node worked out from their behaviour. A panel that mixed the two would
// print inferences in the author's voice with no way for a reader to tell
// which was which. So this renders what it is given and infers nothing —
// a payload field we do not know about is ignored, per the version rule
// in silkpurse_glimpses.
//
// WHAT THE PANEL HAS TO BE HONEST ABOUT. A glimpse is author-curated and
// unanchored: the author wrote it about themselves, nobody has attested
// to it, and nothing pins which one we were shown or when it was current.
// That is acceptable because it feeds exactly one reversible decision —
// replicate this feed or do not — and the panel has to say so rather than
// look like a verified profile card. Hence the provenance line, which is
// not decoration and should not be trimmed for tidiness.
//
// THE POINTER AND THE PAYLOAD ARRIVE SEPARATELY. The glimpse message
// comes back in a discovery round; the blob behind it follows over the
// ordinary want path, and may take a while or never come. So "this feed
// describes itself" and "here is the description" are two states, and
// both are rendered.

const { h, Value } = require('mutant')

const POLL_MS = 2000
// Two minutes of waiting for the payload blob. The want stays recorded
// after that, so re-opening the profile later costs nothing and may well
// find it landed.
const MAX_POLLS = 60

// Returns an element that fills itself in, or stays empty when there is
// nothing to say. Safe to call for any feed: a replicated one renders
// nothing unless it is here because you promoted it.
function mount ({ api, i18n, feedId }) {
  const holder = h('div.GlimpsePanel')
  if (!api.sbot.async.glimpseGet) return holder

  const isSelf = feedId === api.keys.sync.id()

  load()
  return holder

  function load (polls = 0) {
    api.sbot.async.glimpseGet(feedId, (err, res) => {
      if (err || !res) return clear()
      if (holder.isConnected === false) return

      if (!shouldShow(res, isSelf)) return clear()

      if (res.found) return render(res, polls)

      // Promoting FORGETS the staged glimpse — it was a stand-in for a
      // feed that is now on its way — so a pinned feed usually has
      // nothing left to render. The undo has to outlive the glimpse it
      // was offered beside, or the one reversible thing in this feature
      // is the button that looks like it cannot be reversed.
      if (res.pinned) {
        return replace(pinnedStrip({ api, i18n, feedId, onAction: () => load() }))
      }

      renderUnknown(res, polls)
    })
  }

  function clear () {
    holder.innerHTML = ''
  }

  function replace (el) {
    holder.innerHTML = ''
    holder.appendChild(el)
  }

  // Nothing staged for this feed. Usually permanent — most authors have
  // never published a glimpse — so this says what it knows and stops.
  function renderUnknown (res, polls) {
    if (!res.asking || polls >= 3) {
      return replace(h('div.glimpse-quiet', [
        i18n('Nothing is known about this feed here.')
      ]))
    }
    replace(h('div.glimpse-quiet', [i18n('Asking the network…')]))
    setTimeout(() => {
      if (holder.isConnected !== false) load(polls + 1)
    }, POLL_MS)
  }

  function render (res, polls) {
    replace(panel({ api, i18n, feedId, res, isSelf, onAction: () => load() }))

    // The pointer is here and the payload is not. Keep asking: the blob
    // is wanted now, and peers answer wants on their own schedule.
    if (!res.held && polls < MAX_POLLS) {
      setTimeout(() => {
        if (holder.isConnected !== false) load(polls + 1)
      }, POLL_MS)
    }
  }
}

// Three reasons to render a panel, and everything else is silence.
//
// An ordinary replicated feed has a timeline; a summary of itself above
// that is noise, and "nothing is known about this feed" is worse than
// noise when the whole feed is sitting underneath it. But:
//
//   - a feed we do NOT replicate is the case the feature exists for;
//   - a pinned one keeps its panel, because that is where the decision
//     to replicate is undone;
//   - your own glimpse shows on your own profile, because what strangers
//     see of you is a thing you should be able to look at. Only once you
//     have published one — an empty prompt on your own profile every day
//     is nagging, not a feature.
function shouldShow (res, isSelf) {
  if (res.pinned) return true
  if (!res.replicated) return true
  return isSelf && res.found
}

// One rendered glimpse. Separated from the loading above so that a page
// listing many of them can reuse it.
function panel ({ api, i18n, feedId, res, isSelf, onAction }) {
  const payload = res.payload || {}
  const profile = payload.profile || {}
  const status = Value(null)

  return h('div.Glimpse', [
    h('div.glimpse-head', [
      h('div.glimpse-avatar', [avatar(api, profile.image)]),
      h('div.glimpse-identity', [
        h('div.glimpse-name', [profile.name || shortId(feedId)]),
        h('div.glimpse-where', [placeLabel(res, isSelf, i18n)])
      ]),
      // Nothing to promote or demote on your own feed.
      isSelf
        ? null
        : h('div.glimpse-action', [
          actionButton({ api, i18n, feedId, pinned: res.pinned, status, onAction }),
          h('div.glimpse-status', [status])
        ])
    ]),

    profile.description
      ? h('div.glimpse-description', [api.message.html.markdown(profile.description)])
      : null,

    // The author's own words about what the feed is for. The one part of
    // a glimpse nothing else in SSB carries.
    payload.statement
      ? h('blockquote.glimpse-statement', [payload.statement])
      : null,

    // Present even when the payload has not arrived: knowing that a feed
    // describes itself, and how big that description is, is already
    // something.
    provenance(res, payload, isSelf, i18n),

    res.held ? null : h('div.glimpse-waiting', [i18n('Fetching the summary…')])
  ])
}

// A promoted feed with no glimpse left to show.
//
// Deliberately a strip and not a card: once you have promoted somebody
// the timeline underneath is the point, and the only thing the panel
// still owes you is the way back out. There is nothing else honest to
// put here — the name and the picture went with the glimpse, and the
// real ones arrive with the feed.
function pinnedStrip ({ api, i18n, feedId, onAction }) {
  const status = Value(null)
  return h('div.Glimpse -pinned', [
    h('div.glimpse-head', [
      h('div.glimpse-identity', [
        h('div.glimpse-where', [i18n('Replicating at your request')])
      ]),
      h('div.glimpse-action', [
        actionButton({ api, i18n, feedId, pinned: true, status, onAction }),
        h('div.glimpse-status', [status])
      ])
    ])
  ])
}

function actionButton ({ api, i18n, feedId, pinned, status, onAction }) {
  if (pinned) {
    return h('button.glimpse-demote', {
      'ev-click': () => {
        status.set(i18n('Stopping…'))
        api.sbot.async.glimpseDemote(feedId, (err) => {
          if (err) return status.set(err.message)
          status.set(i18n('No longer replicating.'))
          // Re-reads: the feed is no longer pinned, so whether anything
          // renders here at all is the ordinary question again.
          if (onAction) onAction()
        })
      }
    }, i18n('Stop replicating'))
  }

  return h('button.glimpse-promote', {
    'ev-click': () => {
      status.set(i18n('Starting…'))
      api.sbot.async.glimpsePromote(feedId, (err, out) => {
        if (err) return status.set(err.message)
        if (out && out.error) return status.set(out.error)
        // Replication starts on the next pass and arrives when it
        // arrives; saying "done" here would be a lie about the network.
        status.set(i18n('Replicating — posts will appear as they arrive.'))
        if (onAction) onAction()
      })
    }
  }, i18n('Replicate this feed'))
}

// Where this feed stands relative to what the node carries.
function placeLabel (res, isSelf, i18n) {
  if (isSelf) return i18n('What your feed says about itself')
  if (res.pinned) return i18n('Replicating at your request')
  if (res.source === 'edge') return i18n('At the edge of your network')
  return i18n('Not replicated')
}

function avatar (api, image) {
  const link = blobLink(image)
  if (!link) return h('div.glimpse-blank')
  return h('img', { src: api.blob.sync.url(link) })
}

// patchwork writes `image` as either a blob id or a { link } object, and
// a glimpse carries whatever the author's client wrote.
function blobLink (image) {
  if (typeof image === 'string' && image.startsWith('&')) return image
  if (image && typeof image.link === 'string') return image.link
  return null
}

function provenance (res, payload, isSelf, i18n) {
  const bits = [i18n('Self-described')]
  if (res.source === 'edge') bits.push(i18n('relayed by a peer'))
  const size = humanSize(res.size)
  if (size) bits.push(size)
  const when_ = dateLabel(res.updated || payload.published)
  if (when_) bits.push(when_)
  return h('div.glimpse-provenance', [
    h('div.glimpse-provenance-line', [bits.join(' · ')]),
    h('div.glimpse-caveat', [
      isSelf
        ? i18n('This is what someone at the edge of your network sees before deciding whether to read you.')
        : i18n('The author wrote this about themselves. Nobody has vouched for it, and it may not be the newest one.')
    ])
  ])
}

function humanSize (bytes) {
  if (typeof bytes !== 'number') return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// A date and nothing finer. Every timestamp here is self-asserted, so it
// is a label, never an ordering.
function dateLabel (ts) {
  if (typeof ts !== 'number' || !ts) return null
  return new Date(ts).toLocaleDateString(undefined,
    { year: 'numeric', month: 'short', day: 'numeric' })
}

function shortId (feedId) {
  return feedId.slice(0, 10) + '…'
}

module.exports = { mount, panel }
