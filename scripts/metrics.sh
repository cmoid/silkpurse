#!/bin/sh
# Print code-size and dependency metrics for silkpurse.
#
#   ./scripts/metrics.sh          metrics for the working tree / a given ref
#   ./scripts/metrics.sh <ref>    metrics for any commit, e.g. 25572342 (3.18.1)
#
# "app js" is index.js + lib/**/*.js; "styles" is everything under styles/.
# Lockfile packages counts entries in package-lock.json (npm lockfile v2+).

set -e
cd "$(dirname "$0")/.."

REF="${1:-HEAD}"

list() { git ls-tree -r "$REF" --name-only | grep -E "$1"; }
lines() { list "$1" | while read -r f; do git show "$REF:$f"; done | wc -l | tr -d ' '; }

JS=$(lines '^(index\.js|lib/.*\.js)$')
JSFILES=$(list '^(index\.js|lib/.*\.js)$' | wc -l | tr -d ' ')
STYLES=$(lines '^styles/')
DEPS=$(git show "$REF:package.json" | python3 -c "
import json,sys
p=json.load(sys.stdin)
print(f\"{len(p.get('dependencies',{}))} deps + {len(p.get('devDependencies',{}))} dev\")")
LOCK=$(git show "$REF:package-lock.json" 2>/dev/null | python3 -c "
import json,sys
try:
    l=json.load(sys.stdin)
    print(len(l['packages'])-1 if 'packages' in l else 'v1 lockfile')
except Exception:
    print('n/a')")

echo "ref:               $REF ($(git log -1 --format='%h %s' "$REF" | cut -c1-60))"
echo "app js lines:      $JS in $JSFILES files"
echo "styles lines:      $STYLES"
echo "package.json:      $DEPS"
echo "lockfile packages: $LOCK"
if [ "$REF" = "HEAD" ] && [ -d node_modules ]; then
  echo "node_modules dirs: $(ls node_modules | grep -cv '^\.')"
fi
