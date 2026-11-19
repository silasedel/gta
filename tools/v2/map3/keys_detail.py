#!/usr/bin/env python
"""Key Largo detail: the user's aerial design (docs/v2/plan/keys_detail.webp, 1440 x 1092) -> tools/v2/map3/out/keys_detail.json,
consumed by tools/v2/map3/build_v3.py section "3b. Key Largo detail" (it replaces the main map inside `region`).

Everything visible in the image is digitized by hand in image pixels below (roads as control points of smooth curves,
docks, roof rectangles) and placed with tools/v2/map3/out/keys_fit.json (tools/v2/map3/keys_fit.py):
    world = R(rot) * (px, py) * mpp + (tx, tz),   x' = x cos - y sin,  z' = x sin + y cos.
The strip south-west of the image (not shown in it) continues in the same sparse style along the main map's strip shape.

Road styles (user, Nov 16):
  - the wide gray road with the center line: the Overseas Highway, concrete, one lane each way (the NE branch over the
    bridge is the same road style: Card Sound Road);
  - every smaller road: a simple PAVED neighborhood street, worn sun-faded asphalt ~6.5 m, no curbs, no sidewalks, no
    lane markings, sandy/grassy crumbling shoulders (`style: 'keys_lane'`).
Nico's house (the circled house) is the nicoHouse set piece: house frame +Z = street side (lot to z = +27), -Z = the bay
(seawall z = -14.2, dock to -27.5) and +X = the cove (seawall x = 11.4). Its street is the lane east of it.

Run:  tools/world/.venv/bin/python tools/v2/map3/keys_detail.py [--sheet docs/v2/shots/stage1/KEYS_overlay.png]
"""
import json, math, os, sys, random
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, mapping, shape, box
from shapely.ops import unary_union, nearest_points, split
from shapely import affinity
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(HERE, 'out')
IMG = os.path.join(ROOT, 'docs', 'v2', 'plan', 'keys_detail.webp')
S_MAIN, OX, OY = 11.0, 700.0, 800.0          # main map frame: x = (px - 700) * 11, z = (py - 800) * 11

ROADS_PX = {   # name: control points (image px); junctions share a control point exactly (resolved in snap_px)
    'hwN': [(785.5, 230), (793, 250), (800.1, 272.8), (811.7, 300.8), (815.6, 309.7), (821, 320), (831, 350), (840.2, 377.9), (842, 381.3), (848.1, 400.6), (853, 420.4), (859, 444.9), (861, 470.1), (858, 500.5)],
    'hwNE': [(1161.4, 2.1), (1141, 50), (1105, 100), (1086.4, 125.2), (1067.1, 151.4), (1033.7, 201.1), (1003.9, 252.2), (986.8, 280.5), (967.3, 307), (942.5, 330), (924.4, 356.6), (910.1, 374.3), (898, 395.2), (887, 419.8), (879, 442.5), (866.5, 470), (858, 500.5)],
    'hwS': [(858, 500.5), (848.8, 524.9), (839.2, 538.9), (826.7, 550), (810, 560), (793.9, 566.9), (767.4, 575.7), (747.8, 582.1), (721.2, 590), (692.5, 601.2), (677.9, 608.8), (665, 618.9), (648, 640.1), (636.8, 664), (628.1, 692.6), (618.3, 724.3), (609.4, 756.3), (600.6, 784.8), (592, 810.7), (579.2, 832.9), (560.3, 854), (538.5, 875.1), (515.3, 895.8), (488.6, 918.1), (462.7, 939.6), (436.8, 960.2), (403.9, 985.2), (373, 1007), (341.7, 1027.5), (307.5, 1048), (275.1, 1069.7), (240, 1086.7), (230, 1092)],
    'neSpur': [(1033, 88), (1060, 105), (1083, 123)],
    'e1': [(817.5, 309), (835, 304), (850, 304.5), (865, 310), (880, 320), (890, 330), (895, 345), (906, 362.5), (908, 373), (916, 392.5), (921, 412.5), (925, 430), (922.5, 434), (912.5, 445), (904, 455), (897.5, 470), (896, 485), (900, 500)],
    'e1cul': [(900, 500), (915, 502.5), (935, 500), (937.5, 495)],
    'e3': [(900, 500), (892.5, 525), (882.5, 542.5), (867.5, 557.5), (850, 572.5), (840, 580), (820, 597), (780, 621), (750, 655), (728, 700), (717, 728.6), (706, 768), (699, 800), (692, 828.6), (684, 845), (665, 865), (647.5, 885), (627.5, 900), (612.5, 912.5), (600, 925), (582.5, 940), (565, 955), (550, 970), (540, 980), (513, 1003), (483, 1027), (450, 1050), (416.7, 1073), (393, 1092)],
    'w1': [(759.5, 335), (762.5, 326), (782.5, 320), (787.5, 330), (795, 355), (805, 380), (810, 385), (813, 395), (815, 420), (816, 445), (815, 470), (812.5, 488), (810, 507), (797, 520), (783, 527), (767, 529), (753, 520), (747, 507), (743, 487), (745, 475), (748, 468)],
    'w1L': [(759.5, 335), (763, 350), (765, 370), (767, 385), (772, 398), (776, 410), (778, 425), (778, 440), (775, 450), (771, 453)],
    's1': [(810, 385), (826, 382), (843, 381)],
    'd1': [(847, 524), (830, 507.5), (812.5, 488), (792.5, 470), (771, 453), (760, 461), (748, 468)],
    'rn1': [(748, 468), (730, 472), (713, 476), (695, 480), (680, 484), (667, 492), (659, 503), (657, 515), (659, 528), (664, 542), (670, 556), (676, 566), (683, 581), (691, 598)],
    'rw2': [(676, 566), (647, 567), (623, 572), (613, 577), (600, 587), (593, 597), (580, 608), (571, 616), (564, 627)],
    'wl': [(564, 627), (559, 650), (554, 665), (547.5, 685), (541, 700), (534, 717.5), (526, 735), (517.5, 752.5), (510, 767.5), (507.5, 777.5), (511, 790), (506, 802), (491, 818), (470, 833), (445.5, 851), (427, 866), (416.7, 879.7), (397, 893), (379, 908.5), (360.6, 923.6), (342, 942), (333, 947), (306.7, 963), (280, 979), (265.5, 1004), (243, 1017), (221, 1029), (203, 1040), (183, 1051), (165.5, 1062), (150, 1071), (132, 1084.5), (122, 1092)],
    'c2': [(636.8, 664), (615, 672.5), (597.5, 680), (581, 680.5)],
    'wb1': [(416.7, 879.7), (427, 896), (442, 914.5), (452, 928), (460, 936)],
    'x3': [(460, 936), (467, 950), (486.7, 976.7), (500, 993), (513, 1003)],
    'x2': [(280, 979), (291, 1003), (300, 1025), (306.7, 1046.7), (323, 1062), (337, 1087)],
    'rn1loop': [(675, 486), (675, 470), (685, 464), (695, 465), (705, 476)],
    'rw2b': [(613, 577), (600, 570), (594, 566)],
}
PIERS_PX = [
    [(704, 336.7), (733, 331.7)],   # pN1
    [(718, 346.7), (731.7, 345.3)],   # pN2
    [(514, 611), (534, 620)],   # pW1
    [(507, 624), (520, 626)],   # pW2
    [(463, 710), (494, 717.5)],   # pW3
    [(468.6, 730), (488.6, 733)],   # pW4
    [(440, 753), (471, 751.4)],   # pW5
    [(443, 768), (469, 769)],   # pW6
    [(441.4, 761), (445.7, 773)],   # pW6b
    [(403, 810), (420, 806), (437, 804)],   # pW7
    [(440, 790), (454, 804)],   # pW8
    [(388.6, 818.6), (414, 836)],   # pW9
    [(371, 833), (397, 847)],   # pW10
    [(296.7, 883.3), (308, 896.7)],   # pS1
    [(270, 898), (288, 925)],   # pS2
    [(291.7, 908), (300, 918)],   # pS3
    [(251.7, 930), (263, 943)],   # pS4
    [(213, 941.7), (240, 966.7)],   # pS5
    [(193, 951.7), (208, 968)],   # pS6
    [(181.7, 966.7), (206.7, 993)],   # pS7
    [(121.7, 1013), (141.7, 1028)],   # pS8
    [(70, 1033), (73, 1060), (86.7, 1066.7)],   # pS9
    [(90, 1036.7), (100, 1056.7)],   # pS10
]
ROOFS_PX = [   # oriented roof rectangles fitted to the roof blobs (image px), reviewed by hand
    [[891.5,325.0],[900.5,311.5],[884.5,301.0],[875.5,314.5]],
    [[744.5,329.0],[742.0,315.0],[731.0,317.0],[733.5,330.5]],
    [[804.0,342.5],[809.5,356.0],[821.5,351.5],[816.0,338.0]],
    [[733.0,362.0],[745.0,362.0],[745.0,351.0],[733.0,351.0]],
    [[871.5,399.5],[883.5,360.0],[861.5,353.5],[850.0,393.0]],
    [[807.5,366.0],[819.0,383.0],[832.0,374.0],[821.0,357.0]],
    [[916.0,368.0],[924.5,393.0],[938.5,388.0],[930.5,363.0]],
    [[738.0,382.5],[749.5,381.0],[748.0,370.5],[736.5,372.5]],
    [[789.0,389.0],[789.0,402.0],[803.0,402.0],[803.0,389.0]],
    [[830.5,388.5],[822.5,396.5],[832.0,406.0],[840.0,398.0]],
    [[740.0,391.0],[740.0,398.0],[749.0,398.0],[749.0,391.0]],
    [[932.0,409.0],[936.0,426.0],[949.5,422.5],[945.0,405.5]],
    [[821.5,423.0],[834.0,421.5],[832.0,408.5],[820.0,410.0]],
    [[897.5,428.0],[904.0,444.5],[914.5,440.5],[908.0,424.0]],
    [[823.0,435.0],[823.0,456.0],[834.0,456.0],[834.0,435.0]],
    [[949.5,439.0],[938.5,434.0],[934.0,443.0],[945.0,448.5]],
    [[793.0,447.0],[797.0,443.0],[792.0,438.0],[788.0,442.0]],
    [[779.5,455.5],[784.5,450.5],[780.0,446.0],[775.0,451.0]],
    [[929.5,460.5],[934.5,455.5],[930.0,451.0],[925.0,456.0]],
    [[912.0,454.0],[908.0,458.0],[912.0,462.0],[916.0,458.0]],
    [[794.0,460.0],[790.0,464.0],[793.5,467.5],[797.5,463.5]],
    [[822.0,465.0],[822.0,494.0],[835.0,494.0],[835.0,465.0]],
    [[684.0,468.0],[677.0,471.5],[681.0,480.5],[688.5,477.0]],
    [[760.5,469.0],[751.5,476.0],[757.0,482.5],[766.0,475.5]],
    [[637.5,473.0],[649.5,503.5],[666.5,497.0],[655.0,466.5]],
    [[805.0,471.0],[801.0,475.0],[808.5,482.5],[812.5,478.5]],
    [[909.0,473.0],[909.0,483.0],[923.0,483.0],[923.0,473.0]],
    [[714.0,502.5],[706.5,479.5],[695.0,483.5],[702.5,506.0]],
    [[711.0,488.0],[711.0,496.0],[717.0,496.0],[717.0,488.0]],
    [[873.0,497.0],[869.0,503.5],[874.0,507.0],[878.5,500.5]],
    [[644.5,514.0],[657.0,509.0],[652.5,498.0],[640.0,503.5]],
    [[684.5,510.5],[677.5,512.5],[680.5,524.0],[687.5,522.0]],
    [[873.5,514.5],[869.0,519.0],[873.5,523.5],[878.0,519.0]],
    [[625.5,534.5],[634.5,556.5],[645.5,552.0],[636.5,530.5]],
    [[585.0,533.0],[585.0,562.0],[603.0,562.0],[603.0,533.0]],
    [[798.0,580.0],[747.0,599.0],[755.0,620.0],[806.0,601.0]],
    [[555.5,624.0],[544.0,618.5],[539.0,628.5],[550.5,634.0]],
    [[701.0,641.5],[710.5,636.0],[705.0,626.5],[695.0,632.0]],
    [[578.0,638.0],[583.0,643.0],[588.5,637.5],[583.5,632.5]],
    [[535.0,635.5],[529.5,647.0],[541.0,652.5],[546.5,641.0]],
    [[674.5,648.5],[680.0,657.5],[690.0,652.0],[684.5,642.5]],
    [[569.0,645.0],[559.0,655.0],[568.5,664.5],[578.5,654.5]],
    [[534.0,669.0],[541.5,656.0],[529.0,649.0],[521.5,662.0]],
    [[775.5,661.0],[782.5,673.5],[790.0,669.0],[783.0,656.5]],
    [[594.5,658.5],[585.5,667.5],[592.0,674.0],[601.0,665.0]],
    [[662.5,669.0],[668.0,680.5],[680.0,674.5],[674.0,663.5]],
    [[525.5,672.0],[519.5,684.0],[532.0,690.5],[538.0,678.5]],
    [[573.0,675.0],[573.0,686.0],[581.0,686.0],[581.0,675.0]],
    [[672.5,705.5],[666.5,695.0],[657.5,700.0],[663.5,710.5]],
    [[579.0,698.0],[574.5,702.5],[579.0,707.0],[583.5,702.5]],
    [[523.5,710.5],[511.5,703.5],[506.0,713.5],[517.5,720.0]],
    [[655.5,724.0],[661.5,736.0],[671.5,731.0],[665.5,719.0]],
    [[502.5,720.5],[495.5,730.5],[507.5,738.5],[514.0,728.5]],
    [[501.5,749.0],[490.0,742.5],[484.0,753.0],[495.5,759.5]],
    [[567.0,775.5],[570.5,749.0],[549.0,746.0],[546.0,773.0]],
    [[643.5,758.0],[633.0,763.5],[639.5,776.0],[650.0,770.5]],
    [[473.5,767.5],[486.0,775.5],[492.0,767.0],[479.5,758.5]],
    [[477.0,792.0],[484.0,802.0],[490.0,798.0],[483.5,787.5]],
    [[625.5,795.0],[614.5,800.0],[621.0,812.5],[631.5,807.0]],
    [[471.0,801.0],[462.5,808.0],[472.0,819.0],[480.0,812.5]],
    [[514.5,823.5],[506.0,814.0],[498.0,821.0],[506.5,831.0]],
    [[443.0,826.0],[451.5,837.0],[461.0,830.5],[452.5,819.0]],
    [[604.5,843.5],[614.5,837.5],[607.5,826.0],[597.5,832.0]],
    [[479.0,839.0],[487.5,850.0],[496.5,843.0],[488.0,832.0]],
    [[430.0,837.0],[422.0,845.0],[431.5,854.5],[439.5,846.5]],
    [[464.5,868.5],[473.5,862.0],[465.5,850.5],[456.5,857.0]],
    [[399.0,860.0],[406.5,873.0],[416.5,866.5],[408.5,854.0]],
    [[594.0,875.0],[587.0,861.0],[573.5,868.0],[580.5,882.0]],
    [[439.5,887.0],[448.5,880.0],[441.0,870.0],[432.0,877.0]],
    [[378.0,889.5],[388.5,883.5],[382.0,872.0],[371.5,877.5]],
    [[465.5,910.0],[481.0,898.0],[469.5,883.5],[454.0,896.0]],
    [[542.0,899.0],[548.0,910.5],[557.5,906.0],[551.5,894.0]],
    [[502.5,967.5],[543.5,931.0],[530.0,916.0],[489.0,953.0]],
    [[289.5,964.0],[324.0,939.0],[312.0,922.0],[277.0,946.5]],
    [[383.5,924.5],[372.0,941.0],[388.0,951.5],[399.0,935.0]],
    [[382.5,947.5],[367.5,958.5],[374.0,967.5],[389.0,956.5]],
    [[246.0,979.5],[254.5,994.0],[269.5,985.5],[260.5,970.5]],
    [[465.0,990.0],[452.0,977.0],[437.5,991.5],[450.5,1004.5]],
    [[223.0,1018.0],[237.0,1007.0],[229.5,997.5],[215.5,1008.5]],
    [[530.5,1002.5],[522.0,1011.0],[528.5,1017.5],[537.0,1009.0]],
    [[317.5,1018.0],[310.0,1006.5],[301.0,1012.0],[309.0,1024.0]],
    [[409.5,1034.0],[423.0,1025.0],[412.5,1009.5],[399.0,1018.5]],
    [[200.0,1029.5],[214.0,1022.5],[208.5,1011.0],[194.5,1018.0]],
    [[508.5,1023.5],[514.0,1030.5],[524.5,1023.0],[519.0,1015.5]],
    [[161.5,1021.5],[128.5,1054.5],[141.5,1067.5],[174.5,1034.5]],
    [[495.0,1047.0],[508.5,1037.0],[501.5,1028.0],[488.5,1038.0]],
    [[241.0,1065.0],[228.0,1038.5],[211.5,1047.0],[224.5,1073.0]],
    [[344.0,1056.0],[328.5,1066.5],[337.5,1080.0],[353.0,1069.5]],
    [[92.0,1065.0],[97.5,1093.5],[118.0,1089.5],[112.5,1061.0]],
    [[451.5,1078.0],[461.5,1071.0],[456.5,1064.0],[446.5,1071.0]],
    [[378.0,1085.0],[392.5,1074.0],[385.5,1065.0],[371.0,1075.5]],
    [[436.0,1078.5],[424.5,1088.5],[430.5,1095.5],[442.0,1085.5]],
    [[779.5,336.5],[791.0,365.5],[780.5,369.5],[769.0,340.5]],
]

