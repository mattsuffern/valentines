<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>A Walk in the Meadow</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Quicksand:wght@500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --cream: #fff8ed;
    --brown: #5b4636;
    --rose: #e8607a;
    --shadow: rgba(91,70,54,0.18);
  }
  html, body { margin: 0; padding: 0; overflow: hidden; height: 100%; }
  body {
    background: linear-gradient(to bottom, #ffd9a0 0%, #ffe9c4 35%, #fff3d6 55%, #eaf6e9 100%);
    font-family: 'Quicksand', sans-serif;
  }
  canvas { display: block; touch-action: none; }

  #ui {
    position: fixed;
    top: 16px;
    left: 16px;
    background: var(--cream);
    border-radius: 20px;
    padding: 12px 20px;
    box-shadow: 0 6px 16px var(--shadow);
    color: var(--brown);
    user-select: none;
    pointer-events: none;
  }
  #ui .stat { font-family: 'Fredoka', sans-serif; font-size: 17px; line-height: 1.5; white-space: nowrap; }
  #ui .stat b { color: var(--rose); }

  #instructions {
    position: fixed;
    bottom: 26px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--cream);
    border-radius: 18px;
    padding: 10px 22px;
    box-shadow: 0 6px 16px var(--shadow);
    color: var(--brown);
    font-size: 15px;
    text-align: center;
    transition: opacity 0.8s ease;
    user-select: none;
    pointer-events: none;
  }
  #instructions.hidden { opacity: 0; }

  #title {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Fredoka', sans-serif;
    font-size: 22px;
    color: var(--brown);
    text-shadow: 0 2px 6px rgba(255,255,255,0.6);
    transition: opacity 1s ease;
    user-select: none;
    pointer-events: none;
  }
  #title.hidden { opacity: 0; }

  /* Touch controls (mobile only, added via JS) */
  #touch-controls {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 150px;
    height: 150px;
    display: none;
  }
  #touch-controls button {
    position: absolute;
    width: 50px;
    height: 50px;
    border-radius: 14px;
    border: none;
    background: rgba(255,248,237,0.85);
    box-shadow: 0 4px 10px var(--shadow);
    font-size: 20px;
    color: var(--brown);
    -webkit-tap-highlight-color: transparent;
  }
  #btn-up    { top: 0;    left: 50px; }
  #btn-down  { top: 100px; left: 50px; }
  #btn-left  { top: 50px;  left: 0; }
  #btn-right { top: 50px;  left: 100px; }
</style>
</head>
<body>
  <div id="title">🌼 A Walk in the Meadow 🌼</div>
  <div id="ui">
    <div class="stat">🌸 Carrying: <b id="carrying">0</b></div>
    <div class="stat">💐 Given to her: <b id="given">0</b></div>
  </div>
  <div id="instructions">Walk with WASD or Arrow Keys • Stroll near a flower to pick it • Bring your bouquet to her ❤️</div>

  <div id="touch-controls">
    <button id="btn-up">⬆</button>
    <button id="btn-down">⬇</button>
    <button id="btn-left">⬅</button>
    <button id="btn-right">➡</button>
  </div>

  <script type="module" src="game.js"></script>
</body>
</html>

// ---------- Renderer / Scene / Camera ----------
const scene = new THREE.Scene();
// No scene.background — the canvas stays transparent so the warm CSS
// sky gradient behind it shows through. Cheap and pretty.
scene.fog = new THREE.Fog(0xfff3d6, 40, 88);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Lighting (cheap: no shadow maps, just soft toon light) ----------
scene.add(new THREE.HemisphereLight(0xfff1d0, 0x6b9350, 0.95));
const sun = new THREE.DirectionalLight(0xffe9c2, 0.85);
sun.position.set(12, 20, 8);
scene.add(sun);

