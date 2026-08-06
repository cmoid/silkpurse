// dial.js
const ssbClient = require('ssb-client')
const remote = 'unix:' + process.env.HOME + '/.silkpurse/socket:~noauth:Sur8RwcDh6kBjub8pLZpHNWDfuuRpYVyCHrVo+TdA/4='
const addr = 'net:pub.cmoid.org:8008~shs:ASFlv8MHXcuHeRMruDnUPZwMkFTx+t1fYvoP7xWkXRo='

ssbClient(null, { remote }, (err, sbot) => {
  if (err) return console.error('client error:', err)
  sbot.whoami((err, id) => {
    console.log('whoami ->', err || id)
    sbot.conn.connect(addr, (err, res) => {
      console.log('connect ->', err || res)
      sbot.close()
    })
  })
})
