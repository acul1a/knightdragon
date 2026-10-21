import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/* =====================================================================
   Рыцарь: Пленница дракона — Уровень 1 «Окраина королевства»
   Вертикальный срез: деревня, меч, щит, один гоблин, награда.
   ===================================================================== */

const MAX_HP = 5;
const GOBLIN_HP = 100;
const ARENA_RADIUS = 11;
const UP = new THREE.Vector3(0, 1, 0);

const hpEl = document.getElementById('hp');
const foeEl = document.getElementById('foe');
const msgEl = document.getElementById('msg');

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151b33);
scene.fog = new THREE.Fog(0x151b33, 10, 45);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, 1.6, 0);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- audio
let actx = null;
function tone(freq, dur = 0.12, type = 'square', vol = 0.08, slide = 0) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator();
    const g = actx.createGain();
    const t = actx.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (e) { /* звук необязателен */ }
}
const sfx = {
  hit: () => tone(180, 0.14, 'sawtooth', 0.12, -90),
  clang: () => { tone(900, 0.15, 'square', 0.07); tone(1350, 0.22, 'triangle', 0.06); },
  hurt: () => tone(130, 0.3, 'sawtooth', 0.15, -70),
  potion: () => tone(600, 0.25, 'sine', 0.1, 500),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'triangle', 0.1), i * 130)),
  swing: () => tone(300, 0.08, 'sine', 0.03, 200),
};

// ---------------------------------------------------------------- world
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry(7);

scene.add(new THREE.HemisphereLight(0x8fa4ff, 0x2a2a1e, 0.9));
const moon = new THREE.DirectionalLight(0xbfcfff, 0.8);
moon.position.set(-10, 20, 8);
scene.add(moon);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48),
  new THREE.MeshStandardMaterial({ color: 0x3b4a2f, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 1 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x5b3d22, roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x25492c, roughness: 1 });

function ruin(x, z, ry) {
  const g = new THREE.Group();
  // [px, py, pz, w, h, d] — стены с «разрушенными» краями
  const walls = [
    [0, 1.0, -2, 4, 2.0, 0.3],
    [-1.0, 0.6, 2, 2.0, 1.2, 0.3],
    [-2, 1.2, 0, 0.3, 2.4, 4],
    [2, 0.5, 0.5, 0.3, 1.0, 3],
  ];
  for (const [px, py, pz, w, h, d] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
    m.position.set(px, py, pz);
    g.add(m);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 3.2), woodMat);
  beam.position.set(-1.6, 2.2, 0);
  beam.rotation.z = 0.5;
  g.add(beam);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
}

function tree(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2, 6), woodMat);
  trunk.position.y = 1;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 7), leafMat);
  crown.position.y = 4;
  g.add(trunk, crown);
  g.position.set(x, 0, z);
  g.scale.setScalar(0.8 + rnd() * 0.7);
  scene.add(g);
}

function torch(x, z) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.8, 6), woodMat);
  pole.position.set(x, 0.9, z);
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffa23a })
  );
  flame.position.set(x, 1.95, z);
  const light = new THREE.PointLight(0xff9a3c, 1.6, 14);
  light.position.set(x, 2.1, z);
  scene.add(pole, flame, light);
}

for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + 0.3;
  const r = 15 + rnd() * 4;
  ruin(Math.cos(a) * r, Math.sin(a) * r, -a + Math.PI / 2 + (rnd() - 0.5));
}
for (let i = 0; i < 26; i++) {
  const a = rnd() * Math.PI * 2;
  const r = 22 + rnd() * 18;
  tree(Math.cos(a) * r, Math.sin(a) * r);
}
for (let i = 0; i < 30; i++) {
  const a = rnd() * Math.PI * 2;
  const r = 5 + rnd() * 20;
  const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15 + rnd() * 0.3), stoneMat);
  s.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
  s.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
  scene.add(s);
}
torch(-4, -3);
torch(4, 3);

// ---------------------------------------------------------------- sword & shield
function makeSword() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, metalness: 0.8, roughness: 0.25 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a933, metalness: 0.7, roughness: 0.4 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.85), steel);
  blade.position.z = -0.55;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.04), gold);
  guard.position.z = -0.12;
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), woodMat);
  hilt.rotation.x = Math.PI / 2;
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), gold);
  pommel.position.z = 0.08;
  const tip = new THREE.Object3D(); tip.position.z = -0.97;
  const mid = new THREE.Object3D(); mid.position.z = -0.55;
  g.add(blade, guard, hilt, pommel, tip, mid);
  g.userData = { tip, mid };
  return g;
}