// ---------- Toon shading helper ----------
// A tiny stepped gradient map gives everything a soft cel-shaded look,
// which reads as "cute" far more than flat MeshBasicMaterial did.
const gradientData = new Uint8Array([90, 150, 210, 255]);
const gradientTexture = new THREE.DataTexture(gradientData, gradientData.length, 1, THREE.RedFormat);
gradientTexture.needsUpdate = true;
gradientTexture.minFilter = THREE.NearestFilter;
gradientTexture.magFilter = THREE.NearestFilter;

function toonMat(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientTexture, ...opts });
}

// ---------- Ground ----------
// A soft procedural mottled-grass texture, generated on a small canvas
// so we don't need to ship an image file.
function makeGrassTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7fa65c';
  ctx.fillRect(0, 0, size, size);
  const patchColors = ['#749a52', '#89b566', '#6b9350'];
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = patchColors[i % patchColors.length];
    const x = Math.random() * size, y = Math.random() * size;
    const r = Math.random() * 2.2 + 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

const FIELD_RADIUS = 50;
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(FIELD_RADIUS + 6, 48),
  new THREE.MeshToonMaterial({ map: makeGrassTexture(), gradientMap: gradientTexture })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------- Little person builder (player + girlfriend share this) ----------
function createPerson({ shirt, pants, skin, hair }) {
  const group = new THREE.Group();
  const skinMat = toonMat(skin);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.45, 4, 8), toonMat(shirt));
  torso.position.y = 1.02;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 16), skinMat);
  head.position.y = 1.6;
  group.add(head);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.7),
    toonMat(hair)
  );
  hairCap.position.y = 1.66;
  group.add(hairCap);

  function limb(mat, length, radius, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), mat);
    mesh.position.y = -(length / 2 + radius);
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }

  const leftArm = limb(skinMat, 0.46, 0.085, -0.4, 1.28);
  const rightArm = limb(skinMat, 0.46, 0.085, 0.4, 1.28);
  const leftLeg = limb(toonMat(pants), 0.52, 0.11, -0.14, 0.78);
  const rightLeg = limb(toonMat(pants), 0.52, 0.11, 0.14, 0.78);

  // Where held flowers attach, at the end of the right arm.
  const handSlot = new THREE.Object3D();
  handSlot.position.set(0, -0.5, 0.05);
  rightArm.add(handSlot);

  return { group, leftArm, rightArm, leftLeg, rightLeg, handSlot, walkCycle: 0 };
}

const player = createPerson({ shirt: 0x4c7ba6, pants: 0x6b4a34, skin: 0xe8b98a, hair: 0x3b2a20 });
player.group.position.set(0, 0, 10);
scene.add(player.group);

const girlfriend = createPerson({ shirt: 0xe8607a, pants: 0xe8607a, skin: 0xefc49b, hair: 0x4a2e1e });
girlfriend.group.position.set(0, 0, -22);
girlfriend.group.rotation.y = Math.PI; // face the player's side of the field
scene.add(girlfriend.group);

// A little picnic blanket marks her spot.
const blanket = new THREE.Mesh(
  new THREE.CircleGeometry(1.4, 24),
  toonMat(0xf4e3c1, { side: THREE.DoubleSide })
);
blanket.rotation.x = -Math.PI / 2;
blanket.position.set(girlfriend.group.position.x, 0.02, girlfriend.group.position.z + 1);
scene.add(blanket);

// ---------- Flower builder ----------
const PETAL_COLORS = [0xff6f91, 0xffc145, 0xb185db, 0xff8552, 0xf4f4f4];

function createFlower(color) {
  const group = new THREE.Group();

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 6), toonMat(0x4a7c3c));
  stem.position.y = 0.25;
  group.add(stem);

  const center = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), toonMat(0xffd23f));
  center.position.y = 0.52;
  group.add(center);

  const petalMat = toonMat(color);
  const petalCount = 6;
  for (let i = 0; i < petalCount; i++) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), petalMat);
    petal.scale.set(1, 0.45, 1.7);
    const angle = (i / petalCount) * Math.PI * 2;
    petal.position.set(Math.cos(angle) * 0.1, 0.52, Math.sin(angle) * 0.1);
    petal.lookAt(petal.position.x * 2, 0.52, petal.position.z * 2);
    group.add(petal);
  }

  group.userData.swayPhase = Math.random() * Math.PI * 2;
  group.userData.color = color;
  return group;
}

