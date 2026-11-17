# Southline V2 — NPC archetypes (PEOPLE-LOOK track). Every person here is our own design on the CC0 MakeHuman /
# MPFB2 base mesh. Outfits are original cuts with no real brands. Used by gen_npc.py (Blender) and paint_npc.py (numpy).
#   python3 npc_specs.py  -> writes npc_specs.json next to this file
import json, os, random, zlib
hs = lambda s: zlib.crc32(s.encode()) & 0xffffffff

RACES = {   # MPFB race macro blend
    "white":   {"caucasian": 0.9, "african": 0.03, "asian": 0.07},
    "black":   {"caucasian": 0.05, "african": 0.92, "asian": 0.03},
    "latino":  {"caucasian": 0.62, "african": 0.16, "asian": 0.22},
    "latino2": {"caucasian": 0.45, "african": 0.42, "asian": 0.13},
    "asian":   {"caucasian": 0.08, "african": 0.02, "asian": 0.9},
    "mixed":   {"caucasian": 0.42, "african": 0.36, "asian": 0.22},
}
# skin tone (multiplier on the MakeHuman photo skin, linear-ish RGB) and which MakeHuman skin it starts from
TONES = {
    "fair":   (1.06, 1.0, 0.97), "light": (1.0, 0.97, 0.92), "olive": (0.92, 0.86, 0.74), "tan": (0.84, 0.74, 0.6),
    "brown":  (0.82, 0.72, 0.62), "deep": (0.82, 0.74, 0.68), "dark": (0.72, 0.66, 0.62),
}
def agev(y):
    return max(0.47, 0.1875 + (y - 11) / 14 * 0.3125) if y < 25 else 0.5 + (y - 25) / 65 * 0.5
def skin_for(g, y, race):
    b = "young" if y < 36 else "middleage" if y < 58 else "old"
    dom = {"white": "caucasian", "black": "african", "asian": "asian", "latino": "caucasian", "latino2": "african", "mixed": "african"}[race]
    s = f"{b}_{dom}_{'male' if g == 'm' else 'female'}"
    if s in ("young_caucasian_male", "young_caucasian_female") and race != "white": s += "2"
    return s

FACE_POOL = ["nose-hump-incr", "nose-hump-decr", "nose-width1-incr", "nose-width1-decr", "nose-width2-incr", "nose-flaring-incr", "nose-point-up", "nose-point-down",
    "nose-scale-vert-incr", "nose-scale-vert-decr", "nose-volume-incr", "nose-volume-decr", "nose-greek-incr", "nose-curve-convex",
    "mouth-scale-horiz-incr", "mouth-scale-horiz-decr", "mouth-lowerlip-volume-incr", "mouth-upperlip-volume-incr", "mouth-lowerlip-volume-decr", "mouth-cupidsbow-incr", "mouth-angles-down", "mouth-angles-up",
    "chin-width-incr", "chin-width-decr", "chin-prominent-incr", "chin-prominent-decr", "chin-height-incr", "chin-height-decr", "chin-cleft-incr", "chin-bones-incr",
    "l-cheek-bones-incr|r-cheek-bones-incr", "l-cheek-volume-incr|r-cheek-volume-incr", "l-cheek-volume-decr|r-cheek-volume-decr",
    "l-eye-scale-decr|r-eye-scale-decr", "l-eye-scale-incr|r-eye-scale-incr", "l-eye-bag-incr|r-eye-bag-incr", "l-eye-eyefold-down|r-eye-eyefold-down", "l-eye-corner2-up|r-eye-corner2-up", "l-eye-trans-in|r-eye-trans-in", "l-eye-trans-out|r-eye-trans-out",
    "eyebrows-trans-down", "eyebrows-angle-up", "eyebrows-angle-down", "head-oval", "head-square", "head-round", "head-rectangular", "head-diamond", "head-fat-incr", "head-fat-decr",
    "l-ear-scale-decr|r-ear-scale-decr", "l-ear-flap-decr|r-ear-flap-decr", "l-ear-lobe-incr|r-ear-lobe-incr", "forehead-temple-decr", "neck-double-incr"]
