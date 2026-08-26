// Formatting for archive boundaries, shared by the message renderer and
// the profile footer.
//
// Both describe the same thing — history an author froze into a blob —
// but they get it from different places, and the field names differ. The
// archive MESSAGE carries SSB-style snake_case, because that is what the
// author signed; `archives.history` answers in camelCase, because that is
// what the rest of the muxrpc surface uses. Rather than pick a winner and
// break one of them, each caller maps its own shape into the small record
// this module formats.

// Bytes as something a person can weigh against their patience.
function humanSize (bytes) {
  if (typeof bytes !== 'number') return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// A span of months. SSB timestamps are self-asserted and frequently
// absurd, so this is a label and nothing more — never an ordering.
function dateRange (from, to) {
  if (typeof from !== 'number' || typeof to !== 'number') return null
  const opts = { year: 'numeric', month: 'short' }
  const a = new Date(from).toLocaleDateString(undefined, opts)
  const b = new Date(to).toLocaleDateString(undefined, opts)
  return a === b ? a : `${a} – ${b}`
}

// { count, size, fromTs, toTs } -> "10,000 messages · 3.6 MB · Apr 2017 – Aug 2026"
//
// i18n is threaded through rather than imported: this module is required by
// both a message renderer and a page renderer, and each already holds the
// api it came from. Defaulting to identity keeps it usable from a test or a
// script with no api at hand.
function summarise ({ count, size, fromTs, toTs }, i18n = (s) => s) {
  const bits = []
  if (typeof count === 'number') {
    bits.push(i18n('%s messages').replace('%s', count.toLocaleString()))
  }
  const sz = humanSize(size)
  if (sz) bits.push(sz)
  const range = dateRange(fromTs, toTs)
  if (range) bits.push(range)
  return bits.join(' · ')
}

// The archive message's own content, as signed.
function fromContent (content, i18n) {
  const from = content.from_sequence
  const to = content.to_sequence
  return summarise({
    count: (typeof from === 'number' && typeof to === 'number') ? to - from + 1 : null,
    size: content.size,
    fromTs: content.from_timestamp,
    toTs: content.to_timestamp
  }, i18n)
}

// The `skipped` object from archives.history.
function fromSkipped (skipped, i18n) {
  const from = skipped.fromSequence
  const to = skipped.toSequence
  return summarise({
    count: (typeof from === 'number' && typeof to === 'number') ? to - from + 1 : null,
    size: skipped.size,
    fromTs: skipped.fromTimestamp,
    toTs: skipped.toTimestamp
  }, i18n)
}

module.exports = { humanSize, dateRange, summarise, fromContent, fromSkipped }
