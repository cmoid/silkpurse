const fs = require('fs')
const path = require('path')

// npm sets npm_package_version when run as `npm run release-notes`, but
// requiring it forced this script through npm -- and npm >= 7 writes its
// run-script banner ("> silkpurse@0.1.0 release-notes") to STDOUT, so a
// plain redirect captured it into the release notes. That banner reached
// a published release once. Reading package.json directly means
//
//     node scripts/release-notes.js > notes.md
//
// works with nothing to remember.
const pkg = require(path.join(__dirname, '..', 'package.json'))
const version = process.env.npm_package_version || pkg.version

const template = fs.readFileSync(path.join(__dirname, '..', 'docs', 'release-notes-template.md'), 'utf8')
const changelog = fs.readFileSync(path.join(__dirname, '..', 'docs', 'CHANGELOG.md'), 'utf8')

let record = false
const lines = changelog.split('\n')

const relevantLines = lines.reduce((acc, cur) => {
  if (cur.startsWith('## ')) {
    if (cur.startsWith(`## v${version}`)) {
      record = true
      return acc
    } else {
      record = false
      return acc
    }
  }

  if (record) {
    acc.push(cur)
  }

  return acc
}, [])

const changes = relevantLines.join('\n')

const releaseNotes = template
  .replace(/\$\$VERSION/g, version)
  .replace(/\$\$CHANGES/g, changes)

console.log(releaseNotes)