// ---------- Decoration: trees, bushes, clouds, butterflies ----------
function createTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 7), toonMat(0x8a5a3c));
  trunk.position.y = 0.6;
  group.add(trunk);
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.8, 9, 9), toonMat(0x4f8a3d));
  leaves.position.y = 1.55;
  leaves.scale.set(1, 1.15, 1);
  group.add(leaves);
  return group;
}

function createBush() {
  const bush = new THREE.Mesh(new THREE.SphereGeometry(0.5, 9, 9), toonMat(0x5b9a44));
  bush.position.y = 0.32;
  bush.scale.y = 0.65;
  return bush;
}

const decor = new THREE.Group();
const ringCount = 26;
for (let i = 0; i < ringCount; i++) {
  const angle = (i / ringCount) * Math.PI * 2;
  const r = FIELD_RADIUS + 2 + Math.random() * 3;
  const item = Math.random() < 0.6 ? createTree() : createBush();
  item.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
  item.rotation.y = Math.random() * Math.PI * 2;
  decor.add(item);
}
scene.add(decor);

function createCloud() {
  const group = new THREE.Group();
  const mat = toonMat(0xffffff);
  const puffs = [[0, 0, 0, 0.5], [0.4, 0.05, 0, 0.4], [-0.4, 0.05, 0, 0.4], [0.2, 0.15, 0.1, 0.35], [-0.2, 0.15, -0.1, 0.35]];
  puffs.forEach(([x, y, z, s]) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 8), mat);
    puff.position.set(x, y, z);
    group.add(puff);
  });
  return group;
}

const clouds = [];
for (let i = 0; i < 6; i++) {
  const cloud = createCloud();
  cloud.position.set((Math.random() - 0.5) * 100, 16 + Math.random() * 6, (Math.random() - 0.5) * 100);
  const scale = 1.5 + Math.random();
  cloud.scale.setScalar(scale);
  cloud.userData.speed = 0.3 + Math.random() * 0.4;
  scene.add(cloud);
  clouds.push(cloud);
}

function createButterfly(color) {
  const group = new THREE.Group();
  const wingMat = new THREE.MeshToonMaterial({ color, gradientMap: gradientTexture, side: THREE.DoubleSide });
  const wingGeo = new THREE.CircleGeometry(0.12, 8);
  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.position.x = -0.1;
  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  rightWing.position.x = 0.1;
  group.add(leftWing, rightWing);
  group.userData = { leftWing, rightWing, phase: Math.random() * Math.PI * 2, center: new THREE.Vector3(), t: Math.random() * 100 };
  return group;
}

const butterflies = [];
for (let i = 0; i < 4; i++) {
  const b = createButterfly([0xffe08a, 0xffffff, 0xffb3c6, 0xc9a6ff][i % 4]);
  b.userData.center.set((Math.random() - 0.5) * 60, 1.4 + Math.random(), (Math.random() - 0.5) * 60);
  scene.add(b);
  butterflies.push(b);
}

// ---------- Flower field state ----------
const MAX_FLOWERS = 36;
const MAX_CARRY = 6;
const activeFlowers = []; // { mesh, x, z }

function randomFieldSpot(minDistFromCenter = 4) {
  let x, z, tries = 0;
  do {
    const angle = Math.random() * Math.PI * 2;
    const r = minDistFromCenter + Math.random() * (FIELD_RADIUS - minDistFromCenter - 2);
    x = Math.cos(angle) * r;
    z = Math.sin(angle) * r;
    tries++;
  } while (Math.hypot(x - girlfriend.group.position.x, z - girlfriend.group.position.z) < 5 && tries < 20);
  return { x, z };
}

function spawnFlower() {
  const color = PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)];
  const flower = createFlower(color);
  const { x, z } = randomFieldSpot();
  flower.position.set(x, 0, z);
  flower.rotation.y = Math.random() * Math.PI * 2;
  scene.add(flower);
  activeFlowers.push({ mesh: flower, x, z });
}