# ---------------------------------------------------------------------------------------------------------------- frame
FIT = json.load(open(os.path.join(OUT, 'keys_fit.json')))
MPP, ROT, TX, TZ = FIT['mpp'], FIT['rot'], FIT['tx'], FIT['tz']
_C, _S = math.cos(ROT), math.sin(ROT)
IW, IH = 1440, 1092


def I2W(x, y):
    return ((x * _C - y * _S) * MPP + TX, (x * _S + y * _C) * MPP + TZ)


def W2I(X, Z):
    u, v = (X - TX) / MPP, (Z - TZ) / MPP
    return (u * _C + v * _S, -u * _S + v * _C)


def wpts(pts):
    return [I2W(*p) for p in pts]


FRAME = Polygon(wpts([(0, 0), (IW, 0), (IW, IH), (0, IH)]))

# ---------------------------------------------------------------------------------------------------------------- roads
HIGHWAY = {'hwN': 'Overseas Highway', 'hwS': 'Overseas Highway', 'hwNE': 'Card Sound Road'}
LANE_NAME = {'w1': 'Pelican Point Ln', 'w1L': 'Pelican Point Ln', 'd1': 'Mahogany Dr', 'rn1': 'Tarpon Basin Dr', 'rn1loop': 'Tarpon Basin Dr',
             'rw2': 'Bonefish Ln', 'rw2b': 'Bonefish Ln', 'wl': 'Coconut Row', 'c2': 'Sea Grape Ln', 'e1': 'Ocean Bay Dr', 'e1cul': 'Conch Ave',
             'e3': 'Seashell Ln', 's1': 'Dove Ln', 'wb1': 'Barracuda Ln', 'x3': 'Barracuda Ln', 'x2': 'Grouper St', 'neSpur': 'Sponge Ln'}


def snap_px(roads):
    """Junctions: every lane end (and every lane vertex that crosses another road) lands exactly on a control point of the
    road it meets; highways keep their points, lanes adapt (a point is inserted into the other road where needed)."""
    roads = {k: [tuple(map(float, p)) for p in v] for k, v in roads.items()}
    order = sorted(roads, key=lambda k: (k not in HIGHWAY, k))
    for k in order:
        if k in HIGHWAY: continue
        pts = roads[k]
        for idx in range(len(pts)):
            p = pts[idx]; end = idx in (0, len(pts) - 1)
            best = None
            for o in order:
                if o == k: continue
                ln = LineString(roads[o]); d = ln.distance(Point(p))
                if d < (6.0 if end else 2.5) and (best is None or d < best[0]): best = (d, o)
            if best is None: continue
            o = best[1]; op = roads[o]
            dv = [math.dist(p, q) for q in op]; j = int(np.argmin(dv))
            if dv[j] < 3.5:
                pts[idx] = op[j]; continue
            ln = LineString(op); s = ln.project(Point(p)); q = ln.interpolate(s); q = (round(q.x, 2), round(q.y, 2))
            acc = 0.0
            for i in range(len(op) - 1):
                seg = math.dist(op[i], op[i + 1])
                if acc + seg >= s:
                    op.insert(i + 1, q); break
                acc += seg
            pts[idx] = q
    return roads


