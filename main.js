import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/* =====================================================================
   Рыцарь: Пленница дракона — 8 уровней
   WebXR (Meta Quest 2) + Three.js. Меч в правой руке, щит в левой.
   Подсказка для проверки: добавь в адрес ?level=N (например ?level=8).
   ===================================================================== */

const UP = new THREE.Vector3(0, 1, 0);
const ARENA_RADIUS = 11;
const SAVE_KEY = 'kd_save_v1';

const hpEl = document.getElementById('hp');
const foeEl = document.getElementById('foe');
const lvlEl = document.getElementById('lvl');
const msgEl = document.getElementById('msg');

// ---------------------------------------------------------------- награды
const REWARDS = {
  shield:  { name: 'Щит',                    text: 'Получен щит и эликсир!\nЩит стал шире', apply: (s) => { s.blockR += 0.12; } },
  amulet:  { name: 'Амулет здоровья',        text: 'Амулет здоровья!\n+1 сердце',            apply: (s) => { s.maxHp += 1; } },
  hammer:  { name: 'Боевой молот',           text: 'Боевой молот!\nУдары сильнее на 25%',    apply: (s) => { s.dmg *= 1.25; } },
  ice:     { name: 'Ледяной клинок',         text: 'Ледяной клинок!\nВраги медленнее',       apply: (s) => { s.slow *= 0.82; } },
  shield2: { name: 'Усиленный щит',          text: 'Усиленный щит!\nБлок надёжнее',          apply: (s) => { s.blockR += 0.12; } },
  fire:    { name: 'Амулет защиты от огня',  text: 'Амулет от огня!\nЧасть ударов не ранит', apply: (s) => { s.evade += 0.3; } },
  enchant: { name: 'Зачарование меча',       text: 'Меч зачарован!\nБольше урона по боссам', apply: (s) => { s.bossDmg *= 1.5; } },
  princess:{ name: 'Принцесса',              text: 'Принцесса спасена!',                     apply: () => {} },
};

// ---------------------------------------------------------------- враги
const BASE = { shape: 'humanoid', dmg: 1, hitR: 0.55, height: 1.7, reach: 1.7 };
const ENEMY = {
  goblin:   { ...BASE, name: 'Гоблин',        hp: 100, speed: 1.3, windup: 0.9, skin: 0x5fa043, cloth: 0x5a3b22, eyes: 0xffe14d },
  spider:   { ...BASE, name: 'Паук',          hp: 90,  speed: 2.1, windup: 0.55, skin: 0x2b2b33, cloth: 0x1a1a20, eyes: 0xff2a2a, shape: 'spider', height: 0.9, hitR: 0.6, reach: 1.5 },
  skeleton: { ...BASE, name: 'Скелет',        hp: 110, speed: 1.4, windup: 0.8, skin: 0xe8e4d0, cloth: 0x8a8a80, eyes: 0x66ccff },
  golem:    { ...BASE, name: 'Каменный голем',hp: 230, speed: 0.8, windup: 1.2, skin: 0x8a8f99, cloth: 0x6a6f79, eyes: 0xff8a2a },
  bog:      { ...BASE, name: 'Болотник',      hp: 120, speed: 1.5, windup: 0.8, skin: 0x3f6b6b, cloth: 0x24403a, eyes: 0xb8ff5a },
  dark:     { ...BASE, name: 'Воин ордена',   hp: 140, speed: 1.6, windup: 0.7, skin: 0x2c2c3a, cloth: 0x16161e, eyes: 0xff3a3a },
  fire:     { ...BASE, name: 'Огненное создание', hp: 120, speed: 1.8, windup: 0.6, skin: 0xff7a1a, cloth: 0xb02a10, eyes: 0xffff66 },
  elite:    { ...BASE, name: 'Страж дракона', hp: 180, speed: 1.7, windup: 0.6, skin: 0x9a3a3a, cloth: 0x3a1c1c, eyes: 0xffd24a },
  dragon:   { ...BASE, name: 'Дракон',        hp: 520, speed: 1.1, windup: 0.9, skin: 0x8a2222, cloth: 0x5a1414, eyes: 0xffe14d,
              shape: 'dragon', height: 2.2, hitR: 0.9, reach: 2.0, dmg: 2, fire: true, phases: true },
};

