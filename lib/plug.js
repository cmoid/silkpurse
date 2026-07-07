// Minimal replacement for depject/depnest.
//
// The api object exposes one dispatcher per socket key (see plug-keys.js).
// Dispatchers close over a live provider array, so a module created early
// may capture api.foo.bar before a later module provides it — same
// registration model depject's combine() had, with the same call-order
// constraint: a provider must be registered (use()d) before the first call.
//
// Socket types:
//   first — call providers in registration order, return the first
//           result that is not undefined
//   map   — call every provider, return the array of results
//
// use() accepts a module — function (api) { return { 'dot.key': fn } } —
// or a nested collection of modules (the lib/depject index tree), walked
// in key order so provider registration order follows the tree.

function setPath (obj, path, value) {
  let o = obj
  for (let i = 0; i < path.length - 1; i++) {
    o = o[path[i]] = o[path[i]] || {}
  }
  o[path[path.length - 1]] = value
}

function firstDispatcher (key, funs) {
  return function (...args) {
    if (!funs.length) throw new Error('plug/first: no providers for: ' + key)
    for (const fn of funs) {
      const value = fn.apply(this, args)
      if (value !== undefined) return value
    }
  }
}

function mapDispatcher (key, funs) {
  return function (...args) {
    if (!funs.length) throw new Error('plug/map: no providers for: ' + key)
    return funs.map((fn) => fn.apply(this, args))
  }
}

module.exports = function Plug (keyTypes) {
  const providers = {}
  const api = {}

  for (const key of Object.keys(keyTypes)) {
    const funs = (providers[key] = [])
    const dispatcher = keyTypes[key] === 'map'
      ? mapDispatcher(key, funs)
      : firstDispatcher(key, funs)
    setPath(api, key.split('.'), dispatcher)
  }

  function provide (key, fn) {
    if (!providers[key]) throw new Error('plug: unknown socket key: ' + key)
    if (typeof fn !== 'function') throw new Error('plug: provider for ' + key + ' is not a function')
    providers[key].push(fn)
  }

  function use (mod) {
    if (typeof mod === 'function') {
      const given = mod(api)
      for (const key of Object.keys(given)) provide(key, given[key])
    } else if (mod && typeof mod === 'object') {
      for (const k of Object.keys(mod)) use(mod[k])
    } else {
      throw new Error('plug: unrecognized module: ' + mod)
    }
  }

  return { api, use }
}
