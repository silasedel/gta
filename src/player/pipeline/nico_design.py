# Southline V2 — Nico, the protagonist: design spec (CHARACTER track).
# Original character: late 20s, Miami-born, mixed Cuban heritage. Lean swimmer's build, olive-tan skin,
# dark wavy hair (longer on top, tapered sides), light stubble, hazel eyes, a small scar through the left brow.
# Built from the MakeHuman / MPFB2 CC0 base mesh and modelling targets; every weight below is our own choice.
MACRO = {
    "gender": 1.0, "age": 0.58, "muscle": 0.90, "weight": 0.56, "proportions": 0.85, "height": 0.56,
    "cupsize": 0.5, "firmness": 0.5,
    "race": {"asian": 0.20, "caucasian": 0.62, "african": 0.18},
}
# body-change extremes (BIG_UPDATE 0a "Body changes"): same person, different macros; exported as morph targets
BODY_VARIANTS = {
    "fat":    {"weight": 0.86, "muscle": 0.60},      # game.player.body.fat = 1 (capped at runtime, subtle)
    "thin":   {"weight": 0.22, "muscle": 0.62},      # the slim end (exercise, under-eating)
    "muscle": {"weight": 0.47, "muscle": 0.97},      # gym
}
DETAILS = {
    # head and jaw: angular, defined jawline, slight chin cleft
    "head-square": 0.30, "head-oval": 0.30, "head-fat-decr": 0.45, "head-scale-horiz-decr": 0.14,
    "chin-bones-incr": 0.34, "chin-width-incr": 0.30, "chin-prominent-incr": 0.26, "chin-cleft-incr": 0.38, "chin-height-incr": 0.10,
    "l-cheek-bones-incr": 0.46, "r-cheek-bones-incr": 0.46, "l-cheek-volume-decr": 0.40, "r-cheek-volume-decr": 0.40,
    "l-cheek-inner-decr": 0.12, "r-cheek-inner-decr": 0.12,
    # nose: straight bridge with a light hump, slightly broad tip
    "nose-hump-incr": 0.32, "nose-greek-incr": 0.18, "nose-width2-incr": 0.14, "nose-width3-incr": 0.10, "nose-point-down": 0.16,
    "nose-scale-vert-incr": 0.10, "nose-volume-incr": 0.08,
    # eyes: deep-set, a little narrow, heavy lids
    "l-eye-height2-decr": 0.04, "r-eye-height2-decr": 0.04, "l-eye-scale-incr": 0.14, "r-eye-scale-incr": 0.14, "l-eye-push1-in": 0.25, "r-eye-push1-in": 0.25,
    "l-eye-eyefold-down": 0.28, "r-eye-eyefold-down": 0.28, "l-eye-corner2-up": 0.10, "r-eye-corner2-up": 0.10,
    "l-eye-bag-incr": 0.12, "r-eye-bag-incr": 0.12,
    # brows: low and fairly straight
    "eyebrows-trans-down": 0.48, "eyebrows-angle-down": 0.12, "eyebrows-trans-forward": 0.22, "forehead-temple-decr": 0.10,
    # mouth: wide, fuller lower lip
    "mouth-scale-horiz-incr": 0.16, "mouth-lowerlip-volume-incr": 0.30, "mouth-upperlip-volume-incr": 0.08, "mouth-cupidsbow-incr": 0.22,
    "mouth-angles-up": 0.08, "mouth-philtrum-volume-incr": 0.15,
    # ears, neck
    "l-ear-wing-decr": 0.25, "r-ear-wing-decr": 0.25, "l-ear-lobe-incr": 0.2, "r-ear-lobe-incr": 0.2,
    "measure-neck-circ-incr": 0.80,
    # torso and arms: swimmer's V, defined shoulders
    "torso-vshape-incr": 0.40, "measure-shoulder-dist-incr": 0.34, "torso-muscle-pectoral-incr": 0.55, "torso-muscle-dorsi-incr": 0.45,
    "l-upperarm-shoulder-muscle-incr": 0.55, "r-upperarm-shoulder-muscle-incr": 0.55, "l-lowerarm-muscle-incr": 0.85, "r-lowerarm-muscle-incr": 0.85, "l-upperarm-muscle-incr": 0.70, "r-upperarm-muscle-incr": 0.70,
    # pass 6 (ref_48 side view): real depth front to back, trapezius slope into a thick neck, heavier upper arms and thighs
    "torso-scale-depth-incr": 0.30, "neck-back-scale-depth-incr": 0.45, "measure-upperarm-circ-incr": 0.30,
    "l-upperleg-muscle-incr": 0.35, "r-upperleg-muscle-incr": 0.35,
    # pass 3 (natural proportions): longer neck, sloped rather than square shoulders, real-size hands and feet,
    # tapered wrists and ankles, defined calves, ears set a little closer to the head
    "measure-neck-height-incr": 0.0, "neck-scale-horiz-incr": 0.40, "neck-scale-depth-incr": 0.32, "torso-trans-down": 0.0,
    "measure-wrist-circ-decr": 0.12, "measure-ankle-circ-decr": 0.18,
    "l-hand-scale-incr": 0.16, "r-hand-scale-incr": 0.16, "l-hand-fingers-length-incr": 0.10, "r-hand-fingers-length-incr": 0.10,
    "l-foot-scale-incr": 0.10, "r-foot-scale-incr": 0.10,
    "l-lowerleg-muscle-incr": 0.40, "r-lowerleg-muscle-incr": 0.40, "measure-calf-circ-incr": 0.12,
    "l-ear-flap-decr": 0.18, "r-ear-flap-decr": 0.18, "l-ear-scale-decr": 0.06, "r-ear-scale-decr": 0.06,
    # asymmetry: real faces are not mirrored
    "asym-nose-2-l": 0.30, "asym-jaw-1-r": 0.22, "asym-brown-1-l": 0.25, "asym-mouth-1-r": 0.18, "asym-eye-3-l": 0.20,
}
SKIN = "young_caucasian_male"      # CC0 MakeHuman skin used as the painting base; regraded and detailed in nico_textures.py
HEIGHT_M = 1.80

