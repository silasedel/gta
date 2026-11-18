#!/bin/zsh
# Web build only: re-encode the PNG / JPEG textures embedded in every GLB of a built site as WebP (three's GLTFLoader reads
# EXT_texture_webp natively). Color / emissive maps lossy q90, data maps (normal, ORM) near-lossless. The Mac app keeps the
# original files. The built site's public files are HARD LINKS into the source tree, so every result is written to a temp
# file and moved over the link (a new inode): the source assets are never modified.
#   zsh tools/v2/web/texcomp/webp-glbs.sh <built site dir>
set -e
SITE="$1"; [ -d "$SITE/assets" ] || { echo "usage: webp-glbs.sh <built site dir>"; exit 1; }
HERE="${0:A:h}"; GT="$HERE/node_modules/.bin/gltf-transform"
[ -x "$GT" ] || { echo "run npm install in $HERE first"; exit 1; }
TMP=$(mktemp -d); n=0; saved=0
has_raster() { python3 - "$1" <<'EOF'
import json,struct,sys
b=open(sys.argv[1],'rb').read(); jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl])
sys.exit(0 if any(i.get('mimeType') in ('image/png','image/jpeg') for i in j.get('images',[])) else 1)
EOF
}
find "$SITE/assets" -name '*.glb' -size +100k | while read -r f; do
  has_raster "$f" || continue
  a=$(stat -f %z "$f")
  if "$GT" webp "$f" "$TMP/a.glb" --quality=90 --slots="{baseColorTexture,emissiveTexture,diffuseTexture}" >/dev/null 2>&1 \
     && "$GT" webp "$TMP/a.glb" "$TMP/b.glb" --near-lossless=true --slots="{normalTexture,occlusionTexture,metallicRoughnessTexture}" >/dev/null 2>&1; then
    b=$(stat -f %z "$TMP/b.glb")
    if [ "$b" -lt "$a" ]; then mv -f "$TMP/b.glb" "$f.tmpwebp" && mv -f "$f.tmpwebp" "$f"; n=$((n+1)); saved=$((saved + a - b)); fi
  fi
  rm -f "$TMP/a.glb" "$TMP/b.glb"
done
rm -rf "$TMP"
echo "webp-glbs: done"