for (let i = 0; i < MAX_FLOWERS; i++) spawnFlower();

// ---------- Floating feedback text (picked-up flower, heart on delivery) ----------
function createTextSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.7, 0.7, 0.7);
  return sprite;
}

const floaters = []; // { sprite, life, maxLife }
function spawnFloater(text, position) {
  const sprite = createTextSprite(text);
  sprite.position.copy(position);
  scene.add(sprite);
  floaters.push({ sprite, life: 1.1, maxLife: 1.1 });
}

// ---------- Carried bouquet visuals ----------
function attachMiniFlower(handSlot, index, color) {
  const mini = createFlower(color);
  mini.scale.setScalar(0.55);
  mini.rotation.z = (Math.random() - 0.5) * 0.6;
  mini.position.set((index % 3) * 0.05 - 0.05, index * 0.05, (Math.random() - 0.5) * 0.05);
  handSlot.add(mini);
  return mini;
}

let carrying = 0;
let given = 0;

const carryingEl = document.getElementById('carrying');
const givenEl = document.getElementById('given');
function updateUI() {
  carryingEl.textContent = String(carrying);
  givenEl.textContent = String(given);
}
updateUI();

// A small stack of flowers she's already received, so she visibly
// accumulates the bouquet you've given her.
let girlfriendBouquetCount = 0;
const GIRLFRIEND_DISPLAY_CAP = 14;

// ---------- Input ----------
const keys = {};
document.addEventListener('keydown', (e) => { keys[e.code] = true; hideIntro(); });
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Touch controls for mobile / GitHub Pages visitors on phones.
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

// ---------- Camera (smooth, world-anchored follow — calm, not dizzying) ----------
const camOffset = new THREE.Vector3(0, 7.5, 11.5);
camera.position.copy(player.group.position).add(camOffset);

// ---------- Game loop ----------
const clock = new THREE.Clock();
const SPEED = 4.2;

function animatePerson(p, dt, moving, speedFactor = 1) {
  p.walkCycle += dt * (moving ? 8 : 2) * speedFactor;
  const swing = moving ? 0.55 : 0.04;
  p.leftLeg.rotation.x = Math.sin(p.walkCycle) * swing;
  p.rightLeg.rotation.x = -Math.sin(p.walkCycle) * swing;
  p.leftArm.rotation.x = -Math.sin(p.walkCycle) * swing * 0.85;
  p.rightArm.rotation.x = Math.sin(p.walkCycle) * swing * 0.85;
  p.group.position.y = moving
    ? Math.abs(Math.sin(p.walkCycle * 2)) * 0.05
    : Math.sin(p.walkCycle * 0.5) * 0.025;
}