// ---------------------------------------------------------------- уровни
const LEVELS = [
  { name: 'Окраина королевства', env: 'village', seed: 7, bg: 0x151b33, fog: [10, 45], ground: 0x3b4a2f, hemi: [0x8fa4ff, 0x2a2a1e], torch: 0xff9a3c,
    intro: 'Бей резкими взмахами,\nблокируй щитом!', enemies: [['goblin', 2]],
    boss: { type: 'goblin', name: 'Главарь гоблинов', hpMul: 2.2, scale: 1.35 }, reward: 'shield' },
  { name: 'Заколдованный лес', env: 'forest', seed: 11, bg: 0x08140d, fog: [6, 32], ground: 0x1c3020, hemi: [0x66cc88, 0x0a1a10], torch: 0x88ffaa,
    intro: 'Пауки быстры —\nне давай им подойти', enemies: [['spider', 3]],
    boss: { type: 'spider', name: 'Паучья матка', hpMul: 2.6, scale: 1.9 }, reward: 'amulet' },
  { name: 'Заброшенные шахты', env: 'mine', seed: 13, bg: 0x0f0b09, fog: [5, 30], ground: 0x3a3230, hemi: [0xaa8866, 0x1a1210], torch: 0xffb060,
    intro: 'Скелеты-шахтёры\nи каменный голем', enemies: [['skeleton', 3]],
    boss: { type: 'golem', name: 'Каменный голем', hpMul: 1.4, scale: 1.7 }, reward: 'hammer' },
  { name: 'Затопленные руины', env: 'swamp', seed: 17, bg: 0x0c1a22, fog: [6, 34], ground: 0x2c4a44, hemi: [0x77c4cc, 0x0c1a1c], torch: 0x99ffee,
    intro: 'Болотные чудовища\nвыходят из воды', enemies: [['bog', 3]],
    boss: { type: 'bog', name: 'Хранитель руин', hpMul: 2.6, scale: 1.6 }, reward: 'ice' },
  { name: 'Крепость тёмного ордена', env: 'fortress', seed: 19, bg: 0x17131d, fog: [8, 40], ground: 0x4a4750, hemi: [0x9a88cc, 0x1a1520], torch: 0xff7a5a,
    intro: 'Чёрный рыцарь умеет\nблокировать и отвечать', enemies: [['dark', 3]],
    boss: { type: 'dark', name: 'Чёрный рыцарь', hpMul: 2.6, scale: 1.3, blocks: true }, reward: 'shield2' },
  { name: 'Огненное ущелье', env: 'canyon', seed: 23, bg: 0x2a0c06, fog: [8, 40], ground: 0x4a2a1e, hemi: [0xff8a5a, 0x2a0c06], torch: 0xff6a2a, hemiI: 1.1,
    intro: 'Огонь бьёт издалека —\nпрячься за камнями или щитом', enemies: [['fire', 3]],
    boss: { type: 'fire', name: 'Огненный страж', hpMul: 2.6, scale: 1.6, fire: true }, reward: 'fire', covers: 3 },
  { name: 'Подступы к замку', env: 'approach', seed: 29, bg: 0x1a1a2e, fog: [8, 45], ground: 0x555566, hemi: [0x9aa4ff, 0x1a1a22], torch: 0xffc070,
    intro: 'Элитные стражи дракона', enemies: [['elite', 4]],
    boss: { type: 'elite', name: 'Командир стражи', hpMul: 2.8, scale: 1.4 }, reward: 'enchant' },
  { name: 'Замок дракона', env: 'castle', seed: 31, bg: 0x241017, fog: [10, 50], ground: 0x4a3a3a, hemi: [0xff9a8a, 0x241017], torch: 0xff7040, hemiI: 1.0,
    intro: 'Дракон!\nПрячься от огня за камнями', enemies: [],
    boss: { type: 'dragon', name: 'Дракон', hpMul: 1, scale: 1.5 }, reward: 'princess', covers: 5 },
];

// ---------------------------------------------------------------- рендерер и сцена
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151b33);
scene.fog = new THREE.Fog(0x151b33, 10, 45);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 120);
camera.position.set(0, 1.6, 0);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- звук
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
  roar: () => tone(110, 0.5, 'sawtooth', 0.12, -40),
  fire: () => tone(90, 0.6, 'sawtooth', 0.14, 60),
};

// ---------------------------------------------------------------- состояние
const state = {
  level: 0,
  got: [],
  hp: 5,
  stats: { maxHp: 5, dmg: 1, blockR: 0.55, slow: 1, evade: 0, bossDmg: 1 },
  enemies: [],
  bossPending: null,
  pickup: null,
  lastDeath: new THREE.Vector3(0, 0, -5),
  covers: [],
  mode: 'play',   // play | dead | victory
  timer: 0,
};

function computeStats() {
  const s = { maxHp: 5, dmg: 1, blockR: 0.55, slow: 1, evade: 0, bossDmg: 1 };
  for (const id of state.got) if (REWARDS[id]) REWARDS[id].apply(s);
  state.stats = s;
}

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && Number.isInteger(s.level) && Array.isArray(s.got) && s.level >= 0 && s.level < LEVELS.length) return s;
  } catch (e) { /* нет сохранения */ }
  return null;
}
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ level: state.level, got: state.got })); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- освещение, земля
const hemi = new THREE.HemisphereLight(0x8fa4ff, 0x2a2a1e, 0.9);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xbfcfff, 0.7);
moon.position.set(-10, 20, 8);
scene.add(moon);
const torchLightA = new THREE.PointLight(0xff9a3c, 1.6, 14);
const torchLightB = new THREE.PointLight(0xff9a3c, 1.6, 14);
scene.add(torchLightA, torchLightB);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(70, 48),
  new THREE.MeshStandardMaterial({ color: 0x3b4a2f, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function disposeTree(o) {
  o.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material.dispose();
    }
  });
}

let env = null;