FACE_GROUPS = [   # one strong pick per feature so faces differ in nose, jaw, brow, eyes and mouth, not only in tone
    ["nose-hump-incr", "nose-width1-incr", "nose-width1-decr", "nose-point-up", "nose-scale-vert-incr", "nose-scale-vert-decr", "nose-volume-incr", "nose-greek-incr", "nose-curve-convex", "nose-flaring-incr"],
    ["chin-width-incr", "chin-width-decr", "chin-prominent-incr", "chin-prominent-decr", "head-square", "head-oval", "head-round", "head-rectangular", "head-diamond", "chin-height-incr"],
    ["eyebrows-trans-down", "eyebrows-trans-up", "eyebrows-angle-up", "eyebrows-angle-down", "forehead-temple-decr"],
    ["l-eye-scale-decr|r-eye-scale-decr", "l-eye-scale-incr|r-eye-scale-incr", "l-eye-eyefold-down|r-eye-eyefold-down", "l-eye-corner2-up|r-eye-corner2-up", "l-eye-trans-in|r-eye-trans-in", "l-eye-trans-out|r-eye-trans-out", "l-eye-height2-decr|r-eye-height2-decr", "l-eye-epicanthus-in|r-eye-epicanthus-in"],
    ["mouth-scale-horiz-incr", "mouth-scale-horiz-decr", "mouth-lowerlip-volume-incr", "mouth-upperlip-volume-incr", "mouth-lowerlip-volume-decr", "mouth-angles-down", "mouth-cupidsbow-incr"],
    ["l-cheek-bones-incr|r-cheek-bones-incr", "l-cheek-volume-incr|r-cheek-volume-incr", "l-cheek-volume-decr|r-cheek-volume-decr", "l-ear-scale-decr|r-ear-scale-decr", "l-ear-flap-decr|r-ear-flap-decr"]]
def face(seed, n=8, age=30):
    r = random.Random(seed); d = {}
    for grp in FACE_GROUPS:
        for t in r.choice(grp).split("|"): d[t] = round(r.uniform(0.45, 0.85), 2)
    for name in r.sample(FACE_POOL, n):
        w = round(r.uniform(0.15, 0.5), 2)
        for t in name.split("|"): d.setdefault(t, w)
    if age > 50: d["head-age-incr"] = round(min(0.9, (age - 45) / 40), 2); d["l-eye-bag-incr"] = d["r-eye-bag-incr"] = 0.35
    return d

def P(id, g, y, race, tone, build, place, garments, shoes, hair, **kw):
    """build: (muscle, weight, height, proportions[, cup, firm])"""
    m = {"gender": 1.0 if g == "m" else 0.0, "age": round(agev(y), 3), "muscle": build[0], "weight": build[1], "height": build[2], "proportions": build[3], "race": RACES[race]}
    if g == "f": m["cupsize"] = build[4] if len(build) > 4 else 0.5; m["firmness"] = build[5] if len(build) > 5 else 0.55
    s = {"id": id, "gender": g, "years": y, "race": race, "tone": tone, "macro": m, "skin": kw.pop("skin", skin_for(g, y, race)),
         "details": face(kw.pop("faceSeed", hs(id) & 0xffff), age=y), "place": place, "garments": garments, "shoes": shoes, "hair": hair,
         "brows": kw.pop("brows", "eyebrow00%d" % (1 + (hs(id + "b") % 7))), "lashes": kw.pop("lashes", "eyelashes0%d" % (1 + (hs(id + "l") & 3))),
         "eyes": kw.pop("eyes", "brown")}
    s.update(kw)
    return s

G = lambda type, color, fabric=None, **k: dict(type=type, color=color, fabric=fabric, **k)
H = lambda style, color, trim=None, **k: dict(style=style, color=color, trim=trim, **k)

