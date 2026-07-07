// Vendored from patch-settings (MIT), converted to plain module form.
// Persists app settings to localStorage under the patchSettings key.
const { Value, computed } = require('mutant')
const get = require('lodash/get')
const set = require('lodash/set')
const mergeWith = require('lodash/mergeWith')
const deepEqual = require('deep-equal')

const STORAGE_KEY = 'patchSettings'

module.exports = function (api) {
  let _settings

  return {
    'settings.sync.get': getSync,
    'settings.sync.set': setSync,
    'settings.obs.get': getObs
  }

  function getSync (path, fallback) {
    _initialise()
    if (!path) return _settings()

    return get(_settings(), path, fallback)
  }

  function setSync (newSettings) {
    _initialise()

    const updatedSettings = mergeWith({}, _settings(), newSettings, (objVal, srcVal) => {
      if (Array.isArray(srcVal)) {
        return srcVal
      }
    })
    _settings.set(updatedSettings)
  }

  function getObs (path, fallback) {
    _initialise()
    if (!path) return _settings

    const obs = computed(_settings, s => get(s, path, fallback), { comparer: deepEqual })
    obs.set = function (value) {
      if (value !== obs()) {
        const updatedSettings = mergeWith({}, _settings())
        set(updatedSettings, path, value)
        _settings.set(updatedSettings)
      }
    }

    return obs
  }

  function _initialise () {
    if (_settings) return

    const settings = window.localStorage[STORAGE_KEY]
      ? JSON.parse(window.localStorage[STORAGE_KEY])
      : {}
    _settings = Value(settings)

    // initialise a listener to persist on changes
    _settings(_save)
  }

  function _save (newSettings) {
    window.localStorage[STORAGE_KEY] = JSON.stringify(newSettings)
  }
}
