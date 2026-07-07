'use strict'
const { computed } = require('mutant')
const MutantPullDict = require('../../mutant-pull-dict')

module.exports = function (api) {
  const cache = {}
  const reverseCache = {}
  let ignoreCache = null

  return {
    'contact.obs.following': (key) => matchingValueKeys(states(key), true),
    'contact.obs.followers': (key) => matchingValueKeys(reverseStates(key), true),
    'contact.obs.blocking': (key) => matchingValueKeys(states(key), false),
    'contact.obs.blockers': (key) => matchingValueKeys(reverseStates(key), false),
    'contact.obs.ignores': ignores,
    'contact.obs.states': states,
    'contact.obs.reverseStates': reverseStates
  }

  function states (feedId) {
    if (!cache[feedId]) {
      cache[feedId] = MutantPullDict(() => {
        return api.sbot.pull.stream((sbot) => sbot.patchwork.contacts.stateStream({ feedId, live: true }))
      }, {
        sync: true
      })
    }
    return cache[feedId]
  }

  function reverseStates (feedId) {
    if (!reverseCache[feedId]) {
      reverseCache[feedId] = MutantPullDict(() => {
        return api.sbot.pull.stream((sbot) => sbot.patchwork.contacts.stateStream({ feedId, live: true, reverse: true }))
      }, {
        sync: true
      })
    }
    return reverseCache[feedId]
  }

  function ignores () {
    if (!ignoreCache) {
      ignoreCache = MutantPullDict(() => {
        return api.sbot.pull.stream((sbot) => sbot.patchwork.contacts.ignoreStream({ live: true }))
      }, {
        sync: true
      })
    }
    return ignoreCache
  }

  function matchingValueKeys (state, value) {
    const obs = computed(state, state => {
      return Object.keys(state).filter(key => {
        return state[key] === value
      })
    })

    obs.sync = state.sync
    return obs
  }
}