function buildEnv(cfg) {
  if (env) { scene.remove(env); disposeTree(env); }
  env = new THREE.Group();
  scene.add(env);
  state.covers = [];

  scene.background.setHex(cfg.bg);
  scene.fog.color.setHex(cfg.bg);
  scene.fog.near = cfg.fog[0]; scene.fog.far = cfg.fog[1];
  ground.material.color.setHex(cfg.ground);
  hemi.color.setHex(cfg.hemi[0]); hemi.groundColor.setHex(cfg.hemi[1]); hemi.intensity = cfg.hemiI || 0.9;
  torchLightA.color.setHex(cfg.torch); torchLightB.color.setHex(cfg.torch);

  const rnd = mulberry(cfg.seed);
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, ...extra });
  const stone = mat(0x77726a), dkStone = mat(0x4b4742), wood = mat(0x5b3d22), leaf = mat(0x25492c);
  const add = (m, x, y, z) => { m.position.set(x, y, z); env.add(m); return m; };
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (rt, rb, h, m, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  const ring = (n, r, fn, off = 0) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + off; const [x, z] = polar(a, r); fn(x, z, a, i); } };
  const scatter = (n, r0, r1, fn) => { for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2; const [x, z] = polar(a, r0 + rnd() * (r1 - r0)); fn(x, z, a, i); } };

  const treeFn = (trunkM, crownM, tall) => (x, z) => {
    const g = new THREE.Group();
    const t = cyl(0.2, 0.3, 2 * tall, trunkM, 6); t.position.y = tall;
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4 * tall, 7), crownM); c.position.y = 3.6 * tall;
    g.add(t, c);
    g.scale.setScalar(0.8 + rnd() * 0.7);
    add(g, x, 0, z);
  };
  const rockFn = (m, s) => (x, z) => {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry((0.3 + rnd() * 0.5) * s), m);
    r.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    add(r, x, 0.2 * s, z);
  };
  const ruinFn = (x, z, a) => {
    const g = new THREE.Group();
    [[0, 1.0, -2, 4, 2.0, 0.3], [-1.0, 0.6, 2, 2.0, 1.2, 0.3], [-2, 1.2, 0, 0.3, 2.4, 4], [2, 0.5, 0.5, 0.3, 1.0, 3]].forEach(([px, py, pz, w, h, d]) => {
      const m = box(w, h, d, stone); m.position.set(px, py, pz); g.add(m);
    });
    g.rotation.y = -a + Math.PI / 2;
    add(g, x, 0, z);
  };
  const coverFn = (m, count) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.5;
      const r = 5.5 + (i % 2) * 2.5;
      const [x, z] = polar(a, r);
      const b = box(1.6, 1.8, 1.0, m);
      b.rotation.y = a;
      add(b, x, 0.9, z);
      state.covers.push({ x, z, r: 1.0 });
    }
  };

  // факелы (источники света общие, меняются только позиции)
  const torchAt = (x, z, light) => {
    add(cyl(0.05, 0.07, 1.8, wood, 6), x, 0.9, z);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: cfg.torch })), x, 1.95, z);
    light.position.set(x, 2.1, z);
  };
  torchAt(-4, -3, torchLightA);
  torchAt(4, 3, torchLightB);

  switch (cfg.env) {
    case 'village':
      ring(6, 17, ruinFn, 0.3);
      scatter(26, 22, 40, treeFn(wood, leaf, 1));
      scatter(30, 5, 25, rockFn(stone, 0.6));
      break;
    case 'forest': {
      const dark = mat(0x143d22), trunk = mat(0x2d1f12);
      scatter(80, 12, 40, treeFn(trunk, dark, 1.3));
      const web = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
      scatter(12, 8, 14, (x, z, a) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), web); w.rotation.y = a; add(w, x, 2, z); });
      scatter(20, 6, 22, rockFn(mat(0x2a3a2a), 0.7));
      break;
    }
    case 'mine': {
      ring(14, 15, (x, z) => add(box(1, 7, 1, dkStone), x, 3.5, z));
      scatter(18, 14, 32, rockFn(dkStone, 2.2));
      scatter(8, 8, 14, (x, z, a) => { const b = box(5, 0.3, 0.3, wood); b.rotation.y = a; add(b, x, 4.2, z); });
      const ceil = new THREE.Mesh(new THREE.CircleGeometry(40, 24), new THREE.MeshBasicMaterial({ color: 0x0a0807, side: THREE.DoubleSide }));
      ceil.rotation.x = Math.PI / 2; add(ceil, 0, 7.5, 0);
      scatter(10, 7, 12, rockFn(mat(0x5a5048), 0.6));
      break;
    }
    case 'swamp': {
      const water = new THREE.Mesh(new THREE.CircleGeometry(60, 40), new THREE.MeshStandardMaterial({ color: 0x2a6f7a, transparent: true, opacity: 0.7, roughness: 0.3 }));
      water.rotation.x = -Math.PI / 2; add(water, 0, 0.04, 0);
      add(cyl(11.5, 11.5, 0.12, stone, 32), 0, 0.06, 0);
      scatter(18, 13, 32, (x, z) => { const p = cyl(0.5, 0.6, 2 + rnd() * 2, stone); p.rotation.z = (rnd() - 0.5) * 0.4; add(p, x, 1, z); });
      scatter(20, 13, 36, (x, z) => { const t = cyl(0.1, 0.2, 3, mat(0x2d2a22), 5); t.rotation.z = (rnd() - 0.5) * 0.5; add(t, x, 1.5, z); });
      break;
    }
    case 'fortress': {
      const wallM = mat(0x5a5560), red = new THREE.MeshBasicMaterial({ color: 0x8a1f2b, side: THREE.DoubleSide });
      ring(16, 17, (x, z, a) => { const w = box(6.2, 7, 1.2, wallM); w.rotation.y = -a + Math.PI / 2; add(w, x, 3.5, z); });
      ring(4, 17, (x, z) => add(cyl(2.4, 2.6, 11, wallM, 12), x, 5.5, z), Math.PI / 4);
      ring(8, 10.5, (x, z, a) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3), red); b.rotation.y = -a + Math.PI / 2; add(b, x, 3.5, z); }, 0.2);
      break;
    }
    case 'canyon': {
      const rock = mat(0x7a3322), lavaM = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
      scatter(26, 15, 32, (x, z) => add(box(2 + rnd() * 2, 6 + rnd() * 8, 2 + rnd() * 2, rock), x, 5, z));
      const lava = new THREE.Mesh(new THREE.RingGeometry(12.5, 65, 48), lavaM);
      lava.rotation.x = -Math.PI / 2; add(lava, 0, 0.03, 0);
      scatter(10, 9, 11.5, (x, z) => add(new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0xff8a2a })), x, 0.8, z));
      coverFn(rock, cfg.covers || 3);
      break;
    }
    case 'approach': {
      const col = mat(0x8a8a99);
      ring(12, 14, (x, z, a, i) => add(cyl(0.6, 0.7, i % 3 === 0 ? 4 : 7, col, 10), x, i % 3 === 0 ? 2 : 3.5, z));
      const dk = mat(0x2a2236);
      add(box(30, 14, 6, dk), 0, 7, -52);
      [-16, -8, 8, 16].forEach((x) => add(cyl(2, 2.2, 22, dk, 10), x, 11, -52));
      scatter(24, 14, 36, rockFn(mat(0x44445a), 1.4));
      break;
    }
    case 'castle': {
      const wallM = mat(0x4d3d3d), roof = mat(0x5a1a1a);
      ring(6, 18, (x, z) => {
        add(cyl(2.6, 2.8, 14, wallM, 12), x, 7, z);
        add(new THREE.Mesh(new THREE.ConeGeometry(3.2, 4, 12), roof), x, 16, z);
      }, 0.3);
      add(cyl(3, 3.4, 22, wallM, 14), 0, 11, -26);
      add(new THREE.Mesh(new THREE.ConeGeometry(3.8, 5, 14), roof), 0, 24.5, -26);
      add(box(1.2, 1.6, 0.2, new THREE.MeshBasicMaterial({ color: 0xffe29a })), 0, 15, -22.6);
      coverFn(mat(0x6a5a5a), cfg.covers || 5);
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- меч и щит
const woodMatShared = new THREE.MeshStandardMaterial({ color: 0x5b3d22, roughness: 1 });
function makeSword() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, metalness: 0.8, roughness: 0.25 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a933, metalness: 0.7, roughness: 0.4 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.85), steel);
  blade.position.z = -0.55;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.04), gold);
  guard.position.z = -0.12;
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), woodMatShared);
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
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0x2c4f9e, roughness: 0.6 }));
  face.rotation.x = Math.PI / 2;
  const goldM = new THREE.MeshStandardMaterial({ color: 0xd9a933, metalness: 0.7, roughness: 0.4 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 8, 24), goldM);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), goldM);
  boss.position.z = -0.03;
  g.add(face, rim, boss);
  g.position.z = -0.12;
  const holder = new THREE.Group();
  holder.add(g);
  return holder;
}