def catmull(pts, step=4.0):
    """Centripetal Catmull-Rom through the control points (every control point stays on the curve: junctions hold)."""
    P = [np.array(p, float) for p in pts]
    if len(P) < 3: return [tuple(p) for p in P]
    out = [tuple(P[0])]
    def get(i): return P[0] + (P[0] - P[1]) if i < 0 else P[-1] + (P[-1] - P[-2]) if i >= len(P) else P[i]
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = get(i - 1), get(i), get(i + 1), get(i + 2)
        def tj(ti, a, b): return ti + max(np.linalg.norm(b - a), 1e-6) ** 0.5
        t0 = 0.0; t1 = tj(t0, p0, p1); t2 = tj(t1, p1, p2); t3 = tj(t2, p2, p3)
        n = max(1, int(math.ceil(np.linalg.norm(p2 - p1) / step)))
        for k in range(1, n + 1):
            t = t1 + (t2 - t1) * k / n
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            c = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2
            out.append(tuple(p2) if k == n else tuple(c))
    return out


def road_rec(pts_w, name, cls):
    pts = [[round(x, 2), round(z, 2)] for x, z in pts_w]
    if cls == 'hw':
        return dict(pts=pts, kind='trunk', surface='concrete', lanes=1, width=11.0, name=name, speedKmh=72)
    return dict(pts=pts, kind='residential', surface='asphalt', style='keys_lane', lanes=1, width=6.5, name=name, speedKmh=40)

# ---------------------------------------------------------------------------------------------------------------- land


def water_mask(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    w = (b - r > 18) & (b > 0.78 * g)            # deep blue and turquoise shallows; vegetation / sand / roofs are not
    return ndimage.gaussian_filter(w.astype(np.float32), 2.0) > 0.5


def image_land():
    """Island + islet rings (world) from the image's land mask, smoothed, simplified ~1 m. Islands cut by the image border
    are dropped except the main island and the north-east islet (they continue outside the image on purpose)."""
    from skimage import measure
    rgb = np.asarray(Image.open(IMG).convert('RGB')).astype(np.float32)
    land = ~water_mask(rgb)
    land = ndimage.binary_opening(land, iterations=2)           # docks and boats in the shallows are not land
    lab, n = ndimage.label(land)
    sz = np.bincount(lab.ravel()); sz[0] = 0
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    keep = np.zeros(n + 1, bool)
    for i in range(1, n + 1):
        if sz[i] < 120: continue
        if i in border and sz[i] < 20000: continue
        keep[i] = True
    m = keep[lab]
    f = ndimage.gaussian_filter(np.pad(m.astype(np.float32), 3), 1.3)
    polys = []
    for c in measure.find_contours(f, 0.5):
        if len(c) < 6: continue
        p = Polygon([I2W(x - 3, y - 3) for y, x in c]).buffer(0)
        if p.area > 40: polys.append(p)
    polys.sort(key=lambda p: -p.area)
    acc = Polygon()
    for p in polys: acc = acc.symmetric_difference(p)
    return acc.buffer(0).intersection(FRAME).simplify(0.9)


def load_main():
    """Main-map land and roads around the strip from a build WITHOUT the Keys detail (cached: later builds contain it)."""
    cache = os.path.join(OUT, 'keys_main_cache.json')
    if os.path.exists(cache):
        c = json.load(open(cache)); c['land'] = shape(c['land']); return c
    f = json.load(open(os.path.join(OUT, 'world', 'features.json')))
    if any(abs(r.get('width', 0) - 6.5) < 0.05 for r in f['roads']):
        sys.exit('features.json already contains the Keys detail and there is no keys_main_cache.json: build once without keys_detail.json')
    B = box(-2700, 3900, 400, 6800)
    land = unary_union([Polygon(l['outer'], l['holes']).buffer(0) for l in f['land']]).intersection(B)
    roads = [dict(id=r['id'], kind=r['kind'], name=r['name'], pts=[[round(x, 2), round(z, 2)] for x, z in r['pts']])
             for r in f['roads'] if LineString(r['pts']).intersects(B)]
    json.dump(dict(land=mapping(land.simplify(0.5)), roads=roads), open(cache, 'w'), separators=(',', ':'))
    return dict(land=land, roads=roads)

# ---------------------------------------------------------------------------------------------------------------- region
# North / NE / east: drawn by hand around the image's island, islets and the strip's north-east corner (world m). It
# crosses the Overseas Highway from Florida City in the narrow channel north of the island (the stub outside is kept by
# the hook and meets our highway there) and leaves out the land the highway comes down on and the upper-Keys land to the
# north-east (both stay as the main map has them). South-west: the main map's strip outside the image, 110 m out.
REGION_N = [(-1240, 4760), (-1060, 4660), (-1000, 4565), (-950, 4503), (-878, 4488), (-800, 4455), (-770, 4392), (-470, 4340),
            (-462, 4800), (-520, 5000), (-600, 5200), (-700, 5380), (-800, 5450), (-1520, 5560), (-1540, 5460), (-1460, 5300),
            (-1380, 5100), (-1300, 4920)]
STRIP_CUT = [(-1600, 5380), (-790, 5380), (-790, 5600), (-1200, 6000), (-1700, 6450), (-1985, 6345), (-2075, 6215), (-2150, 6100)]   # the strip SW of the image
SW_TIP_CUT = [(-2060, 6230), (-1975, 6330)]        # the region's end across the highway to Marathon, over water
KEEP_N = [(-1010, 4485), (-900, 4470), (-835, 4600), (-850, 4665), (-925, 4668)]      # main-map land kept: the neck the highway comes down on
KEEP_NE = [(-690, 4320), (-455, 4320), (-455, 4790), (-650, 4790)]                    # main-map upper-Keys land inside the region
JOIN_NE = (-231.0, 4345.0)        # main map: start of the road on the upper-Keys land (features r6553) the NE branch continues into


def merged_line(roads, ids):
    pts = []
    for i in ids:
        p = next(r['pts'] for r in roads if r['id'] == i)
        pts += p if not pts else p[1:]
    return LineString(pts)


def build_region(main):
    land = main['land']
    strip = land.intersection(Polygon(STRIP_CUT)).difference(FRAME.buffer(-1))
    strip = max([g for g in getattr(strip, 'geoms', [strip]) if g.geom_type == 'Polygon'], key=lambda g: g.area)
    sw = strip.buffer(110, join_style=1)
    a, b = SW_TIP_CUT
    ux, uz = b[0] - a[0], b[1] - a[1]; L = math.hypot(ux, uz); nx_, nz_ = -uz / L, ux / L      # normal toward the SW (Marathon)
    cut = Polygon([a, b, (b[0] + nx_ * 900, b[1] + nz_ * 900), (a[0] + nx_ * 900, a[1] + nz_ * 900)])
    sw = sw.difference(cut)
    reg = unary_union([Polygon(REGION_N), sw]).buffer(20).buffer(-20)
    reg = max([g for g in getattr(reg, 'geoms', [reg])], key=lambda g: g.area)
    return Polygon(reg.exterior).simplify(2.0), strip


def crossing(region, line, near):
    x = region.exterior.intersection(line)
    pts = [g for g in getattr(x, 'geoms', [x]) if g.geom_type == 'Point']
    p = min(pts, key=lambda g: g.distance(Point(near)))
    return (round(p.x, 2), round(p.y, 2))

# ---------------------------------------------------------------------------------------------------------------- SW extension


def smooth01(x):
    x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)


def extension(main, region, strip, img_land, hw_exit):
    """Land and street layout for the part of the strip the image does not show: the image's island cross-section blends
    into the main map's strip over ~350 m, then follows it to the tip. Returns (land, profile(t) -> (C, n, a, b), t range)."""
    tip = (-1960.0, 6250.0)
    ux, uz = tip[0] - hw_exit[0], tip[1] - hw_exit[1]; L = math.hypot(ux, uz); u = (ux / L, uz / L); n = (u[1], -u[0])   # n: toward the SE (ocean)
    island = max([g for g in getattr(img_land, 'geoms', [img_land]) if g.geom_type == 'Polygon'], key=lambda g: g.area)
    main_strip = main['land'].intersection(Polygon(STRIP_CUT).union(FRAME))
    def cs(poly, t):
        C = (hw_exit[0] + u[0] * t, hw_exit[1] + u[1] * t)
        ln = LineString([(C[0] - n[0] * 700, C[1] - n[1] * 700), (C[0] + n[0] * 700, C[1] + n[1] * 700)])
        x = poly.intersection(ln)
        segs = [g for g in getattr(x, 'geoms', [x]) if g.geom_type == 'LineString' and g.length > 4]
        if not segs: return C, None
        g = min(segs, key=lambda g: g.distance(Point(C)))
        ds = [((q[0] - C[0]) * n[0] + (q[1] - C[1]) * n[1]) for q in g.coords]
        return C, (min(ds), max(ds), g)
    fr_in = FRAME.buffer(-3)
    T = list(np.arange(-300, L + 120, 6.0))
    img = {}; mn = {}
    for t in T:
        C, r = cs(island, t)
        if r:
            a, b, g = r
            pa = (C[0] + n[0] * a, C[1] + n[1] * a); pb = (C[0] + n[0] * b, C[1] + n[1] * b)
            img[t] = (a if fr_in.contains(Point(pa)) else None, b if fr_in.contains(Point(pb)) else None)
        C, r = cs(main_strip, t)
        if r: mn[t] = (r[0], r[1])
    last_a = max(t for t, v in img.items() if v[0] is not None); last_b = max(t for t, v in img.items() if v[1] is not None)
    A0 = img[last_a][0]; B0 = img[last_b][1]
    left, right, prof = [], [], {}
    t_end = max(mn)
    for t in T:
        if t not in mn or t < min(last_a, last_b) - 30: continue
        am, bm = mn[t]
        a = A0 + (am - A0) * smooth01((t - last_a) / 350.0) if t > last_a else (img.get(t, (A0, B0))[0] if img.get(t, (None,))[0] is not None else A0)
        b = B0 + (bm - B0) * smooth01((t - last_b) / 350.0) if t > last_b else (img.get(t, (A0, B0))[1] if img.get(t, (None, None))[1] is not None else B0)
        if b - a < 20: continue
        C = (hw_exit[0] + u[0] * t, hw_exit[1] + u[1] * t)
        left.append((C[0] + n[0] * a, C[1] + n[1] * a)); right.append((C[0] + n[0] * b, C[1] + n[1] * b)); prof[t] = (C, a, b)
    poly = Polygon(left + right[::-1]).buffer(0)
    t_full = max(last_a, last_b) + 350
    half = Polygon([(hw_exit[0] + u[0] * t_full - n[0] * 900, hw_exit[1] + u[1] * t_full - n[1] * 900),
                    (hw_exit[0] + u[0] * t_full + n[0] * 900, hw_exit[1] + u[1] * t_full + n[1] * 900),
                    (hw_exit[0] + u[0] * (L + 900) + n[0] * 900, hw_exit[1] + u[1] * (L + 900) + n[1] * 900),
                    (hw_exit[0] + u[0] * (L + 900) - n[0] * 900, hw_exit[1] + u[1] * (L + 900) - n[1] * 900)])
    ext = unary_union([poly, strip.intersection(half)]).intersection(region).difference(FRAME)
    return ext, dict(u=u, n=n, prof=prof, last_a=last_a, last_b=last_b, L=L)


