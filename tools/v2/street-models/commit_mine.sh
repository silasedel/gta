#!/bin/zsh
# Commit only the props helper's files / hunks through a private index (other helpers' staged work is never swept in).
#   tools/v2/street-models/commit_mine.sh "message"
cd "$(dirname $0)/../../.."
export GIT_INDEX_FILE=$PWD/.git/props-index
git read-tree HEAD
git add src/world/props tools/v2/street-models public/assets/models/street src/world/miami/streetkit.js src/world/miami/breakables.js src/world/signs 2>/dev/null
RX="props pass|dynProps|workZones|propJitter|variantColor|movedProps|movedKey|setPropMatrix|physOf|boundsOf|varOf|kitParts|b\._site|it\.m && it\.m|dummy\.rotation\.set\(it\.rx|work: \[\]|shapesOf|collShapes|furn\(|withMoved|work: \(it\)|kitVar\(group, 'work'|brk\('hydrant', p, 0\.15|carts \+ mailboxes per house|=== 'beach' \? sh < 0\.4|_pm2|assignVariants|JIT|CART|lotProps|LIBP|CURB_LIB|curb"
for f in src/world/miami/tilebuild.js src/world/dressing/dressing.v2.js src/world/setpieces/houses/generator.js src/world/setpieces/houses/houses.v2.js; do python3 -P tools/v2/street-models/stage_hunks.py $f "$RX"; done
python3 -P tools/v2/street-models/stage_hunks.py docs/v2/briefs/OVERNIGHT_STATUS.md "^.?- [0-9:]+ .*(props|lotProps|mailbox)|## props"
git diff --cached --stat HEAD | tail -25
git commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
rm -f $PWD/.git/props-index
