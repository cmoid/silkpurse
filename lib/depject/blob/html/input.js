const h = require('mutant/h')
const blobFiles = require('ssb-blob-files')

module.exports = function (api) {
  return { 'blob.html.input': FileInput }

  function FileInput (onAdded, opts = {}) {
    const { accept, private: isPrivate, stripExif = true, resize, quality, multiple, maxSize } = opts

    return h('input', {
      type: 'file',
      accept,
      multiple,
      'ev-change': handleEvent
    })

    function handleEvent (ev) {
      const opts = { isPrivate, stripExif, resize, quality, maxSize: maxSize || 5 * 1024 * 1024 }
      blobFiles(ev.target.files, api.sbot.obs.connection, opts, (err, result) => {
        // error is returned if file is too big
        onAdded(err, result) // { link, name, size, type }
        ev.target.value = ''
      })
    }
  }
}
