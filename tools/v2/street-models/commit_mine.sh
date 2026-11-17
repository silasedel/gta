#!/bin/zsh
# Commit only the props helper's files / hunks, race-safe: a private index built from the HEAD read at the start, a commit
# object with that HEAD as parent, then a compare-and-swap of HEAD (if another helper committed meanwhile, start over).
# Never touches the shared index or the working tree.   tools/v2/street-models/commit_mine.sh "message"
cd "$(dirname $0)/../../.."
RX="Street props \(overnight props pass|props pass|dynProps|workZones|propJitter|variantColor|movedProps|movedKey|setPropMatrix|physOf|boundsOf|varOf|kitParts|b\._site|it\.m && it\.m|dummy\.rotation\.set\(it\.rx|work: \[\]|shapesOf|collShapes|furn\(|withMoved|work: \(it\)|kitVar\(group, 'work'|brk\('hydrant', p, 0\.15|carts \+ mailboxes per house|=== 'beach' \? sh < 0\.4|_pm2|assignVariants|JIT|__workNear|lotProps|LIBP|CURB_LIB"
for try in 1 2 3 4 5; do
  BASE=$(git rev-parse HEAD)
  export GIT_INDEX_FILE=$PWD/.git/props-index; rm -f $GIT_INDEX_FILE
  git read-tree $BASE
  git add src/world/props tools/v2/street-models public/assets/models/street src/world/miami/streetkit.js src/world/miami/breakables.js src/world/signs 2>/dev/null
  for f in src/world/miami/tilebuild.js src/world/dressing/dressing.v2.js src/world/setpieces/houses/generator.js src/world/setpieces/houses/houses.v2.js docs/v2/CONVENTIONS.md; do python3 -P tools/v2/street-models/stage_hunks.py $f "$RX"; done
  git diff --cached --stat $BASE | tail -15
  TREE=$(git write-tree); rm -f $GIT_INDEX_FILE; unset GIT_INDEX_FILE
  [ "$TREE" = "$(git rev-parse $BASE^{tree})" ] && { echo "nothing to commit"; exit 0; }
  C=$(git commit-tree $TREE -p $BASE -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")
  if git update-ref HEAD $C $BASE; then git log --oneline -1; exit 0; fi
  echo "HEAD moved during the commit, retrying"
done
exit 1