const sword = makeSword();
const shield = makeShield();

// ---------------------------------------------------------------- HUD и сообщения
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 256; hudCanvas.height = 128;
const hudTex = new THREE.CanvasTexture(hudCanvas);
const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ map: hudTex, transparent: true }));
hudMesh.position.set(0, 0.09, 0.06);
hudMesh.rotation.x = -Math.PI / 3;
hudMesh.visible = false;

function foeText() {
  const alive = state.enemies.filter((e) => !e.dead);
  const boss = alive.find((e) => e.boss);
  if (boss) return boss.name + ': ' + Math.max(0, Math.ceil(boss.hp)) + '/' + Math.ceil(boss.maxHp);
  if (alive.length) return 'Врагов: ' + alive.length + (state.bossPending ? ' + босс' : '');
  return state.bossPending ? 'Скоро босс' : 'Победа!';
}

function drawHud() {
  const c = hudCanvas.getContext('2d');
  c.clearRect(0, 0, 256, 128);
  c.fillStyle = 'rgba(10,12,25,0.7)';
  c.fillRect(0, 0, 256, 128);
  c.font = 'bold 36px sans-serif';
  c.textBaseline = 'middle';
  const n = state.stats.maxHp;
  for (let i = 0; i < n; i++) {
    c.fillStyle = i < state.hp ? '#ff4d5e' : '#4a4f66';
    c.fillText('♥', 8 + i * 38, 36);
  }
  c.font = '20px sans-serif';
  c.fillStyle = '#ffffff';
  c.fillText('Уровень ' + (state.level + 1) + '/' + LEVELS.length, 10, 80);
  c.fillText(foeText(), 10, 108);
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

const camPos = new THREE.Vector3();
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
  c.font = 'bold ' + (lines.length > 2 ? 56 : 68) + 'px sans-serif';
  lines.forEach((l, i) => c.fillText(l, 512, 128 + (i - (lines.length - 1) / 2) * 78));
  msgTex.needsUpdate = true;

  camera.getWorldPosition(camPos);
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  msgMesh.position.copy(camPos).addScaledVector(fwd, 1.8);
  msgMesh.position.y = camPos.y + 0.1;
  msgMesh.lookAt(camPos);
  msgTimer = secs;
}

function updateMessage(dt) {
  if (msgTimer > 0) {
    msgTimer -= dt;
    msgMesh.material.opacity = Math.min(1, msgTimer * 2);
    if (msgTimer <= 0) { msgEl.style.opacity = 0; msgMesh.material.opacity = 0; }
  }
}

const flash = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false })
);
flash.renderOrder = 998;
camera.add(flash);
let flashT = 0;

// струя огня дракона/стража
const flameGeo = new THREE.CylinderGeometry(0.7, 0.1, 1, 12, 1, true);
flameGeo.rotateX(Math.PI / 2);
const flameMesh = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
flameMesh.visible = false;
scene.add(flameMesh);
let flameT = 0;

// ---------------------------------------------------------------- руки / контроллеры
const grips = [];
const pads = {};
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
}

renderer.xr.addEventListener('sessionstart', () => { vrActive = true; });
renderer.xr.addEventListener('sessionend', () => { vrActive = false; attachDesktop(); });

// ---------------------------------------------------------------- модели врагов
function makeHumanoid(spec, skin, cloth) {
  const model = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.45, 4, 10), cloth); body.position.y = 0.8;
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), skin); headM.position.y = 1.42;
  const earGeo = new THREE.ConeGeometry(0.08, 0.35, 8);
  const earL = new THREE.Mesh(earGeo, skin); earL.position.set(-0.3, 1.5, 0); earL.rotation.z = Math.PI / 2 + 0.3;
  const earR = new THREE.Mesh(earGeo, skin); earR.position.set(0.3, 1.5, 0); earR.rotation.z = -Math.PI / 2 - 0.3;
  const eyeMat = new THREE.MeshBasicMaterial({ color: spec.eyes });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat); eyeL.position.set(-0.09, 1.47, 0.2);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.09;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), skin); nose.position.set(0, 1.4, 0.26); nose.rotation.x = Math.PI / 2;
  const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
  const legL = new THREE.Mesh(legGeo, skin); legL.position.set(-0.12, 0.25, 0);
  const legR = new THREE.Mesh(legGeo, skin); legR.position.set(0.12, 0.25, 0);
  const armIdle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), skin); armIdle.position.set(-0.36, 0.95, 0.05);
  const arm = new THREE.Group(); arm.position.set(0.36, 1.15, 0.05);
  const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), skin); armMesh.position.y = -0.25;
  const club = new THREE.Group(); club.position.y = -0.5;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 8), dark); handle.position.y = -0.1;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), dark); knob.position.y = -0.5;
  club.add(handle, knob);
  arm.add(armMesh, club);
  model.add(body, headM, earL, earR, eyeL, eyeR, nose, legL, legR, armIdle, arm);
  return { model, arm };
}

