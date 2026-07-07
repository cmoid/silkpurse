const ref = require('ssb-ref')

module.exports = function (api) {
  return {
    'contact.async.follow': follow,
    'contact.async.unfollow': unfollow,
    'contact.async.followerOf': followerOf,
    'contact.async.block': block,
    'contact.async.unblock': unblock
  }

  function followerOf (source, dest, cb) {
    api.sbot.async.friendsGet({ source: source, dest: dest }, cb)
  }

  function follow (id, cb) {
    if (!ref.isFeed(id)) throw new Error('a feed id must be specified')
    api.sbot.async.publish({
      type: 'contact',
      contact: id,
      following: true
    }, cb)
  }

  function unfollow (id, cb) {
    if (!ref.isFeed(id)) throw new Error('a feed id must be specified')
    api.sbot.async.publish({
      type: 'contact',
      contact: id,
      following: false
    }, cb)
  }

  function block (id, cb) {
    if (!ref.isFeed(id)) throw new Error('a feed id must be specified')
    api.sbot.async.publish({
      type: 'contact',
      contact: id,
      blocking: true
    }, cb)
  }

  function unblock (id, cb) {
    if (!ref.isFeed(id)) throw new Error('a feed id must be specified')
    api.sbot.async.publish({
      type: 'contact',
      contact: id,
      blocking: false
    }, cb)
  }
}