function makeShield() {
  const g = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.27, 0.04, 20),
    new THREE.MeshStandardMaterial({ color: 0x2c4f9e, roughness: 0.6 })
  );
  face.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.27, 0.025, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xd9a933, metalness: 0.7, roughness: 0.4 })
  );
  const boss = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9a933, metalness: 0.7, roughness: 0.4 })
  );
  boss.position.z = -0.03;
  g.add(face, rim, boss);
  g.position.z = -0.12;
  const holder = new THREE.Group();
  holder.add(g);
  return holder;
}

const sword = makeSword();
const shield = makeShield();

// ---------------------------------------------------------------- HUD (на запястье) и табличка сообщений
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 256; hudCanvas.height = 128;
const hudTex = new THREE.CanvasTexture(hudCanvas);
const hudMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.16, 0.08),
  new THREE.MeshBasicMaterial({ map: hudTex, transparent: true })
);
hudMesh.position.set(0, 0.09, 0.06);
hudMesh.rotation.x = -Math.PI / 3;
hudMesh.visible = false;

function drawHud() {
  const c = hudCanvas.getContext('2d');
  c.clearRect(0, 0, 256, 128);
  c.fillStyle = 'rgba(10,12,25,0.7)';
  c.fillRect(0, 0, 256, 128);
  c.font = 'bold 44px sans-serif';
  c.textBaseline = 'middle';
  for (let i = 0; i < MAX_HP; i++) {
    c.fillStyle = i < state.hp ? '#ff4d5e' : '#4a4f66';
    c.fillText('♥', 10 + i * 48, 48);
  }
  c.font = '22px sans-serif';
  c.fillStyle = '#ffffff';
  c.fillText(state.goblin && !state.goblin.dead ? 'Гоблин: ' + Math.max(0, Math.ceil(state.goblin.hp)) : 'Гоблин повержен', 12, 100);
  hudTex.needsUpdate = true;
}

const msgCanvas = document.createElement('canvas');
msgCanvas.width = 1024; msgCanvas.height = 256;
const msgTex = new THREE.CanvasTexture(msgCanvas);
const msgMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.6, 0.4),
  new THREE.MeshBasicMaterial({ map: msgTex, transparent: true, depthTest: false, opacity: 0 })
);
msgMesh.renderOrder = 999;
scene.add(msgMesh);
let msgTimer = 0;

function showMessage(text, secs = 3.5) {
  msgEl.textContent = text;
  msgEl.style.opacity = 1;
  const c = msgCanvas.getContext('2d');
  c.clearRect(0, 0, 1024, 256);
  c.fillStyle = 'rgba(10,12,25,0.75)';
  c.fillRect(0, 0, 1024, 256);
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const lines = text.split('\n');
  c.font = 'bold 72px sans-serif';
  lines.forEach((l, i) => c.fillText(l, 512, 128 + (i - (lines.length - 1) / 2) * 84));
  msgTex.needsUpdate = true;

  const head = new THREE.Vector3();
  camera.getWorldPosition(head);
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  msgMesh.position.copy(head).addScaledVector(fwd, 1.8);
  msgMesh.position.y = head.y + 0.1;
  msgMesh.lookAt(head);
  msgTimer = secs;
}

function updateMessage(dt) {
  if (msgTimer > 0) {
    msgTimer -= dt;
    msgMesh.material.opacity = Math.min(1, msgTimer * 2);
    if (msgTimer <= 0) { msgEl.style.opacity = 0; msgMesh.material.opacity = 0; }
  }
}

// вспышка урона
const flash = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false })
);
flash.renderOrder = 998;
camera.add(flash);
let flashT = 0;

// ---------------------------------------------------------------- руки / контроллеры
const grips = [];
const pads = {};          // handedness -> gamepad
let vrActive = false;

function haptic(hand, strength = 0.6, ms = 90) {
  const gp = pads[hand];
  const act = gp && gp.hapticActuators && gp.hapticActuators[0];
  if (act && act.pulse) act.pulse(strength, ms);
}