function update(dt) {
  // --- Player movement ---
  let mx = 0, mz = 0;
  if (keys['ArrowUp'] || keys['KeyW']) mz -= 1;
  if (keys['ArrowDown'] || keys['KeyS']) mz += 1;
  if (keys['ArrowLeft'] || keys['KeyA']) mx -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) mx += 1;
  const moving = mx !== 0 || mz !== 0;

  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    player.group.position.x += mx * SPEED * dt;
    player.group.position.z += mz * SPEED * dt;

    const targetAngle = Math.atan2(mx, mz);
    let da = targetAngle - player.group.rotation.y;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    player.group.rotation.y += da * Math.min(1, dt * 10);
  }

  // Keep the player within the meadow clearing.
  const dist = Math.hypot(player.group.position.x, player.group.position.z);
  if (dist > FIELD_RADIUS) {
    const s = FIELD_RADIUS / dist;
    player.group.position.x *= s;
    player.group.position.z *= s;
  }

  animatePerson(player, dt, moving);

  // Gentle idle sway for the girlfriend.
  girlfriend.walkCycle += dt * 1.2;
  girlfriend.group.position.y = Math.sin(girlfriend.walkCycle) * 0.02;
  girlfriend.leftArm.rotation.x = Math.sin(girlfriend.walkCycle) * 0.06;
  girlfriend.rightArm.rotation.x = -Math.sin(girlfriend.walkCycle) * 0.06;
  if (girlfriend.waveTimer > 0) {
    girlfriend.waveTimer -= dt;
    girlfriend.rightArm.rotation.z = Math.sin(girlfriend.waveTimer * 20) * 0.6;
  } else {
    girlfriend.rightArm.rotation.z = 0;
  }

  // --- Camera, smoothed ---
  const desired = new THREE.Vector3(
    player.group.position.x + camOffset.x,
    camOffset.y,
    player.group.position.z + camOffset.z
  );
  const camLerp = 1 - Math.pow(0.0005, dt);
  camera.position.lerp(desired, camLerp);
  camera.lookAt(player.group.position.x, 1, player.group.position.z);

  // --- Flower pickup ---
  if (carrying < MAX_CARRY) {
    for (let i = activeFlowers.length - 1; i >= 0; i--) {
      const f = activeFlowers[i];
      const d = Math.hypot(f.x - player.group.position.x, f.z - player.group.position.z);
      if (d < 1.1) {
        scene.remove(f.mesh);
        activeFlowers.splice(i, 1);
        spawnFloater('🌸', new THREE.Vector3(f.x, 1.1, f.z));
        attachMiniFlower(player.handSlot, carrying, f.mesh.userData.color);
        carrying++;
        updateUI();
        setTimeout(spawnFlower, 2500 + Math.random() * 3000);
        if (carrying >= MAX_CARRY) break;
      }
    }
  }

  // --- Delivery to girlfriend ---
  const dToHer = Math.hypot(
    player.group.position.x - girlfriend.group.position.x,
    player.group.position.z - girlfriend.group.position.z
  );
  if (carrying > 0 && dToHer < 2.2) {
    while (player.handSlot.children.length > 0) {
      const mesh = player.handSlot.children[0];
      player.handSlot.remove(mesh);
      if (girlfriendBouquetCount < GIRLFRIEND_DISPLAY_CAP) {
        mesh.scale.setScalar(0.55);
        mesh.position.set(
          (girlfriendBouquetCount % 4) * 0.06 - 0.09,
          Math.floor(girlfriendBouquetCount / 4) * 0.09,
          (Math.random() - 0.5) * 0.05
        );
        girlfriend.handSlot.add(mesh);
        girlfriendBouquetCount++;
      }
    }
    given += carrying;
    carrying = 0;
    updateUI();
    spawnFloater('💖', new THREE.Vector3(girlfriend.group.position.x, 2.1, girlfriend.group.position.z));
    girlfriend.waveTimer = 1.0;
  }

  // --- Flowers gently swaying ---
  activeFlowers.forEach(f => {
    f.mesh.rotation.z = Math.sin(clock.elapsedTime * 1.5 + f.mesh.userData.swayPhase) * 0.06;
  });

  // --- Clouds drifting ---
  clouds.forEach(c => {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 60) c.position.x = -60;
  });

  // --- Butterflies fluttering on lazy loops ---
  butterflies.forEach(b => {
    const u = b.userData;
    u.t += dt;
    b.position.set(
      u.center.x + Math.sin(u.t * 0.6) * 3,
      u.center.y + Math.sin(u.t * 2.2) * 0.25,
      u.center.z + Math.cos(u.t * 0.5) * 3
    );
    const flap = Math.sin(u.t * 14);
    u.leftWing.rotation.y = flap * 1.1;
    u.rightWing.rotation.y = -flap * 1.1;
  });

  // --- Floating text feedback ---
  for (let i = floaters.length - 1; i >= 0; i--) {
    const fl = floaters[i];
    fl.sprite.position.y += dt * 0.7;
    fl.life -= dt;
    fl.sprite.material.opacity = Math.max(fl.life / fl.maxLife, 0);
    if (fl.life <= 0) {
      scene.remove(fl.sprite);
      floaters.splice(i, 1);
    }
  }
}
girlfriend.waveTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
}
animate();
