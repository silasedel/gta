# Base dressing props (airports agent, Nov 19): the user's downloaded tent, sandbags, fences, towers and buildings ->
# one clean GLB each in meters with their PBR textures wired up (the FBX / OBJ / DAE sources keep their textures in a
# separate folder, and two of them only open through assimp). tools/v2/airport/convert.sh then decimates them, adds the
# far LOD and the collision mesh (models.json entries base_*), exactly like the other airport props.
#   blender -b --disable-autoexec --python-exit-code 1 --python tools/v2/airport/prep_base_props.py -- <key|all>
#   W6_DL   = folder with the user's download zips unpacked (one folder per zip name; inner zips unpacked to source/x)
#   W6_PREP = output folder (default /private/tmp/claude-501/sl/prep)
# checkpoint-building (ASCII FBX), military-watchtower-1 and simple-signal-tower (Collada, which Blender 5 no longer
# reads) are converted to GLB first with `assimp export <src> <prep>/asm/<key>.glb -fglb2` (see ASSIMP below).
import bpy, sys, os, re, glob, math, mathutils

DL = os.environ.get('W6_DL', '/private/tmp/claude-501/sl/dl')
PREP = os.environ.get('W6_PREP', '/private/tmp/claude-501/sl/prep')
ASM = os.path.join(PREP, 'asm')

# texture slots: glob patterns relative to the texture folder; {m} = the material name
PBR = {'color': '{m}_BaseColor*', 'normal': '{m}_Normal*', 'rough': '{m}_Roughness*', 'metal': '{m}_Metallic*'}