def assemble_land(main, region, img_land, ext):
    land = unary_union([img_land.intersection(region), ext,
                        main['land'].intersection(Polygon(KEEP_N)).intersection(region),
                        main['land'].intersection(Polygon(KEEP_NE)).intersection(region),
                        main['land'].intersection(region).difference(FRAME).difference(Polygon(STRIP_CUT))])
    # seams (image edge, kept main-map pieces): close small notches and steps along the frame edge only
    band = FRAME.exterior.buffer(45)
    closed = land.buffer(14, join_style=1).buffer(-14, join_style=1)
    land = land.difference(band).union(closed.intersection(band)).intersection(region)
    # where the region boundary cuts land that does not continue outside (the image's islet ends), round the cut off
    outside = main['land'].difference(region).buffer(30)
    band = region.exterior.buffer(30).difference(outside)
    opened = land.buffer(-12, join_style=1).buffer(12, join_style=1)
    land = land.difference(band).union(opened.intersection(band))
    land = land.buffer(0).simplify(0.9)
    return unary_union([g for g in getattr(land, 'geoms', [land]) if g.geom_type == 'Polygon' and g.area > 40])

# ---------------------------------------------------------------------------------------------------------------- Nico's house
# House frame (src/world/setpieces/nicoHouse/plan.js): +Z street side (lot to z = 27), -Z the bay (seawall z = -14.2, dock to
# -27.5), +X the cove (seawall x = 11.4); world street direction = (sin h, cos h). In the image the circled house has the
# bay to its west, the inlet to its north-west and its street (the lane east of it, Pelican Point Ln) to the east, with the
# grass yard in between. Its origin sits 27 m + half the street + 1.5 m in from the street.
NICO_PX = (740.0, 441.0)


def hl(o, h, lx, lz):
    c, s = math.cos(h), math.sin(h)
    return (o[0] + lx * c + lz * s, o[1] - lx * s + lz * c)


def place_nico(street_w):
    house = Point(I2W(*NICO_PX))
    ln = LineString(street_w); q = ln.interpolate(ln.project(house))
    a = ln.interpolate(max(0, ln.project(q) - 8)); b = ln.interpolate(min(ln.length, ln.project(q) + 8))
    tx, tz = b.x - a.x, b.y - a.y; tl = math.hypot(tx, tz); tx, tz = tx / tl, tz / tl
    sx, sz = tz, -tx                                         # street normal; pick the one pointing from the house to the street
    if (q.x - house.x) * sx + (q.y - house.y) * sz < 0: sx, sz = -sx, -sz
    h = math.atan2(sx, sz)
    d = 27.0 + 6.5 / 2 + 1.5
    o = (q.x - sx * d, q.y - sz * d)
    return o, h


def carve_nico(land, o, h):
    """The set piece needs open water behind its bay bulkhead and a straight canal beside the house (SPEC r8).
    r8 (user, Nov 18 night): the house is DIAGONAL to the compass; its frame H (src/world/setpieces/nicoHouse/r4/plan4.js) is the lot frame
    turned theta = pi/4 - h about (0, -7) (lot frame shifted by OZ along +Z): -X = SW front, +X = NE back, -Z = NW bay side. The bay
    bulkhead runs along H z = -16.5 (NW of the house); the canal is 6 m of water (H x 12.6..18.6) from the bay straight in toward the SE to
    H z = 20 (a dead end). Within the local block around the lot (H x -27..40, z -16.5..34) the land is exactly that; the bay beyond."""
    th = math.pi / 4 - h; c2, s2 = math.cos(th), math.sin(th)
    def H(x, z):   # house frame -> world
        dx, dz = x, z + 7.0
        sx, sz = dx * c2 + dz * s2, -7.0 - dx * s2 + dz * c2
        return hl(o, h, sx, sz + NICO_OZ)
    poly = lambda pts: Polygon([H(x, z) for x, z in pts])
    block = poly(((-27, -60), (62, -60), (62, 34), (-27, 34)))
    bay = poly(((-27, -60), (62, -60), (62, -16.5), (-27, -16.5)))
    canal = poly(((12.6, -17.5), (18.6, -17.5), (18.6, 20.0), (12.6, 20.0)))
    shore = poly(((-27, -16.5), (62, -16.5), (62, 34), (-27, 34))).difference(canal)
    NICO_WATER[:] = [dict(ring=[[round(x, 2), round(z, 2)] for x, z in list(canal.exterior.coords)[:-1]], kind='canal', name=None, depth=2.0)]   # r8: build_v3 may add it as inland water (kind canal: no sliver fill)
    return land.difference(block).union(shore).difference(bay).buffer(0)


NICO_OZ = 4.5   # the set piece's pinned lot offset (plan4.js P4.oz)
NICO_WATER = []
NICO_CANAL_Z1 = 6.5

# ---------------------------------------------------------------------------------------------------------------- buildings


def roof_buildings(roads_w, lot, rng):
    out = []
    road_buf = unary_union([LineString(r['pts']).buffer(r['width'] / 2 + 0.8) for r in roads_w])
    for ring in ROOFS_PX:
        poly = Polygon(wpts(ring))
        if poly.intersects(lot) or poly.intersects(road_buf): continue
        A = poly.area
        c = list(poly.exterior.coords); e = sorted([math.dist(c[0], c[1]), math.dist(c[1], c[2])])
        if A > 420:                                      # the few big roofs: shops, a warehouse, a marina shed
            style, kind, h = ('industrial', 'warehouse', rng.uniform(6.0, 7.0)) if A > 900 else ('strip', 'retail', rng.uniform(5.0, 6.0))
            out.append(dict(ring=[[round(x, 2), round(z, 2)] for x, z in c[:-1]], h=round(h, 1), style=style, kind=kind, zone='commercial'))
        else:
            out.append(dict(ring=[[round(x, 2), round(z, 2)] for x, z in c[:-1]], h=round(rng.uniform(6.0, 8.0), 1),
                            style='stilt' if rng.random() < 0.6 else 'house', kind='house', zone='residential'))
    return out


