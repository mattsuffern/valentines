/* ------------------------------------------------------------------
   A WALK IN THE MEADOW
   A cozy, top-down, no-fail game: walk around, pick flowers, bring
   them to your girlfriend. Nothing to lose, nowhere to rush.

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

// ---------- World constants ----------
const FIELD_RADIUS = 900;
const SPEED = 260;              // px/sec
const MAX_CARRY = 6;
const PICKUP_RADIUS = 42;
const DELIVER_RADIUS = 72;
const TREE_COLLISION_RADIUS = 30;
const GIRLFRIEND_COLLISION_RADIUS = 32;
const PLAYER_RADIUS = 15;

const PETAL_COLORS = ['#ff6f91', '#ffc145', '#b185db', '#ff8552', '#f8f4ef'];

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

const player = makePerson(0, 320, {
  skin: '#e8b98a', hair: '#3b2a20', body: '#4c7ba6'
});
player.carrying = 0;

const girlfriend = makePerson(0, -560, {
  skin: '#efc49b', hair: '#4a2e1e', body: '#e8607a'
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

  // body
  ctx.fillStyle = palette.body;
  roundRectPath(ctx, x - 11, cy - 2, 22, 20, 8);
  ctx.fill();

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

  if (isGirlfriend) {
    ctx.fillStyle = '#ffffff';
    circle(ctx, x - 8, cy - 26, 3.4);
    circle(ctx, x + 8, cy - 26, 3.4);
    circle(ctx, x, cy - 26, 2.6);
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

const MAX_FLOWERS = 34;
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

const RING_COUNT = 30;
for (let i = 0; i < RING_COUNT; i++) {
  const angle = (i / RING_COUNT) * Math.PI * 2;
  const r = FIELD_RADIUS + 20 + Math.random() * 50;
  trees.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
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
      const cy = drawPerson(player, false);
      if (player.carrying > 0) drawHeldBouquet(player, cy, elapsed);
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
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