function attachDesktop() {
  camera.add(sword);
  sword.position.set(0.3, -0.3, -0.45);
  sword.rotation.set(0.9, 0.2, 0);
  camera.add(shield);
  shield.position.set(-0.32, -0.25, -0.5);
  shield.rotation.set(0, 0.3, 0);
  hudMesh.visible = false;
}
attachDesktop();

for (let i = 0; i < 2; i++) {
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(grip);
  grips.push(grip);
  grip.addEventListener('connected', (e) => {
    const hand = e.data.handedness;
    grip.userData.hand = hand;
    if (e.data.gamepad) pads[hand] = e.data.gamepad;
    if (hand === 'right') {
      grip.add(sword);
      sword.position.set(0, 0, 0);
      sword.rotation.set(0.3, 0, 0);
    } else if (hand === 'left') {
      grip.add(shield);
      shield.position.set(0, 0, 0);
      shield.rotation.set(0, 0, 0);
      grip.add(hudMesh);
      hudMesh.visible = true;
    }
  });
  grip.addEventListener('disconnected', () => {
    grip.userData.hand = null;
  });
}

renderer.xr.addEventListener('sessionstart', () => { vrActive = true; });
renderer.xr.addEventListener('sessionend', () => {
  vrActive = false;
  attachDesktop();
});

// ---------------------------------------------------------------- гоблин
function makeGoblin() {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);

  const skin = new THREE.MeshStandardMaterial({ color: 0x5fa043, roughness: 0.8, emissive: 0x000000 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 1, emissive: 0x000000 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.45, 4, 10), cloth);
  body.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), skin);
  head.position.y = 1.42;
  const earGeo = new THREE.ConeGeometry(0.08, 0.35, 8);
  const earL = new THREE.Mesh(earGeo, skin);
  earL.position.set(-0.3, 1.5, 0); earL.rotation.z = Math.PI / 2 + 0.3;
  const earR = new THREE.Mesh(earGeo, skin);
  earR.position.set(0.3, 1.5, 0); earR.rotation.z = -Math.PI / 2 - 0.3;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
  eyeL.position.set(-0.09, 1.47, 0.2);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.09;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), skin);
  nose.position.set(0, 1.4, 0.26); nose.rotation.x = Math.PI / 2;
  const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
  const legL = new THREE.Mesh(legGeo, skin); legL.position.set(-0.12, 0.25, 0);
  const legR = new THREE.Mesh(legGeo, skin); legR.position.set(0.12, 0.25, 0);
  const armIdle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), skin);
  armIdle.position.set(-0.36, 0.95, 0.05);

  // рука с дубиной: вращение вокруг плеча
  const arm = new THREE.Group();
  arm.position.set(0.36, 1.15, 0.05);
  const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), skin);
  armMesh.position.y = -0.25;
  const club = new THREE.Group();
  club.position.y = -0.5;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 8), dark);
  handle.position.y = -0.1;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), dark);
  knob.position.y = -0.5;
  club.add(handle, knob);
  arm.add(armMesh, club);

  model.add(body, head, earL, earR, eyeL, eyeR, nose, legL, legR, armIdle, arm);

  // полоска здоровья (в сцене, поворачивается к игроку)
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.07), new THREE.MeshBasicMaterial({ color: 0x220000 }));
  const fillGeo = new THREE.PlaneGeometry(0.6, 0.07);
  fillGeo.translate(0.3, 0, 0);
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x44dd55 }));
  fill.position.set(-0.3, 0, 0.002);
  bar.add(bg, fill);
  scene.add(bar);

  return {
    root, model, arm, skin, cloth, bar, fill,
    hp: GOBLIN_HP, st: 'chase', t: 0, stun: 0, dead: false, resolved: false, deadT: 0, walk: 0,
  };
}

const ARM_IDLE = -0.2, ARM_UP = -3.4, ARM_HIT = -1.3;
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

// ---------------------------------------------------------------- состояние игры
const state = {
  hp: MAX_HP,
  goblin: null,
  potion: null,
  mode: 'play',      // play | dead | victory
  timer: 0,
};

function removeGoblin() {
  const g = state.goblin;
  if (!g) return;
  scene.remove(g.root, g.bar);
  state.goblin = null;
}

function spawnGoblin() {
  removeGoblin();
  const g = makeGoblin();
  g.root.position.set(0, 0, -6);
  scene.add(g.root);
  state.goblin = g;
}

