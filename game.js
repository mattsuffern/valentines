/* ------------------------------------------------------------------
   A WALK IN THE MEADOW
   A cozy, top-down game: walk around, pick flowers, bring them to
   your girlfriend — but watch out for wasps. Touch one and you get
   stung, drop whatever you're carrying, and get bounced back to the
   start with a moment of safety before they can catch you again.

   Extras:
     - Golden flowers grant a brief speed boost; lavender flowers
       throw up a scent aura that makes nearby wasps flee.
     - A smooth day/night cycle drifts from daylight through a warm
       golden hour into indigo night, with fireflies drifting through
       the meadow once it's dark.
     - Drop a honey jar (E / Space / the honey button) to lure wasps
       away from you for a few seconds, clearing a safe window to
       harvest nearby flowers.
     - A quiet, synthesized pentatonic melody loops in the background
       (Web Audio API, no audio files); mute it from the top-right
       button any time.

   Everything here is drawn with the Canvas 2D API — no external
   libraries, no CDN, no WebGL. That keeps it small, fast, and safe
   to run anywhere GitHub Pages serves it, including on phones.
------------------------------------------------------------------- */

// ---------- Canvas setup ----------
const canvas = document.createElement('canvas');
document.body.insertBefore(canvas, document.body.firstChild);
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ---------- Small drawing helpers ----------
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function circle(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function ellipse(c, x, y, rx, ry, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
}

function randomRange(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Generic keyframe interpolator used by the day/night cycle below.
// `frames` is an array of { pos, value } sorted by ascending pos
// (0..1); `value` can be a plain number or a flat object of numbers.
function interpKeyframes(frames, pos) {
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    if (pos >= a.pos && pos <= b.pos) {
      const t = (pos - a.pos) / ((b.pos - a.pos) || 1);
      if (typeof a.value === 'number') return a.value + (b.value - a.value) * t;
      const out = {};
      for (const k in a.value) out[k] = a.value[k] + (b.value[k] - a.value[k]) * t;
      return out;
    }
  }
  return frames[frames.length - 1].value;
}

// ---------- World constants ----------
const FIELD_RADIUS = 1300;
const SPEED = 260;              // px/sec
const SPEED_BOOST_MULTIPLIER = 1.6;
const SPEED_BOOST_DURATION = 5; // seconds, granted by golden flowers
const REPEL_DURATION = 6;       // seconds, granted by lavender flowers
const REPEL_RADIUS = 150;       // px — wasps flee the player within this range
const MAX_CARRY = 6;
const PICKUP_RADIUS = 42;
const DELIVER_RADIUS = 72;
const TREE_COLLISION_RADIUS = 30;
const GIRLFRIEND_COLLISION_RADIUS = 32;
const PLAYER_RADIUS = 15;

const PETAL_COLORS = ['#ff6f91', '#ffc145', '#b185db', '#ff8552', '#f8f4ef'];

// ---------- Weather cycle ----------
// Several weather "kinds" take turns, each held for a while and
// crossfaded smoothly into the next one. Each kind defines a tint
// overlay (as r/g/b/a so it can be blended numerically), whether it
// rains and how hard, and whether it can throw lightning.
const WEATHER_KINDS = {
  sunny:  { overlay: { r: 255, g: 255, b: 255, a: 0.00 }, precip: null,   precipIntensity: 0,   lightning: false },
  cloudy: { overlay: { r: 130, g: 135, b: 145, a: 0.30 }, precip: null,   precipIntensity: 0,   lightning: false },
  rain:   { overlay: { r: 60,  g: 75,  b: 95,  a: 0.38 }, precip: 'rain', precipIntensity: 1,   lightning: false },
  storm:  { overlay: { r: 40,  g: 45,  b: 60,  a: 0.52 }, precip: 'rain', precipIntensity: 1.7, lightning: true  },
};
const WEATHER_ORDER = Object.keys(WEATHER_KINDS);

function weatherDuration(kind) {
  switch (kind) {
    case 'sunny':  return randomRange(90, 160); // long, comfortable stretches
    case 'cloudy': return randomRange(20, 35);
    case 'rain':   return randomRange(10, 20);
    case 'storm':  return randomRange(7, 14);
    default:       return 20;
  }
}

// Weighted so sunny is by far the most likely thing to come next —
// rain and storms still happen, just as occasional visitors rather
// than a regular part of the rotation.
const WEATHER_WEIGHTS = { sunny: 6, cloudy: 3, rain: 1.3, storm: 0.5 };

function pickNextWeather(exclude) {
  const options = WEATHER_ORDER.filter(k => k !== exclude);
  const totalWeight = options.reduce((sum, k) => sum + WEATHER_WEIGHTS[k], 0);
  let r = Math.random() * totalWeight;
  for (const k of options) {
    r -= WEATHER_WEIGHTS[k];
    if (r <= 0) return k;
  }
  return options[options.length - 1];
}

const WEATHER = {
  current: 'sunny',
  next: null,
  timeInState: 0,
  stateDuration: weatherDuration('sunny'),
  crossfade: 0,           // 0 = fully `current`, 1 = fully `next` (only set mid-transition)
  crossfadeLength: 3,     // seconds to blend between weather kinds
  lightningFlash: 0,      // 0..1, brief white flash during storms
  lightningTimer: randomRange(4, 9),
};

function updateWeather(dt) {
  if (WEATHER.next) {
    WEATHER.crossfade = clamp(WEATHER.crossfade + dt / WEATHER.crossfadeLength, 0, 1);
    if (WEATHER.crossfade >= 1) {
      WEATHER.current = WEATHER.next;
      WEATHER.next = null;
      WEATHER.crossfade = 0;
      WEATHER.timeInState = 0;
      WEATHER.stateDuration = weatherDuration(WEATHER.current);
    }
  } else {
    WEATHER.timeInState += dt;
    if (WEATHER.timeInState >= WEATHER.stateDuration) {
      WEATHER.next = pickNextWeather(WEATHER.current);
      WEATHER.crossfade = 0;
    }
  }

  const inStorm = WEATHER.current === 'storm' || WEATHER.next === 'storm';
  if (inStorm) {
    WEATHER.lightningTimer -= dt;
    if (WEATHER.lightningTimer <= 0) {
      WEATHER.lightningFlash = 1;
      WEATHER.lightningTimer = randomRange(3, 9);
    }
  }
  WEATHER.lightningFlash = Math.max(0, WEATHER.lightningFlash - dt * 3.2);
}

function currentOverlay() {
  const a = WEATHER_KINDS[WEATHER.current].overlay;
  if (!WEATHER.next) return a;
  const b = WEATHER_KINDS[WEATHER.next].overlay;
  const t = WEATHER.crossfade;
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

function currentPrecip() {
  const curKind = WEATHER_KINDS[WEATHER.current];
  if (!WEATHER.next) {
    return { type: curKind.precip, intensity: curKind.precipIntensity };
  }
  const nextKind = WEATHER_KINDS[WEATHER.next];
  const t = WEATHER.crossfade;
  if (curKind.precip === nextKind.precip) {
    return {
      type: curKind.precip,
      intensity: curKind.precipIntensity + (nextKind.precipIntensity - curKind.precipIntensity) * t,
    };
  }
  if (t < 0.5) return { type: curKind.precip, intensity: curKind.precipIntensity * (1 - t * 2) };
  return { type: nextKind.precip, intensity: nextKind.precipIntensity * ((t - 0.5) * 2) };
}

// ---------- Day / night cycle ----------
// A slow, continuous clock drives a smooth sky tint from bright day
// through a warm golden hour into indigo night and back again.
// `nightAmount` (0..1) also fades the fireflies in and out.
const DAY_CYCLE_LENGTH = 240; // seconds for one full day-night cycle

const SKY_KEYFRAMES = [
  { pos: 0.00, value: { r: 255, g: 255, b: 255, a: 0.00 } }, // daylight
  { pos: 0.35, value: { r: 255, g: 255, b: 255, a: 0.00 } },
  { pos: 0.45, value: { r: 255, g: 150, b: 70,  a: 0.30 } }, // sunset golden hour
  { pos: 0.55, value: { r: 20,  g: 22,  b: 60,  a: 0.55 } }, // night falls
  { pos: 0.85, value: { r: 20,  g: 22,  b: 60,  a: 0.55 } },
  { pos: 0.95, value: { r: 255, g: 180, b: 110, a: 0.26 } }, // sunrise golden hour
  { pos: 1.00, value: { r: 255, g: 255, b: 255, a: 0.00 } },
];

const NIGHT_FACTOR_KEYFRAMES = [
  { pos: 0.00, value: 0 },
  { pos: 0.40, value: 0 },
  { pos: 0.55, value: 1 },
  { pos: 0.85, value: 1 },
  { pos: 0.97, value: 0 },
  { pos: 1.00, value: 0 },
];

let dayTime = DAY_CYCLE_LENGTH * 0.15; // start in bright morning
let daySkyTint = SKY_KEYFRAMES[0].value;
let nightAmount = 0;

function updateDayNight(dt) {
  dayTime = (dayTime + dt) % DAY_CYCLE_LENGTH;
  const cyclePos = dayTime / DAY_CYCLE_LENGTH;
  daySkyTint = interpKeyframes(SKY_KEYFRAMES, cyclePos);
  nightAmount = interpKeyframes(NIGHT_FACTOR_KEYFRAMES, cyclePos);
}

function drawDayNightOverlay() {
  if (daySkyTint.a > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(${daySkyTint.r | 0}, ${daySkyTint.g | 0}, ${daySkyTint.b | 0}, ${daySkyTint.a})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

// ---------- Precipitation particles (screen-space, cheap) ----------
const MAX_PRECIP = 220;

function makeRainDrop() {
  return { x: Math.random(), y: Math.random(), len: randomRange(10, 22), speed: randomRange(650, 950), drift: randomRange(-70, -40) };
}
const rainDrops = Array.from({ length: MAX_PRECIP }, makeRainDrop);

function updatePrecipitation(dt) {
  const precip = currentPrecip();
  if (precip.type === 'rain' && precip.intensity > 0) {
    for (const d of rainDrops) {
      d.y += (d.speed * dt) / canvas.height;
      d.x += (d.drift * dt) / canvas.width;
      if (d.y > 1) { d.y = -0.02; d.x = Math.random(); }
      if (d.x < 0) d.x = 1;
      if (d.x > 1) d.x = 0;
    }
  }
}

function drawPrecipitation() {
  const precip = currentPrecip();
  if (!precip.type || precip.intensity <= 0.01) return;
  const amount = clamp(precip.intensity, 0, 1);
  ctx.save();
  ctx.globalAlpha = amount * 0.55;
  ctx.strokeStyle = '#cfe3f2';
  ctx.lineWidth = 1.4;
  const count = Math.floor(MAX_PRECIP * amount);
  for (let i = 0; i < count; i++) {
    const d = rainDrops[i];
    const x = d.x * canvas.width, y = d.y * canvas.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y + d.len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWeatherOverlay() {
  const o = currentOverlay();
  if (o.a > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(${o.r | 0}, ${o.g | 0}, ${o.b | 0}, ${o.a})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  if (WEATHER.lightningFlash > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${WEATHER.lightningFlash * 0.65})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

// ---------- Grass texture (pre-rendered once, tiled at draw time) ----------
const TILE = 160;
const grassTile = document.createElement('canvas');
grassTile.width = grassTile.height = TILE;
(function paintGrassTile() {
  const g = grassTile.getContext('2d');
  g.fillStyle = '#83b862';
  g.fillRect(0, 0, TILE, TILE);
  const shades = ['#79ab58', '#8fc670', '#6f9e4f'];
  for (let i = 0; i < 55; i++) {
    g.fillStyle = shades[i % shades.length];
    const x = Math.random() * TILE, y = Math.random() * TILE;
    const r = Math.random() * 5 + 2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#628f45';
  g.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * TILE, y = Math.random() * TILE;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 5); g.stroke();
  }
})();

function drawGround(camX, camY) {
  const startX = Math.floor((camX - canvas.width / 2) / TILE) * TILE;
  const startY = Math.floor((camY - canvas.height / 2) / TILE) * TILE;
  const endX = camX + canvas.width / 2 + TILE;
  const endY = camY + canvas.height / 2 + TILE;
  for (let wx = startX; wx < endX; wx += TILE) {
    for (let wy = startY; wy < endY; wy += TILE) {
      const sx = canvas.width / 2 - camX + wx;
      const sy = canvas.height / 2 - camY + wy;
      ctx.drawImage(grassTile, sx, sy);
    }
  }
}

// ---------- People ----------
function makePerson(x, y, palette) {
  return { x, y, facing: 'down', walking: false, walkPhase: 0, idlePhase: Math.random() * Math.PI * 2, palette, waveTimer: 0 };
}

const player = makePerson(0, 480, {
  skin: '#e8b98a', hair: '#3b2a20', body: '#8a5c3c', outfit: 'shirt', hairLength: 0
});
player.carrying = 0;
player.invulnerable = false;
player.invulnTimer = 0;
player.speedBoostTimer = 0;
player.repelTimer = 0;

const girlfriend = makePerson(0, -260, {
  skin: '#efc49b', hair: '#5c3a22', body: '#8a5fd6', outfit: 'dress', hairLength: 8
});
girlfriend.facing = 'down';
girlfriend.given = 0;

function drawPerson(p, isGirlfriend) {
  const { x, y, facing, walking, walkPhase, palette } = p;
  const bounce = walking ? Math.abs(Math.sin(walkPhase * 2)) * 3 : Math.sin(p.idlePhase) * 1.4;
  const cy = y - bounce;
  const step = walking ? Math.sin(walkPhase) * 5 : 0;

  // shadow
  ctx.fillStyle = 'rgba(30,20,10,0.25)';
  ellipse(ctx, x, y + 4, 15, 6);

  // feet
  ctx.fillStyle = '#3a2a1e';
  ellipse(ctx, x - 6, cy + 14 + Math.max(0, step), 4, 3);
  ellipse(ctx, x + 6, cy + 14 + Math.max(0, -step), 4, 3);

  // arm nubs
  ctx.fillStyle = palette.body;
  ellipse(ctx, x - 13, cy + 3, 4, 6);
  ellipse(ctx, x + 13, cy + 3, 4, 6);

  // body: a flared dress or a plain shirt torso
  if (palette.outfit === 'dress') {
    ctx.fillStyle = palette.body;
    ctx.beginPath();
    ctx.moveTo(x - 8, cy + 4);
    ctx.lineTo(x + 8, cy + 4);
    ctx.lineTo(x + 15, cy + 21);
    ctx.quadraticCurveTo(x, cy + 26, x - 15, cy + 21);
    ctx.closePath();
    ctx.fill();
    roundRectPath(ctx, x - 10, cy - 2, 20, 14, 7);
    ctx.fill();
  } else {
    roundRectPath(ctx, x - 11, cy - 2, 22, 20, 8);
    ctx.fill();
  }

  // head
  ctx.fillStyle = palette.skin;
  circle(ctx, x, cy - 15, 13);

  // hair + face
  ctx.fillStyle = palette.hair;
  if (facing === 'up') {
    circle(ctx, x, cy - 15, 13.5);
  } else {
    ctx.beginPath();
    ctx.arc(x, cy - 18, 12.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2016';
    if (facing === 'down') {
      circle(ctx, x - 4, cy - 14, 1.6);
      circle(ctx, x + 4, cy - 14, 1.6);
    } else if (facing === 'left') {
      circle(ctx, x - 5, cy - 14, 1.6);
    } else if (facing === 'right') {
      circle(ctx, x + 5, cy - 14, 1.6);
    }
  }

  // hair draping past the shoulders — length varies per character
  if (palette.hairLength > 0) {
    ctx.fillStyle = palette.hair;
    ellipse(ctx, x - 11, cy - 1, 4.5, palette.hairLength);
    ellipse(ctx, x + 11, cy - 1, 4.5, palette.hairLength);
  }

  if (isGirlfriend) {
    // a little flower crown instead of the old sparkle accents
    drawFlower(x - 8, cy - 26, '#ff8552', 0.35, 0.4, elapsed);
    drawFlower(x, cy - 29, '#ffc145', 0.4, 1.1, elapsed);
    drawFlower(x + 8, cy - 26, '#b185db', 0.35, 2.0, elapsed);
  }

  return cy;
}

// ---------- Flowers ----------
// Most flowers are ordinary bouquet fillers, but a few rare variants
// grant the player a temporary boost when picked up.
const FLOWER_GOLDEN_CHANCE = 0.10;
const FLOWER_LAVENDER_CHANCE = 0.10;

function pickFlowerType() {
  const r = Math.random();
  if (r < FLOWER_GOLDEN_CHANCE) return 'golden';
  if (r < FLOWER_GOLDEN_CHANCE + FLOWER_LAVENDER_CHANCE) return 'lavender';
  return 'regular';
}

function drawFlower(x, y, color, scale, phase, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(time * 1.4 + phase) * 0.15);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(30,20,10,0.18)';
  ellipse(ctx, 0, 3, 9, 4);

  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ellipse(ctx, Math.cos(a) * 6, Math.sin(a) * 6, 5, 3.2, a);
  }
  ctx.fillStyle = '#ffd23f';
  circle(ctx, 0, 0, 4);
  ctx.restore();
}

// Wraps drawFlower with an extra glow ring for the special variants,
// so golden/lavender flowers read as special from a distance.
function drawFieldFlower(f, time) {
  if (f.type === 'golden') {
    ctx.save();
    ctx.globalAlpha = 0.30 + Math.sin(time * 5 + f.phase) * 0.12;
    ctx.fillStyle = '#fff2b0';
    circle(ctx, f.x, f.y, 15);
    ctx.restore();
  } else if (f.type === 'lavender') {
    ctx.save();
    ctx.globalAlpha = 0.18 + Math.sin(time * 3 + f.phase) * 0.06;
    ctx.fillStyle = '#c9a6f0';
    circle(ctx, f.x, f.y, 30);
    ctx.restore();
  }
  drawFlower(f.x, f.y, f.color, 1, f.phase, time);
}

const flowers = []; // { x, y, color, type, phase, id }
let flowerIdCounter = 0;

function randomFieldSpot(minDist) {
  let x, z, tries = 0;
  do {
    const angle = Math.random() * Math.PI * 2;
    const r = minDist + Math.random() * (FIELD_RADIUS - minDist - 60);
    x = Math.cos(angle) * r;
    z = Math.sin(angle) * r;
    tries++;
  } while (Math.hypot(x - girlfriend.x, z - girlfriend.y) < 170 && tries < 20);
  return { x, y: z };
}

function spawnFlower() {
  const { x, y } = randomFieldSpot(60);
  const type = pickFlowerType();
  const color = type === 'golden' ? '#ffd23f'
    : type === 'lavender' ? '#b185db'
    : PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)];
  flowers.push({
    x, y, color, type,
    phase: Math.random() * Math.PI * 2,
    id: flowerIdCounter++
  });
}

const MAX_FLOWERS = 50;
for (let i = 0; i < MAX_FLOWERS; i++) spawnFlower();

// ---------- Trees / bushes ----------
function drawTree(x, y) {
  ctx.fillStyle = 'rgba(30,20,10,0.22)';
  ellipse(ctx, x, y + 4, 20, 7);
  ctx.fillStyle = '#8a5a3c';
  ctx.fillRect(x - 4, y - 16, 8, 20);
  ctx.fillStyle = '#4f8a3d';
  circle(ctx, x, y - 32, 22);
  ctx.fillStyle = '#5b9a44';
  circle(ctx, x - 10, y - 38, 15);
  circle(ctx, x + 11, y - 36, 14);
}

function drawBush(x, y) {
  ctx.fillStyle = 'rgba(30,20,10,0.18)';
  ellipse(ctx, x, y + 4, 13, 5);
  ctx.fillStyle = '#5b9a44';
  circle(ctx, x, y - 4, 13);
  ctx.fillStyle = '#6fae52';
  circle(ctx, x - 5, y - 8, 9);
}

const trees = [];   // collidable: { x, y }
const bushes = [];  // decorative only, no collision

// Trees are planted along a heart-shaped curve ringing the meadow,
// instead of a plain circle. Classic parametric heart:
//   x(t) = 16 sin^3(t)
//   y(t) = 13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t)
// The curve's point (t = pi) is flipped to face down the screen so
// it reads as a heart with its tip toward the player's start and its
// two lobes toward the far side of the field.
const HEART_TREE_COUNT = 60;
const HEART_SCALE = (FIELD_RADIUS + 90) / 17;
for (let i = 0; i < HEART_TREE_COUNT; i++) {
  const t = (i / HEART_TREE_COUNT) * Math.PI * 2;
  const hx = 16 * Math.pow(Math.sin(t), 3);
  const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  const jitter = randomRange(0.94, 1.06);
  trees.push({
    x: hx * HEART_SCALE * jitter,
    y: -hy * HEART_SCALE * jitter,
  });
}
// two trees flanking the picnic spot, romantic framing
trees.push({ x: girlfriend.x - 110, y: girlfriend.y - 40 });
trees.push({ x: girlfriend.x + 120, y: girlfriend.y - 20 });

for (let i = 0; i < 10; i++) {
  const { x, y } = randomFieldSpot(150);
  bushes.push({ x, y });
}

// ---------- Butterflies (purely decorative) ----------
const butterflies = [];
for (let i = 0; i < 4; i++) {
  butterflies.push({
    baseX: (Math.random() - 0.5) * 1400,
    baseY: (Math.random() - 0.5) * 1400,
    color: ['#ffe08a', '#ffffff', '#ffb3c6', '#c9a6ff'][i % 4],
    t: Math.random() * 100
  });
}

function drawButterfly(x, y, color, flap) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  const s = Math.max(0.25, Math.abs(flap));
  ctx.save(); ctx.scale(s, 1); ellipse(ctx, -4, 0, 5, 3); ctx.restore();
  ctx.save(); ctx.scale(s, 1); ellipse(ctx, 4, 0, 5, 3); ctx.restore();
  ctx.fillStyle = '#3b2a20';
  ellipse(ctx, 0, 0, 1.4, 3);
  ctx.restore();
}

// ---------- Fireflies (ambient, appear after dark) ----------
const FIREFLY_COUNT = 30;
const fireflies = [];
for (let i = 0; i < FIREFLY_COUNT; i++) {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * FIELD_RADIUS * 0.85;
  fireflies.push({
    baseX: Math.cos(angle) * r,
    baseY: Math.sin(angle) * r,
    driftR: randomRange(18, 55),
    driftSpeed: randomRange(0.2, 0.5),
    t: Math.random() * 100,
    blinkPhase: Math.random() * Math.PI * 2,
    blinkSpeed: randomRange(1.5, 3.5),
  });
}

function updateFireflies(dt) {
  fireflies.forEach(f => { f.t += dt * f.driftSpeed; });
}

function drawFireflies() {
  if (nightAmount <= 0.02) return;
  fireflies.forEach(f => {
    const x = f.baseX + Math.cos(f.t) * f.driftR;
    const y = f.baseY + Math.sin(f.t * 1.3) * f.driftR;
    const blink = 0.35 + 0.65 * Math.max(0, Math.sin(elapsed * f.blinkSpeed + f.blinkPhase));
    const alpha = nightAmount * blink;
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#d4ff9a';
    ctx.shadowColor = '#d4ff9a';
    ctx.shadowBlur = 12;
    circle(ctx, x, y, 2.2);
    ctx.restore();
  });
}

// ---------- Wasps (danger) ----------
// Touching one sends you back to the start, drops whatever you're
// carrying, and gives a moment of invulnerability so you're not
// instantly re-stung. More wasps join the meadow the more flowers
// you've delivered, so it gets harder as you succeed. A lavender
// aura makes them flee the player, and honey jars lure them away
// entirely.
const WASP_BASE_COUNT = 1;
const WASP_MAX_COUNT = 8;
const WASP_PER_FLOWERS = 6;
const WASP_SCALE = 1.5;
const WASP_WANDER_SPEED = 145;
const WASP_CHASE_SPEED = 190;
const WASP_NOTICE_RADIUS = 240;  // starts flying at the player within this range
const WASP_STING_RADIUS = 17;
const RESPAWN_INVULN_TIME = 1.8;

const wasps = []; // { x, y, wanderAngle, wingPhase }

function wantedWaspCount() {
  return clamp(WASP_BASE_COUNT + Math.floor(girlfriend.given / WASP_PER_FLOWERS), WASP_BASE_COUNT, WASP_MAX_COUNT);
}

function spawnWasp() {
  let x, y, tries = 0;
  do {
    const angle = Math.random() * Math.PI * 2;
    const r = randomRange(220, FIELD_RADIUS - 50);
    x = Math.cos(angle) * r;
    y = Math.sin(angle) * r;
    tries++;
  } while (Math.hypot(x - player.x, y - player.y) < 260 && tries < 20);
  wasps.push({ x, y, wanderAngle: Math.random() * Math.PI * 2, wingPhase: Math.random() * Math.PI * 2 });
}

function updateWasps(dt) {
  const target = wantedWaspCount();
  while (wasps.length < target) spawnWasp();
  while (wasps.length > target) wasps.pop();

  wasps.forEach(w => {
    w.wingPhase += dt * 46;

    // Honey jars are irresistible: a wasp within range of one heads
    // straight for it instead of bothering the player.
    let luredJar = null;
    let luredDist = HONEY_LURE_RADIUS;
    for (const j of honeyJars) {
      const d = Math.hypot(j.x - w.x, j.y - w.y);
      if (d < luredDist) { luredJar = j; luredDist = d; }
    }

    const dxToPlayer = player.x - w.x;
    const dyToPlayer = player.y - w.y;
    const distToPlayer = Math.hypot(dxToPlayer, dyToPlayer);
    const repelling = player.repelTimer > 0 && distToPlayer < REPEL_RADIUS;

    let dx, dy, speed;
    if (luredJar) {
      const jlen = luredDist || 1;
      dx = (luredJar.x - w.x) / jlen;
      dy = (luredJar.y - w.y) / jlen;
      speed = WASP_CHASE_SPEED;
    } else if (repelling) {
      // scented aura: flee directly away from the player
      const flen = distToPlayer || 1;
      dx = -dxToPlayer / flen;
      dy = -dyToPlayer / flen;
      speed = WASP_CHASE_SPEED;
    } else if (distToPlayer < WASP_NOTICE_RADIUS) {
      // aggravated: buzzes toward the player, but not in a straight line
      w.wanderAngle += (Math.random() - 0.5) * 0.5;
      const plen = distToPlayer || 1;
      const vx = dxToPlayer / plen + Math.cos(w.wanderAngle) * 0.5;
      const vy = dyToPlayer / plen + Math.sin(w.wanderAngle) * 0.5;
      const vlen = Math.hypot(vx, vy) || 1;
      dx = vx / vlen; dy = vy / vlen;
      speed = WASP_CHASE_SPEED;
    } else {
      // idle wandering
      w.wanderAngle += (Math.random() - 0.5) * 6 * dt;
      dx = Math.cos(w.wanderAngle);
      dy = Math.sin(w.wanderAngle);
      speed = WASP_WANDER_SPEED;
    }

    w.x += dx * speed * dt;
    w.y += dy * speed * dt;

    // stay loosely within the meadow
    const d = Math.hypot(w.x, w.y);
    if (d > FIELD_RADIUS - 20) {
      const s = (FIELD_RADIUS - 20) / d;
      w.x *= s; w.y *= s;
      w.wanderAngle += Math.PI;
    }
  });

  if (player.invulnerable) {
    player.invulnTimer -= dt;
    if (player.invulnTimer <= 0) player.invulnerable = false;
  } else {
    for (const w of wasps) {
      if (Math.hypot(w.x - player.x, w.y - player.y) < WASP_STING_RADIUS + PLAYER_RADIUS * 0.6) {
        stingPlayer();
        break;
      }
    }
  }
}

function stingPlayer() {
  spawnFloater('🐝💥', player.x, player.y - 20);
  player.carrying = 0;
  updateUI();
  player.x = 0;
  player.y = 320;
  player.invulnerable = true;
  player.invulnTimer = RESPAWN_INVULN_TIME;
}

function drawWasp(w, time) {
  // shadow on the ground — scaled with the wasp so something this big
  // still reads as passing overhead
  ctx.fillStyle = 'rgba(20,15,5,0.22)';
  ellipse(ctx, w.x, w.y + 6, 20 * WASP_SCALE * 0.28, 8 * WASP_SCALE * 0.28);

  const bob = Math.sin(time * 4 + w.wingPhase) * 3;
  ctx.save();
  ctx.translate(w.x, w.y - 14 + bob);
  ctx.scale(WASP_SCALE, WASP_SCALE);

  const flap = Math.max(0.15, Math.abs(Math.sin(w.wingPhase)));
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.save(); ctx.rotate(-0.35); ctx.scale(1, flap); ellipse(ctx, -3, -3, 6, 3.2); ctx.restore();
  ctx.save(); ctx.rotate(0.35); ctx.scale(1, flap); ellipse(ctx, 3, -3, 6, 3.2); ctx.restore();

  ctx.fillStyle = '#241c12';
  ellipse(ctx, 0, 0, 7, 4.2);
  ctx.fillStyle = '#ffcc33';
  ellipse(ctx, -2.2, 0, 1.8, 4);
  ellipse(ctx, 2.2, 0, 1.8, 4);
  ctx.fillStyle = '#241c12';
  circle(ctx, 6.5, 0, 2.6);

  ctx.restore();
}

// ---------- Honey jars (wasp distraction) ----------
// Press E, Space, or tap the honey button to drop a jar. Any wasp
// that wanders within HONEY_LURE_RADIUS beelines for it instead of
// the player, opening a short safe window to harvest nearby flowers.
const HONEY_MAX = 3;
const HONEY_REGEN_TIME = 18;   // seconds to regain one jar
const HONEY_LURE_RADIUS = 260;
const HONEY_DURATION = 9;      // seconds a placed jar stays active

player.honeyJars = HONEY_MAX;
player.honeyRegenTimer = 0;

const honeyJars = []; // { x, y, life, maxLife }

function placeHoneyJar() {
  if (player.honeyJars <= 0) return;
  player.honeyJars--;
  updateAbilityHud();
  honeyJars.push({ x: player.x, y: player.y, life: HONEY_DURATION, maxLife: HONEY_DURATION });
  spawnFloater('🍯', player.x, player.y - 20);
}

function updateHoneyJars(dt) {
  for (let i = honeyJars.length - 1; i >= 0; i--) {
    honeyJars[i].life -= dt;
    if (honeyJars[i].life <= 0) honeyJars.splice(i, 1);
  }
  if (player.honeyJars < HONEY_MAX) {
    player.honeyRegenTimer += dt;
    if (player.honeyRegenTimer >= HONEY_REGEN_TIME) {
      player.honeyRegenTimer = 0;
      player.honeyJars++;
      updateAbilityHud();
    }
  }
}

function drawHoneyJar(j) {
  const fadeIn = clamp((j.maxLife - j.life) / 0.3, 0, 1);
  const fadeOut = clamp(j.life / 1.2, 0, 1);
  const fade = Math.min(fadeIn, fadeOut);

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(30,20,10,0.2)';
  ellipse(ctx, j.x, j.y + 5, 13, 5);

  ctx.globalAlpha = fade * (0.16 + Math.sin(elapsed * 4) * 0.05);
  ctx.fillStyle = '#ffcf4d';
  circle(ctx, j.x, j.y - 2, 32);

  ctx.globalAlpha = fade;
  ctx.fillStyle = '#e8a33d';
  roundRectPath(ctx, j.x - 7, j.y - 15, 14, 17, 3);
  ctx.fill();
  ctx.fillStyle = '#c97f22';
  ctx.fillRect(j.x - 8, j.y - 19, 16, 5);
  ctx.fillStyle = '#fff4d6';
  ellipse(ctx, j.x - 2, j.y - 6, 3, 5);
  ctx.restore();
}

// ---------- Picnic blanket ----------
function drawBlanket() {
  ctx.fillStyle = 'rgba(30,20,10,0.12)';
  ellipse(ctx, girlfriend.x, girlfriend.y + 6, 62, 26);
  ctx.fillStyle = '#f4e3c1';
  ellipse(ctx, girlfriend.x, girlfriend.y, 60, 24);
  ctx.strokeStyle = '#e0c89a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(girlfriend.x, girlfriend.y, 60, 24, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------- Floating feedback text ----------
const floaters = []; // { x, y, text, life, maxLife }
function spawnFloater(text, x, y) {
  floaters.push({ x, y, text, life: 1.1, maxLife: 1.1 });
}

// ---------- Bouquet & status visuals ----------
function drawHeldBouquet(p, cy, time) {
  const count = p.carrying !== undefined ? p.carrying : Math.min(p.given, 14);
  const handX = p.x + 15, handY = cy + 2;
  for (let i = 0; i < count; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    drawFlower(handX + col * 5, handY - row * 7, PETAL_COLORS[i % PETAL_COLORS.length], 0.5, i, time);
  }
}

// Golden speed-boost ring and lavender repel aura around the player.
function drawPlayerAuras(p) {
  if (p.speedBoostTimer > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(elapsed * 10) * 0.15;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (p.repelTimer > 0) {
    ctx.save();
    ctx.globalAlpha = 0.10 + Math.sin(elapsed * 3) * 0.03;
    ctx.fillStyle = '#b185db';
    circle(ctx, p.x, p.y, REPEL_RADIUS);
    ctx.restore();
  }
}

// ---------- Ambient melody ----------
// A short, quiet pentatonic loop, synthesized entirely with the Web
// Audio API — no audio files, no CDN. Each "note" is just an
// oscillator with a soft volume envelope (gentle fade in, slower
// fade out) so it sounds like a music box rather than a beep.
// Notes are scheduled a couple of seconds ahead of time using the
// audio clock (audioCtx.currentTime), which keeps the timing steady
// even if the browser drops a few animation frames.
//
// Browsers block audio until the page has been interacted with, so
// the AudioContext is created — and the loop started — on the first
// keypress, click, or touch, piggybacking on the same gesture that
// already dismisses the intro text.
let audioCtx = null;
let musicGain = null;
let musicStarted = false;
let musicMuted = false;

const MELODY_NOTES = [261.63, 293.66, 329.63, 392.00, 440.00]; // C4 D4 E4 G4 A4, pentatonic
const MELODY_PATTERN = [0, 2, 4, 2, 3, 1, 0, 4, 3, 2, 0, 2];
const NOTE_DURATION = 0.9; // seconds between note starts
let melodyStep = 0;
let nextNoteTime = 0;

function initAudio() {
  if (audioCtx) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return; // very old browser, just skip music
  audioCtx = new AudioContextClass();
  musicGain = audioCtx.createGain();
  musicGain.gain.value = musicMuted ? 0 : 0.05; // deliberately quiet — "a slight melody"
  musicGain.connect(audioCtx.destination);
}

function playNote(freq, time) {
  const osc = audioCtx.createOscillator();
  const noteGain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(noteGain);
  noteGain.connect(musicGain);

  noteGain.gain.setValueAtTime(0, time);
  noteGain.gain.linearRampToValueAtTime(0.9, time + 0.15);
  noteGain.gain.linearRampToValueAtTime(0, time + NOTE_DURATION * 1.4);

  osc.start(time);
  osc.stop(time + NOTE_DURATION * 1.5);
}

function scheduleMelody() {
  if (!audioCtx) return;
  while (nextNoteTime < audioCtx.currentTime + 2) {
    const idx = MELODY_PATTERN[melodyStep % MELODY_PATTERN.length];
    playNote(MELODY_NOTES[idx], nextNoteTime);
    nextNoteTime += NOTE_DURATION;
    melodyStep++;
  }
}

function startMusic() {
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (musicStarted) return;
  musicStarted = true;
  nextNoteTime = audioCtx.currentTime + 0.2;
  melodyStep = 0;
}

function toggleMute() {
  musicMuted = !musicMuted;
  if (musicGain) musicGain.gain.value = musicMuted ? 0 : 0.05;
  updateMuteButton();
}

// ---------- Input ----------
const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  hideIntro();
  startMusic();
  if (e.code === 'Space') e.preventDefault();
  if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) {
    placeHoneyJar();
  }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('click', () => { hideIntro(); startMusic(); });

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  document.getElementById('touch-controls').style.display = 'block';
  const bind = (id, code) => {
    const el = document.getElementById(id);
    const set = (v) => (e) => { e.preventDefault(); keys[code] = v; if (v) { hideIntro(); startMusic(); } };
    el.addEventListener('touchstart', set(true), { passive: false });
    el.addEventListener('touchend', set(false), { passive: false });
    el.addEventListener('touchcancel', set(false), { passive: false });
  };
  bind('btn-up', 'ArrowUp');
  bind('btn-down', 'ArrowDown');
  bind('btn-left', 'ArrowLeft');
  bind('btn-right', 'ArrowRight');

  // Honey-jar button — created here rather than assumed in markup,
  // since this control is new and the surrounding page may not have
  // a slot for it yet.
  const honeyBtn = document.createElement('button');
  honeyBtn.id = 'btn-honey';
  honeyBtn.textContent = '🍯';
  Object.assign(honeyBtn.style, {
    position: 'fixed',
    right: '24px',
    bottom: '110px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(232,163,61,0.88)',
    color: '#fff',
    fontSize: '26px',
    zIndex: 25,
    touchAction: 'manipulation',
  });
  document.body.appendChild(honeyBtn);
  honeyBtn.addEventListener('touchstart', (e) => { e.preventDefault(); placeHoneyJar(); }, { passive: false });
}

let introHidden = false;
function hideIntro() {
  if (introHidden) return;
  introHidden = true;
  document.getElementById('instructions').classList.add('hidden');
}
setTimeout(hideIntro, 9000);
setTimeout(() => document.getElementById('title').classList.add('hidden'), 5000);

// ---------- UI ----------
const carryingEl = document.getElementById('carrying');
const givenEl = document.getElementById('given');
function updateUI() {
  carryingEl.textContent = String(player.carrying);
  givenEl.textContent = String(girlfriend.given);
}
updateUI();

// A small self-contained HUD for the honey jar ability, created here
// rather than assumed in markup since it's a new addition.
const abilityHud = document.createElement('div');
abilityHud.id = 'ability-hud';
Object.assign(abilityHud.style, {
  position: 'fixed',
  left: '16px',
  bottom: '16px',
  padding: '8px 14px',
  borderRadius: '14px',
  background: 'rgba(25,20,10,0.55)',
  color: '#fff6df',
  font: '14px/1.4 sans-serif',
  pointerEvents: 'none',
  zIndex: 20,
});
document.body.appendChild(abilityHud);

function updateAbilityHud() {
  abilityHud.innerHTML =
    `🍯 Honey Jars: ${player.honeyJars}/${HONEY_MAX} <span style="opacity:.7">(E to place)</span>`;
}
updateAbilityHud();

// Mute toggle for the ambient melody.
const muteBtn = document.createElement('button');
muteBtn.id = 'btn-mute';
Object.assign(muteBtn.style, {
  position: 'fixed',
  top: '16px',
  right: '16px',
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(25,20,10,0.55)',
  color: '#fff6df',
  fontSize: '18px',
  cursor: 'pointer',
  zIndex: 30,
});
document.body.appendChild(muteBtn);
function updateMuteButton() {
  muteBtn.textContent = musicMuted ? '🔇' : '🎵';
}
updateMuteButton();
muteBtn.addEventListener('click', () => {
  startMusic();
  toggleMute();
});

// ---------- Main loop ----------
let lastTime = performance.now();
let elapsed = 0;

function update(dt) {
  elapsed += dt;

  updateDayNight(dt);
  updateWeather(dt);
  updatePrecipitation(dt);
  updateFireflies(dt);
  updateHoneyJars(dt);
  scheduleMelody();

  if (player.speedBoostTimer > 0) player.speedBoostTimer = Math.max(0, player.speedBoostTimer - dt);
  if (player.repelTimer > 0) player.repelTimer = Math.max(0, player.repelTimer - dt);

  // --- movement ---
  let mx = 0, my = 0;
  if (keys['ArrowUp'] || keys['KeyW']) my -= 1;
  if (keys['ArrowDown'] || keys['KeyS']) my += 1;
  if (keys['ArrowLeft'] || keys['KeyA']) mx -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) mx += 1;
  const moving = mx !== 0 || my !== 0;

  if (moving) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;

    const currentSpeed = SPEED * (player.speedBoostTimer > 0 ? SPEED_BOOST_MULTIPLIER : 1);

    const nx = player.x + mx * currentSpeed * dt;
    const obstacles = [...trees, { x: girlfriend.x, y: girlfriend.y }];
    const radii = trees.map(() => TREE_COLLISION_RADIUS).concat([GIRLFRIEND_COLLISION_RADIUS]);
    if (!collidesMixed(nx, player.y, PLAYER_RADIUS, obstacles, radii)) player.x = nx;

    const ny = player.y + my * currentSpeed * dt;
    if (!collidesMixed(player.x, ny, PLAYER_RADIUS, obstacles, radii)) player.y = ny;

    if (Math.abs(mx) > Math.abs(my)) player.facing = mx > 0 ? 'right' : 'left';
    else player.facing = my > 0 ? 'down' : 'up';
  }

  // keep inside the meadow clearing
  const dist = Math.hypot(player.x, player.y);
  if (dist > FIELD_RADIUS) {
    const s = FIELD_RADIUS / dist;
    player.x *= s;
    player.y *= s;
  }

  player.walking = moving;
  player.walkPhase += dt * (moving ? 9 : 0);
  player.idlePhase += dt * 1.5;

  girlfriend.idlePhase += dt * 1.2;
  if (girlfriend.waveTimer > 0) girlfriend.waveTimer -= dt;

  updateWasps(dt);

  // --- flower pickup ---
  if (player.carrying < MAX_CARRY) {
    for (let i = flowers.length - 1; i >= 0; i--) {
      const f = flowers[i];
      if (Math.hypot(f.x - player.x, f.y - player.y) < PICKUP_RADIUS) {
        flowers.splice(i, 1);
        player.carrying++;
        updateUI();
        if (f.type === 'golden') {
          player.speedBoostTimer = SPEED_BOOST_DURATION;
          spawnFloater('⚡', f.x, f.y - 10);
        } else if (f.type === 'lavender') {
          player.repelTimer = REPEL_DURATION;
          spawnFloater('🌿', f.x, f.y - 10);
        } else {
          spawnFloater('🌸', f.x, f.y - 10);
        }
        setTimeout(spawnFlower, 2500 + Math.random() * 3000);
        if (player.carrying >= MAX_CARRY) break;
      }
    }
  }

  // --- delivery ---
  if (player.carrying > 0 && Math.hypot(player.x - girlfriend.x, player.y - girlfriend.y) < DELIVER_RADIUS) {
    girlfriend.given += player.carrying;
    player.carrying = 0;
    updateUI();
    spawnFloater('💖', girlfriend.x, girlfriend.y - 40);
    girlfriend.waveTimer = 1.0;
  }

  // --- floaters ---
  for (let i = floaters.length - 1; i >= 0; i--) {
    const fl = floaters[i];
    fl.y -= dt * 30;
    fl.life -= dt;
    if (fl.life <= 0) floaters.splice(i, 1);
  }

  // --- butterflies ---
  butterflies.forEach(b => { b.t += dt; });
}

function collidesMixed(x, y, radius, obstacles, radii) {
  for (let i = 0; i < obstacles.length; i++) {
    if (Math.hypot(x - obstacles[i].x, y - obstacles[i].y) < radius + radii[i]) return true;
  }
  return false;
}

function render() {
  drawGround(player.x, player.y);

  ctx.save();
  ctx.translate(canvas.width / 2 - player.x, canvas.height / 2 - player.y);

  drawBlanket();

  const drawables = [];
  trees.forEach(t => drawables.push({ y: t.y, draw: () => drawTree(t.x, t.y) }));
  bushes.forEach(b => drawables.push({ y: b.y, draw: () => drawBush(b.x, b.y) }));
  flowers.forEach(f => drawables.push({ y: f.y, draw: () => drawFieldFlower(f, elapsed) }));
  honeyJars.forEach(j => drawables.push({ y: j.y, draw: () => drawHoneyJar(j) }));
  wasps.forEach(w => drawables.push({ y: w.y, draw: () => drawWasp(w, elapsed) }));
  drawables.push({
    y: girlfriend.y,
    draw: () => {
      const cy = drawPerson(girlfriend, true);
      if (girlfriend.given > 0) drawHeldBouquet(girlfriend, cy, elapsed);
    }
  });
  drawables.push({
    y: player.y,
    draw: () => {
      ctx.save();
      if (player.invulnerable) {
        ctx.globalAlpha = (Math.floor(elapsed * 10) % 2 === 0) ? 1 : 0.35;
      }
      const cy = drawPerson(player, false);
      if (player.carrying > 0) drawHeldBouquet(player, cy, elapsed);
      ctx.restore();
      drawPlayerAuras(player);
    }
  });
  drawables.sort((a, b) => a.y - b.y);
  drawables.forEach(d => d.draw());

  butterflies.forEach(b => {
    const x = b.baseX + Math.sin(b.t * 0.6) * 90;
    const y = b.baseY + Math.cos(b.t * 0.5) * 90 + Math.sin(b.t * 2.2) * 6;
    drawButterfly(x, y, b.color, Math.sin(b.t * 14));
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '26px sans-serif';
  floaters.forEach(fl => {
    ctx.globalAlpha = Math.max(fl.life / fl.maxLife, 0);
    ctx.fillText(fl.text, fl.x, fl.y);
  });
  ctx.globalAlpha = 1;

  ctx.restore();

  // Weather effects, and the day/night sky tint, are drawn in screen
  // space after the camera transform is restored, so they cover the
  // whole viewport regardless of where the player is standing.
  // Ambient lighting goes down first, then weather layers on top of
  // it, so a rainy night reads as both dark and wet.
  drawDayNightOverlay();
  drawWeatherOverlay();

  // Fireflies are drawn AFTER those overlays (in a fresh camera pass)
  // so their glow sits on top of the night tint instead of getting
  // painted over by it — that was the bug hiding them before.
  ctx.save();
  ctx.translate(canvas.width / 2 - player.x, canvas.height / 2 - player.y);
  drawFireflies();
  ctx.restore();

  drawPrecipitation();
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);