function makeSpider(spec, skin, cloth) {
  const model = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), cloth); body.scale.set(1, 0.75, 1.4); body.position.set(0, 0.55, -0.15);
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin); headM.position.set(0, 0.55, 0.5);
  const eyeMat = new THREE.MeshBasicMaterial({ color: spec.eyes });
  [[-0.09, 0.62], [0.09, 0.62], [-0.05, 0.55], [0.05, 0.55]].forEach(([x, y]) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat); e.position.set(x, y, 0.69); model.add(e);
  });
  const legGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.85, 5);
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(legGeo, skin);
      l.position.set(s * 0.5, 0.35, -0.3 + i * 0.28);
      l.rotation.z = s * 1.1;
      l.rotation.y = s * (i - 1.5) * 0.25;
      model.add(l);
    }
  }
  const arm = new THREE.Group(); arm.position.set(0.18, 0.6, 0.45);
  const fang = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.9, 6), skin); fang.position.y = -0.45;
  arm.add(fang);
  model.add(body, headM, arm);
  return { model, arm };
}

function makeDragonModel(spec, skin, cloth) {
  const model = new THREE.Group();
  const membrane = new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.9, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 12), skin); body.scale.set(1, 0.9, 1.7); body.position.set(0, 1.0, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 1.1, 10), skin); neck.position.set(0, 1.55, 1.0); neck.rotation.x = 0.7;
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin); headM.scale.set(1, 0.8, 1.5); headM.position.set(0, 1.95, 1.5);
  const hornGeo = new THREE.ConeGeometry(0.07, 0.45, 6);
  const hornL = new THREE.Mesh(hornGeo, cloth); hornL.position.set(-0.18, 2.2, 1.3); hornL.rotation.x = -0.5;
  const hornR = hornL.clone(); hornR.position.x = 0.18;
  const eyeMat = new THREE.MeshBasicMaterial({ color: spec.eyes });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat); eyeL.position.set(-0.17, 2.03, 1.65);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.17;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.2, 8), skin); tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.9, -1.9);
  const wingGeo = new THREE.PlaneGeometry(2.4, 1.5);
  const wingL = new THREE.Mesh(wingGeo, membrane); wingL.position.set(-1.5, 1.8, -0.2); wingL.rotation.set(0.1, 0.4, 0.6);
  const wingR = new THREE.Mesh(wingGeo, membrane); wingR.position.set(1.5, 1.8, -0.2); wingR.rotation.set(0.1, -0.4, -0.6);
  const legGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.8, 8);
  [[-0.55, -0.7], [0.55, -0.7], [-0.55, 0.7]].forEach(([x, z]) => {
    const l = new THREE.Mesh(legGeo, skin); l.position.set(x, 0.4, z); model.add(l);
  });
  const arm = new THREE.Group(); arm.position.set(0.6, 1.0, 0.8);
  const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.9, 8), skin); armMesh.position.y = -0.45;
  const claw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 6), cloth); claw.position.y = -1.05; claw.rotation.x = Math.PI;
  arm.add(armMesh, claw);
  model.add(body, neck, headM, hornL, hornR, eyeL, eyeR, tail, wingL, wingR, arm);
  return { model, arm };
}

function makeEnemy(type, cfg = {}, boss = false) {
  const spec = { ...ENEMY[type], ...cfg };
  const scale = cfg.scale || 1;
  const skin = new THREE.MeshStandardMaterial({ color: spec.skin, roughness: 0.8, emissive: 0x000000 });
  const cloth = new THREE.MeshStandardMaterial({ color: spec.cloth, roughness: 1, emissive: 0x000000 });
  const root = new THREE.Group();
  const built = spec.shape === 'spider' ? makeSpider(spec, skin, cloth)
    : spec.shape === 'dragon' ? makeDragonModel(spec, skin, cloth)
    : makeHumanoid(spec, skin, cloth);
  root.add(built.model);
  root.scale.setScalar(scale);

  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.07), new THREE.MeshBasicMaterial({ color: 0x220000 }));
  const fillGeo = new THREE.PlaneGeometry(0.6, 0.07);
  fillGeo.translate(0.3, 0, 0);
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: boss ? 0xff7733 : 0x44dd55 }));
  fill.position.set(-0.3, 0, 0.002);
  bar.add(bg, fill);
  bar.scale.setScalar(boss ? Math.max(1.4, scale) : 1);
  scene.add(bar);

  const maxHp = spec.hp * (cfg.hpMul || 1);
  return {
    spec, type, root, model: built.model, arm: built.arm, skin, cloth, bar, fill, scale, boss,
    name: cfg.name || spec.name,
    hp: maxHp, maxHp,
    reach: spec.reach * scale,
    fire: !!spec.fire, blocks: !!spec.blocks, phases: !!spec.phases, phase: 0,
    speedMul: 1, windMul: 1, breathCd: 4 + Math.random() * 3,
    st: 'chase', t: 0, stun: 0, dead: false, resolved: false, deadT: 0, walk: 0, flashT: 0,
  };
}

const ARM_IDLE = -0.2, ARM_UP = -3.4, ARM_HIT = -1.3;
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