CFG = {
    # tent-military: an 11 x 10.5 m frame tent (body + window panels)
    'base_tent': {'src': 'tent-military/source/Military tent.fbx', 'tex': 'tent-military/textures', 'pbr': PBR},
    # sandbags-defense-line: a kit of sandbag pieces; three of them as separate props
    'base_sb_line': {'src': 'sandbags-defense-line/source/x/Sandbags.fbx', 'keep': r'^Sandbags_Line_2$',
                     'tex': 'sandbags-defense-line/textures', 'pbr': PBR},
    'base_sb_nest': {'src': 'sandbags-defense-line/source/x/Sandbags.fbx', 'keep': r'^Sandbags_Cover_5$',
                     'tex': 'sandbags-defense-line/textures', 'pbr': PBR},
    'base_sb_store': {'src': 'sandbags-defense-line/source/x/Sandbags.fbx', 'keep': r'^Sandbags_Storage$',
                      'tex': 'sandbags-defense-line/textures', 'pbr': PBR},
    # sandbag-wall-24mb: a 3.3 m sandbag wall segment (the four loose bags beside it are left out)
    'base_sb_wall': {'src': 'sandbag-wall-24mb/source/03.fbx', 'drop': r'^Cube_1[4-7]$', 'tex': 'sandbag-wall-24mb/textures',
                     'pbr': {'color': 'BaseColor.png', 'normal': 'Normal.png', 'rough': 'Roughness.png'}},
    # wire-fence: a 4 m wood post and wire section (wire is alpha)
    'base_wire_fence': {'src': 'wire-fence/source/WireFence_V2.fbx', 'tex': 'wire-fence/textures',
                        'pbr': {'M_wood_fence': {'color': 'wood_BaseColor*', 'normal': 'M_wood_fence_Normal*',
                                                 'rough': 'M_wood_fence_Roughness*'},
                                'lambert1': {'color': 'wire_BaseColor*', 'alpha': 'lambert1_Opacity*',
                                             'normal': 'lambert1_Normal*', 'rough': 'lambert1_Roughness*',
                                             'metal': 'lambert1_Metallic*'}}},
    # fence-11mb: a 5.7 m chain-link panel (one of the five copies)
    'base_mesh_fence': {'src': 'fence-11mb/source/01.fbx', 'keep': r'^Fance$', 'tex': 'fence-11mb/textures',
                        'pbr': {'color': 'Alpha_BaseColor.png', 'color_alpha': True,
                                'normal': '01_DefaultMaterial_Normal.png', 'rough': '01_DefaultMaterial_Roughness.png',
                                'metal': '01_DefaultMaterial_Metallic.png'}},
    # wooden-watchtower (obj in source units): scaled to a 7 m tower
    'base_wood_tower': {'src': 'wooden-watchtower/source/x/watchtower/watchtower.obj', 'tex': 'wooden-watchtower/textures',
                        'height': 7.0,
                        'pbr': {'color': 'watchtower_albedo.png', 'normal': 'watchtower_normal.png',
                                'rough': 'watchtower_roughness.png', 'metal': 'watchtower_metalness.png'}},
    # military-style-building-with-animations: the hut's outside only (no interior: it is not enterable); doors closed
    'base_hut': {'src': 'military-style-building-with-animations/source/x/Military_Hut.fbx',
                 'drop': r'^(Back_Inside_Wall|Front_Inside_Wall|Ceiling|Fluorescent_Lights|Fuse_Box|Camera\d)$',
                 'tex': 'military-style-building-with-animations/textures', 'still': True,
                 'pbr': {'color': 'Military_Hut_{m}_Base*', 'normal': 'Military_Hut_{m}_Norma*',
                         'rough': 'Military_Hut_{m}_Rough*', 'metal': 'Military_Hut_{m}_Metal*'}},
    # checkpoint-building (ASCII FBX via assimp, centimeters)
    'base_checkpoint': {'src': 'asm:base_checkpoint.glb', 'tex': 'checkpoint-building/textures', 'scale': 0.01,
                        'pbr': {'color': '{m}_Base_Color.png', 'normal': '{m}_Normal_DirectX.png', 'flip_g': True,
                                'rough': '{m}_Roughness.png', 'metal': '{m}_Metallic.png'}},
    # military-watchtower-1 (Collada via assimp, centimeters)
    'base_mil_tower': {'src': 'asm:base_mil_tower.glb', 'tex': 'military-watchtower-1/textures', 'scale': 0.01,
                       'pbr': {'color': 'DefaultMaterial_albedo*', 'normal': 'DefaultMaterial_normal*',
                               'rough': 'DefaultMaterial_roughness*', 'metal': 'DefaultMaterial_metallic*'}},
    # simple-signal-tower (Collada via assimp): a 30 m lattice radio mast (lattice is alpha)
    'base_mast': {'src': 'asm:base_mast.glb', 'tex': 'simple-signal-tower/source/x/model/textures',
                  'pbr': {'color': 'DefaultMaterial_albedo*', 'alpha': 'DefaultMaterial_opacity*',
                          'normal': 'DefaultMaterial_normal*', 'rough': 'DefaultMaterial_roughness*',
                          'metal': 'DefaultMaterial_metallic*'}},
}
ASSIMP = {
    'base_checkpoint': 'checkpoint-building/source/bldg_lo.fbx',
    'base_mil_tower': 'military-watchtower-1/source/x/model/model.dae',
    'base_mast': 'simple-signal-tower/source/x/model/model.dae',
}


def find_tex(folder, pattern, mat):
    """First texture file in `folder` that matches the pattern (with {m} = the material name)."""
    hits = sorted(glob.glob(os.path.join(DL, folder, pattern.replace('{m}', mat))))
    return hits[0] if hits else None


def image_node(nt, path, non_color):
    node = nt.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(path, check_existing=True)
    if non_color:
        node.image.colorspace_settings.name = 'Non-Color'
    return node