function spawnPotion(pos) {
  const p = new THREE.Group();
  const flask = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xe0203a, emissive: 0xaa1020, emissiveIntensity: 0.8, roughness: 0.2 })
  );
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0xbfd8e8 }));
  neck.position.y = 0.14;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.05, 8), woodMat);
  cork.position.y = 0.22;
  p.add(flask, neck, cork);
  p.position.set(pos.x, 0.9, pos.z);
  const l = new THREE.PointLight(0xff3050, 1.2, 4);
  p.add(l);
  scene.add(p);
  state.potion = p;
}

function removePotion() {
  if (state.potion) { scene.remove(state.potion); state.potion = null; }
}

function resetLevel(first = false) {
  state.hp = MAX_HP;
  state.mode = 'play';
  rig.position.set(0, 0, 5);
  rig.rotation.set(0, 0, 0);
  removePotion();
  spawnGoblin();
  drawHud();
  if (first) showMessage('Окраина королевства\nПобеди гоблина!', 5);
  else showMessage('Новая попытка!', 2.5);
}

// ---------------------------------------------------------------- вспомогательное
const head = new THREE.Vector3();
const tmp = new THREE.Vector3();
const shieldPos = new THREE.Vector3();
const tipPos = new THREE.Vector3();
const midPos = new THREE.Vector3();
const prevTip = new THREE.Vector3();
let swordSpeed = 0;
let swingCd = 0;
let firstFrame = true;

function hurtPlayer() {
  state.hp -= 1;
  flashT = 0.5;
  sfx.hurt();
  haptic('left', 1, 200); haptic('right', 1, 200);
  drawHud();
  if (state.hp <= 0) {
    state.mode = 'dead';
    state.timer = 3.5;
    showMessage('Вы пали в бою...', 3.5);
  }
}

function resolveGoblinStrike(g) {
  tmp.subVectors(head, g.root.position); tmp.y = 0;
  const dist = tmp.length();
  if (dist > 2.4) return; // промах
  tmp.normalize();
  // точка перед игроком, куда приходится удар
  const hit = new THREE.Vector3(head.x - tmp.x * 0.45, head.y - 0.3, head.z - tmp.z * 0.45);
  shield.getWorldPosition(shieldPos);
  if (shieldPos.distanceTo(hit) < 0.6) {
    sfx.clang();
    haptic('left', 1, 150);
    g.st = 'recover'; g.t = -0.6;
    g.root.position.addScaledVector(tmp, -0.7);
    showMessage('Блок!', 0.8);
  } else {
    hurtPlayer();
  }
}

function damageGoblin(g, dmg) {
  g.hp -= dmg;
  sfx.hit();
  haptic('right', 0.9, 120);
  g.skin.emissive.setHex(0xffffff); g.skin.emissiveIntensity = 0.7;
  g.flashT = 0.12;
  if (g.hp <= 0) {
    g.dead = true; g.deadT = 0;
    g.skin.emissive.setHex(0x000000);
    g.cloth.emissive.setHex(0x000000);
    scene.remove(g.bar);
    spawnPotion(g.root.position);
    sfx.win();
    showMessage('Гоблин повержен!\nПодбери эликсир', 4);
    drawHud();
    return;
  }
  // сбить атаку и отбросить
  tmp.subVectors(g.root.position, head); tmp.y = 0; tmp.normalize();
  g.root.position.addScaledVector(tmp, 0.5);
  g.st = 'recover'; g.t = -0.3; g.stun = 0.4;
  drawHud();
}

function updateSwordHit(dt) {
  sword.userData.tip.getWorldPosition(tipPos);
  sword.userData.mid.getWorldPosition(midPos);
  if (firstFrame) { prevTip.copy(tipPos); firstFrame = false; }
  const raw = tipPos.distanceTo(prevTip) / Math.max(dt, 0.001);
  swordSpeed = swordSpeed * 0.5 + raw * 0.5;
  prevTip.copy(tipPos);
  swingCd -= dt;

  const g = state.goblin;
  if (!g || g.dead || swingCd > 0 || swordSpeed < 2.2 || state.mode !== 'play') return;
  for (const p of [tipPos, midPos]) {
    const dx = p.x - g.root.position.x;
    const dz = p.z - g.root.position.z;
    if (Math.hypot(dx, dz) < 0.55 && p.y > 0.05 && p.y < 1.8) {
      const dmg = Math.min(60, Math.max(8, (swordSpeed - 1.5) * 14));
      damageGoblin(g, dmg);
      swingCd = 0.4;
      break;
    }
  }
}

