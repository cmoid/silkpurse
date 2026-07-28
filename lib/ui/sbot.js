const pull = require('pull-stream')
const defer = require('pull-defer')
const { Value, onceTrue, watch, Set: MutantSet } = require('mutant')
const ref = require('ssb-ref')
const Reconnect = require('pull-reconnect')
const createClient = require('ssb-client')
const ssbKeys = require('ssb-keys')
const flat = require('flat')
const extend = require('xtend')
const pullResume = require('../pull-resume')

// pull-stream signals "no more values" by passing `true` where an error
// would go. Named so it reads as the end signal it is.
const END = true

module.exports = function (api) {
  const config = api.config.sync.load()
  const keys = api.keys.sync.load()
  const cache = {}

  let sbot = null
  const connection = Value()
  const connectionStatus = Value()
  const connectedPeers = MutantSet()
  const localPeers = MutantSet()
  const stagedPeers = MutantSet()

  const rec = Reconnect(function (isConn) {
    function notify (value) {
      isConn(value); connectionStatus.set(value)
    }

    const opts = {
      path: config.path,
      remote: config.remote,
      host: config.host,
      port: config.port,
      key: config.key,
      appKey: config.caps.shs,
      timers: config.timers,
      caps: config.caps,
      friends: config.friends
    }

    createClient(keys, opts, function (err, _sbot) {
      if (err) {
        return notify(err)
      }

      sbot = _sbot
      sbot.on('closed', function () {
        sbot = null
        connection.set(null)
        notify(new Error('closed'))
      })

      connection.set(sbot)
      notify()
    })
  })

  watch(connection, (sbot) => {
    if (sbot) {
      pull(
        sbot.conn.peers(),
        pull.drain(entries => {
          const peers = entries.filter(([, x]) => !!x.key).map(([address, data]) => ({ address, data }))
          localPeers.set(peers.filter(peer => peer.data.type === 'lan'))
          connectedPeers.set(peers.filter(peer => peer.data.state === 'connected'))
        })
      )

      pull(
        sbot.conn.stagedPeers(),
        pull.drain(entries => {
          const peers = entries.filter(([, x]) => !!x.key).map(([address, data]) => ({ address, data }))
          stagedPeers.set(peers)
        })
      )
    }
  })

  return {
    'sbot.sync.cache': () => cache,

    'sbot.async.get': rec.async(function (key, cb) {
      if (typeof cb !== 'function') {
        throw new Error('cb must be function')
      }
      if (cache[key]) cb(null, cache[key])
      else {
        const options = typeof key === 'string'
          ? { private: true, id: key }
          : key

        sbot.get(options, function (err, value) {
          if (err) return cb(err)
          runHooks({ key, value })
          cb(null, value)
        })
      }
    }),

    'sbot.async.getLatest': rec.async(function (id, cb) {
      if (typeof cb !== 'function') {
        throw new Error('cb must be function')
      }
      sbot.getLatest(id, function (err, value) {
        if (err) return cb(err)
        cb(null, value)
      })
    }),

    'sbot.async.publish': rec.async((content, cb) => {
      const indexes = api.progress.obs.indexes()
      const progress = indexes()
      const pending = progress.target - progress.current || 0

      if (pending) {
        const err = new Error('Cowardly refusing to publish your message while database is still indexing. Please try again once indexing is finished.')

        if (typeof cb === 'function') {
          return cb(err)
        } else {
          console.error(err.toString())
          return
        }
      }

      if (content.recps) {
        content = ssbKeys.box(content, content.recps.map(e => {
          return ref.isFeed(e) ? e : e.link
        }))
      } else {
        const flatContent = flat(content)
        Object.keys(flatContent).forEach(key => {
          const val = flatContent[key]
          if (ref.isBlob(val)) {
            sbot.blobs.push(val, err => {
              if (err) console.error(err)
            })
          }
        })
      }

      if (sbot) {
        // instant updating of interface (just incase sbot is busy)
        runHooks({
          publishing: true,
          timestamp: Date.now(),
          value: {
            timestamp: Date.now(),
            author: keys.id,
            content
          }
        })
      }

      sbot.publish(content, (err, msg) => {
        if (err) console.error(err)
        else if (!cb) console.log(msg)
        cb && cb(err, msg)
      })
    }),

    'sbot.async.addBlob': rec.async((stream, cb) => {
      return pull(
        stream,
        sbot.blobs.add(cb)
      )
    }),

    'sbot.async.connConnect': rec.async(function (address, data, cb) {
      sbot.conn.connect(address, data, cb)
    }),

    'sbot.async.connRememberConnect': rec.async(function (address, data, cb) {
      sbot.conn.remember(address, { autoconnect: true, ...data }, (err) => {
        if (err) cb(err)
        else sbot.conn.connect(address, data, cb)
      })
    }),

    'sbot.async.friendsGet': rec.async(function (opts, cb) {
      sbot.friends.get(opts, cb)
    }),

    'sbot.pull.backlinks': rec.source(query => {
      return sbot.backlinks.read(query)
    }),

    'sbot.pull.userFeed': rec.source(opts => {
      return sbot.createUserStream(opts)
    }),

    'sbot.pull.messagesByType': rec.source(opts => {
      return sbot.messagesByType(opts)
    }),

    'sbot.pull.feed': rec.source(function (opts) {
      return pull(
        sbot.createFeedStream(opts),
        pull.through(runHooks)
      )
    }),

    'sbot.pull.log': rec.source(opts => {
      return pull(
        sbot.createLogStream(opts),
        pull.through(runHooks)
      )
    }),

    'sbot.pull.links': rec.source(function (query) {
      return sbot.links(query)
    }),

    // Long-lived streams, which must survive a reconnect.
    //
    // This used to resolve ONCE: `onceTrue` fires a single time, so after a
    // disconnect the consumer was left holding a stream on a dead sbot and
    // nothing ever subscribed again. Every live tab is built on this
    // (publicFeed.latest, mentionsFeed.latest, thread.sorted, ...), so one
    // dropped connection silently stopped live updates everywhere until the
    // app was restarted.
    //
    // The visible symptom was worse than that: progress-notifier drains
    // patchwork.heartbeat through here, and its `waiting` flag latches true
    // after one second without a tick and is only cleared BY a tick. A dead
    // heartbeat therefore pinned the overlay on "Scuttling..." forever, with
    // every button in read-only mode.
    //
    // Now the source hides the reconnect: when the underlying stream ends it
    // waits for the NEXT connection and subscribes again, so consumers see
    // one uninterrupted stream. "Next" means a different sbot instance —
    // a stream that ends on its own while the connection is still up must
    // not immediately resubscribe, or it spins.
    'sbot.pull.stream': function (fn) {
      let inner = null
      let from = null // the sbot instance `inner` was created against
      let aborted = false

      return function read (abort, cb) {
        if (abort) {
          aborted = true
          if (inner) return inner(abort, cb)
          return cb(abort)
        }

        if (inner) {
          return inner(null, function (end, data) {
            if (!end) return cb(null, data)
            if (aborted) return cb(end)
            // Ended: either the connection dropped or the peer closed the
            // stream. Wait for a new connection and pick up where we can.
            inner = null
            read(null, cb)
          })
        }

        onNextConnection(from, function (sbot) {
          // aborted while waiting for a connection
          if (aborted) return cb(END)
          from = sbot
          try {
            inner = fn(sbot)
          } catch (err) {
            // A stream we cannot even create (a method the server does not
            // have) is reported, not retried — retrying would spin.
            return cb(err)
          }
          read(null, cb)
        })
      }
    },

    'sbot.pull.resumeStream': function (fn, baseOpts) {
      return function (opts) {
        const stream = defer.source()
        onceTrue(connection, function (connection) {
          stream.resolve(pullResume.remote((opts) => {
            return fn(connection, opts)
          }, extend(baseOpts, opts)))
        })
        return stream
      }
    },

    'sbot.obs.connectionStatus': (listener) => connectionStatus(listener),
    'sbot.obs.connection': connection,
    'sbot.obs.connectedPeers': () => connectedPeers,
    'sbot.obs.localPeers': () => localPeers,
    'sbot.obs.stagedPeers': () => stagedPeers
  }

  // scoped

  // Call cb with the first connected sbot that is not `previous`.
  //
  // Passing `previous` is what stops a resubscribe loop: after a stream
  // ends we want the NEXT connection, not the one it just ended on. On the
  // first subscription `previous` is null and any connection will do.
  //
  // mutant's watch/2 invokes the listener synchronously with the current
  // value before returning the remove function, so `remove` may still be
  // unassigned when we want to call it — hence the flag.
  function onNextConnection (previous, cb) {
    let called = false
    let remove = null

    const check = (sbot) => {
      if (called || !sbot || sbot === previous) return
      called = true
      if (remove) remove()
      cb(sbot)
    }

    remove = watch(connection, check)
    if (called) remove()
  }

  function runHooks (msg) {
    if (msg.publishing) {
      api.sbot.hook.publish(msg)
    } else if (!cache[msg.key]) {
      // cache[msg.key] = msg.value
      // api.sbot.hook.feed(msg)
    }
  }
}
