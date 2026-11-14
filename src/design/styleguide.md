# Port Solana style guide (design-system track)

Data lives in `styleguide.js` (`design.styleguide.district(id)`, `.tier(id)`, `.forBrand(brand, district)`); this page is the short prose version.

## Tiers (readable at a glance)
- **Luxury:** marble, walnut, brass, velvet. Warm spotlights on single items, wide spacing, halo-lit or engraved signs, a guard at the door. Logos: thin didone or engraved faces, wide tracking, muted palettes.
- **Mid:** clean laminate, oak, brushed steel, terrazzo or VCT. Track lights, full faced shelves, channel letters or a lit box. Logos: confident sans, one strong color.
- **Budget:** beige plastic, wood-grain laminate, wire racks, bare tubes (one flickering), stock to the ceiling, hand-written price cards. Logos: loud, saturated, outlined, bursts and slants.
- **Local independents:** hand-painted walls and boards, sign-painter scripts, slab and typewriter faces, an owner's name and a founding year.

## Districts
Each district entry lists its era, palette, wall and floor materials (names from `design.materials`), sign types and furniture. Highlights:
South Beach is pastel deco with neon and terrazzo; Brickell is glass, stone and halo-lit letters; Little Havana is hand-painted, Cuban cement tile, awnings and walk-up windows; Wynwood is stencil on painted block; the Keys are chipped painted wood, rope and tin; the Everglades are sun-bleached plywood.

## Brands
A brand carries its own palette, typeface roles, logo, sign type and packaging style. The same brand always gets the same kind of sign (`design.signs.build` with no `style`), and its products, bags, cups, menus, receipts, posters and truck liveries are drawn from the same data (`design.print.*`).
