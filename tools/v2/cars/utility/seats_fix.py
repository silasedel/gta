# Hand-set seats for the utility vehicles: seats.py assumes a car (two front seats side by side + a rear row), which is right
# for the crew UTV (utv1) but not for the single-seat machines, the golf cart's rear-facing bench or the baggage cart.
# Values are shell space (x = left, y up from the ground, z forward, z 0 = mid-wheelbase), read off the source geometry.
#   python3 -P tools/v2/cars/utility/seats_fix.py [keys...]
import json
import os
import sys

OUT = os.path.join(os.path.dirname(__file__), '../../../../public/assets/vehicles/cars')


def seat(sid, hip, heel, roof, door, yaw=0):
    return {'id': sid, 'hip': hip, 'yaw': yaw, 'heel': heel, 'roofY': roof, 'doorX': door}


# a handlebar is a wheel lying almost flat (tilt ~1.3 rad): the seat solver then puts the hands on its two ends
FIX = {
    # sport ATV: one rider astride the seat, hands on the bar grips (bar 0.8 m wide)
    'atv1': {
        'seats': [seat('driver', [0.0, 1.1, -0.23], [0.0, 0.36, 0.12], 2.2, 0.62)],
        'wheel': {'c': [0.0, 1.25, 0.17], 'r': 0.36, 'tilt': 1.3},
    },
    # single-seat sport UTV: the one bucket seat sits on the centerline
    'utv2': {
        'seats': [seat('driver', [0.0, 0.875, -0.143], [0.0, 0.381, 0.637], 1.756, 0.48)],
        'wheel': {'c': [0.0, 1.2, 0.3], 'r': 0.18, 'tilt': 0.45},
    },
    # golf cart: two front seats as measured; the flip-down rear bench faces backward (feet on the rear platform)
    'golf1': {
        'rear': [
            seat('rearL', [0.3, 0.72, -0.68], [0.3, 0.47, -1.32], 1.84, 0.52, 3.14159),
            seat('rearR', [-0.3, 0.72, -0.68], [-0.3, 0.47, -1.32], 1.84, 0.52, 3.14159),
        ],
    },
    # baggage cart (no cab): the driver sits on the front edge of the cart frame over the tow bar, hands on the tow handle
    'bagcart1': {
        'seats': [seat('driver', [0.0, 0.62, 1.3], [0.0, 0.06, 1.72], 2.6, 0.75)],
        'wheel': {'c': [0.0, 0.92, 1.62], 'r': 0.16, 'tilt': 1.1},
    },
}

for k in sys.argv[1:]:
    p = os.path.join(OUT, k + '.json')
    if k not in FIX or not os.path.exists(p):
        continue
    m = json.load(open(p))
    f = FIX[k]
    if 'seats' in f:
        m['seats'] = f['seats']
    if 'rear' in f:
        m['seats'] = [s for s in m.get('seats', []) if not s['id'].startswith('rear')] + f['rear']
    if 'wheel' in f:
        m['wheel'] = f['wheel']
    json.dump(m, open(p, 'w'))
    print('seats', k, [s['id'] for s in m['seats']])
