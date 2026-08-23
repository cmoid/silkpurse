// peers.js
const ssbClient = require('ssb-client')
const remote = 'unix:' + process.env.HOME + '/.silkpurse/socket:~noauth:Sur8RwcDh6kBjub8pLZpHNWDfuuRpYVyCHrVo+TdA/4='
const pull = require('pull-stream')

ssbClient(null, { remote }, (err, sbot) => {
  if (err) return console.error(err)
  pull(sbot.conn.peers(), pull.take(1), pull.drain(list => {
    list.forEach(([addr, data]) =>
      console.log(data.state, data.key || '', addr))
    sbot.close()
  }))
})
