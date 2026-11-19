# minimal FBX 6.1 ASCII (Tree IT) -> OBJ: Vertices, PolygonVertexIndex, UV ByVertice Direct
import sys, re
src, dst = sys.argv[1], sys.argv[2]
txt = open(src, encoding='latin-1').read()
models = re.split(r'\n Model: "Model::', txt)[1:]
def arr(block, key):
    m = re.search(r'\n\s*' + key + r':\s*([-0-9.,e\s]+)', block)
    return [float(x) for x in m.group(1).replace('\n', '').split(',') if x.strip()] if m else []
out = open(dst, 'w'); vo = 0
for blk in models:
    name = blk.split('"')[0]; V = arr(blk, 'Vertices'); P = [int(x) for x in arr(blk, 'PolygonVertexIndex')]
    uvb = blk[blk.find('LayerElementUV'):]; UV = arr(uvb, 'UV')
    out.write(f'o {name}\nusemtl {name}\n')
    for i in range(0, len(V), 3): out.write(f'v {V[i]} {V[i+1]} {V[i+2]}\n')   # Tree IT writes Y up, like OBJ
    for i in range(0, len(UV), 2): out.write(f'vt {UV[i]} {UV[i+1]}\n')
    face = []
    for p in P:
        last = p < 0; idx = (~p if last else p) + vo + 1; face.append(idx)
        if last: out.write('f ' + ' '.join(f'{k}/{k}' for k in face) + '\n'); face = []
    vo += len(V) // 3
    print(name, len(V)//3, 'verts', len(UV)//2, 'uvs', len(P), 'idx')
