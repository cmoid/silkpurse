const Value = require('mutant/value')
const ref = require('ssb-ref')

module.exports = function (api) {
  return {
    'message.obs.author': function (id) {
      if (!ref.isLink(id)) throw new Error('an id must be specified')
      const result = Value()

      if (ref.isMsg(id)) {
        api.sbot.async.get(id, function (err, value) {
          if (err) console.error(err)
          else result.set(value.author)
        })
      }

      return result
    }
  }
}
