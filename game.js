/* ------------------------------------------------------------------
   A WALK IN THE MEADOW
   A cozy, top-down game: walk around, pick flowers, bring them to
   your girlfriend — but watch out for wasps. Touch one and you get
   stung, drop whatever you're carrying, and get bounced back to the
   start with a moment of safety before they can catch you again.

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

// ---------- World constants ----------
const FIELD_RADIUS = 1300;
const SPEED = 260;              // px/sec
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
// rains or snows and how hard, and whether it can throw lightning.
const WEATHER_KINDS = {
  sunny:  { overlay: { r: 255, g: 255, b: 255, a: 0.00 }, precip: null,   precipIntensity: 0,   lightning: false },
  cloudy: { overlay: { r: 130, g: 135, b: 145, a: 0.30 }, precip: null,   precipIntensity: 0,   lightning: false },
  rain:   { overlay: { r: 60,  g: 75,  b: 95,  a: 0.38 }, precip: 'rain', precipIntensity: 1,   lightning: false },
  storm:  { overlay: { r: 40,  g: 45,  b: 60,  a: 0.52 }, precip: 'rain', precipIntensity: 1.7, lightning: true  },
  snow:   { overlay: { r: 210, g: 220, b: 235, a: 0.18 }, precip: 'snow', precipIntensity: 1,   lightning: false },
  fog:    { overlay: { r: 222, g: 226, b: 230, a: 0.48 }, precip: null,   precipIntensity: 0,   lightning: false },
};
const WEATHER_ORDER = Object.keys(WEATHER_KINDS);

function weatherDuration(kind) {
  // Durations halved so weathers change much faster
  switch (kind) {
    case 'sunny':  return randomRange(25, 45);
    case 'cloudy': return randomRange(15, 25);
    case 'rain':   return randomRange(10, 20);
    case 'storm':  return randomRange(7, 14);
    case 'snow':   return randomRange(12, 22);
    case 'fog':    return randomRange(10, 20);
    default:       return 20;
  }
}

function pickNextWeather(exclude) {
  const options = WEATHER_ORDER.filter(k => k !== exclude);
  return options[Math.floor(Math.random() * options.length)];
}

const WEATHER = {
  current: 'sunny',
  next: null,
  timeInState: 0,
  stateDuration: weatherDuration('sunny'),
  crossfade: 0,           // 0 = fully `current`, 1 = fully `next` (only set mid-transition)
  crossfadeLength: 3,     // seconds to blend between weather kinds (halved to match faster weather)
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
  // Different precipitation types: fade the old one out, then the new one in.
  if (t < 0.5) return { type: curKind.precip, intensity: curKind.precipIntensity * (1 - t * 2) };
  return { type: nextKind.precip, intensity: nextKind.precipIntensity * ((t - 0.5) * 2) };
}

// ---------- Precipitation particles (screen-space, cheap) ----------
const MAX_PRECIP = 220;

function makeRainDrop() {
  return { x: Math.random(), y: Math.random(), len: randomRange(10, 22), speed: randomRange(650, 950), drift: randomRange(-70, -40) };
}
function makeSnowFlake() {
  return { x: Math.random(), y: Math.random(), r: randomRange(1.5, 3.5), speed: randomRange(60, 140), drift: randomRange(-15, 15), sway: Math.random() * Math.PI * 2 };
}
const rainDrops = Array.from({ length: MAX_PRECIP }, makeRainDrop);
const snowFlakes = Array.from({ length: MAX_PRECIP }, makeSnowFlake);

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
  } else if (precip.type === 'snow' && precip.intensity > 0) {
    for (const f of snowFlakes) {
      f.sway += dt * 1.3;
      f.y += (f.speed * dt) / canvas.height;
      f.x += ((f.drift + Math.sin(f.sway) * 20) * dt) / canvas.width;
      if (f.y > 1) { f.y = -0.02; f.x = Math.random(); }
      if (f.x < 0) f.x = 1;
      if (f.x > 1) f.x = 0;
    }
  }
}

function drawPrecipitation() {
  const precip = currentPrecip();
  if (!precip.type || precip.intensity <= 0.01) return;
  const amount = clamp(precip.intensity, 0, 1);
  ctx.save();
  if (precip.type === 'rain') {
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
  } else if (precip.type === 'snow') {
    ctx.globalAlpha = amount * 0.85;
    ctx.fillStyle = '#ffffff';
    const count = Math.floor(MAX_PRECIP * amount * 0.6);
    for (let i = 0; i < count; i++) {
      const f = snowFlakes[i];
      const x = f.x * canvas.width, y = f.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
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

const flowers = []; // { x, y, color, phase, id }
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
  flowers.push({
    x, y,
    color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
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

// ---------- Wasps (danger) ----------
// Touching one sends you back to the start, drops whatever you're
// carrying, and gives a moment of invulnerability so you're not
// instantly re-stung. More wasps join the meadow the more flowers
// you've delivered, so it gets harder as you succeed.
const WASP_BASE_COUNT = 1;       // Reduced start from 2 to 1
const WASP_MAX_COUNT = 8;        // Capped maximum quantity at 8 instead of 14
const WASP_PER_FLOWERS = 6;      // Requires giving 6 flowers instead of 3 to spawn a new wasp
const WASP_SCALE = 1.5;          // Half-sized — these used to be 3.0
const WASP_WANDER_SPEED = 145;   // Faster wander (used to be 115)
const WASP_CHASE_SPEED = 190;    // Faster chase (used to be 150)
const WASP_NOTICE_RADIUS = 240;  // starts flying at the player within this range
const WASP_STING_RADIUS = 17;    // Halved from 34 to match the new visual size
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
    const dxToPlayer = player.x - w.x;
    const dyToPlayer = player.y - w.y;
    const distToPlayer = Math.hypot(dxToPlayer, dyToPlayer);

    let dx, dy;
    if (distToPlayer < WASP_NOTICE_RADIUS) {
      // aggravated: buzzes toward the player, but not in a straight line
      w.wanderAngle += (Math.random() - 0.5) * 0.5;
      dx = dxToPlayer / (distToPlayer || 1) + Math.cos(w.wanderAngle) * 0.5;
      dy = dyToPlayer / (distToPlayer || 1) + Math.sin(w.wanderAngle) * 0.5;
      const len = Math.hypot(dx, dy) || 1;
      w.x += (dx / len) * WASP_CHASE_SPEED * dt;
      w.y += (dy / len) * WASP_CHASE_SPEED * dt;
    } else {
      // idle wandering
      w.wanderAngle += (Math.random() - 0.5) * 6 * dt;
      w.x += Math.cos(w.wanderAngle) * WASP_WANDER_SPEED * dt;
      w.y += Math.sin(w.wanderAngle) * WASP_WANDER_SPEED * dt;
    }

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

// ---------- Bouquet visuals ----------
function drawHeldBouquet(p, cy, time) {
  const count = p.carrying !== undefined ? p.carrying : Math.min(p.given, 14);
  const handX = p.x + 15, handY = cy + 2;
  for (let i = 0; i < count; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    drawFlower(handX + col * 5, handY - row * 7, PETAL_COLORS[i % PETAL_COLORS.length], 0.5, i, time);
  }
}

// ---------- Input ----------
const keys = {};
document.addEventListener('keydown', (e) => { keys[e.code] = true; hideIntro(); });
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  document.getElementById('touch-controls').style.display = 'block';
  const bind = (id, code) => {
    const el = document.getElementById(id);
    const set = (v) => (e) => { e.preventDefault(); keys[code] = v; if (v) hideIntro(); };
    el.addEventListener('touchstart', set(true), { passive: false });
    el.addEventListener('touchend', set(false), { passive: false });
    el.addEventListener('touchcancel', set(false), { passive: false });
  };
  bind('btn-up', 'ArrowUp');
  bind('btn-down', 'ArrowDown');
  bind('btn-left', 'ArrowLeft');
  bind('btn-right', 'ArrowRight');
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

// ---------- Main loop ----------
let lastTime = performance.now();
let elapsed = 0;

function update(dt) {
  elapsed += dt;

  updateWeather(dt);
  updatePrecipitation(dt);

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

    const nx = player.x + mx * SPEED * dt;
    const obstacles = [...trees, { x: girlfriend.x, y: girlfriend.y }];
    const radii = trees.map(() => TREE_COLLISION_RADIUS).concat([GIRLFRIEND_COLLISION_RADIUS]);
    if (!collidesMixed(nx, player.y, PLAYER_RADIUS, obstacles, radii)) player.x = nx;

    const ny = player.y + my * SPEED * dt;
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
        spawnFloater('🌸', f.x, f.y - 10);
        player.carrying++;
        updateUI();
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
  flowers.forEach(f => drawables.push({ y: f.y, draw: () => drawFlower(f.x, f.y, f.color, 1, f.phase, elapsed) }));
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

  // Weather effects are drawn in screen space, after the camera
  // transform is restored, so rain/snow falls straight down over the
  // whole viewport regardless of where the player is standing.
  drawWeatherOverlay();
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