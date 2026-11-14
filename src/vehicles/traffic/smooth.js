// Traffic control smoothing (vehicles-look track).
// aiDrive() in vehicles.js computes raw controls every fixed tick: pure-pursuit steering and a threshold
// throttle / brake switch.  Fed straight to the physics they make AI cars wobble in their lane and surge
// (throttle, brake, throttle) when following.  smoothAiControls() runs right after aiDrive() and turns the
// raw request into what a calm human driver does:
//   - steering: rate-limited and low-passed, with yaw-rate damping, so the car settles on the lane line
//   - pedals: one signed "longitudinal demand" with a jerk limit, so a car eases off the gas before it brakes,
//     brakes progressively to a stop, and releases the brake gently at standstill (no nose bob)
// Pure function of (vehicle state, dt); keeps its state on v.ai._sm.  No allocation per call.

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function smoothAiControls(v, dt) {
  const ai = v.ai;
  const c = v.ctrl;
  if (!ai || !c || !(dt > 0)) {
    return;
  }
  // chases, crashes and panic keep their raw, twitchy controls on purpose
  if (v.chaseTarget || ai.fleeT > 0 || ai.state === 'accident' || ai.state === 'flee' || ai.state === 'rage') {
    ai._sm = null;
    return;
  }
  let sm = ai._sm;
  if (!sm) {
    sm = { steer: c.steer || 0, lon: (c.throttle || 0) - (c.brake || 0) };
    ai._sm = sm;
  }
  const spd = Math.abs(v.speed || 0);

  // ---- steering
  // yaw-rate damping: subtract a little of the current yaw rate so the car does not overshoot the lane center
  let yawRate = 0;
  try {
    yawRate = v.body.angvel().y;
  } catch (e) {
    yawRate = 0;
  }
  const want = clamp((c.steer || 0) - yawRate * clamp(spd / 30, 0, 0.35), -1, 1);
  const tau = spd > 12 ? 0.22 : 0.12;                       // seconds; slower hands at speed
  const k = 1 - Math.exp(-dt / tau);
  let next = sm.steer + (want - sm.steer) * k;
  const rate = spd > 12 ? 1.4 : 2.6;                        // full lock per second
  next = clamp(next, sm.steer - rate * dt, sm.steer + rate * dt);
  sm.steer = next;
  c.steer = next;

  // ---- pedals
  const raw = (c.throttle || 0) - (c.brake || 0);
  const hardStop = (c.brake || 0) >= 0.95 && spd > 6;      // real emergency: allow fast brake build-up
  const up = 1.6;                                           // demand change per second toward more throttle
  const down = hardStop ? 6 : 2.4;                          // toward more brake
  let lon = sm.lon;
  if (raw > lon) {
    lon = Math.min(raw, lon + up * dt);
  } else {
    lon = Math.max(raw, lon - down * dt);
  }
  // a deadband around zero: coast instead of flicking between gas and brake
  if (lon > -0.06 && lon < 0.04 && raw > -0.2 && raw < 0.2) {
    lon *= 0.5;
  }
  sm.lon = lon;
  if (lon >= 0) {
    c.throttle = lon;
    c.brake = 0;
  } else {
    c.throttle = 0;
    // last meter per second of a stop: ease the brake off so the car settles without a lurch, then hold
    const ease = spd < 1.2 && spd > 0.05 ? 0.55 : 1;
    c.brake = spd <= 0.05 ? Math.max(0.6, -lon) : -lon * ease;
  }
}