def wire_material(mat, folder, spec):
    """Rebuild the material as a plain Principled BSDF fed by the downloaded PBR maps."""
    if 'color' not in spec:
        spec = spec.get(mat.name, {})
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Roughness'].default_value = 0.8
    bsdf.inputs['Metallic'].default_value = 0.0
    tex = {k: find_tex(folder, v, mat.name) for k, v in spec.items() if isinstance(v, str)}
    if tex.get('color'):
        c = image_node(nt, tex['color'], False)
        nt.links.new(c.outputs['Color'], bsdf.inputs['Base Color'])
        if spec.get('color_alpha'):
            nt.links.new(c.outputs['Alpha'], bsdf.inputs['Alpha'])
    elif re.search(r'glass', mat.name, re.I):
        bsdf.inputs['Base Color'].default_value = (0.05, 0.07, 0.08, 1)
    if tex.get('alpha'):
        a = image_node(nt, tex['alpha'], True)
        nt.links.new(a.outputs['Color'], bsdf.inputs['Alpha'])
    if tex.get('rough'):
        r = image_node(nt, tex['rough'], True)
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(r.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Red'], bsdf.inputs['Roughness'])
    if tex.get('metal'):
        m = image_node(nt, tex['metal'], True)
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(m.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Red'], bsdf.inputs['Metallic'])
    if tex.get('normal'):
        n = image_node(nt, tex['normal'], True)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        src = n.outputs['Color']
        if spec.get('flip_g'):
            # DirectX normal map: green points down
            sep = nt.nodes.new('ShaderNodeSeparateColor')
            inv = nt.nodes.new('ShaderNodeMath')
            inv.operation = 'SUBTRACT'
            inv.inputs[0].default_value = 1.0
            comb = nt.nodes.new('ShaderNodeCombineColor')
            nt.links.new(src, sep.inputs['Color'])
            nt.links.new(sep.outputs['Green'], inv.inputs[1])
            nt.links.new(sep.outputs['Red'], comb.inputs['Red'])
            nt.links.new(inv.outputs['Value'], comb.inputs['Green'])
            nt.links.new(sep.outputs['Blue'], comb.inputs['Blue'])
            src = comb.outputs['Color']
        nt.links.new(src, nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return sorted(k for k, v in tex.items() if v)


def import_source(path):
    low = path.lower()
    if low.endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=path)
    elif low.endswith('.obj'):
        bpy.ops.wm.obj_import(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)


def world_bounds(objs):
    mn = mathutils.Vector((1e9,) * 3)
    mx = -mn
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return mn, mx


def prep(key):
    c = CFG[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = os.path.join(ASM, c['src'][4:]) if c['src'].startswith('asm:') else os.path.join(DL, c['src'])
    import_source(src)
    # the hut's door animations: keep the rest pose (doors shut)
    for o in bpy.data.objects:
        if o.animation_data:
            o.animation_data_clear()
    keep, drop = c.get('keep'), c.get('drop')
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            continue
        if (keep and not re.search(keep, o.name)) or (drop and re.search(drop, o.name)):
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    wired = {}
    for m in {s.material for o in meshes for s in o.material_slots if s.material}:
        wired[m.name] = wire_material(m, c['tex'], c['pbr'])
    # bake transforms (parents, unit scale) into the meshes, then scale to meters
    bpy.context.view_layer.update()
    world = {o.name: o.matrix_world.copy() for o in meshes}
    for o in meshes:
        me = o.data.copy()
        me.transform(world[o.name])
        if world[o.name].determinant() < 0:
            me.flip_normals()
        o.data = me
    for o in meshes:
        o.parent = None
        o.matrix_parent_inverse = mathutils.Matrix.Identity(4)
        o.matrix_basis = mathutils.Matrix.Identity(4)
    for o in [o for o in bpy.data.objects if o.type != 'MESH']:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    mn, mx = world_bounds(meshes)
    s = c.get('scale', 1.0)
    if c.get('height'):
        s = c['height'] / (mx.z - mn.z)
    if s != 1.0:
        for o in meshes:
            o.data.transform(mathutils.Matrix.Scale(s, 4))
        bpy.context.view_layer.update()
    mn, mx = world_bounds(meshes)
    os.makedirs(PREP, exist_ok=True)
    out = os.path.join(PREP, key + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='AUTO',
                              export_yup=True, export_apply=True, export_animations=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    print('PREP', key, 'tris', tris, 'size', [round(mx[i] - mn[i], 2) for i in range(3)], 'maps', wired)


args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['all']
for k in (list(CFG) if args[0] == 'all' else args):
    prep(k)