# ---- head sculpt (pass 7): falloff brushes applied after the sliders, placed from facial landmarks.
# Each brush: (name, center, radius m, displacement m, mirror). Center = landmark key + offset (x, y, z) in meters,
# x = character's left, -y = forward, z = up. Landmarks: "eye" (mid-point of the eyes), "chin", "gonion" (jaw angle).
SCULPT = [
    ("brow ridge",      ("eye", (0.031, -0.008, 0.021)),  0.020, (0.0000, -0.0072, -0.0024), True),
    ("glabella",        ("eye", (0.0, -0.012, 0.016)),    0.014, (0.0000, -0.0048, 0.0000), False),
    ("cheekbone",       ("eye", (0.050, 0.004, -0.026)),  0.019, (0.0048, -0.0035, 0.0008), True),
    ("cheek hollow",    ("eye", (0.046, 0.006, -0.056)),  0.016, (-0.0040, 0.0016, 0.0000), True),
    ("jaw angle",       ("gonion", (0.0, 0.0, 0.0)),      0.026, (0.0088, 0.0000, -0.0056), True),
    ("jaw line",        ("gonion", (-0.028, -0.040, -0.010)), 0.020, (0.0056, -0.0016, -0.0040), True),
    ("chin corner",     ("chin", (0.016, 0.004, 0.006)),  0.014, (0.0056, -0.0024, -0.0024), True),
    ("chin front",      ("chin", (0.0, 0.0, 0.004)),      0.013, (0.0000, -0.0032, -0.0016), False),
    ("masseter",        ("gonion", (-0.012, -0.022, 0.018)), 0.024, (0.0045, 0.0, 0.0), True),
]