def rect(cx, cz, ang, L, W):
    ux, uz = math.cos(ang), math.sin(ang); vx, vz = -uz, ux
    return Polygon([(cx + sx * ux * L / 2 + sy * vx * W / 2, cz + sx * uz * L / 2 + sy * vz * W / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])

# ---------------------------------------------------------------------------------------------------------------- r4 grid
# r4-keys (user's top-down map of the main Keys island, Nov 18, relayed by the lead): a 4-lane DIVIDED Overseas Highway (two one-way
# 2-lane carriageways, thin planted median) down the island's center line, single 4-lane stubs where it meets the main map's bridges, and on
# BOTH sides an ordinary 2-lane collector halfway between the highway and the shore, cross streets every 60-90 m from the highway through
# the collector to the shore (small blocks, 1-2 deep per side), median openings at every 3rd cross street, dirt spurs into the lots, parks
# at the SW and N tips. The irregular NE end (Nico's Pelican Point Ln loop, Mahogany Dr, Ocean Bay Dr, Dove Ln, Card Sound Road) keeps its
# hand-digitized curves; their highway ends move onto the carriageway on their side. KEYS_GRID=0 = the old one-highway layout.
GRID = os.environ.get('KEYS_GRID', '1') != '0'
DECK = os.environ.get('KEYS_DECK', '1') != '0'   # r5-bridge: one continuous elevated deck over the water at both highway ends
DECK_ABUT, DECK_SPLIT = 8.0, 165.0   # deck runs this far onto the land past the last water; the divide starts this far beyond
G_MOFF, G_CW = 7.2, 9.4          # carriageway centerline offset from the highway axis (median gap 5 m edge to edge), carriageway width
G_KEEP = ('w1', 'w1L', 's1', 'd1', 'e1', 'e1cul', 'neSpur')
G_CROSS = ['Grouper St', 'Dove Ln', 'Lobster Ln', 'Marina Ave', 'Barracuda Ln', 'Bonefish Ln', 'Sea Grape Ln', 'Tarpon Ave', 'Snapper Ln',
           'Heron St', 'Egret Ln', 'Sponge Ln', 'Conch Ave', 'Ibis Ln', 'Wahoo St', 'Permit Ln', 'Osprey St', 'Mullet Ln', 'Coral Way',
           'Hogfish Ln', 'Sawfish St', 'Manatee Ln', 'Gumbo Limbo Ln', 'Buttonwood Dr', 'Palmetto St', 'Sapodilla Ln', 'Cobia St']


def resample(pts, step):
    ln = LineString(pts); n = max(2, int(round(ln.length / step)) + 1)
    return [(ln.interpolate(ln.length * i / (n - 1)).x, ln.interpolate(ln.length * i / (n - 1)).y) for i in range(n)]


def grid_roads(ctrl, hwS0, land, lot, avoid=None):
    rr = random.Random(1118)
    C = resample(catmull(ctrl['hwN'], 4.0) + catmull(hwS0, 4.0)[1:], 4.0)
    jj = min(range(len(C)), key=lambda i: math.dist(C[i], hwS0[0]))
    for _ in range(3):                    # kink where the image's highway meets the extension: smooth SW of the junction, ends fixed
        C2 = list(C)
        for i in range(jj + 25, len(C) - 25):
            w = C[i - 20:i + 21]; C2[i] = (sum(q[0] for q in w) / len(w), sum(q[1] for q in w) / len(w))
        C = C2
    N = len(C); S = [0.0]
    for i in range(1, N): S.append(S[-1] + math.dist(C[i], C[i - 1]))
    L = S[-1]
    T = []
    for i in range(N):
        a, b = C[max(0, i - 2)], C[min(N - 1, i + 2)]; tx, tz = b[0] - a[0], b[1] - a[1]; tl = math.hypot(tx, tz); T.append((tx / tl, tz / tl))
    R = [(-tz, tx) for tx, tz in T]                                  # right of travel (x east, z south)
    sst = lambda t: t * t * (3 - 2 * t)
    STUB, TAPER = 50.0, 70.0
    # r5-bridge (user: "fully fix the overpass to and from the Keys"): the divided highway used to split 50 m from each join, out over the
    # water, so one carriageway bridged a channel while its twin lay flat on a sand sliver at sea level (and water showed between the two
    # decks). Now the highway stays ONE 4-lane road over every over-water stretch at the ends (one wide deck, KEYS_DECK=0 = old), and only
    # divides on solid land, far enough past the abutment that the r3 junction pin at the split never pulls the deck down
    # (deck 6.2 m at 5 % = 124 m ramp; the pin's flat mouth + 8 % envelope needs >= 141 m between the deck end and the split).
    STUB_N = STUB_S = STUB; decks = []
    if DECK:
        landq = prep(land.buffer(-6, join_style=2).buffer(6, join_style=2))     # slivers narrower than 12 m count as water
        HALF = G_MOFF + G_CW / 2
        wet = [any(not landq.contains(Point(C[i][0] + R[i][0] * o, C[i][1] + R[i][1] * o)) for o in (-HALF, -HALF / 2, 0, HALF / 2, HALF)) for i in range(N)]
        dN = max((S[i] for i in range(N) if wet[i] and S[i] < 900), default=None)
        dS = max((L - S[i] for i in range(N) if wet[i] and L - S[i] < 900), default=None)
        for d, end in ((dN, 0), (dS, 1)):
            if d is None: continue
            a_, b_ = (0.0, d + DECK_ABUT) if end == 0 else (L - d - DECK_ABUT, L)
            seg = [C[i] for i in range(N) if a_ - 0.01 <= S[i] <= b_ + 0.01]
            if len(seg) >= 2: decks.append(LineString(seg).buffer(G_CW / 2 + G_MOFF + 3.0, cap_style=2, join_style=2))
        if dN is not None: STUB_N = max(STUB, dN + DECK_ABUT + DECK_SPLIT)
        if dS is not None: STUB_S = max(STUB, dS + DECK_ABUT + DECK_SPLIT)
        print(f'deck: over-water ends N {dN} m, SW {dS} m -> undivided stubs N {STUB_N:.0f} m, SW {STUB_S:.0f} m')
    O = [G_MOFF * sst(min(1, max(0, (S[i] - STUB_N) / TAPER))) * sst(min(1, max(0, (L - STUB_S - S[i]) / TAPER))) for i in range(N)]
    pt = lambda i, o: (C[i][0] + R[i][0] * o, C[i][1] + R[i][1] * o)
    iA0 = next(i for i in range(N) if S[i] >= STUB_N); iA1 = max(i for i in range(N) if S[i] <= L - STUB_S)
    j0 = min(range(N), key=lambda i: math.dist(C[i], hwS0[0]))
    HW = 'Overseas Highway'
    rec = lambda pts, **kw: dict(pts=[[round(x, 2), round(z, 2)] for x, z in pts], **kw)
    dk = dict(deck=1) if decks else {}
    out = [rec(C[:iA0 + 1], kind='trunk', surface='concrete', lanes=2, width=19.0, name=HW, speedKmh=72, grid=1, **dk),
           rec(C[iA1:], kind='trunk', surface='concrete', lanes=2, width=19.0, name=HW, speedKmh=72, grid=1, **dk),
           rec([pt(i, O[i]) for i in range(iA0, iA1 + 1)], kind='trunk', surface='concrete', lanes=2, width=G_CW, name=HW, speedKmh=72, oneway=True, grid=1, fill='hw'),
           rec([pt(i, -O[i]) for i in range(iA1, iA0 - 1, -1)], kind='trunk', surface='concrete', lanes=2, width=G_CW, name=HW, speedKmh=72, oneway=True, grid=1, fill='hw')]
    axis = LineString(C)
    # NE end: Card Sound Road meets the carriageway on its side; a median crossover links both carriageways there
    ne = list(ctrl['hwNE']); sd = 1 if ((ne[-2][0] - C[j0][0]) * R[j0][0] + (ne[-2][1] - C[j0][1]) * R[j0][1]) > 0 else -1
    ne[-1] = pt(j0, sd * O[j0])
    out.append(road_rec(catmull(ne, 4.0), 'Card Sound Road', 'hw')); out[-1]['pts'][-1] = [round(ne[-1][0], 2), round(ne[-1][1], 2)]
    out.append(rec([pt(j0, O[j0]), pt(j0, -O[j0])], kind='trunk', surface='concrete', lanes=1, width=8.0, name='Card Sound Road', speedKmh=40, grid=1))
    # the kept NE lanes: highway ends onto the carriageway on their side
    keep = []
    for k in (() if LAYOUT else G_KEEP):
        pts = list(ctrl[k])
        for e, nb in ((0, 1), (-1, -2)):
            if axis.distance(Point(pts[e])) < 4.0:
                i = min(range(N), key=lambda q: math.dist(C[q], pts[e]))
                sd = 1 if ((pts[nb][0] - C[i][0]) * R[i][0] + (pts[nb][1] - C[i][1]) * R[i][1]) > 0 else -1
                pts[e] = pt(i, sd * O[i])
        nm = {'w1': 'Pelican Point Ln', 'w1L': 'Pelican Point Ln', 'd1': 'Mahogany Dr', 'e1': 'Ocean Bay Dr', 'e1cul': 'Conch Ave', 's1': 'Dove Ln', 'neSpur': 'Sponge Ln'}[k]
        rd = road_rec(catmull(pts, 4.0), nm, 'lane'); rd['pts'][0] = [round(pts[0][0], 2), round(pts[0][1], 2)]; rd['pts'][-1] = [round(pts[-1][0], 2), round(pts[-1][1], 2)]
        out.append(rd); keep.append(LineString(rd['pts']))
    keepz = unary_union([g.buffer(45) for g in keep] + [lot.buffer(6 if LAYOUT else 30)])
    landp = land.buffer(0)

    def coast(i, sd):
        p = C[i]; ray = LineString([p, (p[0] + R[i][0] * sd * 500, p[1] + R[i][1] * sd * 500)]); g = ray.intersection(landp); best = 0.0
        for gg in getattr(g, 'geoms', [g]):
            if not gg.is_empty and gg.distance(Point(p)) < 1.0: best = gg.length
        return best
    neL = LineString(out[4]['pts'])      # Card Sound Road (the NE branch): grid streets stop at it
    if LAYOUT:   # the grid runs the whole island: the N branch's stretch north of the split too (not within 70 m of the split)
        g0 = next((i for i in range(iA0 + 5, j0) if coast(i, 1) > 35 and coast(i, -1) > 35), j0 + 20); g1 = iA1 - 25
    else: g0, g1 = j0 + 40, iA1 - 25
    if DECK:   # r5-bridge: no cross street (an at-grade junction pinned at 0) on the undivided stubs next to a deck
        g0 = max(g0, next(i for i in range(N) if S[i] >= STUB_N + TAPER)); g1 = min(g1, max(i for i in range(N) if S[i] <= L - STUB_S - TAPER))
    cross_names = {}
    sides = {}
    for sd in (1, -1):
        d = [coast(i, sd) if g0 <= i <= g1 else 0.0 for i in range(N)]
        dmin = [min(d[max(g0, i - 8):min(g1, i + 8) + 1] or [0]) for i in range(N)]
        dm = [sum(dmin[max(g0, i - 12):min(g1, i + 12) + 1]) / max(1, len(dmin[max(g0, i - 12):min(g1, i + 12) + 1])) for i in range(N)]
        oc = [((12 + dm[i]) / 2 if dm[i] >= 80 and g0 <= i <= g1 else None) for i in range(N)]
        sm = [None] * N
        for i in range(N):
            if oc[i] is None: continue
            w = [oc[q] for q in range(max(0, i - 15), min(N, i + 16)) if oc[q] is not None]; sm[i] = min(sum(w) / len(w), dm[i] - 32)
            if sm[i] < 40 or keepz.contains(Point(pt(i, sd * (abs(O[i]) + sm[i])))) or neL.distance(Point(pt(i, sd * (abs(O[i]) + sm[i])))) < 12 or (LAYOUT and abs(S[i] - S[j0]) < 70): sm[i] = None
        runs, i = [], g0
        while i <= g1:
            if sm[i] is None: i += 1; continue
            j = i
            while j + 1 <= g1 and sm[j + 1] is not None: j += 1
            if S[j] - S[i] >= 100: runs.append((i, j))
            i = j + 1
        sides[sd] = dict(d=d, dm=dm, oc=sm, runs=runs)
    # cross-street stations (shared by both sides) + the collector run ends
    st, s_ = [], S[g0] + 20
    while s_ < S[g1] - 20:
        q_ = min(range(g0, g1 + 1), key=lambda q: abs(S[q] - s_)); s_ += rr.uniform(60, 90)
        if not (LAYOUT and abs(S[q_] - S[j0]) < 70): st.append(q_)
    ext = set()
    for sd in (1, -1):
        for a, b in sides[sd]['runs']: ext.update([a, b])
    stations = sorted(set(st) | {e for e in ext if all(abs(S[e] - S[q]) > 30 for q in st)})
    if os.environ.get('GRID_DEBUG'): print('grid dbg', 'L', round(L), 'j0', j0, 'S[j0]', round(S[j0]), 'g0', g0, round(S[g0]), 'g1', g1, round(S[g1]), [(round(S[i]), round(sides[1]['d'][i]), round(sides[-1]['d'][i])) for i in stations])
    nm_i = 0; opened = 0; crossed = []
    for k, i in enumerate(stations):
        name = G_CROSS[nm_i % len(G_CROSS)]; nm_i += 1; both = 0
        for sd in (1, -1):
            sdd = sides[sd]; oc = sdd['oc'][i] if any(a <= i <= b for a, b in sdd['runs']) else None
            dd = min(sdd['d'][i], sdd['dm'][i] + 12) - 9
            if dd < 40 and oc is None: continue
            o0 = sd * O[i]
            pts = [pt(i, o0)]
            if oc is not None: pts.append(pt(i, sd * (O[i] + oc)))
            if dd > (oc or 0) + O[i] + 14: pts.append(pt(i, sd * dd))
            if len(pts) < 2: continue
            ln = LineString(pts)
            if ln.crosses(neL):          # stop at Card Sound Road (a T onto it)
                cut = ln.intersection(neL); cut = min(getattr(cut, 'geoms', [cut]), key=lambda g: Point(pts[0]).distance(g))
                dcut = Point(pts[0]).distance(cut); pts = [q for q in pts if Point(pts[0]).distance(Point(q)) < dcut - 12] + [(cut.x, cut.y)]
                if len(pts) < 2: continue
                ln = LineString(pts)
            if any(ln.crosses(q) for q in crossed): continue
            if ln.intersects(keepz) or not landp.buffer(2).contains(ln) or (avoid is not None and ln.intersects(avoid)): continue
            out.append(rec(pts, kind='residential', surface='asphalt', style='keys_lane', lanes=1, width=6.5, name=name, speedKmh=40, grid=1, fill='lots'))
            both += 1; crossed.append(ln.buffer(8))
        if both == 2 and k % 3 == 1:            # median opening: the cross street continues over the median
            out.append(rec([pt(i, O[i]), pt(i, -O[i])], kind='residential', surface='asphalt', style='keys_lane', lanes=1, width=6.5, name=name, speedKmh=30, grid=1)); opened += 1
    # collectors (+ dirt spurs into the lots between the cross streets)
    ncol = 0
    for sd, cname in ((1, 'Coconut Row'), (-1, 'Seashell Ln')):
        sdd = sides[sd]
        for a, b in sdd['runs']:
            pts = [pt(i, sd * (O[i] + sdd['oc'][i])) for i in range(a, b + 1)]
            out.append(rec(pts, kind='residential', surface='asphalt', style='keys_lane', lanes=1, width=6.5, name=cname, speedKmh=40, grid=1, fill='lots')); ncol += 1
            cs = [q for q in stations if a <= q <= b]
            for q0, q1 in zip(cs, cs[1:]):
                m = (q0 + q1) // 2
                if rr.random() > 0.4 or S[q1] - S[q0] < 50: continue
                oc = sdd['oc'][m]; dd = sdd['dm'][m]
                if dd - oc < 34: continue
                sp = [pt(m, sd * (O[m] + oc)), pt(m, sd * (O[m] + oc + 22))]
                if landp.contains(LineString(sp)) and not (avoid is not None and LineString(sp).intersects(avoid)): out.append(rec(sp, kind='service', surface='dirt', lanes=1, width=3.4, name='', speedKmh=20, grid=1))
    # parks at the SW and N tips
    areas = []
    corridor = unary_union([LineString(r['pts']).buffer(r['width'] / 2 + 2.5) for r in out])
    for s_c, rad, nm in ((L - 130, 120, 'Southpoint Park'), (110, 90, 'North Key Park')):
        i = min(range(N), key=lambda q: abs(S[q] - s_c)); g = Point(C[i]).buffer(rad).intersection(landp).difference(corridor).difference(lot.buffer(25))
        for gg in getattr(g, 'geoms', [g]):
            if gg.geom_type == 'Polygon' and gg.area > 600: areas.append(dict(ring=[[round(x, 2), round(z, 2)] for x, z in list(gg.exterior.coords)[:-1]], kind='park', name=nm))
    print(f'grid: highway {L:.0f} m divided ({G_MOFF} m offset), cross stations {len(stations)}, median openings {opened}, collectors {ncol}, '
          f'roads {len(out)}, parks {len(areas)}')
    return out, areas, keepz, dict(decks=[[[round(x, 2), round(z, 2)] for x, z in list(g.exterior.coords)[:-1]] for g in decks], axis=[[round(x, 2), round(z, 2)] for x, z in C], R=[[round(a, 4), round(b, 4)] for a, b in R])


# ---------------------------------------------------------------------------------------------------------------- r4 layout map
# r4-keys (user, Nov 18): docs/v2/plan/keys_layout_house_dot.webp is the exact top-down map of the island (shape, divided highway,
# grid, shores, islets, the two NE bridges; red dot = Nico's house on the NW bay shore). Placed by a similarity transform: the SW
# bridge landing on the island tip = the main map's SW join, the north bridge's top edge = the main map's north join. The highway
# centerline is digitized from it (image px); the island + islet land comes from its water mask. KEYS_LAYOUT=0 = the earlier image.
LAYOUT = GRID and os.environ.get('KEYS_LAYOUT', '1') != '0'
LIMG = os.path.join(ROOT, 'docs', 'v2', 'plan', 'keys_layout_house_dot.webp')
L_SW, L_N = (95.0, 1215.0), (770.0, 0.0)         # anchors (image px) -> P_SW, P_N
L_HWN = [(770, 0), (800, 75), (830, 140), (860, 200), (885, 250), (902, 300), (903, 380), (902, 450), (895, 500), (880, 530)]
L_HWS = [(880, 530), (850, 545), (780, 580), (720, 600), (680, 630), (640, 700), (600, 790), (550, 860), (485, 955), (400, 1020), (300, 1095), (200, 1160), (95, 1215)]
L_HWNE = [(1186, 60), (1110, 160), (1035, 260), (990, 350), (950, 430), (880, 530)]
L_NICO = (750.0, 462.0)


def layout_xf(P_SW, P_N):
    a, b = complex(*L_SW), complex(*L_N); A, B = complex(*P_SW), complex(*P_N); k = (B - A) / (b - a)
    def f(x, y): w = A + k * (complex(x, y) - a); return (w.real, w.imag)
    return f, abs(k)


def layout_land(f):
    from skimage import measure
    rgb = np.asarray(Image.open(LIMG).convert('RGB')).astype(np.float32); r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    water = (b > 150) & (b - g > 45) & (r < 150) & (g < 150)
    water[:8, :] = True; water[:, -4:] |= False                 # the map's dark top border row is not land
    land = ndimage.binary_opening(~water, iterations=1)
    land = ndimage.binary_fill_holes(land)                       # roofs / pools / dock gaps inside the island are not water
    lab, nl = ndimage.label(land); sz = np.bincount(lab.ravel()); sz[0] = 0
    m = (sz >= 40)[lab]
    fm = ndimage.gaussian_filter(np.pad(m.astype(np.float32), 3), 1.0)
    polys = []
    for c in measure.find_contours(fm, 0.5):
        if len(c) < 6: continue
        pp = Polygon([f(x - 3, y - 3) for y, x in c]).buffer(0)
        if pp.area > 60: polys.append(pp)
    polys.sort(key=lambda q: -q.area); acc = Polygon()
    for pp in polys: acc = acc.symmetric_difference(pp)
    H, W_ = rgb.shape[:2]
    frame = Polygon([f(0, 0), f(W_, 0), f(W_, H), f(0, H)])
    return acc.buffer(0).simplify(0.8), frame


# ---------------------------------------------------------------------------------------------------------------- main


def main():
    rng = random.Random(1116)
    main_ = load_main()
    region, strip = build_region(main_)
    img_land = image_land()

    # roads in the image
    R = snap_px(ROADS_PX)
    ctrl = {k: wpts(v) for k, v in R.items()}
    hw_exit = ctrl['hwS'][-1]
    ext, X = extension(main_, region, strip, img_land, hw_exit)
    u, n, prof = X['u'], X['n'], X['prof']
    ts = sorted(prof)
    def at(t, f):
        """Point at axis distance t, fraction f across the strip (0 = bay/NW coast, 1 = ocean/SE coast)."""
        t = min(ts, key=lambda q: abs(q - t)); C, a, b = prof[t]; o = a + (b - a) * f
        return (C[0] + n[0] * o, C[1] + n[1] * o)

    # joins with the main map
    trunk = merged_line(main_['roads'], ['r6549', 'r6550', 'r6551'])
    P_N = crossing(region, trunk, (-940, 4505))
    ovs = next(r for r in main_['roads'] if r['id'] == 'r6758')
    P_SW = crossing(region, LineString(ovs['pts']), ovs['pts'][0])
    d_sw = np.subtract(ovs['pts'][1], ovs['pts'][0]); d_sw = d_sw / np.linalg.norm(d_sw)

    # north: from the channel down onto the island's tip (the main map's highway direction at the crossing first)
    tl = trunk.project(Point(P_N)); q = trunk.interpolate(tl + 22)
    ctrl['hwN'] = [P_N, (q.x, q.y)] + ctrl['hwN']
    # NE branch: over the bridge to the upper-Keys land
    e0 = ctrl['hwNE'][0]; e1 = ctrl['hwNE'][1]; d0 = np.subtract(e0, e1); d0 = d0 / np.linalg.norm(d0)
    ne_ext = [JOIN_NE, (-300, 4313), (-385, 4290), (-465, 4296), (e0[0] + d0[0] * 45 + 18, e0[1] + d0[1] * 45)]
    ctrl['hwNE'] = ne_ext + ctrl['hwNE']

    # south-west extension: highway along the strip (about mid-island like in the image) to the main map's crossing
    tmax = max(ts)
    sw_hw = []
    for t in np.arange(70, tmax, 75):
        p = at(t, 0.47)
        if math.dist(p, P_SW) < 140: break
        sw_hw.append(p)
    sw_hw += [(P_SW[0] - d_sw[0] * 45, P_SW[1] - d_sw[1] * 45), P_SW]
    ctrl['hwS'] = ctrl['hwS'] + sw_hw
    hwS0 = list(ctrl['hwS'])   # r4 grid: the highway before the old lane junction points go in
    # bay lane (continues Coconut Row) and ocean lane (continues Seashell Ln), cross lanes to the highway
    hw_line = LineString(ctrl['hwS'])
    def on_hw(t, f=0.47):
        p = Point(at(t, f)); qq = hw_line.interpolate(hw_line.project(p)); return (qq.x, qq.y)
    bay = [at(t, 0.2) for t in np.arange(45, tmax - 170, 60)]
    t_bay_end = list(np.arange(45, tmax - 170, 60))[-1]
    ocean = [at(t, 0.8) for t in np.arange(40, tmax - 120, 60)]
    t_oc_end = list(np.arange(40, tmax - 120, 60))[-1]
    ctrl['wl'] = ctrl['wl'] + bay
    ctrl['e3'] = ctrl['e3'] + ocean
    ext_roads = {}
    def lane_to_hw(name, from_pt, t):
        h = on_hw(t); ext_roads[name] = [from_pt, h]; return h
    hw_joins = []
    hw_joins.append(lane_to_hw('sw_bay_end', bay[-1], t_bay_end + 70))
    hw_joins.append(lane_to_hw('sw_ocean_end', ocean[-1], t_oc_end + 80))
    # two cross lanes through the highway (bay lane - highway - ocean lane)
    for i, t in enumerate((285, 525)):
        b_ = min(bay, key=lambda p: abs(((p[0] - hw_exit[0]) * u[0] + (p[1] - hw_exit[1]) * u[1]) - t))
        o_ = min(ocean, key=lambda p: abs(((p[0] - hw_exit[0]) * u[0] + (p[1] - hw_exit[1]) * u[1]) - t))
        h = on_hw(t); hw_joins.append(h)
        ext_roads[f'sw_cross{i}'] = [b_, h, o_]
    # Grouper St (x2) continues to the ocean lane
    o_ = min(ocean, key=lambda p: math.dist(p, ctrl['x2'][-1]))
    ctrl['x2'] = ctrl['x2'] + [o_]
    # put the highway junction points into the highway's control points (in axis order)
    hw_pts = ctrl['hwS']
    for h in hw_joins:
        ln = LineString(hw_pts); s = ln.project(Point(h)); acc = 0
        for i in range(len(hw_pts) - 1):
            seg = math.dist(hw_pts[i], hw_pts[i + 1])
            if acc + seg >= s: hw_pts.insert(i + 1, h); break
            acc += seg
    ctrl['hwS'] = hw_pts
    ctrl.update(ext_roads)

    # smooth curves (control points stay on the curve: junctions hold)
    roads_w = []
    names = dict(LANE_NAME, sw_bay_end='Lobster Ln', sw_ocean_end='Marina Ave', sw_cross0='Grouper St', sw_cross1='Dove Ln')
    for k, pts in ctrl.items():
        cls = 'hw' if k in HIGHWAY else 'lane'
        pts = [p for i, p in enumerate(pts) if i == 0 or math.dist(p, pts[i - 1]) > 0.5]
        if k.startswith('sw_cross'):          # the cross lanes meet the highway at their middle control point
            roads_w.append(road_rec(catmull(pts[:2], 4.0), names[k], cls)); roads_w.append(road_rec(catmull(pts[1:], 4.0), names[k], cls)); continue
        roads_w.append(road_rec(catmull(pts, 4.0), HIGHWAY.get(k) or names.get(k, 'Sponge Ln'), cls))

    # Nico's house on Pelican Point Ln (the lane east of the circled house)
    o, h = place_nico(ctrl['w1L'])
    lot = Polygon([hl(o, h, x, z) for x, z in ((-24, -14.2), (11.4, -14.2), (11.4, 33), (-24, 33))])
    spawn = hl(o, h, -6.0, 12.0)

    land = assemble_land(main_, region, img_land, ext)
    if LAYOUT:   # r4: the user's exact layout map replaces the island, the highway and Nico's spot
        LF, lmpp = layout_xf(P_SW, P_N)
        lland, lframe = layout_land(LF)
        land = unary_union([lland.intersection(region), main_['land'].intersection(region).difference(lframe)]).buffer(0)
        land = unary_union([g for g in getattr(land, 'geoms', [land]) if g.geom_type == 'Polygon' and g.area > 60])
        ctrl['hwN'] = [LF(*p) for p in L_HWN]; hwS0 = [LF(*p) for p in L_HWS]
        ne_img = [LF(*p) for p in L_HWNE]
        ctrl['hwNE'] = ([JOIN_NE] if math.dist(JOIN_NE, ne_img[0]) > 30 else []) + ne_img
        # Nico's lot at the red dot: back (-Z) on the bay shore, front (+Z) toward the island axis
        dot = LF(*L_NICO); ax = LineString(catmull(ctrl['hwN'], 4.0) + catmull(hwS0, 4.0)[1:]); q = ax.interpolate(ax.project(Point(dot)))
        sx, sz = q.x - dot[0], q.y - dot[1]; sl = math.hypot(sx, sz); sx, sz = sx / sl, sz / sl
        cp = dot
        for k in range(0, 120):
            t = (dot[0] - sx * k * 0.5, dot[1] - sz * k * 0.5)
            if not land.contains(Point(t)): cp = t; break
        h = math.atan2(sx, sz); o = (cp[0] + sx * 13.2, cp[1] + sz * 13.2)
        lot = Polygon([hl(o, h, x, z) for x, z in ((-24, -14.2), (11.4, -14.2), (11.4, 33), (-24, 33))])
        spawn = hl(o, h, -6.0, 12.0)
        print(f'layout: {lmpp:.3f} m/px, dot {dot[0]:.1f},{dot[1]:.1f} shore {cp[0]:.1f},{cp[1]:.1f} -> nico origin {o[0]:.1f},{o[1]:.1f} heading {h:.4f}; NE end {ne_img[0]} join {JOIN_NE}')
        land = land.union(lot.buffer(1.0, join_style=2).intersection(Polygon([hl(o, h, x, z) for x, z in ((-26, -14.2), (13, -14.2), (13, 40), (-26, 40))])))
    land = carve_nico(land, o, h)
    areas, gridinfo = [], None
    if GRID:
        _tb = 400; _hp = on_hw(_tb); _bx, _bz = _hp[0] + n[0] * 33, _hp[1] + n[1] * 33; _bh = math.atan2(-n[0], -n[1])   # the Keys bar lot (as below)
        _bar_lot = Polygon([hl((_bx, _bz), _bh, x, z) for x, z in ((-24, -19), (24, -19), (24, 19), (-24, 19))])
        if LAYOUT:
            _ax = LineString(catmull(hwS0, 4.0)); _p = _ax.interpolate(_ax.length * 0.45); _q = _ax.interpolate(_ax.length * 0.45 + 3)
            _tx, _tz = _q.x - _p.x, _q.y - _p.y; _tl = math.hypot(_tx, _tz); _rx, _rz = -_tz / _tl, _tx / _tl   # R+ = bay (NW)
            _bx, _bz = _p.x - _rx * 36, _p.y - _rz * 36; _bh = math.atan2(_rx, _rz)
            _bar_lot = Polygon([hl((_bx, _bz), _bh, x, z) for x, z in ((-24, -19), (24, -19), (24, 19), (-24, 19))])
        roads_w, areas, keepz, gridinfo = grid_roads(ctrl, hwS0, land, lot, avoid=_bar_lot.buffer(4))
        if gridinfo.get('decks'):   # r5-bridge: sand slivers (< 12 m wide) under / beside the end decks go (the twin carriageway lay on one)
            _dz = unary_union([Polygon(d) for d in gridinfo['decks']]).buffer(12)
            _sl = land.intersection(_dz).difference(land.buffer(-6, join_style=2).buffer(6, join_style=2))
            _sl = _sl.union(land.intersection(_dz.buffer(-12)).difference(land.buffer(-12, join_style=2).buffer(12, join_style=2)))   # strips the map drew under the deck
            land = unary_union([g for g in getattr(land.difference(_sl.buffer(0.5)), 'geoms', [land.difference(_sl.buffer(0.5))]) if g.geom_type == 'Polygon' and g.area > 60]).buffer(0)
            print(f'deck: {len(gridinfo["decks"])} end decks, {_sl.area:.0f} m2 of sand sliver removed')
        if LAYOUT:   # Nico's driveway street: from the lot front straight out to the first grid street
            _a = hl(o, h, -6.0, 33.5); _b = hl(o, h, -6.0, 160.0); _ray = LineString([_a, _b]); _hit = None
            for r in roads_w:
                if r.get('kind') == 'service': continue
                ii = _ray.intersection(LineString(r['pts']))
                for g in getattr(ii, 'geoms', [ii]):
                    if g.geom_type == 'Point' and (_hit is None or Point(_a).distance(g) < Point(_a).distance(_hit)): _hit = g
            if _hit is not None:
                roads_w.append(dict(pts=[[round(_a[0], 2), round(_a[1], 2)], [round(_hit.x, 2), round(_hit.y, 2)]], kind='residential', surface='asphalt', style='keys_lane', lanes=1, width=6.5, name='Pelican Point Ln', speedKmh=30, grid=1))
            print('nico driveway', _hit)

    # buildings: the image's roofs, then the sparse extension (houses along the lanes, docks on the bay side)
    buildings = roof_buildings(roads_w, lot.buffer(3), rng)
    if GRID: buildings = [] if LAYOUT else [b for b in buildings if keepz.contains(Polygon(b['ring']).centroid)]   # the image's roofs only where its own lanes stay
    road_buf = unary_union([LineString(r['pts']).buffer(r['width'] / 2 + 3.0) for r in roads_w])
    taken = unary_union([Polygon(b['ring']) for b in buildings]).buffer(4)
    piers = [dict(pts=[[round(x, 2), round(z, 2)] for x, z in wpts(p)], width=2.2) for p in PIERS_PX]
    if LAYOUT: piers = []
    ext_area = ext.buffer(-4)
    bar = None
    # the Keys bar: a roadside lot on the ocean side of the highway in the extension, kept clear of houses
    tb = 400; hp = on_hw(tb); C, a, b = prof[min(ts, key=lambda q: abs(q - tb))]
    bx, bz = hp[0] + n[0] * 33, hp[1] + n[1] * 33
    bar_h = math.atan2(-n[0], -n[1])                     # front (+Z) faces the highway
    if LAYOUT: bx, bz, bar_h = _bx, _bz, _bh
    bar_lot = Polygon([hl((bx, bz), bar_h, x, z) for x, z in ((-24, -19), (24, -19), (24, 19), (-24, 19))])
    if GRID: print('bar lot hits:', [r['name'] for r in roads_w if LineString(r['pts']).buffer(r['width'] / 2 + 3.0).intersects(bar_lot.buffer(-4))], 'land ok', land.contains(bar_lot.buffer(-6)))
    if land.contains(bar_lot.buffer(-6)) and not bar_lot.buffer(-4).intersects(road_buf):
        bar = dict(x=round(bx, 2), z=round(bz, 2), heading=round(bar_h, 4))
        taken = taken.union(bar_lot.buffer(4))
    for lane, side, step, fill, docks in (() if GRID else ((bay, -1, 33, 0.8, True), (ocean, +1, 38, 0.65, False), (bay, +1, 45, 0.35, False), (ocean, -1, 45, 0.35, False))):   # r4 grid: build_v3 fills the lots (keys_fill.py)
        ln = LineString(lane)
        for s in np.arange(10, ln.length - 10, step):
            if rng.random() > fill: continue
            p = ln.interpolate(s); a_ = ln.interpolate(max(0, s - 5)); b_ = ln.interpolate(min(ln.length, s + 5))
            tx, tz = b_.x - a_.x, b_.y - a_.y; tl_ = math.hypot(tx, tz); tx, tz = tx / tl_, tz / tl_
            nx_, nz_ = -tz * side, tx * side                # away from the lane on the chosen side (n: SE positive)
            if (nx_ * n[0] + nz_ * n[1]) * side < 0: nx_, nz_ = -nx_, -nz_
            Ld, Wd = rng.uniform(11, 15), rng.uniform(9, 12)
            dd = 3.25 + 7 + Wd / 2 + rng.uniform(0, 5)
            cx, cz = p.x + nx_ * dd, p.y + nz_ * dd
            fp = rect(cx, cz, math.atan2(tz, tx) + rng.uniform(-0.06, 0.06), Ld, Wd)
            if not ext_area.contains(fp) or fp.intersects(road_buf) or fp.intersects(taken): continue
            buildings.append(dict(ring=[[round(x, 2), round(z, 2)] for x, z in list(fp.exterior.coords)[:-1]], h=round(rng.uniform(6.0, 8.0), 1),
                                  style='stilt' if rng.random() < 0.6 else 'house', kind='house', zone='residential'))
            taken = taken.union(fp.buffer(5))
            if docks and rng.random() < 0.7:            # dock from the shore behind the house straight out into the bay
                sh = Point(cx, cz)
                coast = land.boundary
                cp = nearest_points(coast, sh)[0]
                if cp.distance(sh) < 60:
                    ox, oz = cp.x - cx, cp.y - cz; ol = math.hypot(ox, oz) or 1; ox, oz = ox / ol, oz / ol
                    Ldk = rng.uniform(16, 28)
                    piers.append(dict(pts=[[round(cp.x - ox * 2, 2), round(cp.y - oz * 2, 2)], [round(cp.x + ox * Ldk, 2), round(cp.y + oz * Ldk, 2)]], width=2.2))
    # a couple of roadside shops on the highway in the extension
    for tt in (() if GRID else (200, 640)):
        hp = on_hw(tt); side = -1 if tt == 200 else 1
        cx, cz = hp[0] + n[0] * side * 22, hp[1] + n[1] * side * 22
        fp = rect(cx, cz, math.atan2(u[1], u[0]), 26, 14)
        if ext_area.contains(fp) and not fp.intersects(road_buf) and not fp.intersects(taken):
            buildings.append(dict(ring=[[round(x, 2), round(z, 2)] for x, z in list(fp.exterior.coords)[:-1]], h=5.5, style='strip', kind='retail', zone='commercial'))
            taken = taken.union(fp.buffer(5))
    # nothing on water, nothing in Nico's lot
    buildings = [b for b in buildings if land.buffer(1.0).contains(Polygon(b['ring'])) and not Polygon(b['ring']).intersects(lot.buffer(3))]

    def ringl(p): return [[round(x, 2), round(z, 2)] for x, z in list(p.exterior.coords)[:-1]]
    land_rings = []
    for g in getattr(land, 'geoms', [land]):
        # the hook takes outer rings only: a polygon with a lagoon is cut through each lagoon into pieces (their union
        # in the hook has the lagoon again)
        pieces = [g]
        for hole in g.interiors:
            c = Polygon(hole).representative_point(); minx, miny, maxx, maxy = g.bounds
            blade = LineString([(c.x, miny - 1), (c.x, maxy + 1)])
            pieces = [q for pc in pieces for q in (split(pc, blade).geoms if pc.intersects(blade) else [pc])]
        land_rings += [ringl(q) for q in pieces if q.geom_type == 'Polygon' and q.area > 1]
    out = dict(
        generator='tools/v2/map3/keys_detail.py (hand-digitized from docs/v2/plan/keys_detail.webp)',
        fit=dict(mpp=MPP, rot=ROT, tx=TX, tz=TZ),
        region=ringl(region), land=land_rings, roads=roads_w, buildings=buildings, piers=piers, areas=areas, grid=gridinfo,
        nico=dict(x=round(o[0], 2), z=round(o[1], 2), heading=round(h, 4), spawnX=round(spawn[0], 2), spawnZ=round(spawn[1], 2),
                  lot=ringl(lot), street='Pelican Point Ln'),
        joins=[list(P_N), list(P_SW), list(JOIN_NE)], water=NICO_WATER)
    if bar: out['keysBar'] = bar
    json.dump(out, open(os.path.join(OUT, 'keys_detail.json'), 'w'), separators=(',', ':'))
    print(f"keys_detail.json: region {region.area / 1e6:.2f} km2, land {land.area / 1e6:.3f} km2 in {len(land_rings)} rings, roads {len(roads_w)} "
          f"({sum(LineString(r['pts']).length for r in roads_w) / 1000:.1f} km), buildings {len(buildings)}, piers {len(piers)}, "
          f"nico ({o[0]:.1f}, {o[1]:.1f}) h {h:.3f}, keysBar {bar}, joins N {P_N} SW {P_SW} NE {JOIN_NE}")
    if '--sheet' in sys.argv:
        sheet(out, main_, sys.argv[sys.argv.index('--sheet') + 1])
    return out

# ---------------------------------------------------------------------------------------------------------------- overlay sheet


def sheet(out, main_, path):
    """Left: the user's image with the digitized roads / roofs / docks / Nico's lot on top. Right: the whole region in world
    space (main map around it in gray), including the south-west extension."""
    im = Image.open(IMG).convert('RGB')
    d = ImageDraw.Draw(im, 'RGBA')
    def P(pts): return [W2I(x, z) for x, z in pts]
    for b in out['buildings']: d.polygon(P(b['ring']), outline=(255, 60, 60, 255))
    for p in out['piers']: d.line(P(p['pts']), fill=(255, 150, 0, 255), width=2)
    for r in out['roads']:
        d.line(P(r['pts']), fill=(255, 0, 255, 255) if r['kind'] == 'trunk' else (0, 255, 255, 255), width=2)
    d.polygon(P(out['nico']['lot']), outline=(255, 255, 0, 255))
    sx, sz = W2I(out['nico']['spawnX'], out['nico']['spawnZ']); d.ellipse([sx - 3, sz - 3, sx + 3, sz + 3], fill=(255, 255, 0, 255))
    X0, Z0, X1, Z1 = -2250, 4250, -150, 6450; SC = 1092 / (Z1 - Z0)
    W2 = Image.new('RGB', (int((X1 - X0) * SC), 1092), (24, 52, 92)); e = ImageDraw.Draw(W2)
    def T(pts): return [((x - X0) * SC, (z - Z0) * SC) for x, z in pts]
    for g in getattr(main_['land'], 'geoms', [main_['land']]):
        if g.geom_type == 'Polygon': e.polygon(T(g.exterior.coords), fill=(70, 80, 70))
    reg = Polygon(out['region'])
    e.polygon(T(reg.exterior.coords), fill=(30, 66, 112))
    for ring in out['land']: e.polygon(T(ring), fill=(84, 128, 70))
    for r in main_['roads']:
        if not LineString(r['pts']).within(reg): e.line(T(r['pts']), fill=(150, 150, 150), width=1)
    for b in out['buildings']: e.polygon(T(b['ring']), fill=(225, 225, 225))
    for p in out['piers']: e.line(T(p['pts']), fill=(210, 160, 90), width=1)
    for r in out['roads']: e.line(T(r['pts']), fill=(255, 210, 0) if r['kind'] == 'trunk' else (240, 240, 240), width=2 if r['kind'] == 'trunk' else 1)
    e.polygon(T(out['nico']['lot']), outline=(255, 60, 60))
    if out.get('keysBar'):
        kb = out['keysBar']; e.ellipse([(kb['x'] - X0) * SC - 4, (kb['z'] - Z0) * SC - 4, (kb['x'] - X0) * SC + 4, (kb['z'] - Z0) * SC + 4], outline=(0, 255, 255))
    for j in out['joins']: e.ellipse([(j[0] - X0) * SC - 5, (j[1] - Z0) * SC - 5, (j[0] - X0) * SC + 5, (j[1] - Z0) * SC + 5], outline=(255, 0, 0), width=2)
    e.line(T(FRAME.exterior.coords), fill=(255, 0, 255))
    e.text((8, 8), 'world (m): region, land, roads, roofs, docks; magenta = image frame, red = joins', fill=(255, 255, 255))
    sheet_ = Image.new('RGB', (im.width + W2.width + 10, 1092), (0, 0, 0)); sheet_.paste(im, (0, 0)); sheet_.paste(W2, (im.width + 10, 0))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True); sheet_.save(path); print('sheet', path)


if __name__ == '__main__':
    main()
