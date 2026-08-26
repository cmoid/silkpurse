// Driving `archives.fetch` to completion on the user's behalf.
//
// The RPC is two calls when the blob is not local, and for a good reason:
// blob transfer is want-driven and asynchronous, so a call that blocked
// until a multi-megabyte segment arrived would hold the connection's
// rpc_processor for the whole transfer. The first call records the want
// and answers `fetching`; a later call, once the blob has landed, verifies
// and imports.
//
// That is the right shape for the protocol and the wrong shape for a
// person. Asked once, they should not have to notice the blob arriving and
// ask again — there is nothing on screen that tells them when it has. So
// this polls `archives.history` for `skipped.held`, which exists precisely
// to distinguish a wait from an instant, and issues the second call itself.
//
// Shared by the profile footer and the archive message renderer so the two
// cannot drift into behaving differently about the same button.

const POLL_MS = 2000
// Ten minutes. A blob that has not arrived by then is not arriving from
// the peers currently connected, and the want stays recorded regardless —
// asking again later costs nothing.
const MAX_POLLS = 300

// status: a mutant Value that receives human-readable progress.
// onImported: called once, after history has actually been restored.
function start ({ api, i18n, feedId, status, element, onImported }) {
  status.set(i18n('Fetching…'))
  api.sbot.async.archivesFetch(feedId, (err, res) => {
    if (err) return status.set(i18n('Could not fetch: ') + err.message)
    if (res && res.status === 'fetching') return awaitBlob()
    finish(res)
  })

  function awaitBlob () {
    status.set(i18n('Downloading the archive…'))
    let polls = 0
    const tick = () => {
      // Stop if the view has gone away under us.
      if (element && element.isConnected === false) return
      if (++polls > MAX_POLLS) {
        return status.set(i18n('Still downloading — try again later.'))
      }
      api.sbot.async.archivesHistory(feedId, (err, res) => {
        if (!err && res && res.skipped && res.skipped.held) return importNow()
        setTimeout(tick, POLL_MS)
      })
    }
    setTimeout(tick, POLL_MS)
  }

  function importNow () {
    // Every signature in the segment is checked, so this is seconds of work
    // on a large archive rather than milliseconds. Say so.
    status.set(i18n('Verifying earlier history…'))
    api.sbot.async.archivesFetch(feedId, (err, res) => {
      if (err) return status.set(i18n('Could not fetch: ') + err.message)
      finish(res)
    })
  }

  function finish (res) {
    status.set(describe(res, i18n))
    if (res && res.status === 'imported' && onImported) onImported()
  }
}

function describe (res, i18n) {
  if (!res) return i18n('No response')
  switch (res.status) {
    case 'imported':
      return i18n('Earlier history restored and verified.')
    case 'nothing_to_fetch':
      return i18n('Nothing was skipped — you already have this history.')
    case 'failed':
      // The segment does not join the chain it claims to. Not a network
      // problem, and not something to retry.
      return i18n('Verification failed: ') + (res.reason || i18n('unknown'))
    case 'blob_unreadable':
      return i18n('The archive could not be read.')
    default:
      return res.status
  }
}

module.exports = { start, describe }
