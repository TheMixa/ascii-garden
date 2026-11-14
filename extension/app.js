/* ASCII Garden: animals drawn on a character grid.
 *
 * How it works:
 *  - The screen is a grid of cells (CS px each).
 *  - Every animal is a *shape function* shape(lx, ly, a) that says which
 *    palette colour (if any) sits at a point in the animal's own coordinates
 *    (lx = forward, ly = sideways, measured in cells).
 *  - Each frame, for every grid cell near an animal, we rotate the cell centre
 *    into the animal's frame, ask the shape function, and paint a coloured tile
 *    with a keyboard character in it. Rotating and sampling like this is what
 *    gives the chunky pixel look at any angle.
 *  - Cells an animal passes over leave a fading character behind (the trail).
 *  - Clicking adds an outward impulse + "panic" to every animal.
 */
(() => {
  'use strict';

  // ------------------------------------------------------------ storage
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('asciiGarden.' + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('asciiGarden.' + k, JSON.stringify(v)); } catch (e) { /* storage off */ }
    }
  };

  const settings = {
    name: store.get('name', ''),
    species: store.get('species', 'butterfly'),
    density: store.get('density', 1),
    trails: store.get('trails', true),
    bookmarks: store.get('bookmarks', true)
  };

  // ------------------------------------------------------------ helpers
  const TAU = Math.PI * 2;
  const CHARS = '$}{)(][-=+~^*#%&/\\|<>?!;:@0o';
  const rand = Math.random;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function hash(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash(xi, yi, s), hash(xi + 1, yi, s), u),
                lerp(hash(xi, yi + 1, s), hash(xi + 1, yi + 1, s), u), v);
  }

  // squared normalised ellipse distance (< 1 means inside)
  function ell(x, y, cx, cy, rx, ry) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    return dx * dx + dy * dy;
  }

  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
    const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lerpAngle(a, b, t) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return a + d * Math.min(1, t);
  }

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(rgb, k) {
    const f = k < 0 ? c => c * (1 + k) : c => c + (255 - c) * k;
    return `rgb(${f(rgb[0]) | 0},${f(rgb[1]) | 0},${f(rgb[2]) | 0})`;
  }

  // trail colours: each palette colour registers a muted version with 8 alpha steps
  const TRAIL_STYLES = [];
  const TRAIL_LEVELS = 8;
  function registerTrail(rgb) {
    const m = rgb.map(c => (c * 0.75 + 120 * 0.25) | 0);
    const styles = [];
    for (let i = 0; i < TRAIL_LEVELS; i++) styles.push(`rgba(${m[0]},${m[1]},${m[2]},${((i + 1) / TRAIL_LEVELS * 0.55).toFixed(3)})`);
    TRAIL_STYLES.push(styles);
    return TRAIL_STYLES.length - 1;
  }

  // "g:#hex" = character only (no tile), used for tentacles, fins
  // "a:#hex" = see-through tile, used for dragonfly wings
  function makePalette(list) {
    return [null].concat(list.map(s => {
      const glyph = s.startsWith('g:'), clear = s.startsWith('a:');
      const rgb = hexToRgb(glyph || clear ? s.slice(2) : s);
      const rgba = al => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${al})`;
      return {
        glyph,
        variants: clear ? [rgba(0.16), rgba(0.22), rgba(0.28)] : [shade(rgb, -0.14), shade(rgb, 0), shade(rgb, 0.12)],
        ink: clear ? rgba(0.75) : 'rgba(0,0,0,0.30)',
        glyphStyle: `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)`,
        trail: registerTrail(rgb)
      };
    }));
  }

  // ------------------------------------------------------------ species
  // Every shape is drawn facing +x (forward). Units are grid cells.
  const SPECIES = {

    butterfly: {
      label: 'Butterfly', dot: '#4f9bff', count: 14, radius: 7.2, scale: [0.8, 1.25],
      palette: makePalette(['#16213d', '#2563d8', '#4f9bff', '#8fd0ff', '#e8f6ff', 'g:#9cc4ff']),
      init(a) { a.wander = rand() * TAU; a.phase = rand() * TAU; },
      update(a, dt, U) {
        a.wander += (rand() - 0.5) * 5 * dt;
        const sp = 55 * U * (1 + a.panic * 2.6);
        steer(a, Math.cos(a.wander) * sp, Math.sin(a.wander) * sp, dt * 1.8);
        a.vy += Math.sin(a.t * 6 + a.seed) * 18 * U * dt; // bob
        a.h = lerpAngle(a.h, Math.atan2(a.vy, a.vx), dt * 5);
        a.phase += dt * (10 + a.panic * 16);
        a.flap = 0.22 + 0.78 * Math.abs(Math.cos(a.phase));
      },
      scatter(a, ang) { a.wander = ang; },
      shape(x, y, a) {
        const ay = Math.abs(y);
        if (ay < 0.55 && x > -3.6 && x < 2.6) return 1;               // body
        if (ell(x, y, 3.1, 0, 0.9, 0.8) < 1) return 1;                 // head
        if (x > 3.7 && x < 6.2 && Math.abs(ay - (x - 3.7) * 0.75) < 0.42) return 6; // antennae
        if (ay < 0.5) return 0;
        const wy = ay / a.flap;                                        // flap squashes the wings sideways
        const d1 = ell(x, wy, 1.0 + (wy - 3) * 0.28, 3.4, 2.4, 3.1);   // forewing
        const d2 = ell(x, wy, -1.9 - (wy - 2.5) * 0.18, 2.6, 1.9, 2.4); // hindwing
        const d = Math.min(d1, d2);
        if (d >= 1) return 0;
        if (d1 < 1 && ell(x, wy, 2.1, 4.8, 0.7, 0.7) < 1) return 5;    // pale spot
        if (d > 0.7) return 2;
        if (d > 0.28) return 3;
        return 4;
      }
    },

    jellyfish: {
      label: 'Jellyfish', dot: '#ff4fbf', count: 9, radius: 13.5, scale: [0.75, 1.2],
      palette: makePalette(['#a3106f', '#e03aa4', '#ff6fd0', '#ffc6ef', 'g:#ff8ad8', '#c42487']),
      init(a) { a.h = -Math.PI / 2 + (rand() - 0.5); a.target = -Math.PI / 2; a.cyc = rand(); a.c = 0; },
      update(a, dt, U) {
        a.cyc += dt * (0.5 + a.panic * 1.3);
        const f = a.cyc % 1;
        a.c = f < 0.32 ? Math.sin(f / 0.32 * Math.PI) : 0;            // bell contraction
        const thrust = 95 * U * a.c * (1 + a.panic * 1.8);
        a.vx += Math.cos(a.h) * thrust * dt * 3;
        a.vy += Math.sin(a.h) * thrust * dt * 3;
        const drag = Math.exp(-dt * 1.1);
        a.vx *= drag; a.vy *= drag;
        if (a.panic < 0.05) a.target = lerpAngle(a.target, -Math.PI / 2 + Math.sin(a.t * 0.3 + a.seed) * 0.6, dt * 0.5);
        a.h = lerpAngle(a.h, a.target, dt * 0.9);
      },
      scatter(a, ang) { a.target = ang; a.cyc = Math.floor(a.cyc); },
      shape(x, y, a) {
        const c = a.c;
        const rx = 3.4 * (1 + 0.22 * c), ry = 4.0 * (1 - 0.24 * c);
        if (x > -0.6) {
          const d = ell(x, y, -0.6, 0, rx, ry);
          if (d < 1) {
            if (ell(x, y, rx * 0.4, -ry * 0.38, 1.0, 1.1) < 1) return 4;
            if (d < 0.42) return 3;
            if (d < 0.8) return 2;
            return 1;
          }
          return 0;
        }
        if (x > -1.3 && Math.abs(y) < ry * 0.98) return 1;             // rim
        const t = a.t;
        if (x > -5.5 && Math.abs(y - Math.sin(x * 0.7 + t * 2.2) * 0.5) < 0.95 - (-x - 1.3) * 0.12) return 6; // oral arms
        if (x < -1.3) {
          for (let i = 0; i < 5; i++) {
            const len = 8 + (i % 2) * 3 + (i === 2 ? 1.5 : 0);
            if (-x - 1.3 > len) continue;
            const y0 = (-1 + i * 0.5) * ry * 0.85;
            const yy = y0 + Math.sin(x * 0.55 + t * 2.4 + i * 1.7) * 0.9 * (-x / 9);
            if (Math.abs(y - yy) < 0.42) return 5;
          }
        }
        return 0;
      }
    },

    dragonfly: {
      label: 'Dragonfly', dot: '#4fe08a', count: 11, radius: 9, scale: [0.8, 1.15],
      palette: makePalette(['#0e5229', '#1f9d50', '#5ee08a', '#c6ffd9', 'a:#b8ffd2']),
      init(a) { a.timer = rand(); a.th = a.h; a.buzz = 1; },
      update(a, dt, U) {
        a.timer -= dt * (1 + a.panic * 2);
        if (a.timer <= 0) {
          a.th = (a.flee != null ? a.flee : a.h + (rand() - 0.5) * 2.6);
          a.flee = null;
          const sp = (240 + rand() * 180) * U * (1 + a.panic);
          a.vx = Math.cos(a.th) * sp; a.vy = Math.sin(a.th) * sp;
          a.timer = 0.6 + rand() * 1.8;
        }
        const drag = Math.exp(-dt * 3.4);
        a.vx = a.vx * drag + (rand() - 0.5) * 40 * U * dt;
        a.vy = a.vy * drag + (rand() - 0.5) * 40 * U * dt;
        a.h = lerpAngle(a.h, a.th, dt * 14);
        a.buzz = 0.82 + 0.18 * Math.abs(Math.sin(a.t * 55));
      },
      scatter(a, ang) { a.flee = ang; a.timer = rand() * 0.08; },
      shape(x, y, a) {
        const ay = Math.abs(y);
        if (ell(x, y, 5.6, 0, 1.0, 1.35) < 1) return ay > 0.45 ? 4 : 1;  // head + eyes
        if (ell(x, y, 3.6, 0, 1.7, 1.0) < 1) return ay < 0.4 ? 3 : 2;   // thorax
        if (x > -8.2 && x < 2.2 && ay < 0.55 - (2.2 - x) * 0.018)        // abdomen
          return (Math.floor((x + 9) * 0.9) & 1) ? 2 : 1;
        const b = a.buzz;
        if (ell(x + ay * 0.08, ay, 4.1, 3.8 * b, 0.85, 3.5 * b) < 1) return 5; // forewings
        if (ell(x + ay * 0.16, ay, 2.6, 3.6 * b, 0.95, 3.4 * b) < 1) return 5; // hindwings
        return 0;
      }
    },

    koi: {
      label: 'Koi', dot: '#ffcc33', count: 11, radius: 9.6, scale: [0.8, 1.25],
      palettes: [
        makePalette(['#f4efe6', '#e0402b', 'g:#f2d6cc', '#ffffff', '#c9c1b5', '#1a1a1a']), // kohaku
        makePalette(['#f08a24', '#ffb347', 'g:#ffc98a', '#ffffff', '#c4651a', '#1a1a1a']), // ogon
        makePalette(['#f2c230', '#ffe27a', 'g:#ffe9a6', '#ffffff', '#c99a14', '#1a1a1a']), // yamabuki
        makePalette(['#f4efe6', '#26262b', 'g:#d9d9de', '#ffffff', '#c9c1b5', '#1a1a1a'])  // shiro
      ],
      init(a) {
        a.wander = rand() * TAU;
        a.pal = rand() < 0.5 ? 0 : (1 + (rand() * 3) | 0);
        a.sw = 0;
      },
      update(a, dt, U) {
        a.wander += (rand() - 0.5) * 1.8 * dt;
        const sp = 42 * U * (1 + a.panic * 3);
        steer(a, Math.cos(a.wander) * sp, Math.sin(a.wander) * sp, dt * 1.3);
        a.h = lerpAngle(a.h, Math.atan2(a.vy, a.vx), dt * 2.6);
        a.sw += dt * (4 + Math.hypot(a.vx, a.vy) / (12 * U));
      },
      scatter(a, ang) { a.wander = ang; },
      shape(x, y, a) {
        const sway = xx => Math.sin(a.sw - xx * 0.45) * 0.1 * (5 - xx);
        const yo = y - sway(x);
        const ay = Math.abs(yo);
        if (x > -5.5 && x < 5.2) {
          const u = (x + 5.5) / 10.7;
          const hw = 2.3 * Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.pow(u, 1.6))));
          if (ay < hw) {
            if (ell(x, ay, 3.5, 1.15, 0.5, 0.5) < 1) return 6;            // eyes
            if (ay > hw - 0.5) return 5;                                 // edge shade
            return vnoise(x * 0.42 + a.seed * 7, yo * 0.55, a.seed) > 0.52 ? 2 : 1;
          }
          if (ell(x, ay, 1.6, hw + 0.9, 0.9, 1.1) < 1) return 3;         // pectoral fins
        }
        const tx = -5.4 - x;                                             // tail
        if (tx > -0.2 && tx < 3.9) {
          const yt = y - sway(-5.4) - Math.sin(a.sw * 1.2) * tx * 0.25;
          const spread = 0.35 + tx * 0.7;
          const fork = tx > 2.3 && Math.abs(yt) < (tx - 2.3) * 1.1;
          if (Math.abs(yt) < spread && !fork) return 3;
        }
        return 0;
      }
    },

    frog: {
      label: 'Frog', dot: '#7fdc5a', count: 9, radius: 9.2, scale: [0.85, 1.2],
      palette: makePalette(['#1d5a18', '#3ea534', '#86e061', '#efffe0', '#0b1a08', '#2a7522']),
      init(a) { a.timer = rand() * 2; a.air = 0; a.legs = 0; },
      update(a, dt, U) {
        if (a.air > 0) {
          a.air -= dt;
          const drag = Math.exp(-dt * 1.4);
          a.vx *= drag; a.vy *= drag;
          a.legs = Math.min(1, a.legs + dt * 14);
          a.lift = Math.sin(clamp(1 - a.air / 0.45, 0, 1) * Math.PI);
        } else {
          const drag = Math.exp(-dt * 14);
          a.vx *= drag; a.vy *= drag;
          a.legs = Math.max(0, a.legs - dt * 5);
          a.lift = 0;
          a.timer -= dt;
          if (a.timer <= 0) {
            a.h = a.flee != null ? a.flee : a.h + (rand() - 0.5) * 1.9;
            a.flee = null;
            const sp = (230 + rand() * 130) * U * (1 + a.panic * 0.7);
            a.vx = Math.cos(a.h) * sp; a.vy = Math.sin(a.h) * sp;
            a.air = 0.45;
            a.timer = a.panic > 0.3 ? 0.12 + rand() * 0.2 : 0.9 + rand() * 2.4;
          }
        }
        a.sizeMul = 1 + 0.14 * (a.lift || 0);
      },
      scatter(a, ang) { a.flee = ang; if (a.air <= 0) a.timer = rand() * 0.12; },
      shape(x, y, a) {
        const ay = Math.abs(y);
        if (ell(x, ay, 2.8, 1.45, 0.85, 0.85) < 1)                      // eyes
          return ell(x, ay, 3.05, 1.5, 0.36, 0.36) < 1 ? 5 : 4;
        const dh = ell(x, y, 2.0, 0, 1.8, 2.0);
        const db = ell(x, y, -0.7, 0, 3.0, 2.5);
        if (dh < 1 || db < 1) {
          if (ay < 0.45 && x < 2.4 && x > -3) return 3;                 // stripe
          if (vnoise(x * 0.8 + a.seed * 3, y * 0.8, a.seed) > 0.7) return 6; // spots
          if (Math.min(dh, db) > 0.72) return 1;
          return 2;
        }
        const L = a.legs;
        const kx = lerp(-0.4, -5.0, L), ky = lerp(3.6, 2.9, L);
        const fx = lerp(0.8, -7.8, L), fy = lerp(3.1, 3.5, L);
        if (segDist(x, ay, -2.4, 1.8, kx, ky) < 0.72) return 2;          // thigh
        if (segDist(x, ay, kx, ky, fx, fy) < 0.5) return 2;             // shin
        if (ell(x, ay, fx, fy, 0.75, 0.75) < 1) return 1;               // foot
        if (segDist(x, ay, 1.3, 1.6, 2.3, 3.0) < 0.45) return 2;         // front legs
        if (ell(x, ay, 2.5, 3.2, 0.55, 0.55) < 1) return 1;
        return 0;
      }
    },

    crane: {
      label: 'Crane', dot: '#e8edf5', count: 8, radius: 9.4, scale: [0.85, 1.2],
      palette: makePalette(['#f5f7fa', '#c8d0db', '#8a96a8', '#1c2230', '#e0342c', '#d9c27a', 'g:#7d879a']),
      init(a) { a.wander = rand() * TAU; a.phase = rand() * TAU; a.glide = rand() * 3; a.span = 1; },
      update(a, dt, U) {
        a.wander += (rand() - 0.5) * 0.9 * dt;
        const sp = 72 * U * (1 + a.panic * 1.8);
        steer(a, Math.cos(a.wander) * sp, Math.sin(a.wander) * sp, dt * 0.9);
        a.h = lerpAngle(a.h, Math.atan2(a.vy, a.vx), dt * 2.2);
        a.glide -= dt;
        if (a.glide < -2.2) a.glide = 1.5 + rand() * 3;
        const flapping = a.glide < 0 || a.panic > 0.2;
        a.phase += dt * (3.4 + a.panic * 5);
        const target = flapping ? 0.58 + 0.42 * (0.5 + 0.5 * Math.cos(a.phase)) : 1;
        a.span = lerp(a.span, target, Math.min(1, dt * 10));
      },
      scatter(a, ang) { a.wander = ang; },
      shape(x, y, a) {
        const ay = Math.abs(y);
        if (ell(x, y, 0, 0, 3.0, 1.0) < 1) return x > 0.3 ? 1 : 2;       // body
        if (x > 2.4 && x < 5.8 && ay < 0.42) return 4;                   // neck
        if (ell(x, y, 6.2, 0, 0.8, 0.62) < 1)                            // head + red crown
          return ell(x, y, 6.1, 0, 0.38, 0.3) < 1 ? 5 : 1;
        if (x > 6.9 && x < 8.5 && ay < 0.3 - (x - 6.9) * 0.13) return 6; // beak
        if (x < -2.6 && x > -4.3 && ay < 0.9 + (-2.6 - x) * 0.35) return 2; // tail
        if (x < -3.6 && x > -7.2 && Math.abs(ay - 0.35) < 0.2) return 7; // trailing legs
        const span = 8.6 * a.span;
        if (ay > 0.6 && ay < span) {                                     // wings
          const k = ay / span;
          const lead = 1.25 - 0.9 * k - 0.7 * k * k;
          const chord = 2.9 * (1 - 0.5 * k);
          if (x < lead && x > lead - chord) {
            if (k > 0.82) return 4;
            if (x < lead - chord * 0.62) return 3;
            return k < 0.45 ? 1 : 2;
          }
        }
        return 0;
      }
    },

    crab: {
      label: 'Crab', dot: '#ff5a4a', count: 10, radius: 7.4, scale: [0.8, 1.25],
      palette: makePalette(['#741810', '#d8442e', '#ff7d58', '#fff2e0', '#1a0a08', '#b3301d']),
      init(a) { a.h = -Math.PI / 2; a.timer = rand(); a.side = rand() < 0.5 ? -1 : 1; a.speed = 0; a.walk = 0; a.drift = 0; },
      update(a, dt, U) {
        a.timer -= dt;
        if (a.timer <= 0) {
          if (rand() < 0.3 && a.panic < 0.2) { a.speed = 0; a.timer = 0.6 + rand() * 1.4; }
          else {
            if (rand() < 0.5) a.side *= -1;
            a.speed = (55 + rand() * 60) * U;
            a.drift = (rand() - 0.5) * 30 * U;
            a.timer = 0.8 + rand() * 1.8;
          }
        }
        const sp = a.speed * (1 + a.panic * 2.5);
        steer(a, a.side * sp, a.drift, dt * 6);
        a.h = -Math.PI / 2 + Math.sin(a.t * 1.4 + a.seed) * 0.07;
        a.walk += Math.hypot(a.vx, a.vy) * dt * 0.11 / U;
        a.pinch = 0.5 + 0.5 * Math.sin(a.t * 3 + a.seed);
      },
      scatter(a, ang) {
        a.side = Math.cos(ang) >= 0 ? 1 : -1;
        a.speed = (90 + rand() * 50) * U;
        a.drift = Math.sin(ang) * 60 * U;
        a.timer = 1 + rand();
      },
      scatterAxis: 'x',
      shape(x, y, a) {
        const ay = Math.abs(y);
        const d = ell(x, y, 0, 0, 2.3, 3.4);                             // shell
        if (d < 1) { if (ell(x, y, 0.7, 0, 0.9, 1.7) < 1) return 3; return d > 0.7 ? 1 : 2; }
        if (ell(x, ay, 2.65, 1.0, 0.55, 0.5) < 1)                         // eyes
          return ell(x, ay, 2.8, 1.0, 0.28, 0.28) < 1 ? 5 : 4;
        if (x > 1.8 && x < 2.3 && Math.abs(ay - 1.0) < 0.25) return 1;
        if (segDist(x, ay, 1.1, 2.5, 2.6, 3.8) < 0.5) return 6;           // arms
        if (ell(x, ay, 3.7, 4.0, 1.35, 1.15) < 1) {                       // claws
          if (x > 3.8 && Math.abs(ay - 4.0) < 0.3 * (0.4 + a.pinch)) return 0;
          return ell(x, ay, 3.4, 3.7, 0.5, 0.45) < 1 ? 3 : 2;
        }
        const side = y > 0 ? 0 : Math.PI;                                // legs
        for (let i = 0; i < 3; i++) {
          const w = Math.sin(a.walk + i * 2.1 + side) * 0.5;
          const bx = 0.4 - i * 1.05, kx = bx + w, tx = bx - 0.5 + w * 1.4;
          if (segDist(x, ay, bx, 2.9, kx, 4.6) < 0.4) return 6;
          if (segDist(x, ay, kx, 4.6, tx, 5.9) < 0.34) return 6;
        }
        return 0;
      }
    }
  };

  const ORDER = ['butterfly', 'jellyfish', 'dragonfly', 'koi', 'frog', 'crane', 'crab', 'mix'];
  if (!SPECIES[settings.species] && settings.species !== 'mix') settings.species = 'butterfly';

  function steer(a, tx, ty, k) {
    k = Math.min(1, k);
    a.vx += (tx - a.vx) * k;
    a.vy += (ty - a.vy) * k;
  }

  // ------------------------------------------------------------ canvas setup
  const bg = document.getElementById('bg');
  const bctx = bg.getContext('2d');
  const canvas = document.getElementById('garden');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, CS = 12, COLS = 0, ROWS = 0, U = 1;
  let trailLife = new Float32Array(0), trailChar = new Uint8Array(0), trailCol = new Uint16Array(0);
  let font = '';

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    CS = clamp(Math.round(Math.min(W, H) / 68), 8, 13);
    U = CS / 12;
    COLS = Math.ceil(W / CS); ROWS = Math.ceil(H / CS);
    for (const c of [bg, canvas]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    font = `${Math.max(6, Math.round(CS * 0.78))}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    trailLife = new Float32Array(COLS * ROWS);
    trailChar = new Uint8Array(COLS * ROWS);
    trailCol = new Uint16Array(COLS * ROWS);
    drawBackground();
  }

  function drawBackground() {
    bctx.fillStyle = '#0b0d12';
    bctx.fillRect(0, 0, W, H);
    // faint grid
    bctx.strokeStyle = 'rgba(255,255,255,0.028)';
    bctx.lineWidth = 1;
    bctx.beginPath();
    for (let x = 0; x <= COLS; x++) { bctx.moveTo(x * CS + 0.5, 0); bctx.lineTo(x * CS + 0.5, H); }
    for (let y = 0; y <= ROWS; y++) { bctx.moveTo(0, y * CS + 0.5); bctx.lineTo(W, y * CS + 0.5); }
    bctx.stroke();
    // scattered dim characters
    bctx.font = font; bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
    bctx.fillStyle = 'rgba(160,170,200,0.07)';
    for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < COLS; gx++) {
      if (hash(gx, gy, 7) < 0.012) bctx.fillText(CHARS[(hash(gx, gy, 9) * CHARS.length) | 0], gx * CS + CS / 2, gy * CS + CS / 2 + 0.5);
    }
    // vignette
    const g = bctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(30,36,56,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------ animals
  let animals = [];
  let seedCounter = 1;

  function areaFactor() { return clamp((W * H) / (1440 * 900), 0.35, 1.7); }

  function spawn(kind, n) {
    const sp = SPECIES[kind];
    for (let i = 0; i < n; i++) {
      const a = {
        kind, sp,
        x: rand() * W, y: rand() * H,
        vx: 0, vy: 0, h: rand() * TAU,
        size: lerp(sp.scale[0], sp.scale[1], rand()), sizeMul: 1,
        seed: seedCounter++, t: rand() * 10, panic: 0,
        reveal: 0, dying: false
      };
      sp.init(a);
      animals.push(a);
    }
  }

  function populate(kind) {
    for (const a of animals) a.dying = true;
    const f = areaFactor() * settings.density;
    if (kind === 'mix') {
      for (const k of ORDER) if (SPECIES[k]) spawn(k, Math.max(1, Math.round(SPECIES[k].count * f * 0.3)));
    } else {
      spawn(kind, Math.max(3, Math.round(SPECIES[kind].count * f)));
    }
  }

  // ------------------------------------------------------------ input
  const pointer = { x: -1e4, y: -1e4, active: false };
  const ripples = [];
  const hint = document.getElementById('hint');

  function scatter(px, py) {
    ripples.push({ x: px, y: py, t: 0 });
    const reach = Math.max(W, H) * 0.65;
    for (const a of animals) {
      const dx = a.x - px, dy = a.y - py;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.max(0.3, 1 - d / reach);
      a.panic = Math.min(1.6, a.panic + k);
      const ang = Math.atan2(dy, dx);
      const imp = 380 * U * k;
      if (a.sp.scatterAxis === 'x') a.vx += Math.sign(dx || 1) * imp;
      else { a.vx += dx / d * imp; a.vy += dy / d * imp; }
      a.sp.scatter(a, ang, k);
    }
    hint.classList.add('gone');
  }

  window.addEventListener('pointerdown', e => {
    if (!(e.target.closest && (e.target.closest('#bm-menu') || e.target.closest('.bm-folder')))) closeMenu();
    if (e.target.closest && e.target.closest('.ui')) return;
    closePanel();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    scatter(e.clientX, e.clientY);
  });
  window.addEventListener('pointermove', e => {
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.active = e.pointerType === 'mouse';
  });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
  window.addEventListener('blur', () => { pointer.active = false; });

  // ------------------------------------------------------------ simulation + render
  function update(dt) {
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i];
      a.t += dt;
      a.panic = Math.max(0, a.panic - dt * 0.55);
      if (a.dying) { a.reveal -= dt * 2.2; if (a.reveal <= 0) { animals.splice(i, 1); continue; } }
      else a.reveal = Math.min(1, a.reveal + dt * 1.3);

      if (pointer.active) {                                     // shy of the cursor
        const dx = a.x - pointer.x, dy = a.y - pointer.y;
        const d = Math.hypot(dx, dy);
        const r = 150 * U;
        if (d < r && d > 0.1) {
          const f = (1 - d / r) * 900 * U * dt;
          if (a.sp.scatterAxis === 'x') a.vx += Math.sign(dx) * f;
          else { a.vx += dx / d * f; a.vy += dy / d * f; }
          a.panic = Math.max(a.panic, 0.25 * (1 - d / r));
        }
      }

      a.sp.update(a, dt, U);
      a.x += a.vx * dt;
      a.y += a.vy * dt;

      const m = a.sp.radius * a.size * CS;                      // wrap around edges
      if (a.x < -m) a.x += W + 2 * m; else if (a.x > W + m) a.x -= W + 2 * m;
      if (a.y < -m) a.y += H + 2 * m; else if (a.y > H + m) a.y -= H + 2 * m;
    }
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 1.1) ripples.splice(i, 1); }
  }

  function drawTrails(dt) {
    const decay = dt * 0.85;
    let lastStyle = '';
    for (let i = 0, n = trailLife.length; i < n; i++) {
      let l = trailLife[i];
      if (l <= 0) continue;
      l -= decay; trailLife[i] = l;
      if (l <= 0) continue;
      const style = TRAIL_STYLES[trailCol[i]][Math.min(TRAIL_LEVELS - 1, (l * TRAIL_LEVELS) | 0)];
      if (style !== lastStyle) { ctx.fillStyle = style; lastStyle = style; }
      const gx = i % COLS, gy = (i / COLS) | 0;
      ctx.fillText(CHARS[trailChar[i]], gx * CS + CS / 2, gy * CS + CS / 2 + 0.5);
    }
  }

  function drawRipples() {
    for (const r of ripples) {
      for (let ring = 0; ring < 2; ring++) {
        const t = r.t - ring * 0.14;
        if (t <= 0) continue;
        const rad = t * 340 * U + 6;
        const alpha = Math.max(0, 1 - t / 0.95);
        if (alpha <= 0) continue;
        const n = Math.max(6, Math.floor(rad * TAU / (CS * 1.7)));
        ctx.fillStyle = `rgba(215,225,255,${(alpha * (ring ? 0.35 : 0.7)).toFixed(3)})`;
        for (let i = 0; i < n; i++) {
          const ang = i / n * TAU + ring * 0.2;
          const gx = Math.floor((r.x + Math.cos(ang) * rad) / CS);
          const gy = Math.floor((r.y + Math.sin(ang) * rad) / CS);
          ctx.fillText(ring ? '.' : 'o', gx * CS + CS / 2, gy * CS + CS / 2);
        }
      }
    }
  }

  function drawAnimal(a) {
    const sp = a.sp;
    const pal = sp.palettes ? sp.palettes[a.pal] : sp.palette;
    const size = a.size * (a.sizeMul || 1);
    const R = sp.radius * size;
    const cx = a.x / CS, cy = a.y / CS;
    const gx0 = Math.max(0, Math.floor(cx - R)), gx1 = Math.min(COLS - 1, Math.ceil(cx + R));
    const gy0 = Math.max(0, Math.floor(cy - R)), gy1 = Math.min(ROWS - 1, Math.ceil(cy + R));
    if (gx0 > gx1 || gy0 > gy1) return;
    const c = Math.cos(a.h), s = Math.sin(a.h), inv = 1 / size, R2 = R * R;
    const reveal = a.reveal, trails = settings.trails;
    const gap = CS >= 10 ? 1 : 0.5, tile = CS - gap * 2, half = CS / 2;

    for (let gy = gy0; gy <= gy1; gy++) {
      const dy = gy + 0.5 - cy;
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = gx + 0.5 - cx;
        if (dx * dx + dy * dy > R2) continue;
        const lx = (dx * c + dy * s) * inv;
        const ly = (-dx * s + dy * c) * inv;
        const idx = sp.shape(lx, ly, a);
        if (!idx) continue;
        const e = pal[idx];
        const h1 = hash(gx, gy, a.seed);
        let asGlyph = e.glyph;
        if (reveal < 1) {                                       // assemble / dissolve effect
          const hr = hash(gx, gy, a.seed + 77);
          if (hr > reveal + 0.25) continue;
          if (hr > reveal) asGlyph = true;
        }
        const px = gx * CS, py = gy * CS;
        const ch = CHARS[(h1 * CHARS.length) | 0];
        if (asGlyph) {
          ctx.fillStyle = e.glyphStyle;
          ctx.fillText(ch, px + half, py + half + 0.5);
          continue;
        }
        ctx.fillStyle = e.variants[(h1 * 3) | 0];
        ctx.fillRect(px + gap, py + gap, tile, tile);
        ctx.fillStyle = e.ink;
        ctx.fillText(ch, px + half, py + half + 0.5);
        if (trails && hash(gx, gy, 4242) < 0.32) {               // leave a character behind
          const ti = gy * COLS + gx;
          trailLife[ti] = 1;
          trailCol[ti] = e.trail;
          trailChar[ti] = (rand() * CHARS.length) | 0;
        }
      }
    }
  }

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (reduceMotion) dt *= 0.45;
    update(dt);
    ctx.clearRect(0, 0, W, H);
    drawTrails(dt);
    drawRipples();
    for (const a of animals) drawAnimal(a);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ UI
  const nav = document.getElementById('species');
  const buttons = {};
  for (const k of ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = k === 'mix'
      ? 'conic-gradient(#4f9bff, #ff4fbf, #ffcc33, #7fdc5a, #4f9bff)'
      : SPECIES[k].dot;
    b.append(dot, document.createTextNode(k === 'mix' ? 'Mix' : SPECIES[k].label));
    b.addEventListener('click', () => setSpecies(k));
    nav.appendChild(b);
    buttons[k] = b;
  }

  function setSpecies(k) {
    settings.species = k;
    store.set('species', k);
    for (const key in buttons) buttons[key].classList.toggle('on', key === k);
    buttons[k].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    populate(k);
  }

  // settings panel
  const gear = document.getElementById('gear');
  const panel = document.getElementById('panel');
  const setName = document.getElementById('set-name');
  const setDensity = document.getElementById('set-density');
  const setTrails = document.getElementById('set-trails');
  setName.value = settings.name;
  setDensity.value = settings.density;
  setTrails.checked = settings.trails;

  function closePanel() { panel.hidden = true; gear.setAttribute('aria-expanded', 'false'); }
  gear.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    gear.setAttribute('aria-expanded', String(!panel.hidden));
  });
  setName.addEventListener('input', () => {
    settings.name = setName.value.trim();
    store.set('name', settings.name);
    updateClock();
  });
  setDensity.addEventListener('change', () => {
    settings.density = parseFloat(setDensity.value) || 1;
    store.set('density', settings.density);
    populate(settings.species);
  });
  setTrails.addEventListener('change', () => {
    settings.trails = setTrails.checked;
    store.set('trails', settings.trails);
    if (!settings.trails) trailLife.fill(0);
  });
  const setBookmarks = document.getElementById('set-bookmarks');
  setBookmarks.checked = settings.bookmarks;
  setBookmarks.addEventListener('change', () => {
    settings.bookmarks = setBookmarks.checked;
    store.set('bookmarks', settings.bookmarks);
    loadBookmarks();
  });

  // ------------------------------------------------------------ bookmarks bar
  // Brave hides its own bookmarks bar on custom new tab pages, so we draw one.
  const bmBar = document.getElementById('bookmarks');
  const bmMenu = document.getElementById('bm-menu');
  const api = (typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.getTree) ? chrome.bookmarks : null;
  const DEMO = [   // shown only in the web preview, where there is no bookmarks API
    { title: 'GitHub', url: 'https://github.com' },
    { title: 'YouTube', url: 'https://www.youtube.com' },
    { title: 'Claude', url: 'https://claude.ai' },
    { title: 'Reading', children: [{ title: 'MDN Web Docs', url: 'https://developer.mozilla.org' }, { title: 'Hacker News', url: 'https://news.ycombinator.com' }] }
  ];
  const FOLDER_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
  let menuAnchor = null;
  let layoutBar = () => {};

  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u || ''; } }

  function letterIcon(node) {
    const s = document.createElement('span');
    const host = hostOf(node.url);
    s.className = 'ico';
    s.textContent = (node.title || host || '?').trim().charAt(0).toUpperCase();
    s.style.background = `hsl(${(hash(host.length, host.charCodeAt(0) || 0, host.charCodeAt(1) || 0) * 360) | 0},65%,68%)`;
    return s;
  }

  function iconFor(node) {
    if (api && chrome.runtime && chrome.runtime.getURL && /^https?:/i.test(node.url || '')) {
      const img = document.createElement('img');
      img.alt = ''; img.width = 16; img.height = 16;
      img.src = chrome.runtime.getURL('/_favicon/?pageUrl=' + encodeURIComponent(node.url) + '&size=32');
      img.addEventListener('error', () => img.replaceWith(letterIcon(node)), { once: true });
      return img;
    }
    return letterIcon(node);
  }

  function makeItem(node) {
    const isFolder = !node.url;
    const el = document.createElement(isFolder ? 'button' : 'a');
    el.className = 'bm' + (isFolder ? ' bm-folder' : '');
    if (isFolder) {
      el.type = 'button';
      el.innerHTML = FOLDER_SVG;
      el.addEventListener('click', () => {
        if (menuAnchor === el && !bmMenu.hidden) { closeMenu(); return; }
        openMenu(el, node.children || []);
      });
    } else {
      el.href = node.url;
      el.title = (node.title ? node.title + '\n' : '') + node.url;
      el.appendChild(iconFor(node));
    }
    const label = node.title || (isFolder ? 'Folder' : '');
    if (label) {
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = label;
      el.appendChild(t);
    }
    return el;
  }

  function openMenu(anchor, nodes, stack) {
    stack = stack || [];
    if (menuAnchor) menuAnchor.classList.remove('open');
    menuAnchor = anchor;
    anchor.classList.add('open');
    bmMenu.textContent = '';
    if (stack.length) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'bm back';
      back.textContent = '← Back';
      back.addEventListener('click', () => { const prev = stack.slice(0, -1); openMenu(anchor, stack[stack.length - 1], prev); });
      bmMenu.appendChild(back);
    }
    if (!nodes.length) {
      const p = document.createElement('div');
      p.className = 'empty';
      p.textContent = 'Empty folder';
      bmMenu.appendChild(p);
    }
    for (const n of nodes) {
      if (n.url) { bmMenu.appendChild(makeItem(n)); continue; }
      const sub = makeItem(n);
      const fresh = sub.cloneNode(true);                 // drop the bar-style click handler
      fresh.addEventListener('click', () => openMenu(anchor, n.children || [], stack.concat([nodes])));
      bmMenu.appendChild(fresh);
    }
    bmMenu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = bmMenu.offsetWidth;
    bmMenu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    bmMenu.style.top = (r.bottom + 4) + 'px';
  }

  function closeMenu() {
    bmMenu.hidden = true;
    if (menuAnchor) menuAnchor.classList.remove('open');
    menuAnchor = null;
  }

  function renderBar(items, other) {
    closeMenu();
    bmBar.textContent = '';
    if (!settings.bookmarks || (!items.length && !(other && other.length))) { bmBar.hidden = true; return; }
    bmBar.hidden = false;
    const list = document.createElement('div');
    list.className = 'bm-list';
    const els = items.map(n => list.appendChild(makeItem(n)));
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'bm bm-more bm-folder';
    more.title = 'More bookmarks';
    more.textContent = '»';
    bmBar.append(list, more);
    if (other && other.length) bmBar.appendChild(makeItem({ title: 'Other bookmarks', children: other }));

    let hidden = [];
    more.addEventListener('click', () => {
      if (menuAnchor === more && !bmMenu.hidden) { closeMenu(); return; }
      openMenu(more, hidden);
    });
    layoutBar = () => {
      const fit = () => {
        hidden = [];
        for (const e of els) e.style.display = '';
        const avail = list.clientWidth;
        for (let i = 0; i < els.length; i++) {
          if (els[i].offsetLeft + els[i].offsetWidth > avail) {
            hidden = items.slice(i);
            for (let j = i; j < els.length; j++) els[j].style.display = 'none';
            break;
          }
        }
      };
      more.style.display = 'none';
      fit();
      if (hidden.length) { more.style.display = ''; fit(); }
    };
    layoutBar();
  }

  function loadBookmarks() {
    if (!api) { renderBar(DEMO, []); return; }
    api.getTree(tree => {
      const roots = (tree && tree[0] && tree[0].children) || [];
      const bar = roots.find(n => n.id === '1') || roots[0];
      const other = roots.find(n => n.id === '2');
      renderBar((bar && bar.children) || [], (other && other.children) || []);
    });
  }

  if (api) {
    for (const ev of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
      if (api[ev]) api[ev].addListener(() => loadBookmarks());
    }
  }
  window.addEventListener('resize', () => { closeMenu(); layoutBar(); });
  loadBookmarks();

  // keyboard: 1..8 switch species, Esc closes panel
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Escape') { closePanel(); closeMenu(); return; }
    if (tag === 'input' || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= ORDER.length) setSpecies(ORDER[n - 1]);
  });

  // greeting + clock
  const greet = document.getElementById('greet');
  const clock = document.getElementById('clock');
  const orb = document.getElementById('orb');
  function updateClock() {
    const d = new Date();
    const hr = d.getHours();
    const who = settings.name ? `, ${settings.name}` : '';
    let text, mood;
    if (hr >= 5 && hr < 12) { text = `Good morning${who}`; mood = 'day'; }
    else if (hr >= 12 && hr < 17) { text = `Good afternoon${who}`; mood = 'day'; }
    else if (hr >= 17 && hr < 21) { text = `Good evening${who}`; mood = 'dusk'; }
    else if (hr >= 21) { text = `Good night${who}`; mood = 'night'; }
    else { text = `Still up${who}?`; mood = 'night'; }
    greet.textContent = text;
    orb.className = 'orb ' + mood;
    clock.textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
      + '  ·  ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  setInterval(updateClock, 15000);

  // search
  const form = document.getElementById('search');
  const q = document.getElementById('q');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = q.value.trim();
    if (!v) return;
    let url;
    if (/^https?:\/\//i.test(v)) url = v;
    else if (!/\s/.test(v) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(v)) url = 'https://' + v;
    else url = 'https://www.google.com/search?q=' + encodeURIComponent(v);
    let framed = false;
    try { framed = window.top !== window.self; } catch (err) { framed = true; }
    if (framed) {
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener';
      document.body.appendChild(link); link.click(); link.remove();
    } else {
      location.href = url;
    }
  });

  // ------------------------------------------------------------ go
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const oldW = W, oldH = H;
      resize();
      for (const a of animals) { a.x *= W / oldW; a.y *= H / oldH; }
    }, 120);
  });

  resize();
  updateClock();
  setSpecies(settings.species);
  for (const a of animals) a.reveal = 1;                       // first load: no assemble delay
  requestAnimationFrame(frame);

  // test hook (harmless)
  window.__garden = { setSpecies, scatter, animals: () => animals };
})();
