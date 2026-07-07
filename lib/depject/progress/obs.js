const pull = require('pull-stream')
const { Struct, Dict, Value, computed, watch } = require('mutant')

module.exports = function (api) {
  let syncStatus = null
  let progress = null
  let pluginProgress = null

  return {
    'progress.obs.replicate': function () {
      load()
      return syncStatus
    },

    'progress.obs.peer': function (id) {
      load()
      const result = computed(syncStatus, (status) => {
        return status.pendingPeers[id] || 0
      })
      return result
    },

    'progress.obs.indexes': function () {
      load()
      return progress.indexes
    },

    'progress.obs.plugins': function () {
      load()
      return pluginProgress.plugins
    },

    'progress.obs.migration': function () {
      load()
      return progress.migration
    },

    'progress.obs.global': function () {
      load()
      return progress
    }
  }

  function load () {
    if (!syncStatus) {
      syncStatus = ProgressStatus(x => x.replicate.changes(), {
        incompleteFeeds: 0,
        pendingPeers: Dict({}, { fixedIndexing: true }),
        feeds: null,
        rate: 0
      })
    }
    if (!progress) {
      progress = ProgressStatus(x => x.patchwork.progress(), {
        indexes: Status(),
        migration: Status()
      })
    }
    if (!pluginProgress) {
      pluginProgress = ProgressStatus(x => x.patchwork.progress(), {
        plugins: Struct({})
      })
    }
  }

  function ProgressStatus (keyFn, attrs) {
    const progress = Struct(attrs || {
      pending: 0
    })

    watch(api.sbot.obs.connection, (sbot) => {
      if (sbot) {
        let source
        try {
          source = keyFn(sbot)
        } catch (err) {
          progress.set(err)
          return progress
        }
        if (source) {
          pull(
            source,
            pull.drain((event) => {
              progress.set(event)
            })
          )
        }
      }
    })

    return progress
  }
}

function Status () {
  return Struct({
    start: Value(),
    current: Value(),
    target: Value()
  })
}