function updateGoblin(g, dt, time) {
  // вспышка при попадании
  if (g.flashT > 0) {
    g.flashT -= dt;
    if (g.flashT <= 0) { g.skin.emissive.setHex(0x000000); g.skin.emissiveIntensity = 1; }
  }

  if (g.dead) {
    g.deadT += dt;
    g.model.rotation.x = -Math.min(Math.PI / 2, g.deadT * 4);
    g.model.position.y = Math.max(-0.3, -g.deadT * 0.3) + (g.deadT * 4 < Math.PI / 2 ? 0 : 0);
    return;
  }

  tmp.subVectors(head, g.root.position); tmp.y = 0;
  const dist = tmp.length();
  const targetYaw = Math.atan2(tmp.x, tmp.z);
  let dy = targetYaw - g.root.rotation.y;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  g.root.rotation.y += dy * Math.min(1, dt * 8);

  // индикатор подготовки атаки: красное свечение
  const warn = g.st === 'windup' ? 0.4 + 0.4 * Math.sin(time * 30) : 0;
  g.cloth.emissive.setRGB(warn, 0, 0);

  let armAngle = ARM_IDLE;
  g.walk = 0;

  if (g.stun > 0) g.stun -= dt;

  switch (g.st) {
    case 'chase':
      if (g.stun > 0) break;
      if (dist > 1.7) {
        tmp.normalize();
        g.root.position.addScaledVector(tmp, 1.3 * dt);
        g.walk = 1;
      } else {
        g.st = 'windup'; g.t = 0; g.resolved = false;
        tone(220, 0.25, 'sawtooth', 0.05, 120); // предупреждающий рык
      }
      break;
    case 'windup':
      g.t += dt;
      armAngle = lerp(ARM_IDLE, ARM_UP, g.t / 0.9);
      if (g.t >= 0.9) { g.st = 'strike'; g.t = 0; }
      break;
    case 'strike':
      g.t += dt;
      armAngle = lerp(ARM_UP, ARM_HIT, g.t / 0.12);
      if (!g.resolved && g.t >= 0.1) {
        g.resolved = true;
        if (state.mode === 'play') resolveGoblinStrike(g);
      }
      if (g.t >= 0.3) { g.st = 'recover'; g.t = 0; }
      break;
    case 'recover':
      g.t += dt;
      armAngle = lerp(ARM_HIT, ARM_IDLE, Math.max(0, g.t) / 0.5);
      if (g.t >= 1.1) g.st = 'chase';
      break;
  }

  g.arm.rotation.x = armAngle;
  g.model.position.y = g.walk ? Math.abs(Math.sin(time * 9)) * 0.06 : 0;

  // полоска здоровья
  g.bar.position.set(g.root.position.x, 2.0, g.root.position.z);
  g.bar.lookAt(head.x, 2.0, head.z);
  g.fill.scale.x = Math.max(0.001, g.hp / GOBLIN_HP);
}

function updatePotion(dt, time) {
  const p = state.potion;
  if (!p) return;
  p.position.y = 0.9 + Math.sin(time * 3) * 0.05;
  p.rotation.y += dt;
  let taken = false;
  if (vrActive) {
    for (const gr of grips) {
      gr.getWorldPosition(tmp);
      if (tmp.distanceTo(p.position) < 0.35) { taken = true; break; }
    }
  } else {
    tmp.set(head.x, p.position.y, head.z);
    if (Math.hypot(head.x - p.position.x, head.z - p.position.z) < 1.2) taken = true;
  }
  if (taken) {
    removePotion();
    state.hp = MAX_HP;
    sfx.potion();
    haptic('right', 0.7, 150); haptic('left', 0.7, 150);
    drawHud();
    state.mode = 'victory';
    state.timer = 6;
    showMessage('Эликсир получен!\nУровень 1 пройден', 5);
  }
}

// ---------------------------------------------------------------- управление
// Компьютер
const keys = {};
let dragging = false;
let swingT = 0;
let blocking = false;
window.addEventListener('keydown', (e) => { keys[e.code] = true; if (e.key === 'Shift') blocking = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.key === 'Shift') blocking = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (e) => {
  if (vrActive) return;
  dragging = true;
  if (e.button === 0 && swingT <= 0) { swingT = 0.3; sfx.swing(); }
  if (e.button === 2) blocking = true;
});
window.addEventListener('mouseup', (e) => {
  dragging = false;
  if (e.button === 2) blocking = false;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging || vrActive) return;
  rig.rotation.y -= e.movementX * 0.003;
  camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x - e.movementY * 0.003));
});

