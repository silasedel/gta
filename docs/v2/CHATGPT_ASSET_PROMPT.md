# Prompt for ChatGPT: build a 3D asset for Port Solana

Paste everything below the line into ChatGPT. Swap the "Asset" section for whatever is being asked for.

---

Build me a real 3D game asset as a downloadable `.glb` file (binary glTF 2.0). Write and run code to generate it (for example Python with trimesh, numpy and pygltflib), then give me the file to download. Do not give me an image, a description or code only. I need the actual `.glb`.

**Asset:** a small independent gas station for a sunny, slightly run-down Florida coastal town, in an original made-up brand called "Sunspur" (orange and cream, a simple sun-and-spur mark). No real brands, logos or trademarks anywhere.

It includes:
- A canopy on four steel columns with a lit fascia band, underside light panels, rust streaks at the column bases and one dented fascia corner.
- Four fuel pumps on two raised concrete islands, each with a screen, keypad, card slot, two hoses with nozzles in holsters, a price display, a squeegee bucket and a trash bin. Bollards at the island ends.
- A small flat-roofed shop: glass front with door, window posters, an ice chest and a propane cage outside, roof AC units, a rear door and a dumpster pad.
- A tall roadside price sign with three fuel grades.
- Ground slab with oil stains, cracked concrete, painted bay lines worn at the edges, a storm drain, and curbs.
- An air and water machine, a pay phone shell, a newspaper box and two parking stops.

**Technical rules (these matter most):**
- Units are meters, real-world scale. Y is up. The front faces +Z. The origin is at ground level in the center of the lot. Lot size about 36 m wide by 28 m deep.
- One `.glb` with everything embedded. Under 25 MB.
- Real geometry, not flat cards: bevel hard edges, give panels thickness, model the hoses, nozzles, keypads, door handles, light fixtures and bolts. Target 150,000 to 300,000 triangles in total.
- Separate, clearly named nodes for each object (`canopy`, `pump_01` … `pump_04`, `shop`, `shop_door`, `price_sign`, `ground`, `dumpster`, and so on), so each can be moved or removed. The shop door is its own node with its pivot on the hinge edge.
- Every face of every object has a PBR material with textures: base color, normal, and a combined occlusion-roughness-metalness map. No untextured or single-flat-color surfaces. Glossy where it should be (glass, painted metal, pump screens), matte where it should be (concrete, stucco), bumpy where it should be (asphalt, rust, cracked paint).
- Textures 1024 or 2048 px, PNG or JPEG, power-of-two sizes. Reuse a few shared texture sets across objects. Proper UVs with consistent texel density (about 512 px per meter on things you see up close, less on the roof and slab).
- Nothing looks factory new: sun fading on the south side, grime under ledges, chipped paint on bollards, tire marks, a cracked pump screen, faded posters, stains under the AC units. Vary each pump slightly.
- Glass uses alpha blend with a low roughness; emissive maps on the fascia band, canopy lights, pump screens and price sign digits so they glow at night.
- Clean normals (no dark faces or inside-out faces), no duplicate overlapping faces, no cameras or lights in the file.
- Also include simple collision shapes as nodes named `col_*` (boxes only) for the columns, pumps, shop walls, sign pole, bollards and dumpster.

**Before you give me the file:** load it back, and report the triangle count, the bounding box in meters, the list of node names, the list of materials with which texture maps each has, and the file size. Render four preview images (front, back, a three-quarter view, and a close-up of one pump) and look at them. Fix anything that is flat, untextured, floating, intersecting or out of scale, then give me the final `.glb`.
