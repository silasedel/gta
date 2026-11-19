# Mission prop configs for convert_props.py. Paths are relative to Models/_Inbox (one folder per downloaded zip;
# nested archives unpacked into <zip>/source/x). Keys:
#   src     source model (.blend / .glb / .fbx / .obj / .dae)    gen   built from primitives instead (see GENERATORS)
#   keep    object-name regexes to keep (others dropped)          drop  object-name regexes to drop
#   dropmat material-name regex: objects using it are dropped    half  (axis, '<' | '>'): keep one of two copies
#   rot     euler degrees applied first                            len / height / scale: real size in meters
#   tris    triangle budget                                        tex   texture cap (px)
#   pbr     {material regex | '*': texture set}                    scrub {image regex: [[x0, y0, x1, y1], ...]}
#   tint    (image regex, rgb)                                     lod1  far-LOD triangles (props over 2 m)
#   desc / use / placement: copied into manifest.json
CFG = {
    # ---------------------------------------------------------------- drug packages (Ocean Smuggling, B1 / B2)
    "crate_wood": {
        "src": "wooden-crates/source/x/wooden_crates/wooden_crates.fbx",
        "keep": [r"^Box_01$"],
        "pbr": {"*": {
            "base": "wooden-crates/source/x/wooden_crates/textures/wooden_crates_Albedo.png",
            "normal": "wooden-crates/source/x/wooden_crates/textures/wooden_crates_Normal.png",
            "rough": "wooden-crates/source/x/wooden_crates/textures/wooden_crates_Roughness.png",
        }},
        "tris": 2000,
        "tex": 1024,
        "desc": "Long wooden shipping crate, clean planks.",
        "use": "Drug cargo crate on the smuggler's boat, the plane drop and the stash house.",
    },
    "crate_wood_small": {
        "src": "wooden-crates/source/x/wooden_crates/wooden_crates.fbx",
        "keep": [r"^Box_02$"],
        "pbr": {"*": {
            "base": "wooden-crates/source/x/wooden_crates/textures/wooden_crates_Albedo.png",
            "normal": "wooden-crates/source/x/wooden_crates/textures/wooden_crates_Normal.png",
            "rough": "wooden-crates/source/x/wooden_crates/textures/wooden_crates_Roughness.png",
        }},
        "tris": 2000,
        "tex": 1024,
        "desc": "Small wooden crate, clean planks.",
        "use": "Stackable cargo next to crate_wood; a carry-able crate.",
    },
    "crate_mossy": {
        "src": "mossy-wooden-crates/source/x/Wooden_Crates/Models/Boxes_Wooden.blend",
        "keep": [r"^Crate1$"],
        "pbr": {"*": {
            "base": "mossy-wooden-crates/textures/Wooden_Crates_2K_Albedo.png",
            "normal": "mossy-wooden-crates/textures/Wooden_Crates_2K_Normal.png",
            "rough": "mossy-wooden-crates/textures/Wooden_Crates_2K_Roughness.png",
        }},
        "tex": 1024,
        "desc": "Weathered, mossy wooden crate (closed).",
        "use": "Swamp shack and dock stash dressing; old cargo at the shipwreck.",
    },
    "crate_mossy_open": {
        "src": "mossy-wooden-crates/source/x/Wooden_Crates/Models/Boxes_Wooden.blend",
        "keep": [r"^Crate2_Open$"],
        "pbr": {"*": {
            "base": "mossy-wooden-crates/textures/Wooden_Crates_2K_Albedo.png",
            "normal": "mossy-wooden-crates/textures/Wooden_Crates_2K_Normal.png",
            "rough": "mossy-wooden-crates/textures/Wooden_Crates_2K_Roughness.png",
        }},
        "tex": 1024,
        "desc": "Weathered wooden crate with the lid off.",
        "use": "Opened stash crate (put packages inside); diving-job cargo pickup.",
    },
    "crate_mossy_boarded": {
        "src": "mossy-wooden-crates/source/x/Wooden_Crates/Models/Boxes_Wooden.blend",
        "keep": [r"^Crate3_Boarded$"],
        "pbr": {"*": {
            "base": "mossy-wooden-crates/textures/Wooden_Crates_2K_Albedo.png",
            "normal": "mossy-wooden-crates/textures/Wooden_Crates_2K_Normal.png",
            "rough": "mossy-wooden-crates/textures/Wooden_Crates_2K_Roughness.png",
        }},
        "tex": 1024,
        "desc": "Weathered wooden crate, boarded shut.",
        "use": "Sealed cargo at the swamp shack and on the wreck.",
    },
    "crate_cargo": {
        "src": "cargo-wooden-crates/source/Box.fbx",
        "scale": 0.8,
        "pbr": {
            r"1001": {
                "base": "cargo-wooden-crates/textures/Box.1001_albedo.png",
                "normal": "cargo-wooden-crates/textures/Box.1001_normal.png",
                "rough": "cargo-wooden-crates/textures/Box.1001_roughness.png",
            },
            r"1002": {
                "base": "cargo-wooden-crates/textures/Box.1002_albedo.png",
                "normal": "cargo-wooden-crates/textures/Box.1002_normal.png",
                "rough": "cargo-wooden-crates/textures/Box.1002_roughness.png",
            },
        },
        "tex": 1024,
        "desc": "Framed cargo crate, 0.8 m cube.",
        "use": "Pallet cargo on the marina dock and in the boat hold.",
    },
    "package_waterproof": {
        "gen": "package",
        "desc": "Tape-wrapped waterproof brick bundle (black plastic, tan tape), 46 x 32 x 20 cm.",
        "use": "The floating packages of the ocean drop (buoyant pickup); also stash loot.",
    },
    # ---------------------------------------------------------------- diving job (C3)
    "scuba_mask": {
        "src": "scuba-goggles-and-snorkel/source/goggles.blend",
        "tris": 6000,
        "tex": 1024,
        "pbr": {r"snorkel\.glass": {"color": (0.6, 0.75, 0.8), "roughness": 0.05, "alpha_value": 0.3}},
        "desc": "Dive mask with snorkel.",
        "use": "Worn by the player during the dive (head attachment); boat-deck pickup.",
    },
    "dive_tank": {
        "gen": "dive_tank",
        "desc": "Plain yellow aluminium scuba cylinder with valve, 0.76 m.",
        "use": "Back attachment during the dive; on the dive boat deck.",
    },
    "dive_fins": {
        "src": "flipper-v2/source/flipper v2.fbx",
        "len": 0.62,
        "tris": 3000,
        "pbr": {"*": {
            "base": "flipper-v2/textures/flipper_v2_Material__25_BaseColor.png",
            "normal": "flipper-v2/textures/flipper_v2_Material__25_Normal.png",
            "rough": "flipper-v2/textures/flipper_v2_Material__25_Roughness.png",
        }},
        "tex": 1024,
        "desc": "Pair of dive fins.",
        "use": "Feet attachment during the dive; dive boat deck dressing.",
    },
    "shipwreck": {
        "src": "shipwreck/source/shipwreack_Model_3m.fbx",
        "tris": 15000,
        "lod1": 2000,
        "lod_dist": 120,
        "tex": 2048,
        "pbr": {"*": {"base": "shipwreck/textures/shipwreack_Model_3m_u1_v1.jpg", "roughness": 0.9}},
        "desc": "Scanned sunken wooden wreck (hull and ribs), 27 m.",
        "use": "The Diving Job wreck on the sea floor; cargo crates go in and around the hull.",
    },
    # ---------------------------------------------------------------- navy
    "navy_destroyer": {
        "src": "uss-jack-h-lucas-ddg-125/source/x/Jack H. Lucas/Jack H. Lucas .obj",
        "rot": (-90, 0, 90),
        # the deck helicopters carry service roundels and unit codes: removed
        "dropfaces": r"^Mat_(6|7|8|9|10)$",
        "len": 155,
        "tris": 11000,
        "diffuse_only": True,
        "planar": True,
        "lod1": 2500,
        "lod_dist": 400,
        "tex": 2048,
        "scrub": {
            r"JackHLucas": [
                [0.54, 0.025, 0.63, 0.08],
                [0.385, 0.765, 0.48, 0.835],
                [0.51, 0.63, 0.65, 0.672],
                [0.37, 0.915, 0.43, 0.99],
            ]
        },
        "desc": "Guided-missile destroyer (hull numbers, name, crest and deck helicopters removed), 155 m.",
        "use": "Static ship at the naval pier.",
        "placement": "Naval pier near the air station; moor bow out, keep 60 m clear water around it.",
    },
    "navy_patrol": {
        "src": "uss-cyclone-war-thunder/source/x/USS_Cyclone.obj",
        "len": 55,
        "tris": 11000,
        "drop_thin": 0.12,
        "diffuse_only": True,
        "planar": True,
        "lod1": 2000,
        "lod_dist": 250,
        "tex": 2048,
        "drop": [r"flag"],
        "desc": "Coastal patrol ship (flag removed), 55 m.",
        "use": "Static ship at the naval pier; could patrol the bay later.",
        "placement": "Naval pier near the air station, alongside navy_destroyer.",
    },
    # ---------------------------------------------------------------- throwables and flares
    "grenade_frag": {
        "src": "mk2-grenade/source/x/model/model.FBX",
        "tris": 3000,
        "pbr": {"*": {
            "base": "mk2-grenade/textures/MK2_Granat_albedo.jpg",
            "normal": "mk2-grenade/textures/MK2_Granat_normal.jpg",
            "rough": "mk2-grenade/textures/MK2_Granat_roughness.jpg",
            "metal": "mk2-grenade/textures/MK2_Granat_metallic.jpg",
        }},
        "tex": 1024,
        "desc": "Pineapple fragmentation grenade.",
        "use": "Mesh for a later throwable (frag grenade).",
    },
    "grenade_flash": {
        "src": "flashbang-grenade/source/x/flashbang_lowpoly.fbx",
        "tris": 4000,
        "pbr": {"*": {
            "base": "flashbang-grenade/textures/flashbang_albedo.png",
            "normal": "flashbang-grenade/textures/flashbang_normal.png",
            "rough": "flashbang-grenade/textures/flashbang_roughness.png",
            "metal": "flashbang-grenade/textures/flashbang_metallness.png",
        }},
        "tex": 1024,
        "desc": "Stun grenade (flashbang).",
        "use": "Mesh for a later throwable (flashbang).",
    },
    "smoke_canister": {
        "src": "up-in-smoke/source/UpInSmoke.fbx",
        "band": ("x", 0.0, 0.2),
        # the label's maker logo, product name and barcode are painted out
        "scrub": {r"UpInSmoke": [[0.64, 0.06, 0.9, 0.22], [0.08, 0.08, 0.5, 0.5], [0.66, 0.8, 0.77, 0.96]]},
        "height": 0.2,
        "tris": 3000,
        "tex": 1024,
        "desc": "Green smoke canister (one of the five in the source).",
        "use": "Smoke throwable / signal smoke at the drop zone (pair with a particle plume).",
    },
    "flare_gun": {
        "src": "flare-gun/source/x/FlareGun.fbx",
        "keep": [r"^FlareGun_(Trigger|Hammer|Barrel|Frame)$"],
        "len": 0.25,
        "tris": 5000,
        "pbr": {"*": {
            "base": "flare-gun/textures/T_FlareGun_BaseColor.png",
            "normal": "flare-gun/textures/T_FlareGun_Normal.png",
            "rough": "flare-gun/textures/T_FlareGun_Roughness.png",
            "metal": "flare-gun/textures/T_FlareGun_Metallic.png",
        }},
        "tex": 1024,
        "desc": "Orange signal flare pistol.",
        "use": "The pilot's / player's flare gun that marks the drop zone.",
    },
    "flare_cartridge": {
        "src": "flare-gun/source/x/FlareGun.fbx",
        "keep": [r"^FlareGun_Long$"],
        "len": 0.12,
        "tris": 600,
        "pbr": {"*": {
            "base": "flare-gun/textures/T_FlareGun_BaseColor.png",
            "normal": "flare-gun/textures/T_FlareGun_Normal.png",
            "rough": "flare-gun/textures/T_FlareGun_Roughness.png",
        }},
        "tex": 512,
        "desc": "Flare gun cartridge.",
        "use": "Ammo pickup / loading close-up for the flare gun.",
    },
    "flare_marine": {
        "src": "flare/source/x/Flare.blend",
        "len": 0.3,
        "tex": 1024,
        "desc": "Handheld marine signal flare.",
        "use": "Lit and dropped at the drop zone (add a red point light + smoke particles).",
    },
    "road_flare": {
        "src": "road-flare/source/x/model/model.dae",
        "len": 0.3,
        "pbr": {"*": {
            "base": "road-flare/source/x/model/textures/lambert1_albedo.jpg",
            "normal": "road-flare/source/x/model/textures/lambert1_normal.png",
            "rough": "road-flare/source/x/model/textures/lambert1_roughness.jpg",
        }},
        "tex": 1024,
        "desc": "Red road flare (fusee).",
        "use": "Drop-zone marker on the water / beach; roadside props.",
    },
    # ---------------------------------------------------------------- hostage and swamp shack
    "zip_tie": {
        "src": "zip-tie/source/model.glb",
        "len": 0.2,
        "tris": 2500,
        "pbr": {"*": {"color": (0.05, 0.05, 0.05), "roughness": 0.5}},
        "desc": "Black nylon zip tie.",
        "use": "The captured associate's wrist bindings (hand attachment).",
    },
    "rope_coil": {
        "src": "hempen-rope-model/source/Rope.blend",
        "len": 0.45,
        "tris": 8000,
        "pbr": {"*": {
            "base": "hempen-rope-model/textures/SheetOfThreads_low_DefaultMaterial_BaseCol.png",
            "normal": "hempen-rope-model/textures/SheetOfThreads_low_DefaultMaterial_Normal.png",
            "rough": "hempen-rope-model/textures/SheetOfThreads_low_DefaultMaterial_Roughne.png",
        }},
        "tex": 1024,
        "desc": "Hemp rope.",
        "use": "The associate's bindings (chair / post); shack dressing.",
    },
    "rope_fence": {
        "src": "rope-fence/source/RopeFence.fbx.fbx",
        "height": 1.0,
        "pbr": {
            r"Post": {"base": "rope-fence/textures/Rope_Post1_D.png", "normal": "rope-fence/textures/Rope_Post1_N.png"},
            r"^Rope__": {"base": "rope-fence/textures/Rope_Rope_D.png", "normal": "rope-fence/textures/Rope_Rope_N.png"},
        },
        "tex": 1024,
        "desc": "Two wooden posts with a sagging rope (one fence span).",
        "use": "Swamp shack yard and dock edges; repeat along a path.",
    },
    "rope_bridge": {
        "src": "rope-bridge/source/maya2sketchfab.fbx",
        # the source is a little diorama: drop the stray Maya blocks and the two grass / dirt banks
        "drop": [r"^Cube$", r"^woodenplank[13]$", r"^pPlane[3-9]$", r"^pCube(1|2|22|23)$"],
        "len": 6,
        "tris": 9000,
        "pbr": {
            r"aiStandardSurface11": {"base": "rope-bridge/textures/WoodRough0046_1_download600.jpeg"},
            r"aiStandardSurface3": {"base": "rope-bridge/textures/newcartoonwood.jpeg"},
            r"aiStandardSurface14": {"base": "rope-bridge/textures/ropettry.jpeg"},
        },
        "tex": 1024,
        "desc": "Rope-and-plank footbridge.",
        "use": "Swamp shack walkway over a creek.",
    },
    "rope_ladder": {
        "src": "ladder-rope/source/ladder rope.fbx",
        "tris": 5000,
        "pbr": {"*": {
            "base": "ladder-rope/textures/BaseColor.png",
            "normal": "ladder-rope/textures/Normal.png",
            "rough": "ladder-rope/textures/Roughness.png",
        }},
        "tex": 1024,
        "desc": "Rope ladder with wooden rungs, 3.5 m.",
        "use": "Shack stilts / boat side ladder; climbing onto the wreck boat.",
    },
    # ---------------------------------------------------------------- phone
    "phone": {
        "src": "apple-iphone-17-63/source/Apple iPhone 17 6_3''.glb",
        "drop": [r"(?i)logo"],
        "half": ("x", "<"),
        "tris": 8000,
        "tex": 1024,
        "desc": "Generic smartphone (logo removed), 15 cm.",
        "use": "In-hand phone for the phone-call cutscenes.",
    },
    # ---------------------------------------------------------------- cash
    "briefcase": {
        "src": "briefcase/source/x/Briefcase.fbx",
        "len": 0.46,
        "tris": 8000,
        "tex": 1024,
        "desc": "Black leather briefcase with gold hardware (closed).",
        "use": "Carried payment case; the employer's desk.",
    },
    "cash_case_open": {
        "src": "briefcase-suitcase-low-poly-game-ready/source/x/Briefcase.fbx",
        "keep": [r"_Cash$"],
        "len": 0.46,
        "tex": 1024,
        "desc": "Open case full of cash.",
        "use": "The payment cutscene.",
    },
    "case_closed": {
        "src": "briefcase-suitcase-low-poly-game-ready/source/x/Briefcase.fbx",
        "keep": [r"^Closed_Empty$"],
        "len": 0.46,
        "tex": 1024,
        "desc": "Closed aluminium-style case.",
        "use": "Hand-off case before the payment cutscene opens it.",
    },
    "money_stack_20": {
        # built from the download's 20 dollar bill image; its own mesh is ~17k loose bill quads that will not decimate
        "gen": "cash_stack",
        "tex": 1024,
        "desc": "Eleven banded bundles of 20 dollar bills on three layers, 32 x 14 x 3.5 cm.",
        "use": "Table cash at the stash; pickup loot; payment close-ups.",
    },
    "cash_100": {
        "src": "100-dolllar-cash/source/Cash $100.glb",
        "rot": (0, 90, 0),
        "tris": 6000,
        "len": 0.17,
        "tex": 1024,
        "desc": "100 dollar bill bundles.",
        "use": "Payment close-ups; pickup loot.",
    },
    "cash_pile": {
        "src": "cash-pile-and-money-stacks/source/x/cashpile 4.fbx",
        "len": 0.6,
        "tex": 512,
        "desc": "Loose pile of cash with stacks.",
        "use": "Stash-house table, count-room dressing.",
    },
}