function updateDesktop(dt) {
  const f = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, rig.rotation.y);
  const r = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, rig.rotation.y);
  const mv = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) mv.add(f);
  if (keys.KeyS || keys.ArrowDown) mv.sub(f);
  if (keys.KeyD || keys.ArrowRight) mv.add(r);
  if (keys.KeyA || keys.ArrowLeft) mv.sub(r);
  if (mv.lengthSq() > 0) rig.position.addScaledVector(mv.normalize(), 2.2 * dt);

  // удар
  if (swingT > 0) {
    swingT -= dt;
    const p = 1 - Math.max(0, swingT) / 0.3;
    sword.rotation.set(lerp(1.3, -0.9, p), 0.2, lerp(0.3, -0.3, p));
    sword.position.set(0.3 - p * 0.15, -0.3 + p * 0.05, -0.45 - Math.sin(p * Math.PI) * 0.3);
  } else {
    sword.rotation.set(0.9, 0.2, 0);
    sword.position.set(0.3, -0.3, -0.45);
  }
  // блок
  const tgtPos = blocking ? new THREE.Vector3(-0.02, -0.12, -0.55) : new THREE.Vector3(-0.32, -0.25, -0.5);
  shield.position.lerp(tgtPos, Math.min(1, dt * 14));
  shield.rotation.y = lerp(shield.rotation.y, blocking ? 0 : 0.3, dt * 14);
}

// VR
let snapCd = 0;
function updateVR(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;
  snapCd -= dt;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp || !src.handedness) continue;
    pads[src.handedness] = gp;
    const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0];
    const ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1];
    if (src.handedness === 'left') {
      if (Math.hypot(ax, ay) > 0.15) {
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        fwd.y = 0; fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, UP);
        const mv = fwd.multiplyScalar(-ay).addScaledVector(right, ax);
        rig.position.addScaledVector(mv, 2.0 * dt);
      }
    } else if (src.handedness === 'right') {
      if (Math.abs(ax) > 0.7 && snapCd <= 0) {
        const a = -Math.sign(ax) * (Math.PI / 6);
        camera.getWorldPosition(tmp);
        rig.position.sub(tmp).applyAxisAngle(UP, a).add(tmp);
        rig.rotation.y += a;
        snapCd = 0.3;
      }
    }
  }
}

function clampRig() {
  const r = Math.hypot(rig.position.x, rig.position.z);
  if (r > ARENA_RADIUS) {
    rig.position.x *= ARENA_RADIUS / r;
    rig.position.z *= ARENA_RADIUS / r;
  }
}

// ---------------------------------------------------------------- главный цикл
const clock = new THREE.Clock();
let hudTimer = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (vrActive) updateVR(dt); else updateDesktop(dt);
  clampRig();
  camera.getWorldPosition(head);

  if (state.mode === 'play') updateSwordHit(dt);
  else { sword.userData.tip.getWorldPosition(prevTip); }

  if (state.goblin && (state.mode === 'play' || state.mode === 'victory')) updateGoblin(state.goblin, dt, time);
  else if (state.goblin && state.goblin.dead) updateGoblin(state.goblin, dt, time);
  if (state.mode === 'play') updatePotion(dt, time);
  else if (state.potion) { state.potion.rotation.y += dt; }

  if (state.mode === 'dead' || state.mode === 'victory') {
    state.timer -= dt;
    if (state.timer <= 0) resetLevel();
  }

  // вспышка урона
  if (flashT > 0) { flashT -= dt; flash.material.opacity = Math.max(0, flashT) * 0.9; }
  else flash.material.opacity = 0;

  updateMessage(dt);

  // DOM-индикаторы
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.15;
    hpEl.textContent = '♥'.repeat(state.hp) + '♡'.repeat(MAX_HP - state.hp);
    const g = state.goblin;
    foeEl.textContent = g && !g.dead ? 'Гоблин: ' + Math.max(0, Math.ceil(g.hp)) + ' / ' + GOBLIN_HP : (g ? 'Гоблин повержен' : '');
  }

  renderer.render(scene, camera);
});

resetLevel(true);