// ---------------------------------------------------------------- награда
function makePickup(id, pos) {
  const colors = { shield: 0xe0203a, amulet: 0xff5a8a, hammer: 0xb0b0b8, ice: 0x66ccff, shield2: 0x4f7fe0, fire: 0xff8a2a, enchant: 0xc27bff, princess: 0xffe29a };
  const col = colors[id] || 0xffffff;
  const p = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16),
    new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.2 })
  );
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.015, 6, 24), new THREE.MeshBasicMaterial({ color: col }));
  halo.rotation.x = Math.PI / 2;
  p.add(gem, halo);
  p.position.set(pos.x, 1.0, pos.z);
  scene.add(p);
  return { obj: p, id };
}

// ---------------------------------------------------------------- уровни
const head = new THREE.Vector3();
const tmp = new THREE.Vector3();
const shieldPos = new THREE.Vector3();
const tipPos = new THREE.Vector3();
const midPos = new THREE.Vector3();
const prevTip = new THREE.Vector3();
let swordSpeed = 0;
let swingCd = 0;
let firstFrame = true;

function clearEnemies() {
  for (const e of state.enemies) { scene.remove(e.root, e.bar); disposeTree(e.root); }
  state.enemies = [];
  if (state.pickup) { scene.remove(state.pickup.obj); disposeTree(state.pickup.obj); state.pickup = null; }
  flameMesh.visible = false;
}

function spawnEnemy(type, x, z, cfg = {}, boss = false) {
  const e = makeEnemy(type, cfg, boss);
  e.root.position.set(x, 0, z);
  scene.add(e.root);
  state.enemies.push(e);
  return e;
}

function loadLevel(idx, message) {
  state.level = idx;
  const cfg = LEVELS[idx];
  computeStats();
  clearEnemies();
  buildEnv(cfg);
  state.hp = state.stats.maxHp;
  state.mode = 'play';
  rig.position.set(0, 0, 5);
  rig.rotation.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  firstFrame = true;

  let i = 0;
  for (const [type, count] of cfg.enemies) {
    for (let k = 0; k < count; k++, i++) {
      const x = (k - (count - 1) / 2) * 3.5;
      spawnEnemy(type, x, -6 - (k % 2) * 1.5);
    }
  }
  state.bossPending = cfg.boss;
  saveGame();
  drawHud();
  showMessage(message || ('Уровень ' + (idx + 1) + ': ' + cfg.name + '\n' + cfg.intro), 5);
}

function spawnBossIfNeeded() {
  if (!state.bossPending) return;
  const b = state.bossPending;
  state.bossPending = null;
  const e = spawnEnemy(b.type, 0, -7, b, true);
  sfx.roar();
  showMessage('Босс: ' + b.name + '!', 3);
  drawHud();
}

function levelClearCheck() {
  if (state.pickup) return;
  if (state.enemies.some((e) => !e.dead)) return;
  if (state.bossPending) { spawnBossIfNeeded(); return; }
  const cfg = LEVELS[state.level];
  state.pickup = makePickup(cfg.reward, state.lastDeath);
  sfx.win();
  showMessage(cfg.reward === 'princess' ? 'Дракон повержен!\nОткрой башню — коснись камня' : 'Уровень пройден!\nПодбери награду: ' + REWARDS[cfg.reward].name, 5);
  drawHud();
}

// ---------------------------------------------------------------- бой
function hurtPlayer(n = 1) {
  if (Math.random() < state.stats.evade) { showMessage('Амулет защитил!', 0.8); return; }
  state.hp = Math.max(0, state.hp - n);
  flashT = 0.5;
  sfx.hurt();
  haptic('left', 1, 200); haptic('right', 1, 200);
  drawHud();
  if (state.hp <= 0) {
    state.mode = 'dead';
    state.timer = 3.5;
    showMessage('Вы пали в бою...\nУровень начнётся заново', 3.5);
  }
}

