// Stamp the CHANGELOG's [Unreleased] heading with the current version and
// today's date.
//
// `changelog-version`'s own bin takes no arguments and always looks for
// CHANGELOG.md in the working directory, which is why the npm script used
// to shuffle the file to the repo root and back:
//
//   mv docs/CHANGELOG.md . && changelog-version && mv CHANGELOG.md docs/
//
// That is not atomic -- if the stamp throws, CHANGELOG.md is left stranded
// in the repo root. The module underneath does accept a path, so calling
// it directly avoids the shuffle entirely.
//
// It reads the version from ./package.json, so run this from the repo root.

const path = require('path')
const changelogVersion = require('changelog-version')

changelogVersion(path.join(__dirname, '..', 'docs', 'CHANGELOG.md'))
