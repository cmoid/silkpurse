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
// use() accepts two module shapes:
//   converted — module.exports = function (api) { return { 'dot.key': fn } }
//   legacy    — { needs, gives, create } depject modules (transitional,
//               removed once conversion is complete)

function setPath (obj, path, value) {
  let o = obj
  for (let i = 0; i < path.length - 1; i++) {
    o = o[path[i]] = o[path[i]] || {}
  }
  o[path[path.length - 1]] = value
}

function getPath (obj, path) {
  let o = obj
  for (let i = 0; i < path.length && o != null; i++) {
    o = o[path[i]]
  }
  return o
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

  // Walk a legacy depnest gives declaration ({a: {b: true}} or
  // {a: {b: {c: true, d: true}}}), collecting dot keys at `true` leaves.
  function givesKeys (gives, path = []) {
    if (gives === true) return [path.join('.')]
    if (typeof gives === 'string') return [gives]
    const keys = []
    for (const k of Object.keys(gives)) {
      keys.push(...givesKeys(gives[k], path.concat(k)))
    }
    return keys
  }

  function use (mod) {
    if (typeof mod === 'function') {
      const given = mod(api)
      for (const key of Object.keys(given)) provide(key, given[key])
    } else if (mod && typeof mod.create === 'function') {
      const given = mod.create(api)
      for (const key of givesKeys(mod.gives)) {
        provide(key, getPath(given, key.split('.')))
      }
    } else if (mod && typeof mod === 'object') {
      // nested collection of modules (e.g. the lib/depject index tree);
      // walk in key order, matching depject's flatten order
      for (const k of Object.keys(mod)) use(mod[k])
    } else {
      throw new Error('plug: unrecognized module: ' + mod)
    }
  }

  return { api, use }
}