function coverBlocks(ax, az, bx, bz) {
  for (const c of state.covers) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((c.x - ax) * dx + (c.z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t, pz = az + dz * t;
    if (Math.hypot(c.x - px, c.z - pz) < c.r) return true;
  }
  return false;
}

function playerGuardsAgainst(g) {
  if (!vrActive && !blocking) return false; // на компьютере щит работает только при блоке (Shift / правая кнопка)
  tmp.subVectors(head, g.root.position); tmp.y = 0;
  const d = tmp.length() || 1;
  tmp.multiplyScalar(1 / d);
  const hit = new THREE.Vector3(head.x - tmp.x * 0.45, head.y - 0.3, head.z - tmp.z * 0.45);
  shield.getWorldPosition(shieldPos);
  return shieldPos.distanceTo(hit) < state.stats.blockR;
}

function resolveStrike(g) {
  tmp.subVectors(head, g.root.position); tmp.y = 0;
  const dist = tmp.length();
  if (dist > g.reach + 0.8) return; // промах
  if (playerGuardsAgainst(g)) {
    sfx.clang();
    haptic('left', 1, 150);
    tmp.subVectors(head, g.root.position); tmp.y = 0; tmp.normalize();
    g.st = 'recover'; g.t = -0.6;
    g.root.position.addScaledVector(tmp, -0.7 / Math.max(1, g.scale));
    showMessage('Блок!', 0.8);
  } else {
    hurtPlayer(g.spec.dmg);
  }
}

function resolveBreath(g) {
  sfx.fire();
  tmp.subVectors(head, g.root.position); tmp.y = 0;
  const dist = tmp.length();
  // визуальная струя
  const from = new THREE.Vector3(g.root.position.x, 1.5 * Math.max(1, g.scale * 0.8), g.root.position.z);
  flameMesh.position.copy(from).lerp(head, 0.5);
  flameMesh.scale.set(1, 1, from.distanceTo(head));
  flameMesh.lookAt(head);
  flameMesh.visible = true; flameT = 0.5;

  if (coverBlocks(g.root.position.x, g.root.position.z, head.x, head.z)) { showMessage('Укрытие!', 0.9); return; }
  if (playerGuardsAgainst(g)) { sfx.clang(); haptic('left', 1, 150); showMessage('Блок!', 0.8); return; }
  if (dist < 40) hurtPlayer(1);
}

function damageEnemy(g, dmgRaw) {
  let dmg = dmgRaw * state.stats.dmg * (g.boss ? state.stats.bossDmg : 1);
  let guarded = false;
  if (g.blocks && g.st === 'chase' && Math.random() < 0.5) {
    guarded = true; dmg *= 0.15;
    sfx.clang();
    g.st = 'windup'; g.t = 0.4; g.resolved = false;
    showMessage('Рыцарь блокирует!', 0.8);
  }
  g.hp -= dmg;
  if (!guarded) sfx.hit();
  haptic('right', 0.9, 120);
  g.skin.emissive.setHex(0xffffff); g.skin.emissiveIntensity = 0.7;
  g.flashT = 0.12;

  if (g.hp <= 0) {
    g.dead = true; g.deadT = 0;
    g.skin.emissive.setHex(0x000000); g.cloth.emissive.setHex(0x000000);
    scene.remove(g.bar);
    state.lastDeath.copy(g.root.position);
    state.lastDeath.x = Math.max(-5, Math.min(5, state.lastDeath.x));
    state.lastDeath.z = Math.max(-5, Math.min(2, state.lastDeath.z));
    if (g.boss) sfx.win();
    drawHud();
    return;
  }
  if (g.phases) {
    const pct = g.hp / g.maxHp;
    const np = pct < 0.33 ? 2 : pct < 0.66 ? 1 : 0;
    if (np > g.phase) {
      g.phase = np; g.speedMul *= 1.2; g.windMul *= 0.85;
      sfx.roar();
      showMessage('Дракон в ярости!\nФаза ' + (np + 1) + ' из 3', 3);
    }
  }
  if (!guarded) {
    tmp.subVectors(g.root.position, head); tmp.y = 0; tmp.normalize();
    g.root.position.addScaledVector(tmp, g.boss ? 0.2 : 0.5);
    if (g.st !== 'breath' || !g.boss) { g.st = 'recover'; g.t = g.boss ? 0.2 : -0.3; }
    g.stun = g.boss ? 0.15 : 0.4;
  }
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
  if (swingCd > 0 || swordSpeed < 2.2 || state.mode !== 'play') return;

  for (const g of state.enemies) {
    if (g.dead) continue;
    const rr = g.spec.hitR * g.scale;
    const hh = g.spec.height * g.scale + 0.2;
    for (const p of [tipPos, midPos]) {
      const dx = p.x - g.root.position.x;
      const dz = p.z - g.root.position.z;
      if (Math.hypot(dx, dz) < rr && p.y > 0.05 && p.y < hh) {
        damageEnemy(g, Math.min(60, Math.max(8, (swordSpeed - 1.5) * 14)));
        swingCd = 0.4;
        return;
      }
    }
  }
}

function updateEnemy(g, dt, time) {
  if (g.flashT > 0) {
    g.flashT -= dt;
    if (g.flashT <= 0) { g.skin.emissive.setHex(0x000000); g.skin.emissiveIntensity = 1; }
  }
  if (g.dead) {
    g.deadT += dt;
    g.model.rotation.x = -Math.min(Math.PI / 2, g.deadT * 3);
    return;
  }

  tmp.subVectors(head, g.root.position); tmp.y = 0;
  const dist = tmp.length();
  const targetYaw = Math.atan2(tmp.x, tmp.z);
  let dy = targetYaw - g.root.rotation.y;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  g.root.rotation.y += dy * Math.min(1, dt * 8);

  const warn = (g.st === 'windup' || g.st === 'breath') ? 0.4 + 0.4 * Math.sin(time * 30) : 0;
  g.cloth.emissive.setRGB(warn, warn * (g.st === 'breath' ? 0.4 : 0), 0);

  let armAngle = ARM_IDLE;
  g.walk = 0;
  if (g.stun > 0) g.stun -= dt;
  g.breathCd -= dt;
  const speed = g.spec.speed * state.stats.slow * g.speedMul;
  const windup = g.spec.windup * g.windMul;

  switch (g.st) {
    case 'chase':
      if (g.stun > 0) break;
      if (g.fire && g.breathCd <= 0 && dist > g.reach + 1.0 && dist < 16) {
        g.st = 'breath'; g.t = 0;
        sfx.roar();
        break;
      }
      if (dist > g.reach) {
        tmp.normalize();
        g.root.position.addScaledVector(tmp, speed * dt);
        g.walk = 1;
      } else {
        g.st = 'windup'; g.t = 0; g.resolved = false;
        tone(220, 0.25, 'sawtooth', 0.05, 120);
      }
      break;
    case 'windup':
      g.t += dt;
      armAngle = lerp(ARM_IDLE, ARM_UP, g.t / windup);
      if (g.t >= windup) { g.st = 'strike'; g.t = 0; }
      break;
    case 'strike':
      g.t += dt;
      armAngle = lerp(ARM_UP, ARM_HIT, g.t / 0.12);
      if (!g.resolved && g.t >= 0.1) {
        g.resolved = true;
        if (state.mode === 'play') resolveStrike(g);
      }
      if (g.t >= 0.3) { g.st = 'recover'; g.t = 0; }
      break;
    case 'breath':
      g.t += dt;
      armAngle = lerp(ARM_IDLE, ARM_UP, g.t / 1.3);
      if (g.t >= 1.3) {
        if (state.mode === 'play') resolveBreath(g);
        g.breathCd = Math.max(3, 8 - g.phase * 2) + Math.random() * 2;
        g.st = 'recover'; g.t = 0;
      }
      break;
    case 'recover':
      g.t += dt;
      armAngle = lerp(ARM_HIT, ARM_IDLE, Math.max(0, g.t) / 0.5);
      if (g.t >= 1.1) g.st = 'chase';
      break;
    default: break;
  }

  g.arm.rotation.x = armAngle;
  g.model.position.y = g.walk ? Math.abs(Math.sin(time * 9)) * 0.06 : 0;

  g.bar.position.set(g.root.position.x, g.spec.height * g.scale + 0.45, g.root.position.z);
  g.bar.lookAt(head.x, g.bar.position.y, head.z);
  g.fill.scale.x = Math.max(0.001, g.hp / g.maxHp);
}

function separateEnemies() {
  const list = state.enemies.filter((e) => !e.dead);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dx = b.root.position.x - a.root.position.x;
      const dz = b.root.position.z - a.root.position.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const minD = 0.9 * Math.max(a.scale, b.scale);
      if (d < minD) {
        const push = (minD - d) / 2;
        a.root.position.x -= (dx / d) * push; a.root.position.z -= (dz / d) * push;
        b.root.position.x += (dx / d) * push; b.root.position.z += (dz / d) * push;
      }
    }
  }
}