SPECS = [
    # ---------------------------------------------------------------- the club (Velvet Undertow) and night life
    P("club_knitdress_f", "f", 27, "latino", "olive", (0.4, 0.42, 0.42, 0.62, 0.55, 0.65), ["nightlife"],
      [G("knit_dress", "#2b2a33", "rib", sleeve=0.55, hemLeg=0.42)], "heels_black", H("bun", "#1c130e"), makeup="evening", eyes="brown", poses=["walk_heels", "idle_f", "talk", "drink"]),
    P("club_bomber_m", "m", 33, "latino", "tan", (0.62, 0.5, 0.58, 0.6), ["nightlife", "street"],
      [G("henley", "#3b3734", "jersey", sleeve=1.95), G("bomber", "#2c3527", "nylon", outer=True, sleeve=1.97), G("jeans", "#27344a", "denim", fade=0.55)],
      "sneaker_white", H("short02", "#16100c", "fade"), hat=G("beanie", "#2e3e52", "knit"), beard="stubble", poses=["lean_cross", "cross_arms", "phone"]),
    P("club_slipdress_f", "f", 24, "black", "deep", (0.45, 0.38, 0.5, 0.65, 0.5, 0.7), ["nightlife"],
      [G("slip_dress", "#7a1c2c", "satin", hemLeg=0.35)], "heels_wine", H("afro01", "#120d0a"), makeup="evening", poses=["dance", "idle_f", "talk"]),
    P("club_printshirt_m", "m", 29, "black", "dark", (0.66, 0.45, 0.62, 0.62), ["nightlife", "street"],
      [G("camp", "#1d2b3a", "rayon", print="leaf_navy"), G("chinos", "#1a1a1c", "twill")], "dress_black", H("short04", "#0e0b09", "fade"), beard="goatee", poses=["dance", "talk", "drink"]),
    P("club_croptop_f", "f", 23, "asian", "light", (0.38, 0.32, 0.36, 0.6, 0.42, 0.6), ["nightlife"],
      [G("crop", "#e9e4dc", "jersey"), G("mini_skirt", "#151517", "leather", hemLeg=0.3)], "heels_black", H("long01", "#0f0c0b"), makeup="evening", poses=["dance", "phone", "talk"]),
    P("club_tee_m", "m", 26, "white", "light", (0.58, 0.42, 0.66, 0.6), ["nightlife", "street"],
      [G("tee", "#141416", "jersey"), G("jeans", "#1c1f26", "denim", fade=0.25)], "sneaker_white", H("short01", "#5a3f28"), poses=["dance", "talk", "drink"]),
    P("bartender_m", "m", 31, "latino", "olive", (0.6, 0.48, 0.55, 0.6), ["bar"],
      [G("rolled_shirt", "#ece9e2", "poplin"), G("vest", "#18181a", "suiting", outer=True), G("trousers", "#141416", "suiting")],
      "dress_black", H("short03", "#120d0a", "fade"), beard="full", poses=["bartend", "pour", "idle"]),
    P("bartender_f", "f", 28, "latino2", "brown", (0.42, 0.4, 0.45, 0.6, 0.48, 0.6), ["bar"],
      [G("rolled_shirt", "#151517", "poplin"), G("vest", "#2a1e26", "suiting", outer=True), G("trousers", "#121214", "suiting")],
      "dress_black", H("ponytail01", "#140e0b"), makeup="day", poses=["bartend", "pour", "idle_f"]),
    P("bartender_vest_m", "m", 42, "black", "dark", (0.62, 0.55, 0.6, 0.58), ["bar"],
      [G("dress_shirt", "#f2f0ea", "poplin"), G("vest", "#3a3d44", "suiting", outer=True), G("trousers", "#1a1b1e", "suiting")],
      "dress_black", H("short04", "#0e0b09", "fade"), beard="goatee", poses=["bartend", "shake", "pour"]),
    P("bouncer_m", "m", 38, "black", "dark", (0.85, 0.72, 0.72, 0.55), ["security"],
      [G("tee", "#101012", "jersey", text="STAFF"), G("cargo_pants", "#18191b", "twill")], "boots_black", H("none", "#0e0b09", "shaved"), beard="full", poses=["cross_arms", "idle"]),

    # ---------------------------------------------------------------- beach and the promenade
    P("beach_board_m", "m", 24, "black", "deep", (0.72, 0.36, 0.62, 0.65), ["beach"],
      [G("boardshorts", "#d25a3c", "poly", print="stripe_coral")], "flipflops", H("short04", "#0e0b09", "fade"), poses=["walk", "idle", "phone"]),
    P("beach_bikini_f", "f", 25, "latino", "tan", (0.42, 0.36, 0.45, 0.62, 0.55, 0.66), ["beach"],
      [G("bikini_top", "#2f8a86", "lycra"), G("bikini_bottom", "#2f8a86", "lycra")], "sandals", H("long01", "#3a2414"), poses=["walk_f", "idle_f", "phone"]),
    P("beach_tourist_m", "m", 47, "white", "fair", (0.42, 0.68, 0.55, 0.5), ["beach", "tourist"],
      [G("polo", "#9cc1de", "pique"), G("cargo_shorts", "#b5a385", "twill")], "sneaker_gray", H("short01", "#6b5a48"), hat=G("cap", "#f0ede6", "twill"), poses=["walk", "photo", "idle"]),
    P("beach_sundress_f", "f", 44, "white", "light", (0.36, 0.55, 0.42, 0.55, 0.62, 0.5), ["beach", "tourist"],
      [G("sundress", "#f2e6c8", "linen", print="floral_cream", hemLeg=1.05)], "sandals", H("bob02", "#8a6a3e"), makeup="day", poses=["walk_f", "photo", "idle_f"]),
    P("beach_retiree_m", "m", 68, "latino", "tan", (0.4, 0.62, 0.42, 0.5), ["beach", "street"],
      [G("guayabera", "#efe9da", "linen"), G("trousers", "#c8b894", "linen", fit=0.02)], "dress_brown", H("short03", "#b5b0a6"), beard="mustache", poses=["idle_old", "walk_old", "talk"]),
    P("beach_crop_f", "f", 21, "black", "dark", (0.5, 0.4, 0.4, 0.62, 0.5, 0.7), ["beach", "street"],
      [G("crop", "#f2c94c", "jersey"), G("shorts", "#4d6c95", "denim", fade=0.7)], "sandals", H("braid01", "#100b09"), poses=["walk_f", "phone", "talk"]),
    P("beach_tank_m", "m", 30, "asian", "light", (0.66, 0.34, 0.5, 0.62), ["beach", "sport"],
      [G("tank", "#f0ede6", "jersey"), G("boardshorts", "#2a3f6e", "poly", print="stripe_navy")], "flipflops", H("short02", "#100c0a"), poses=["walk", "idle", "volley"]),
    P("beach_elder_f", "f", 71, "white", "fair", (0.3, 0.55, 0.3, 0.45, 0.5, 0.35), ["beach", "street"],
      [G("tee", "#e6b3b5", "jersey"), G("shorts", "#f0ede6", "twill", legLen=0.95)], "sandals", H("bob01", "#cfcac0"), poses=["walk_old", "idle_old", "talk"]),
    P("beach_lifeguard_m", "m", 26, "latino2", "tan", (0.82, 0.32, 0.62, 0.66), ["beach"],
      [G("tank", "#d9432b", "jersey", text="RESCUE"), G("boardshorts", "#d9432b", "poly")], "flipflops", H("short04", "#140e0b", "fade"), poses=["cross_arms", "idle", "walk"]),

    # ---------------------------------------------------------------- street, tourists, joggers
    P("street_cap_m", "m", 22, "latino", "olive", (0.6, 0.38, 0.55, 0.6), ["street", "nightlife"],
      [G("tee", "#f0ede6", "jersey"), G("jeans", "#3c5277", "denim", fade=0.8)], "sneaker_white", H("short02", "#120d0a", "fade"), hat=G("cap", "#1f1f21", "twill"), poses=["walk", "phone", "talk"]),
    P("street_tank_f", "f", 30, "latino", "olive", (0.44, 0.48, 0.48, 0.6, 0.6, 0.6), ["street"],
      [G("tank", "#7aa58c", "rib"), G("jeans", "#2c3a54", "denim", fade=0.45, fit=0.004)], "sneaker_white", H("ponytail01", "#24170f"), makeup="day", poses=["walk_f", "phone", "talk"]),
    P("jogger_f", "f", 33, "white", "light", (0.62, 0.3, 0.5, 0.62, 0.42, 0.75), ["sport", "beach"],
      [G("sports_bra", "#1f1f21", "lycra"), G("leggings", "#2a2f3a", "lycra")], "sneaker_gray", H("ponytail01", "#5a3f28"), poses=["jog", "idle_f"]),
    P("jogger_m", "m", 41, "black", "dark", (0.72, 0.36, 0.6, 0.6), ["sport", "beach"],
      [G("tank", "#3b6fb6", "mesh"), G("run_shorts", "#1f1f21", "poly")], "sneaker_black", H("none", "#0e0b09", "shaved"), beard="stubble", poses=["jog", "idle"]),
    P("tourist_print_m", "m", 55, "white", "fair", (0.38, 0.75, 0.48, 0.45), ["tourist", "beach"],
      [G("camp", "#e8d78a", "rayon", print="hibiscus_sun"), G("cargo_shorts", "#8e9094", "twill")], "sandals", H("short03", "#a8a49b"), hat=G("cap", "#2a3442", "twill"), poses=["photo", "walk", "idle"]),
    P("tourist_couple_f", "f", 52, "asian", "light", (0.34, 0.45, 0.32, 0.5, 0.45, 0.45), ["tourist"],
      [G("rolled_shirt", "#cfe0ea", "linen"), G("chinos", "#e9e1cf", "twill")], "sneaker_white", H("bob01", "#181210"), poses=["photo", "walk_f", "idle_f"]),
    P("elder_m", "m", 74, "black", "dark", (0.36, 0.5, 0.45, 0.5), ["street"],
      [G("dress_shirt", "#d6c4a0", "poplin"), G("trousers", "#4a4036", "suiting")], "dress_brown", H("short01", "#c9c5bc"), beard="mustache", hat=G("cap", "#6e5a42", "tweed", flat=True), poses=["idle_old", "walk_old", "talk"]),
    P("elder_f", "f", 66, "latino", "tan", (0.3, 0.62, 0.38, 0.48, 0.7, 0.35), ["street"],
      [G("blouse", "#a95d3d", "rayon", print="dot_rust"), G("trousers", "#2a2622", "suiting")], "dress_black", H("bun", "#bab4aa"), makeup="day", poses=["idle_old", "walk_old", "talk"]),

    # ---------------------------------------------------------------- work
    P("cook_m", "m", 36, "latino2", "brown", (0.6, 0.62, 0.5, 0.55), ["kitchen", "work"],
      [G("chef", "#f3f1ec", "drill"), G("chef_pants", "#1e1f22", "twill", print="check_small"), G("apron", "#efece4", "canvas", outer=True)],
      "boots_black", H("short02", "#120d0a"), hat=G("beanie", "#141416", "knit", skull=True), beard="stubble", poses=["cook", "idle"]),
    P("waiter_f", "f", 24, "white", "light", (0.4, 0.4, 0.5, 0.6, 0.45, 0.6), ["bar", "work"],
      [G("polo", "#151517", "pique"), G("trousers", "#121214", "twill"), G("apron", "#1a1a1c", "canvas", outer=True, short=True)], "dress_black", H("ponytail01", "#7a5232"), makeup="day", poses=["carry_tray", "idle_f", "walk_f"]),
    P("builder_m", "m", 43, "latino", "tan", (0.75, 0.62, 0.55, 0.55), ["work", "port"],
      [G("tee", "#7d8187", "jersey"), G("hivis", "#d7f02a", "mesh", outer=True), G("cargo_pants", "#6a5a44", "canvas")], "boots_tan", H("short02", "#1c130e"), hat=G("cap", "#f0a020", "twill"), beard="full", poses=["idle", "walk", "cross_arms"]),
    P("dock_m", "m", 50, "white", "olive", (0.7, 0.66, 0.5, 0.52), ["work", "port"],
      [G("tee", "#efece6", "jersey"), G("overalls", "#3a5b8a", "denim", fade=0.6)], "boots_tan", H("short03", "#6b6058"), beard="full", poses=["idle", "walk", "cross_arms"]),
    P("courier_m", "m", 27, "black", "deep", (0.62, 0.36, 0.6, 0.62), ["work", "street"],
      [G("polo", "#2f8a86", "pique", text="SWIFTBOX"), G("shorts", "#1f2a3c", "twill")], "sneaker_black", H("short04", "#0e0b09", "fade"), hat=G("cap", "#2f8a86", "twill"), poses=["walk", "phone", "idle"]),

    # ---------------------------------------------------------------- office (Brickell, Downtown)
    P("office_suit_m", "m", 39, "white", "light", (0.55, 0.5, 0.62, 0.6), ["business"],
      [G("dress_shirt", "#f2f2f4", "poplin"), G("blazer", "#2a3042", "suiting", outer=True), G("trousers", "#2a3042", "suiting")], "dress_black", H("short01", "#3d2a1a"), poses=["phone", "walk", "talk"]),
    P("office_blouse_f", "f", 35, "latino", "olive", (0.4, 0.42, 0.5, 0.62, 0.55, 0.6), ["business"],
      [G("blouse", "#f0ede6", "silk"), G("pencil_skirt", "#2a2f3a", "suiting", hemLeg=0.95)], "heels_black", H("bob01", "#1c130e"), makeup="day", poses=["phone", "walk_heels", "talk"]),
    P("office_shirt_m", "m", 30, "asian", "light", (0.5, 0.4, 0.5, 0.6), ["business"],
      [G("dress_shirt", "#bcd3ea", "oxford"), G("chinos", "#3a3a3c", "twill")], "dress_brown", H("short02", "#0f0c0b"), poses=["phone", "walk", "talk"]),
    P("office_pants_f", "f", 42, "black", "dark", (0.42, 0.55, 0.52, 0.58, 0.6, 0.55), ["business"],
      [G("dress_shirt", "#d9e3d6", "silk"), G("trousers", "#141416", "suiting")], "heels_wine", H("braid01", "#100b09"), makeup="day", poses=["phone", "walk_heels", "talk"]),

    # ---------------------------------------------------------------- police (invented department insignia)
    P("police_m", "m", 37, "latino", "olive", (0.72, 0.55, 0.6, 0.58), ["police"],
      [G("police_shirt", "#1d2a45", "uniform"), G("trousers", "#151c2c", "uniform", stripe=True)], "boots_black", H("short02", "#120d0a", "fade"), hat=G("cap", "#151c2c", "twill", police=True), poses=["idle", "walk", "cross_arms"]),
    P("police_f", "f", 32, "black", "deep", (0.55, 0.45, 0.5, 0.58, 0.45, 0.6), ["police"],
      [G("police_shirt", "#1d2a45", "uniform"), G("trousers", "#151c2c", "uniform", stripe=True)], "boots_black", H("bun", "#100b09"), poses=["idle_f", "walk_f", "cross_arms"]),

    # ---------------------------------------------------------------- gangs (colors from src/gameplay/gangs/data.js)
    P("gang_garzas_m", "m", 25, "latino", "tan", (0.68, 0.42, 0.55, 0.6), ["gang_garzas", "street"],
      [G("tank", "#25c4b4", "rib"), G("jeans", "#d9d4c8", "denim", fade=0.2, undyed=True)], "sneaker_white", H("short04", "#100b09", "fade"), beard="goatee", chain=True, poses=["cross_arms", "lean_cross", "talk"]),
    P("gang_lyric_m", "m", 23, "black", "dark", (0.66, 0.4, 0.62, 0.62), ["gang_lyric", "street"],
      [G("tee", "#141414", "jersey", trim="#e3b23c"), G("cargo_pants", "#141414", "twill")], "sneaker_gold", H("braid01", "#0e0b09"), hat=G("cap", "#e3b23c", "twill"), chain=True, poses=["cross_arms", "lean_cross", "phone"]),
    P("gang_wolves_m", "m", 28, "white", "light", (0.6, 0.45, 0.6, 0.6), ["gang_wolves", "street"],
      [G("tee", "#202020", "jersey", print="splatter_magenta"), G("jeans", "#1c1f26", "denim", fade=0.3)], "sneaker_black", H("short01", "#2a1d14"), hat=G("beanie", "#e23d9a", "knit"), beard="stubble", poses=["cross_arms", "lean_cross", "talk"]),
]

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "npc_specs.json")
    for s in SPECS: s["details"] = {k: v for k, v in sorted(s["details"].items())}
    json.dump(SPECS, open(out, "w"), indent=1)
    print(len(SPECS), "archetypes ->", out)