function updatePickup(dt, time) {
  const p = state.pickup;
  if (!p) return;
  p.obj.position.y = 1.0 + Math.sin(time * 3) * 0.06;
  p.obj.rotation.y += dt * 1.5;
  let taken = false;
  if (vrActive) {
    for (const gr of grips) {
      gr.getWorldPosition(tmp);
      if (tmp.distanceTo(p.obj.position) < 0.4) { taken = true; break; }
    }
  } else if (Math.hypot(head.x - p.obj.position.x, head.z - p.obj.position.z) < 1.3) {
    taken = true;
  }
  if (!taken) return;

  const id = p.id;
  scene.remove(p.obj); disposeTree(p.obj); state.pickup = null;
  sfx.potion();
  haptic('right', 0.7, 150); haptic('left', 0.7, 150);
  state.mode = 'victory';
  if (id === 'princess') {
    state.timer = 10;
    showMessage('Принцесса свободна!\nКоролевство спасено', 9);
    sfx.win();
    state.got = [];
    state.level = -1; // следующая игра начнётся с уровня 1
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    return;
  }
  state.got.push(id);
  computeStats();
  state.hp = state.stats.maxHp;
  state.timer = 5;
  saveGame();
  drawHud();
  showMessage(REWARDS[id].text, 4.5);
}

// ---------------------------------------------------------------- управление (компьютер)
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

  if (swingT > 0) {
    swingT -= dt;
    const p = 1 - Math.max(0, swingT) / 0.3;
    sword.rotation.set(lerp(1.3, -0.9, p), 0.2, lerp(0.3, -0.3, p));
    sword.position.set(0.3 - p * 0.15, -0.3 + p * 0.05, -0.45 - Math.sin(p * Math.PI) * 0.3);
  } else {
    sword.rotation.set(0.9, 0.2, 0);
    sword.position.set(0.3, -0.3, -0.45);
  }
  const tgtPos = blocking ? new THREE.Vector3(-0.02, -0.12, -0.55) : new THREE.Vector3(-0.32, -0.25, -0.5);
  shield.position.lerp(tgtPos, Math.min(1, dt * 14));
  shield.rotation.y = lerp(shield.rotation.y, blocking ? 0 : 0.3, dt * 14);
}

// ---------------------------------------------------------------- управление (VR)
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
  else sword.userData.tip.getWorldPosition(prevTip);

  const playing = state.mode === 'play';
  for (const g of state.enemies) {
    if (playing || g.dead) updateEnemy(g, dt, time);
  }
  if (playing) {
    separateEnemies();
    levelClearCheck();
    updatePickup(dt, time);
  } else if (state.pickup) {
    state.pickup.obj.rotation.y += dt;
  }

  if (state.mode === 'dead' || state.mode === 'victory') {
    state.timer -= dt;
    if (state.timer <= 0) {
      if (state.mode === 'dead') loadLevel(state.level, 'Новая попытка!\n' + LEVELS[state.level].name);
      else loadLevel(state.level + 1 < LEVELS.length ? state.level + 1 : 0);
    }
  }

  if (flashT > 0) { flashT -= dt; flash.material.opacity = Math.max(0, flashT) * 0.9; }
  else flash.material.opacity = 0;
  if (flameT > 0) { flameT -= dt; if (flameT <= 0) flameMesh.visible = false; }

  updateMessage(dt);

  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.2;
    hpEl.textContent = '♥'.repeat(state.hp) + '♡'.repeat(Math.max(0, state.stats.maxHp - state.hp));
    foeEl.textContent = foeText();
    lvlEl.textContent = 'Уровень ' + (Math.max(0, state.level) + 1) + ' / ' + LEVELS.length + ' · ' + LEVELS[Math.max(0, state.level)].name;
    if (vrActive) drawHud();
  }

  renderer.render(scene, camera);
});

// ---------------------------------------------------------------- старт
(function start() {
  const param = parseInt(new URLSearchParams(window.location.search).get('level'), 10);
  if (param >= 1 && param <= LEVELS.length) {
    state.level = param - 1;
    state.got = LEVELS.slice(0, param - 1).map((l) => l.reward);
    loadLevel(state.level);
    return;
  }
  const save = loadSave();
  if (save) {
    state.level = save.level;
    state.got = save.got.filter((id) => REWARDS[id]);
    loadLevel(state.level, 'С возвращением!\nУровень ' + (state.level + 1) + ': ' + LEVELS[state.level].name);
  } else {
    state.level = 0; state.got = [];
    loadLevel(0, 'Славный рыцарь, спаси принцессу!\nУровень 1: ' + LEVELS[0].name);
  }
})();
