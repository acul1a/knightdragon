import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import * as A from './audio.js';
import { WEAPONS, WEAPON_ORDER, makeWeaponModel } from './weapons.js';
import { ENEMY, buildModel } from './enemies.js';
import * as NET from './net.js';

/* =====================================================================
   Рыцарь: Пленница дракона — 8 уровней + башня с принцессой
   WebXR (Meta Quest 2) + Three.js. Оружие в правой руке, щит в левой.
   Подсказка для проверки: ?level=N (1–8), ?level=9 — сразу в башню.
   Режим зрителя: ?watch=КОД
   ===================================================================== */

const params = new URLSearchParams(window.location.search);
const WATCH = (params.get('watch') || '').trim().toUpperCase();
const GUEST = !!WATCH;

const UP = new THREE.Vector3(0, 1, 0);
const SAVE_KEY = 'kd_save_v2';
const $ = (id) => document.getElementById(id);
const hpEl = $('hp'), foeEl = $('foe'), lvlEl = $('lvl'), msgEl = $('msg'), wpnEl = $('wpn');

// ---------------------------------------------------------------- награды
const REWARDS = {
  shield:  { name: 'Щит',              text: 'Щит стал шире!\nБлокировать легче',                  apply: (s) => { s.blockR += 0.12; s.guardMax += 30; } },
  bow:     { name: 'Лук и амулет',     text: 'Получен ЛУК и амулет!\n+1 сердце\nA / B — смена оружия', apply: (s) => { s.maxHp += 1; s.weapons.push('bow'); } },
  hammer:  { name: 'Боевой молот',     text: 'Боевой МОЛОТ!\nОглушает и крушит броню',            apply: (s) => { s.weapons.push('hammer'); } },
  ice:     { name: 'Ледяной меч',      text: 'ЛЕДЯНОЙ МЕЧ!\nЗамораживает врагов',                 apply: (s) => { s.weapons.push('frost'); } },
  shield2: { name: 'Щит и меч ветра',  text: 'Усиленный щит и МЕЧ ВЕТРА!\nБыстрые удары,\nотбрасывает врагов', apply: (s) => { s.blockR += 0.12; s.guardMax += 30; s.weapons.push('wind'); } },
  fire:    { name: 'Огненный меч',     text: 'ОГНЕННЫЙ МЕЧ и амулет!\nПоджигает врагов,\nзащита от огня', apply: (s) => { s.evade += 0.3; s.weapons.push('fire'); } },
  enchant: { name: 'Зачарование',      text: 'Все клинки зачарованы!\nБольше урона по боссам',    apply: (s) => { s.bossDmg *= 1.5; } },
  gate:    { name: 'Врата башни',      text: '',                                                   apply: () => {} },
};

// ---------------------------------------------------------------- уровни
const LEVELS = [
  { name: 'Окраина королевства', env: 'village', seed: 7, bg: 0x151b33, fog: [10, 45], ground: 0x3b4a2f, hemi: [0x8fa4ff, 0x2a2a1e], torch: 0xff9a3c,
    intro: 'Бей резкими взмахами,\nблокируй щитом!', enemies: [['goblin', 2]],
    boss: { type: 'goblin', name: 'Главарь гоблинов', hpMul: 2.2, scale: 1.35 }, reward: 'shield' },
  { name: 'Заколдованный лес', env: 'forest', seed: 11, bg: 0x08140d, fog: [6, 32], ground: 0x1c3020, hemi: [0x66cc88, 0x0a1a10], torch: 0x88ffaa,
    intro: 'Пауки быстры —\nне давай им подойти', enemies: [['spider', 3]],
    boss: { type: 'spider', name: 'Паучья матка', hpMul: 2.6, scale: 1.9 }, reward: 'bow' },
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
    boss: { type: 'dragon', name: 'Дракон', hpMul: 1, scale: 1.5 }, reward: 'gate', covers: 5 },
];
const TOWER = { name: 'Башня дракона', env: 'tower', seed: 41, bg: 0x140d14, fog: [6, 22], ground: 0x3a2f2f, hemi: [0xffd6a8, 0x2a1a1a], torch: 0xffb060, hemiI: 1.0, radius: 5.2 };
const TOWER_LV = LEVELS.length;       // служебный номер «уровня» для башни

const PRINCESS_LINES = [
  'Ты… ты пришёл за мной?',
  'Спасибо тебе, храбрый студент!\nТы победил дракона и спас меня.',
  'Королевство снова в безопасности.\nИдём домой!',
];

// ---------------------------------------------------------------- рендерер и сцена
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
if (!GUEST) {
  renderer.xr.enabled = true;
  document.body.appendChild(VRButton.createButton(renderer));
}
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151b33);
scene.fog = new THREE.Fog(0x151b33, 10, 45);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 120);
camera.position.set(0, 1.6, 0);
const rig = new THREE.Group();
if (GUEST) scene.add(camera); else { rig.add(camera); scene.add(rig); }

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- состояние
const state = {
  level: 0, got: [], hp: 5,
  stats: { maxHp: 5, blockR: 0.55, evade: 0, bossDmg: 1, weapons: ['sword'] },
  weapon: 'sword',
  enemies: [], arrows: [], bossPending: null, pickup: null,
  lastDeath: new THREE.Vector3(0, 0, -5), covers: [],
  radius: 11, inTower: false, tower: null, ending: false,
  flame: null, mode: 'play', timer: 0, nextId: 1,
  guard: 100, guardBroken: 0, guardIdle: 0, guardT: 0,
};
const DIFF = {
  easy:   { name: 'Лёгкая',  spd: 0.85, wind: 1.2, hp: 0.8, poise: 0.5, combo: 0, counter: 0.1, dodge: 0,   lunge: 0 },
  normal: { name: 'Обычная', spd: 1,    wind: 1,   hp: 1,   poise: 1,   combo: 1, counter: 0.4, dodge: 0.12, lunge: 0.5 },
  mega:   { name: 'МЕГА',    spd: 1.3,  wind: 0.7, hp: 1.6, poise: 1.7, combo: 2, counter: 0.9, dodge: 0.5,  lunge: 1 },
};
state.diff = 'mega';
try { const d = localStorage.getItem('kd_diff'); if (DIFF[d]) state.diff = d; } catch (e) { /* ignore */ }
const head = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function computeStats() {
  const s = { maxHp: 5, blockR: 0.55, evade: 0, bossDmg: 1, guardMax: 100, weapons: ['sword'] };
  for (const id of state.got) if (REWARDS[id]) REWARDS[id].apply(s);
  s.weapons = [...new Set(s.weapons)];
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

// ---------------------------------------------------------------- трансляция зрителю: события
let host = null;
const evq = [];
const hosting = () => !!host && host.count() > 0;
function pushEvent(name, x, z, arg) { if (hosting() && evq.length < 60) evq.push([name, x ?? null, z ?? null, arg ?? null]); }

function sfx(name, x, z, arg) { A.play(name, x, z, arg); pushEvent(name, x, z, arg); }

// ---------------------------------------------------------------- освещение, земля
const hemi = new THREE.HemisphereLight(0x8fa4ff, 0x2a2a1e, 0.9);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xbfcfff, 0.7);
moon.position.set(-10, 20, 8);
scene.add(moon);
const torchLightA = new THREE.PointLight(0xff9a3c, 1.6, 14);
const torchLightB = new THREE.PointLight(0xff9a3c, 1.6, 14);
scene.add(torchLightA, torchLightB);

const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), new THREE.MeshStandardMaterial({ color: 0x3b4a2f, roughness: 1 }));
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
    if (c.geometry && c.geometry.dispose) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose && m.dispose());
      else if (c.material.dispose) c.material.dispose();
    }
  });
}

let env = null, envLive = null, liveFns = [];
function updateEnvLive(dt, time) {
  for (const fn of liveFns) fn(dt, time);
  const f = (ph) => 0.82 + 0.12 * Math.sin(time * 11 + ph) + 0.06 * Math.sin(time * 27 + ph * 3);
  torchLightA.intensity = 1.6 * f(0); torchLightB.intensity = 1.6 * f(2.1);
}

function buildEnv(cfg) {
  if (env) { scene.remove(env); disposeTree(env); }
  env = new THREE.Group();
  scene.add(env);
  if (envLive) { scene.remove(envLive); disposeTree(envLive); }
  envLive = new THREE.Group(); scene.add(envLive); liveFns = [];
  state.covers = [];
  state.radius = cfg.radius || 11;

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
  // ---- живые эффекты: огонь, светлячки/угольки/пыль, инстансы травы и т. п.
  const flameM1 = new THREE.MeshBasicMaterial({ color: 0xff7a18, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameM2 = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  const addFlame = (x, y, z, sc = 1) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.12 * sc, 0.5 * sc, 6), flameM1); a.position.y = 0.25 * sc;
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.07 * sc, 0.35 * sc, 5), flameM2); b.position.y = 0.2 * sc;
    g.add(a, b); envLive.add(g);
    const ph = rnd() * 6;
    liveFns.push((dt, t) => { const k = 1 + 0.25 * Math.sin(t * 13 + ph) + 0.12 * Math.sin(t * 23 + ph * 2); a.scale.set(0.9 / Math.sqrt(k) + 0.1, k, 1); b.scale.y = 1 + 0.3 * Math.sin(t * 17 + ph); g.rotation.y = t * 2; });
  };
  const motes = (n, color, size, mode, r0, r1, h) => {
    const pos = new Float32Array(n * 3), ph = [];
    for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0); pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = rnd() * h; pos[i * 3 + 2] = Math.sin(a) * r; ph.push(rnd() * 6.28); }
    const base = pos.slice();
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false; envLive.add(pts);
    liveFns.push((dt, t) => {
      for (let i = 0; i < n; i++) {
        const k = i * 3, p = ph[i];
        if (mode === 'fly') { pos[k] = base[k] + Math.sin(t * 0.6 + p) * 0.7; pos[k + 1] = base[k + 1] + Math.sin(t * 0.9 + p * 2) * 0.4; pos[k + 2] = base[k + 2] + Math.cos(t * 0.5 + p) * 0.7; }
        else if (mode === 'rise') { pos[k] = base[k] + Math.sin(t + p) * 0.4; pos[k + 1] = (base[k + 1] + t * (0.7 + p * 0.06)) % h; pos[k + 2] = base[k + 2] + Math.cos(t * 0.8 + p) * 0.4; }
        else { pos[k] = base[k] + Math.sin(t * 0.4 + p) * 0.8; pos[k + 1] = (((base[k + 1] - t * 0.35) % h) + h) % h; pos[k + 2] = base[k + 2] + Math.cos(t * 0.3 + p) * 0.8; }
      }
      geo.attributes.position.needsUpdate = true;
    });
  };
  const inst = (geo, mat, n, place) => {
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      p.set(0, 0, 0); eu.set(0, rnd() * 6.28, 0); sc.set(1, 1, 1); col.setHex(0xffffff);
      place(i, p, eu, sc, col);
      q.setFromEuler(eu); m4.compose(p, q, sc); im.setMatrixAt(i, m4); im.setColorAt(i, col);
    }
    env.add(im); return im;
  };
  const pick = (arr) => arr[(rnd() * arr.length) | 0];
  const disc = (r0, r1) => { const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0); return [Math.cos(a) * r, Math.sin(a) * r]; };
  const grass = (n, cols, r0, r1, hMul = 1) => inst(new THREE.ConeGeometry(0.05, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), n, (i, p, eu, sc, col) => {
    const [x, z] = disc(r0, r1); p.set(x, 0.17 * hMul, z); eu.set((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4); const s2 = (0.6 + rnd() * 1.1) * hMul; sc.set(1, s2, 1); col.setHex(pick(cols));
  });
  const brazier = (x, z) => { add(cyl(0.28, 0.14, 0.35, mat(0x2a2522), 8), x, 0.95, z); add(cyl(0.05, 0.07, 0.8, mat(0x2a2522), 6), x, 0.4, z); addFlame(x, 1.1, z, 1.6); };

  const torchAt = (x, z, light) => {
    add(cyl(0.05, 0.07, 1.8, wood, 6), x, 0.9, z);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: cfg.torch })), x, 1.95, z);
    light.position.set(x, 2.1, z);
    addFlame(x, 1.95, z, 1.1);
  };
  const tx = cfg.env === 'tower' ? 2.6 : 4;
  torchAt(-tx, -3, torchLightA);
  torchAt(tx, 3, torchLightB);

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
    case 'tower': {                                  // комната принцессы
      const wallM = mat(0x5a4a4a);
      ring(14, 6.0, (x, z, a) => { const w = box(2.9, 6.5, 0.6, wallM); w.rotation.y = -a + Math.PI / 2; add(w, x, 3.25, z); });
      ring(6, 4.7, (x, z) => add(cyl(0.28, 0.32, 5.5, stone, 10), x, 2.75, z), 0.2);
      const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 9), new THREE.MeshStandardMaterial({ color: 0x8a1f2b, roughness: 1 }));
      carpet.rotation.x = -Math.PI / 2; add(carpet, 0, 0.02, -0.5);
      add(cyl(1.5, 1.7, 0.25, stone, 24), 0, 0.12, -3);
      add(box(1.4, 2.4, 0.1, new THREE.MeshBasicMaterial({ color: 0xffe29a })), 0, 3.2, -5.6);
      const ceil = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: 0x120a10, side: THREE.DoubleSide }));
      ceil.rotation.x = Math.PI / 2; add(ceil, 0, 6.5, 0);
      break;
    }
    default: break;
  }

  // ---- оформление локации: детали, живность, свет
  const dirt = mat(0x6a5a44), bark = mat(0x3a2a1a), ironM = mat(0x3a3a40, { metalness: 0.6, roughness: 0.5 });
  switch (cfg.env) {
    case 'village': {
      grass(420, [0x4f7a34, 0x3d6a2c, 0x5f8a3a, 0x6a8a3a], 3, 30);
      inst(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshStandardMaterial({ color: 0xffffff }), 70, (i, p, eu, sc, col) => { const [x, z] = disc(4, 24); p.set(x, 0.18, z); col.setHex(pick([0xff5a6a, 0xffd84a, 0xffffff, 0xc48aff])); });
      add(cyl(0.8, 0.9, 0.9, stone, 14), -8, 0.45, -9);                                     // колодец
      add(cyl(0.65, 0.65, 0.05, mat(0x1a3a5a), 14), -8, 0.86, -9);
      for (const s2 of [-1, 1]) add(cyl(0.06, 0.06, 1.9, wood, 6), -8 + s2 * 0.75, 1.5, -9);
      add(new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.7, 4), mat(0x7a3a22)), -8, 2.7, -9).rotation.y = Math.PI / 4;
      for (let i = 0; i < 5; i++) { const b = cyl(0.45, 0.45, 0.8, mat(0xc8a84a), 10); b.rotation.z = Math.PI / 2; b.rotation.y = i; add(b, 7 + (i % 3) * 0.9, 0.45 + (i > 2 ? 0.8 : 0), -6 + (i % 2)); }
      for (let i = 0; i < 14; i++) { const a = -2.6 + i * 0.2; const [x, z] = polar(a, 13.5); add(box(0.15, 1.1 - (i % 4) * 0.2, 0.15, wood), x, 0.5, z); if (i < 13) { const b = box(1.0, 0.1, 0.06, wood); b.rotation.y = -a - 0.1; add(b, x + 0.5, 0.7, z); } }
      add(cyl(0.5, 0.6, 0.18, dkStone, 10), -9, 0.09, 3);                                   // кострище
      addFlame(-9, 0.2, 3, 1.4);
      motes(60, 0xfff2a0, 0.07, 'fly', 3, 22, 3);
      break;
    }
    case 'forest': {
      grass(380, [0x1f4a2a, 0x2a5a30, 0x183a22], 3, 32, 1.2);
      inst(new THREE.SphereGeometry(0.14, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }), 55, (i, p, eu, sc, col) => { const [x, z] = disc(4, 26); p.set(x, 0.02, z); sc.setScalar(0.5 + rnd() * 1.4); col.setHex(pick([0x66ffe0, 0xb86aff, 0x66a8ff])); });
      for (let i = 0; i < 7; i++) { const [x, z] = disc(6, 18); const l = cyl(0.32, 0.36, 3.2, bark, 8); l.rotation.z = Math.PI / 2; l.rotation.y = rnd() * 3; add(l, x, 0.3, z); }
      for (let i = 0; i < 9; i++) { const [x, z] = disc(5, 22); add(cyl(0.38, 0.5, 0.45, bark, 8), x, 0.22, z); }
      scatter(10, 6, 16, (x, z, a) => { const w = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 4, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })); w.rotation.y = a; add(w, x, 1.2 + rnd(), z); });
      motes(90, 0xb8ff6a, 0.1, 'fly', 3, 26, 3.5);
      break;
    }
    case 'mine': {
      inst(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xffffff }), 46, (i, p, eu, sc, col) => { const [x, z] = disc(7, 30); p.set(x, 0.3 + rnd() * 0.3, z); eu.set(rnd() * 0.5, rnd() * 6, rnd() * 0.5); sc.set(0.6 + rnd() * 0.5, 1.2 + rnd() * 2.2, 0.6 + rnd() * 0.5); col.setHex(pick([0x4aa8ff, 0xb86aff, 0x4affc8])); });
      for (const x of [-0.55, 0.55]) add(box(0.1, 0.1, 40, ironM), x, 0.06, -8);
      for (let i = 0; i < 24; i++) add(box(1.5, 0.08, 0.2, wood), 0, 0.03, -26 + i * 1.6);
      add(box(1.3, 0.7, 1.7, mat(0x5a4a3a, { metalness: 0.3 })), 0.0, 0.55, -11);
      add(box(1.0, 0.2, 1.4, mat(0x2a2a2a)), 0, 0.92, -11);
      for (let i = 0; i < 6; i++) { const a = i * 1.047 + 0.3; const [x, z] = polar(a, 9); add(cyl(0.012, 0.012, 1.6, ironM, 3), x, 3.4, z); add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffc070 })), x, 2.55, z); addFlame(x, 2.5, z, 0.45); }
      motes(80, 0xffd9a0, 0.035, 'fall', 3, 24, 7);
      break;
    }
    case 'swamp': {
      inst(new THREE.CylinderGeometry(0.012, 0.02, 1.6, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), 260, (i, p, eu, sc, col) => { const [x, z] = disc(10.5, 32); p.set(x, 0.8, z); eu.set((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3); sc.set(1, 0.6 + rnd() * 1.1, 1); col.setHex(pick([0x6a7a3a, 0x7a8a42, 0x4a5a2a, 0x8a7a42])); });
      inst(new THREE.CircleGeometry(0.4, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 50, (i, p, eu, sc, col) => { const [x, z] = disc(12, 28); p.set(x, 0.07, z); eu.set(-Math.PI / 2, 0, 0); sc.setScalar(0.6 + rnd()); col.setHex(pick([0x3a7a3a, 0x4a8a3a])); });
      for (let i = 0; i < 5; i++) {                                                            // болотные огоньки
        const w = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0x9affd0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
        const [bx, bz] = disc(12, 26); const ph = rnd() * 6; envLive.add(w);
        liveFns.push((dt, t) => { w.position.set(bx + Math.sin(t * 0.4 + ph) * 1.5, 1.0 + Math.sin(t * 1.3 + ph) * 0.35, bz + Math.cos(t * 0.35 + ph) * 1.5); w.scale.setScalar(0.8 + 0.3 * Math.sin(t * 5 + ph)); });
      }
      const mist = new THREE.Mesh(new THREE.CircleGeometry(30, 24), new THREE.MeshBasicMaterial({ color: 0xaad8d0, transparent: true, opacity: 0.1, depthWrite: false }));
      mist.rotation.x = -Math.PI / 2; envLive.add(mist); mist.position.y = 0.5;
      liveFns.push((dt, t) => { mist.position.y = 0.5 + Math.sin(t * 0.4) * 0.12; mist.rotation.z = t * 0.02; });
      motes(70, 0x8affc8, 0.09, 'fly', 8, 30, 2.5);
      break;
    }
    case 'fortress': {
      for (let i = 0; i < 4; i++) { const [x, z] = polar(i * 1.571 + 0.8, 8.2); brazier(x, z); }
      scatter(9, 9, 14, (x, z) => add(cyl(0.38, 0.34, 0.8, mat(0x6a4a2a), 10), x, 0.4, z));
      for (let i = 0; i < 3; i++) { const [x, z] = polar(i * 2 + 0.4, 15.8); add(box(1.6, 0.08, 0.08, wood), x, 1.2, z).rotation.y = -i * 2; add(cyl(0.02, 0.02, 1.2, ironM, 4), x, 1.4, z); }
      ring(10, 15.2, (x, z) => addFlame(x, 3.0, z, 0.8), 0.15);
      motes(70, 0xffc890, 0.04, 'rise', 2, 16, 8);
      break;
    }
    case 'canyon': {
      inst(new THREE.BoxGeometry(0.06, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0xffffff }), 36, (i, p, eu, sc, col) => { const [x, z] = disc(4, 11); p.set(x, 0.05, z); eu.set(rnd() * 0.5, rnd() * 6, rnd() * 0.5); sc.set(1, 1, 0.5 + rnd() * 1.5); col.setHex(0xe8e0c8); });
      for (let i = 0; i < 6; i++) { const [x, z] = polar(i * 1.047, 12.3); const gl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffa030 })); envLive.add(gl); const ph = i; liveFns.push((dt, t) => { gl.position.set(x, 0.1 + Math.max(0, Math.sin(t * 1.3 + ph)) * 0.5, z); gl.scale.setScalar(0.6 + 0.4 * Math.max(0, Math.sin(t * 1.3 + ph))); }); }
      motes(120, 0xff7a2a, 0.07, 'rise', 4, 30, 14);
      break;
    }
    case 'approach': {
      for (let i = 0; i < 12; i++) { const [x, z] = disc(10, 30); const t2 = cyl(0.1, 0.22, 3.4, mat(0x2a2430), 5); t2.rotation.z = (rnd() - 0.5) * 0.3; add(t2, x, 1.7, z); const br = cyl(0.04, 0.08, 1.4, mat(0x2a2430), 4); br.rotation.z = 1.0; add(br, x + 0.5, 2.7, z); }
      for (let i = 0; i < 5; i++) { const [x, z] = disc(9, 20); const st = box(0.7, 1.7, 0.5, mat(0x57576a)); st.rotation.y = rnd() * 6; add(st, x, 0.85, z); add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), mat(0x57576a)), x, 1.95, z); }
      grass(220, [0x3a3a4a, 0x2f2f3f, 0x44445a], 3, 30, 0.8);
      for (let i = 0; i < 3; i++) { const m2 = new THREE.Mesh(new THREE.CircleGeometry(14 + i * 4, 20), new THREE.MeshBasicMaterial({ color: 0x9a90c8, transparent: true, opacity: 0.07, depthWrite: false })); m2.rotation.x = -Math.PI / 2; m2.position.y = 0.3 + i * 0.35; envLive.add(m2); liveFns.push((dt, t) => { m2.rotation.z = t * (0.02 + i * 0.01); }); }
      motes(120, 0xb0a0ff, 0.05, 'fall', 2, 30, 9);
      break;
    }
    case 'castle': {
      for (let i = 0; i < 6; i++) { const [x, z] = polar(i * 1.047 + 0.5, 9.5); brazier(x, z); }
      ring(6, 13, (x, z, a) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.4), new THREE.MeshBasicMaterial({ color: 0x9a1828, side: THREE.DoubleSide })); b.rotation.y = -a + Math.PI / 2; b.position.set(x, 3.2, z); envLive.add(b); liveFns.push((dt, t) => { b.rotation.x = Math.sin(t * 1.6 + a) * 0.06; }); }, 0.2);
      motes(140, 0xff8a40, 0.06, 'rise', 3, 26, 14);
      break;
    }
    case 'tower': {
      for (let i = 0; i < 3; i++) { const [x, z] = polar(i * 2.09 + 0.5, 3.6); add(cyl(0.05, 0.1, 1.3, mat(0xd0a030, { metalness: 0.8 }), 8), x, 0.65, z); add(cyl(0.12, 0.12, 0.07, mat(0xd0a030, { metalness: 0.8 }), 10), x, 1.3, z); for (let k = -1; k <= 1; k++) { add(cyl(0.025, 0.025, 0.2, mat(0xf4ecd4), 6), x + k * 0.09, 1.43, z); addFlame(x + k * 0.09, 1.52, z, 0.25); } }
      const chand = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 6, 20), new THREE.MeshStandardMaterial({ color: 0xd0a030, metalness: 0.8, roughness: 0.3 })); chand.rotation.x = Math.PI / 2; add(chand, 0, 4.6, -1);
      for (let i = 0; i < 8; i++) { const a = i * 0.785; addFlame(Math.cos(a) * 0.9, 4.65, -1 + Math.sin(a) * 0.9, 0.3); }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 5.5, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      shaft.position.set(0, 3.2, -3.6); shaft.rotation.x = 0.2; envLive.add(shaft);
      liveFns.push((dt, t) => { shaft.material.opacity = 0.08 + 0.02 * Math.sin(t * 0.7); });
      motes(70, 0xffe8a0, 0.035, 'fall', 0.5, 5.5, 6);
      break;
    }
    default: break;
  }
  env.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });   // статичный мир — не пересчитываем каждый кадр
  A.ambient(cfg.env);
}

// ---------------------------------------------------------------- оружие, щит
const holder = new THREE.Group();     // то, что в правой руке
let weaponModel = null;
const bow = { drawing: false, t: 0, cd: 0 };

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
  const h = new THREE.Group();
  h.add(g);
  return h;
}
const shield = makeShield();

let holderIn = 'desktop';             // desktop | vr
function restPose() {
  const w = WEAPONS[state.weapon];
  if (holderIn === 'vr') {
    holder.position.set(0, 0, 0);
    holder.rotation.set(w.kind === 'bow' ? 0 : 0.3, 0, 0);
  } else if (w.kind === 'bow') {
    holder.position.set(0.28, -0.22, -0.5);
    holder.rotation.set(0, 0, 0);
  } else {
    holder.position.set(0.3, -0.3, -0.45);
    holder.rotation.set(0.9, 0.2, 0);
  }
}
let firstFrame = true;
function equip(id) {
  if (!WEAPONS[id]) id = 'sword';
  if (weaponModel) { holder.remove(weaponModel); disposeTree(weaponModel); }
  weaponModel = makeWeaponModel(id);
  holder.add(weaponModel);
  holder.userData.tip = weaponModel.userData.tip;
  holder.userData.mid = weaponModel.userData.mid;
  state.weapon = id;
  firstFrame = true;
  bow.drawing = false;
  weaponModel.scale.setScalar(0.3);                                  // оружие «появляется» в руке
  trailReset();
  const two = !!WEAPONS[id].twoHanded;
  shield.visible = !two;                                             // двуручное: щита нет
  if (two && state.mode === 'play') showMessage('Двуручное оружие\nЩит убран — блокировать нельзя', 1.8);
  restPose();
  wpnEl.textContent = 'Оружие: ' + WEAPONS[id].name;
}
function cycleWeapon(dir) {
  const list = WEAPON_ORDER.filter((id) => state.stats.weapons.includes(id));
  if (list.length < 2) return;
  const i = list.indexOf(state.weapon);
  const next = list[(i + dir + list.length) % list.length];
  equip(next);
  showMessage(WEAPONS[next].name, 1.2);
  sfx('clang', undefined, undefined, { p: 1.4 });
}
function pickWeaponByNumber(n) {
  const list = WEAPON_ORDER.filter((id) => state.stats.weapons.includes(id));
  if (list[n]) { equip(list[n]); showMessage(WEAPONS[list[n]].name, 1.2); }
}

// ---------------------------------------------------------------- HUD (на запястье) и сообщения
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 256; hudCanvas.height = 128;
const hudTex = new THREE.CanvasTexture(hudCanvas);
const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ map: hudTex, transparent: true }));
hudMesh.position.set(0, 0.09, 0.06);
hudMesh.rotation.x = -Math.PI / 3;
hudMesh.visible = false;

function foeText(enemies = state.enemies, bossPending = state.bossPending) {
  if (state.inTower) return 'Принцесса ждёт';
  const alive = enemies.filter((e) => !e.dead);
  const boss = alive.find((e) => e.boss);
  if (boss) return boss.name + ': ' + Math.max(0, Math.ceil(boss.hp)) + '/' + Math.ceil(boss.maxHp);
  if (alive.length) return 'Врагов: ' + alive.length + (bossPending ? ' + босс' : '');
  return bossPending ? 'Скоро босс' : 'Победа!';
}

function drawHud() {
  const c = hudCanvas.getContext('2d');
  c.clearRect(0, 0, 256, 128);
  c.fillStyle = 'rgba(10,12,25,0.7)';
  c.fillRect(0, 0, 256, 128);
  c.font = 'bold 34px sans-serif';
  c.textBaseline = 'middle';
  for (let i = 0; i < state.stats.maxHp; i++) {
    c.fillStyle = i < state.hp ? '#ff4d5e' : '#4a4f66';
    c.fillText('♥', 6 + i * 36, 34);
  }
  const gp = state.stats.guardMax ? Math.max(0, state.guard / state.stats.guardMax) : 0;
  c.fillStyle = '#2a2f44'; c.fillRect(8, 56, 240, 9);
  c.fillStyle = state.guardBroken > 0 ? '#ff3b3b' : gp < 0.3 ? '#ffb02e' : '#5ab8ff';
  c.fillRect(8, 56, 240 * gp, 9);
  c.font = '19px sans-serif';
  c.fillStyle = '#ffffff';
  c.fillText('Ур. ' + (state.inTower ? 'башня' : (state.level + 1) + '/' + LEVELS.length) + ' · ' + WEAPONS[state.weapon].name, 8, 78);
  c.fillText(foeText(), 8, 108);
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
if (!GUEST) scene.add(msgMesh);
let msgTimer = 0;
const camPos = new THREE.Vector3();

function showMessage(text, secs = 3.5, remote = false) {
  msgEl.textContent = text;
  msgEl.style.opacity = 1;
  msgTimer = secs;
  if (!remote) pushEvent('msg', null, null, { t: text, s: secs });
  if (GUEST) return;
  const c = msgCanvas.getContext('2d');
  c.clearRect(0, 0, 1024, 256);
  c.fillStyle = 'rgba(10,12,25,0.75)';
  c.fillRect(0, 0, 1024, 256);
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const lines = text.split('\n');
  c.font = 'bold ' + (lines.length > 2 ? 54 : 66) + 'px sans-serif';
  lines.forEach((l, i) => c.fillText(l, 512, 128 + (i - (lines.length - 1) / 2) * 76));
  msgTex.needsUpdate = true;
  camera.getWorldPosition(camPos);
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  msgMesh.position.copy(camPos).addScaledVector(fwd, 1.8);
  msgMesh.position.y = camPos.y + 0.1;
  msgMesh.lookAt(camPos);
}
function updateMessage(dt) {
  if (msgTimer > 0) {
    msgTimer -= dt;
    msgMesh.material.opacity = Math.min(1, msgTimer * 2);
    if (msgTimer <= 0) { msgEl.style.opacity = 0; msgMesh.material.opacity = 0; }
  }
}
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text.replace(/\n/g, ' '));
    u.lang = 'ru-RU'; u.pitch = 1.5; u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) { /* речь необязательна */ }
}
function say(text) {
  showMessage(text, 3.6, true);
  speak(text);
  A.play('princess');
  pushEvent('say', null, null, { t: text });
}

const flash = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false })
);
flash.renderOrder = 998;
camera.add(flash);
let flashT = 0;

// ---------------------------------------------------------------- огонь изо рта (визуал), искры, стрелы
const flameGeo = new THREE.CylinderGeometry(0.75, 0.08, 1, 14, 1, true);
flameGeo.rotateX(Math.PI / 2);        // ось вдоль +z: узкий конец у пасти, широкий — на цели
const flameG = new THREE.Group();
const flameOuter = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
const flameInner = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
flameInner.scale.set(0.45, 0.45, 1);
flameG.add(flameOuter, flameInner);
flameG.visible = false;
scene.add(flameG);

function placeFlame(from, to, time) {
  flameG.visible = true;
  flameG.position.copy(from).lerp(to, 0.5);
  flameG.lookAt(to);
  flameG.scale.set(1, 1, Math.max(0.5, from.distanceTo(to)));
  flameOuter.scale.set(1 + 0.2 * Math.sin(time * 33), 1 + 0.2 * Math.cos(time * 29), 1);
  flameInner.scale.set(0.45 + 0.1 * Math.sin(time * 41), 0.45 + 0.1 * Math.cos(time * 37), 1);
}

const sparkGeo = new THREE.SphereGeometry(0.03, 5, 4);
const SPARK_COLORS = [0xffa030, 0x9fe8ff, 0xbfffe8, 0xffffff, 0xff4020, 0xff7ab8];
const sparkMats = SPARK_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c }));
const sparks = [];
function spark(x, y, z, ci = 3, n = 8, spd = 2.5, g = 6) {
  for (let i = 0; i < n; i++) {
    if (sparks.length > 80) { const o = sparks.shift(); scene.remove(o.m); }
    const m = new THREE.Mesh(sparkGeo, sparkMats[ci % sparkMats.length]);
    m.position.set(x, y, z);
    scene.add(m);
    sparks.push({ m, vx: (Math.random() - 0.5) * spd, vy: Math.random() * spd, vz: (Math.random() - 0.5) * spd, life: 0.35 + Math.random() * 0.4, g });
  }
}
function fxSpark(x, y, z, ci, n, spd, g) { spark(x, y, z, ci, n, spd, g); pushEvent('spark', x, z, { y, c: ci, n, s: spd, g }); }
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    if (s.life <= 0) { scene.remove(s.m); sparks.splice(i, 1); continue; }
    s.vy -= s.g * dt;
    s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
  }
}

const arrowGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.6, 5);
arrowGeo.rotateX(Math.PI / 2);
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xe8dcc0 });
function makeArrowMesh() {
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  scene.add(m);
  return m;
}

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
  holderIn = 'desktop';
  camera.add(holder);
  camera.add(shield);
  shield.position.set(-0.32, -0.25, -0.5);
  shield.rotation.set(0, 0.3, 0);
  hudMesh.visible = false;
  restPose();
}

if (!GUEST) {
  attachDesktop();
  for (let i = 0; i < 2; i++) {
    const grip = renderer.xr.getControllerGrip(i);
    rig.add(grip);
    grips.push(grip);
    grip.addEventListener('connected', (e) => {
      const hand = e.data.handedness;
      if (e.data.gamepad) pads[hand] = e.data.gamepad;
      if (hand === 'right') {
        holderIn = 'vr';
        grip.add(holder);
        restPose();
      } else if (hand === 'left') {
        grip.add(shield);
        shield.position.set(0, 0, 0);
        shield.rotation.set(0, 0, 0);
        grip.add(hudMesh);
        hudMesh.visible = true;
      }
    });
  }
  renderer.xr.addEventListener('sessionstart', () => { vrActive = true; A.unlock(); });
  renderer.xr.addEventListener('sessionend', () => { vrActive = false; attachDesktop(); });
}

// ---------------------------------------------------------------- враги
const ARM_IDLE = -0.2, ARM_UP = -3.4, ARM_HIT = -1.3;

function makeEnemy(type, cfg = {}, boss = false) {
  const spec = { ...ENEMY[type], ...cfg };
  const scale = cfg.scale || 1;
  const skin = new THREE.MeshStandardMaterial({ color: spec.skin, roughness: 0.8, emissive: 0x000000 });
  const cloth = new THREE.MeshStandardMaterial({ color: spec.cloth, roughness: 1, emissive: 0x000000 });
  const root = new THREE.Group();
  const built = buildModel(type, spec, skin, cloth, boss);
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

  const D = DIFF[state.diff] || DIFF.mega;
  const maxHp = spec.hp * (cfg.hpMul || 1) * D.hp;
  const poiseMax = (boss ? 150 : 65) * D.poise * Math.max(1, scale * 0.8);
  return {
    id: 0, type, spec, root, model: built.model, arm: built.arm, mouth: built.mouth, headG: built.headG, jaw: built.jaw, tick: built.tick,
    skin, cloth, bar, fill, scale, boss,
    name: cfg.name || spec.name, hp: maxHp, maxHp,
    reach: spec.reach * scale,
    fire: !!spec.fire, blocks: !!spec.blocks, phases: !!spec.phases, phase: 0,
    speedMul: D.spd, windMul: D.wind, breathCd: 4 + Math.random() * 3,
    st: 'chase', t: 0, stun: 0, dead: false, resolved: false, deadT: 0, walk: 0, flashT: 0,
    burn: 0, freeze: 0, vuln: 0, burnSfx: 0, stepT: Math.random() * 0.5,
    armAngle: ARM_IDLE, headTilt: 0, jawOpen: 0, warn: 0, hover: spec.hover || 0,
    gait: Math.random() * 6, wb: 0, armD: ARM_IDLE, k: 0, hitK: 0, lt: 0,
    guardChance: cfg.blocks ? 0.9 : (spec.guard || 0), guardMax: (boss ? 130 : 60), guardHp: (boss ? 130 : 60), guardT: 0, guardCd: 0,
    kv: new THREE.Vector3(), poise: poiseMax, poiseMax, combo: 0, lungeCd: 3 + Math.random() * 3, dodgeCd: 0, frzImm: 0, spreadT: 0, fx: null, strafe: Math.random() < 0.5 ? 1 : -1,
  };
}

// эффекты на враге: лёд и пламя (общие для хоста и зрителя)
function enemyFx(e) {
  if (e.fx) return e.fx;
  const h = e.spec.height;
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xaee8ff, emissive: 0x3aa8e0, emissiveIntensity: 0.5, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.2 }));
  ice.scale.set(Math.max(0.6, e.spec.hitR * 1.25), h * 0.58, Math.max(0.6, e.spec.hitR * 1.25));
  ice.position.y = h * 0.52;
  ice.visible = false;
  const spikes = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0xdff6ff, emissive: 0x66ccff, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
    const a = i * 1.05; sp.position.set(Math.cos(a) * e.spec.hitR * 0.9, h * (0.2 + (i % 3) * 0.25), Math.sin(a) * e.spec.hitR * 0.9);
    sp.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
    ice.add(sp); spikes.push(sp);
  }
  spikes.forEach((sp) => sp.scale.set(1 / ice.scale.x, 1 / ice.scale.y, 1 / ice.scale.z));
  const fire = new THREE.Group(); fire.visible = false;
  const fm = new THREE.MeshBasicMaterial({ color: 0xff7a18, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  const fm2 = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const fl = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), i % 2 ? fm : fm2);
    const a = i * 1.05; c.position.set(Math.cos(a) * e.spec.hitR * 0.7, h * (0.15 + (i % 3) * 0.28), Math.sin(a) * e.spec.hitR * 0.7);
    fire.add(c); fl.push(c);
  }
  e.model.add(ice, fire);
  e.fx = { ice, fire, fl };
  return e.fx;
}

// одинаково для хоста и зрителя: расставить модель по полям состояния
function poseEnemy(e, time) {
  const dt = e.lt ? clamp(time - e.lt, 0, 0.1) : 0.016;
  e.lt = time;
  const frozen = e.freeze > 0 && !e.dead;
  const moving = e.walk && !frozen;
  e.wb += ((moving ? 1 : 0) - e.wb) * (1 - Math.exp(-dt * 7));
  if (moving) e.gait += dt * (3 + e.spec.speed * e.speedMul * 2.4);
  e.armD += (e.armAngle - e.armD) * (1 - Math.exp(-dt * (frozen ? 0 : 20)));
  e.k = clamp((ARM_IDLE - e.armD) / (ARM_IDLE - ARM_UP), 0, 1);
  e.hitK += ((e.flashT > 0 ? 1 : 0) - e.hitK) * (1 - Math.exp(-dt * 14));
  e.arm.rotation.x = e.armD;
  e.model.position.y = e.hover + (e.hover ? Math.sin(time * 3 + e.id) * 0.06 : 0);
  if (e.dead) {
    if (e.spec.deadStyle === 'flip') { e.model.rotation.z = Math.min(Math.PI, e.deadT * 5); e.model.rotation.x = 0; e.model.position.y += Math.sin(Math.min(1, e.deadT * 5) * Math.PI) * 0.25; }
    else { e.model.rotation.x = -Math.min(Math.PI / 2, e.deadT * 3); e.model.rotation.z = 0; }
  } else { e.model.rotation.x = 0; e.model.rotation.z = 0; }
  if (e.flashT > 0) { e.skin.emissive.setHex(0xffffff); e.skin.emissiveIntensity = 0.7; }
  else if (e.burn > 0) { const p = 0.5 + 0.5 * Math.sin(time * 18); e.skin.emissive.setRGB(0.9 * p, 0.3 * p, 0); e.skin.emissiveIntensity = 1; }
  else if (e.freeze > 0) { e.skin.emissive.setRGB(0.15, 0.4, 0.6); e.skin.emissiveIntensity = 1; }
  else { e.skin.emissive.setHex(0x000000); e.skin.emissiveIntensity = 1; }
  if (e.guardT > 0) e.cloth.emissive.setRGB(0.1, 0.25, 0.55); else e.cloth.emissive.setRGB(e.warn, e.warn * (e.st === 'breath' ? 0.4 : 0), 0);
  if (e.tick) e.tick(time, e);
  if (e.burn > 0 || e.freeze > 0 || e.fx) {
    const fx = enemyFx(e);
    fx.ice.visible = frozen;
    if (frozen) { const p = 1 + 0.02 * Math.sin(time * 12); fx.ice.scale.y = e.spec.height * 0.58 * p; }
    const burning = e.burn > 0 && !e.dead;
    fx.fire.visible = burning;
    if (burning) fx.fl.forEach((c, i) => { c.scale.y = 0.8 + 0.6 * Math.abs(Math.sin(time * 11 + i * 1.7)); c.scale.x = c.scale.z = 0.8 + 0.3 * Math.sin(time * 9 + i); c.position.y += (Math.sin(time * 7 + i) * 0.002); });
  }
  if (e.dead) { e.bar.visible = false; return; }
  e.bar.visible = true;
  e.bar.position.set(e.root.position.x, e.spec.height * e.scale + 0.45, e.root.position.z);
  e.bar.lookAt(head.x, e.bar.position.y, head.z);
  e.fill.scale.x = Math.max(0.001, e.hp / e.maxHp);
}

// ---------------------------------------------------------------- уровни
const tipPos = new THREE.Vector3();
const midPos = new THREE.Vector3();
const prevTip = new THREE.Vector3();
const shieldPos = new THREE.Vector3();
let swordSpeed = 0, swingCd = 0, swinging = false;

function clearEnemies() {
  for (const e of state.enemies) { scene.remove(e.root, e.bar); disposeTree(e.root); }
  state.enemies = [];
  if (state.pickup) { scene.remove(state.pickup.obj); disposeTree(state.pickup.obj); state.pickup = null; }
  for (const a of state.arrows) scene.remove(a.m);
  state.arrows = [];
  state.flame = null; flameG.visible = false;
  if (state.tower) { scene.remove(state.tower.pr.g); disposeTree(state.tower.pr.g); state.tower = null; }
}

function spawnEnemy(type, x, z, cfg = {}, boss = false) {
  const e = makeEnemy(type, cfg, boss);
  e.id = state.nextId++;
  e.root.position.set(x, 0, z);
  scene.add(e.root);
  state.enemies.push(e);
  return e;
}

function loadLevel(idx, message) {
  state.level = idx;
  state.inTower = false;
  state.ending = false;
  const cfg = LEVELS[idx];
  computeStats();
  clearEnemies();
  buildEnv(cfg);
  state.hp = state.stats.maxHp;
  state.guard = state.stats.guardMax; state.guardBroken = 0;
  state.mode = 'play';
  rig.position.set(0, 0, 5);
  rig.rotation.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  equip(state.stats.weapons.includes(state.weapon) ? state.weapon : 'sword');

  for (const [type, count] of cfg.enemies) {
    for (let k = 0; k < count; k++) spawnEnemy(type, (k - (count - 1) / 2) * 3.5, -6 - (k % 2) * 1.5);
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
  if (isHeavy(e)) sfx('rumble', 0, -7, { h: e.scale });
  sfx('voice', e.root.position.x, e.root.position.z, { t: b.type, k: 'alert' });
  showMessage('Босс: ' + b.name + '!', 3);
  drawHud();
}

// --- врата и башня
function makeGate() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x6a5a5a, roughness: 1 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(0.5, 3.2, 0.5), stone, -1.1, 1.6, 0);
  add(new THREE.BoxGeometry(0.5, 3.2, 0.5), stone, 1.1, 1.6, 0);
  add(new THREE.BoxGeometry(2.7, 0.5, 0.6), stone, 0, 3.3, 0);
  const portal = add(new THREE.PlaneGeometry(1.7, 3), new THREE.MeshBasicMaterial({ color: 0xffe29a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 1.5, 0);
  g.userData.portal = portal;
  return g;
}

function makePickup(id, pos) {
  if (id === 'gate') {
    const g = makeGate();
    g.position.set(0, 0, -8);
    scene.add(g);
    return { obj: g, id };
  }
  const colors = { shield: 0xe0203a, bow: 0x8a5a2a, hammer: 0xb0b0b8, ice: 0x66ccff, shield2: 0x4f7fe0, fire: 0xff8a2a, enchant: 0xc27bff };
  const col = colors[id] || 0xffffff;
  const p = new THREE.Group();
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.015, 6, 24), new THREE.MeshBasicMaterial({ color: col }));
  halo.rotation.x = Math.PI / 2;
  p.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.2 })), halo);
  p.position.set(pos.x, 1.0, pos.z);
  scene.add(p);
  return { obj: p, id };
}

function levelClearCheck() {
  if (state.pickup || state.inTower) return;
  if (state.enemies.some((e) => !e.dead)) return;
  if (state.bossPending) { spawnBossIfNeeded(); return; }
  const cfg = LEVELS[state.level];
  state.pickup = makePickup(cfg.reward, state.lastDeath);
  sfx('fanfare');
  showMessage(cfg.reward === 'gate' ? 'Дракон повержен!\nВойди в башню — врата открыты' : 'Уровень пройден!\nПодбери награду: ' + REWARDS[cfg.reward].name, 5);
  drawHud();
}

function makePrincess() {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const dress = M(0xe0559a, { roughness: 0.45, metalness: 0.05 }), dress2 = M(0xff9acb, { roughness: 0.5 });
  const lace = M(0xfff4fa, { roughness: 0.8 }), skinM = M(0xf6cfae, { roughness: 0.7 });
  const hair = M(0xf0b840, { roughness: 0.4, metalness: 0.15 }), goldM = M(0xffd24a, { metalness: 0.85, roughness: 0.25 });
  const gem = M(0x4ac8ff, { emissive: 0x1a78c8, emissiveIntensity: 0.7, roughness: 0.1 }), ruby = M(0xff3060, { emissive: 0x801030, emissiveIntensity: 0.6, roughness: 0.1 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x2a2038 }), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };

  // пышная юбка (поверхность вращения) с оборкой снизу
  const prof = [[0.0, 0], [0.62, 0], [0.64, 0.05], [0.58, 0.12], [0.5, 0.3], [0.4, 0.55], [0.3, 0.8], [0.2, 0.98], [0.15, 1.04], [0, 1.05]].map(([r, y]) => new THREE.Vector2(r, y));
  add(g, new THREE.LatheGeometry(prof, 28), dress, 0, 0, 0);
  const prof2 = [[0.0, 0], [0.7, 0], [0.72, 0.04], [0.68, 0.1], [0.0, 0.1]].map(([r, y]) => new THREE.Vector2(r, y));
  add(g, new THREE.LatheGeometry(prof2, 28), lace, 0, 0.0, 0);
  const over = new THREE.LatheGeometry([[0.0, 0.05], [0.5, 0.05], [0.42, 0.45], [0.3, 0.8], [0.18, 1.0], [0, 1.0]].map(([r, y]) => new THREE.Vector2(r, y)), 20, 0, Math.PI * 0.9);
  add(g, over, dress2, 0, 0, 0, 0, Math.PI * 0.55, 0);                                // светлая вставка спереди
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.35; add(g, new THREE.SphereGeometry(0.03, 6, 6), gem, Math.sin(a) * 0.4, 0.35 + Math.abs(i - 2) * -0.02, Math.cos(a) * 0.4); }
  // корсаж, пояс-бант
  add(g, new THREE.CylinderGeometry(0.15, 0.17, 0.3, 14), dress, 0, 1.2, 0);
  add(g, new THREE.CylinderGeometry(0.175, 0.175, 0.05, 14), goldM, 0, 1.06, 0);
  add(g, new THREE.SphereGeometry(0.06, 8, 8), ruby, 0, 1.08, 0.17);
  for (const s of [-1, 1]) add(g, new THREE.ConeGeometry(0.08, 0.22, 4), dress2, s * 0.1, 1.08, -0.2, 0.5, 0, s * 1.2);   // бант сзади
  // плечи, шея, декольте, ожерелье
  add(g, new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), skinM, 0, 1.4, 0);
  add(g, new THREE.TorusGeometry(0.08, 0.011, 6, 18), goldM, 0, 1.36, 0.02, Math.PI / 2 + 0.3, 0, 0);
  add(g, new THREE.SphereGeometry(0.02, 8, 8), gem, 0, 1.31, 0.085);
  // голова
  const head = add(g, new THREE.SphereGeometry(0.17, 20, 16), skinM, 0, 1.56, 0.0); head.scale.set(0.95, 1.05, 0.98);
  for (const s of [-1, 1]) {
    add(g, new THREE.SphereGeometry(0.036, 10, 8), white, s * 0.065, 1.575, 0.14).scale.set(1, 1.15, 0.5);
    add(g, new THREE.SphereGeometry(0.024, 10, 8), M(0x2a78d8, { roughness: 0.2 }), s * 0.065, 1.572, 0.155).scale.set(1, 1.1, 0.5);
    add(g, new THREE.SphereGeometry(0.012, 8, 6), dark, s * 0.065, 1.572, 0.165);
    add(g, new THREE.BoxGeometry(0.06, 0.008, 0.01), dark, s * 0.065, 1.62, 0.14, 0, 0, s * 0.15);          // ресницы
    add(g, new THREE.SphereGeometry(0.025, 8, 6), M(0xff9aa8, { roughness: 1 }), s * 0.1, 1.52, 0.125).scale.set(1, 0.6, 0.3);   // румянец
  }
  add(g, new THREE.SphereGeometry(0.014, 8, 6), skinM, 0, 1.54, 0.17);
  add(g, new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), M(0xd04058, { roughness: 0.5 }), 0, 1.5, 0.16, 0, 0, Math.PI);    // улыбка
  // причёска: объём, чёлка, длинные волосы, коса
  const cap = add(g, new THREE.SphereGeometry(0.19, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hair, 0, 1.58, -0.015);
  add(g, new THREE.SphereGeometry(0.06, 10, 8), hair, -0.1, 1.64, 0.12).scale.set(1.3, 0.8, 0.8);
  add(g, new THREE.SphereGeometry(0.06, 10, 8), hair, 0.08, 1.65, 0.125).scale.set(1.3, 0.8, 0.8);
  const longHair = add(g, new THREE.CapsuleGeometry(0.15, 0.55, 6, 14), hair, 0, 1.22, -0.12); longHair.scale.set(1.05, 1, 0.55);
  for (const s of [-1, 1]) add(g, new THREE.CapsuleGeometry(0.04, 0.5, 4, 8), hair, s * 0.17, 1.28, 0.0, 0, 0, s * 0.06);   // локоны у лица
  const braid = new THREE.Group(); braid.position.set(0.12, 1.5, -0.13); g.add(braid);
  for (let i = 0; i < 6; i++) add(braid, new THREE.SphereGeometry(0.045 - i * 0.003, 8, 6), hair, 0.02 * i, -0.1 * i - 0.05, -0.0 - 0.01 * i);
  add(braid, new THREE.SphereGeometry(0.028, 8, 6), ruby, 0.12, -0.65, -0.06);
  // корона
  add(g, new THREE.TorusGeometry(0.15, 0.016, 8, 24), goldM, 0, 1.7, 0, Math.PI / 2, 0, 0);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const h = i % 2 ? 0.1 : 0.15; add(g, new THREE.ConeGeometry(0.026, h, 5), goldM, Math.sin(a) * 0.15, 1.7 + h / 2, Math.cos(a) * 0.15); if (!(i % 2)) add(g, new THREE.SphereGeometry(0.02, 8, 6), gem, Math.sin(a) * 0.15, 1.7 + h, Math.cos(a) * 0.15); }
  add(g, new THREE.SphereGeometry(0.03, 8, 8), ruby, 0, 1.71, 0.15);
  // накидка-шлейф сзади
  add(g, new THREE.PlaneGeometry(0.55, 1.2), M(0xa0306a, { side: THREE.DoubleSide, roughness: 0.6 }), 0, 0.85, -0.26, -0.12, 0, 0);
  // ножки (туфельки)
  for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.06, 8, 6), goldM, s * 0.12, 0.04, 0.4).scale.set(1, 0.6, 1.6);
  // руки: пышные рукава, предплечья, ладони
  const arm = (side) => {
    const a = new THREE.Group();
    add(a, new THREE.SphereGeometry(0.075, 10, 8), dress2, 0, 0, 0);
    add(a, new THREE.CylinderGeometry(0.038, 0.032, 0.4, 8), skinM, 0, -0.22, 0);
    add(a, new THREE.CylinderGeometry(0.052, 0.045, 0.1, 10), lace, 0, -0.1, 0);
    add(a, new THREE.SphereGeometry(0.04, 8, 8), skinM, 0, -0.44, 0);
    return a;
  };
  const armL = arm(); armL.position.set(0.25, 1.33, 0.02); armL.rotation.z = -0.2; armL.rotation.x = -0.2; g.add(armL);
  const wave = arm(); wave.position.set(-0.25, 1.33, 0.02); g.add(wave);
  wave.rotation.z = -0.3;
  return { g, wave, stage: 0, hair: [braid, longHair] };
}

function enterTower() {
  clearEnemies();
  state.inTower = true;
  state.mode = 'play';
  buildEnv(TOWER);
  rig.position.set(0, 0, 3.6);
  rig.rotation.set(0, 0, 0);
  const pr = makePrincess();
  pr.g.position.set(0, 0.25, -3);
  scene.add(pr.g);
  state.tower = { pr, stage: 0, t: 0, ry: 0 };
  sfx('gate');
  showMessage('Башня дракона\nПодойди к принцессе', 4);
  drawHud();
}

function updateTower(dt, time) {
  const T = state.tower;
  if (!T) return;
  const pg = T.pr.g;
  tmp.subVectors(head, pg.position); tmp.y = 0;
  const dist = tmp.length();
  if (T.stage >= 1) { T.ry = Math.atan2(tmp.x, tmp.z); pg.rotation.y = T.ry; }
  T.pr.wave.rotation.z = T.stage >= 1 ? -2.4 + 0.35 * Math.sin(time * 6) : -0.3;
  pg.position.y = 0.25 + Math.abs(Math.sin(time * 2)) * 0.02;
  if (T.pr.hair) { T.pr.hair[0].rotation.z = Math.sin(time * 1.8) * 0.08; T.pr.hair[0].rotation.x = Math.sin(time * 1.3) * 0.05; }
  T.t += dt;
  if (T.stage >= 1 && Math.random() < dt * 5) fxSpark(pg.position.x + (Math.random() - 0.5) * 0.8, 1.3 + Math.random() * 0.5, pg.position.z + (Math.random() - 0.5) * 0.8, 5, 1, 0.4, -1.2);
  if (T.stage === 0 && dist < 2.4) { T.stage = 1; T.t = 0; say(PRINCESS_LINES[0]); }
  else if (T.stage >= 1 && T.stage <= 3 && T.t > 3.8) {
    if (T.stage < 3) { say(PRINCESS_LINES[T.stage]); T.stage += 1; T.t = 0; }
    else {
      T.stage = 4; T.t = 0;
      state.mode = 'victory'; state.ending = true; state.timer = 11;
      sfx('fanfare');
      showMessage('Королевство спасено!', 9);
    }
  }
}

// ---------------------------------------------------------------- бой
function updateGuard(dt) {
  const mx = state.stats.guardMax;
  const old = Math.round(state.guard);
  if (state.guardBroken > 0) {
    state.guardBroken -= dt;
    if (state.guardBroken <= 0) { state.guard = mx * 0.5; showMessage('Щит снова готов', 0.8); }
  } else {
    state.guardIdle -= dt;
    if (state.guardIdle <= 0) state.guard = Math.min(mx, state.guard + 16 * dt);
  }
  let att = null;
  for (const g of state.enemies) {
    if (g.dead || !(g.st === 'windup' || g.st === 'strike' || g.st === 'lunge')) continue;
    if (Math.hypot(head.x - g.root.position.x, head.z - g.root.position.z) < g.reach + 1.6) { att = g; break; }
  }
  if (att && playerGuardsAgainst(att)) state.guardT += dt; else state.guardT = 0;
  if (Math.round(state.guard) !== old && state.mode === 'play') hudDirty = true;
}
let hudDirty = false;

function hurtPlayer(n = 1) {
  if (Math.random() < state.stats.evade) { showMessage('Амулет защитил!', 0.8); return; }
  state.hp = Math.max(0, state.hp - n);
  flashT = 0.5;
  sfx('hurt');
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
    if (Math.hypot(c.x - (ax + dx * t), c.z - (az + dz * t)) < c.r) return true;
  }
  return false;
}

let blocking = false;
function playerGuardsAgainst(g) {
  if (WEAPONS[state.weapon].twoHanded || state.guardBroken > 0) return false;   // двуручное оружие / щит пробит
  if (!vrActive && !blocking) return false;       // на компьютере щит работает при блоке (Shift / правая кнопка)
  tmp.subVectors(head, g.root.position); tmp.y = 0;
  const d = tmp.length() || 1;
  tmp.multiplyScalar(1 / d);
  const hit = tmp2.set(head.x - tmp.x * 0.45, head.y - 0.3, head.z - tmp.z * 0.45);
  shield.getWorldPosition(shieldPos);
  return shieldPos.distanceTo(hit) < state.stats.blockR;
}

const isHeavy = (g) => g.type === 'golem' || g.type === 'dragon' || g.scale >= 1.5;
function guardCost(g) {
  const heavy = Math.max(1, g.scale * 0.9);
  const dm = state.diff === 'mega' ? 1.2 : state.diff === 'easy' ? 0.7 : 1;
  return 24 * g.spec.dmg * heavy * (g.boss ? 1.25 : 1) * (1 + g.phase * 0.15) * (g.type === 'golem' || g.type === 'dragon' ? 1.4 : 1) * dm;
}

function resolveStrike(g) {
  tmp.subVectors(head, g.root.position); tmp.y = 0;
  if (tmp.length() > g.reach + 0.8) return;       // промах
  if (isHeavy(g)) {                                // удар великана: грохот и дрожь
    sfx('stomp', g.root.position.x, g.root.position.z, { h: g.scale * 1.6 });
    haptic('left', 0.6, 140); haptic('right', 0.6, 140);
  }
  if (playerGuardsAgainst(g)) {
    tmp.subVectors(head, g.root.position); tmp.y = 0; tmp.normalize();
    if (state.guardT < 0.22) {                     // ПАРИРОВАНИЕ: щит поднят в последний момент
      sfx('parry', g.root.position.x, g.root.position.z);
      haptic('left', 1, 200);
      g.st = 'recover'; g.t = -1.1; g.resolved = true; g.combo = 0; g.poise = g.poiseMax * 0.3;
      g.kv.addScaledVector(tmp, -4 / Math.max(1, g.scale));
      state.guard = Math.min(state.stats.guardMax, state.guard + 15);
      fxSpark(head.x - tmp.x * 0.5, head.y - 0.3, head.z - tmp.z * 0.5, 3, 14, 4, 4);
      showMessage('Парирование!', 0.9);
      return;
    }
    const cost = guardCost(g);
    state.guard -= cost; state.guardIdle = 1.4;
    g.root.position.addScaledVector(tmp, -0.5 / Math.max(1, g.scale));
    if (state.guard <= 0) {                        // щит не выдержал
      state.guard = 0; state.guardBroken = 2.2;
      sfx('guardBreak', g.root.position.x, g.root.position.z);
      haptic('left', 1, 300);
      fxSpark(head.x - tmp.x * 0.5, head.y - 0.3, head.z - tmp.z * 0.5, 3, 20, 5, 5);
      showMessage('Щит пробит!', 1.4);
      hurtPlayer(g.spec.dmg);
    } else {
      sfx('block', g.root.position.x, g.root.position.z);
      if (state.guard < state.stats.guardMax * 0.3) sfx('guardStrain');
      haptic('left', 1, 150);
      g.st = 'recover'; g.t = -0.2;
      showMessage(state.guard < state.stats.guardMax * 0.3 ? 'Щит трещит!' : 'Блок!', 0.8);
    }
    drawHud();
  } else {
    hurtPlayer(g.spec.dmg);
  }
}

function mouthPos(g, out) {
  if (g.mouth) { g.root.updateMatrixWorld(true); return g.mouth.getWorldPosition(out); }
  return out.set(g.root.position.x, 1.5 * g.scale, g.root.position.z);
}

function resolveBreath(g) {
  const from = mouthPos(g, new THREE.Vector3());
  const to = new THREE.Vector3(head.x, head.y - 0.3, head.z);
  state.flame = { t: 0.7, src: g, to };
  sfx('fireBreath', g.root.position.x, g.root.position.z);
  tmp.subVectors(head, g.root.position); tmp.y = 0;
  const dist = tmp.length();
  if (coverBlocks(from.x, from.z, head.x, head.z)) { showMessage('Укрытие!', 0.9); return; }
  if (playerGuardsAgainst(g)) { sfx('block', g.root.position.x, g.root.position.z); haptic('left', 1, 150); showMessage('Блок!', 0.8); return; }
  if (dist < 40) hurtPlayer(1);
}

function killEnemy(g) {
  if (isHeavy(g)) sfx('rumble', g.root.position.x, g.root.position.z, { h: g.scale });
  g.dead = true; g.deadT = 0; g.hp = 0; g.st = 'dead';
  g.burn = 0; g.freeze = 0;
  scene.remove(g.bar);
  state.lastDeath.copy(g.root.position);
  state.lastDeath.x = clamp(state.lastDeath.x, -5, 5);
  state.lastDeath.z = clamp(state.lastDeath.z, -5, 2);
  sfx('voice', g.root.position.x, g.root.position.z, { t: g.type, k: 'die' });
  if (g.boss) sfx('fanfare');
  drawHud();
}

function igniteEnemy(g, secs) {
  if (g.dead || g.type === 'fire') return;
  if (g.freeze > 0) { g.freeze = 0; fxSpark(g.root.position.x, 1.0 * g.scale, g.root.position.z, 1, 10, 3, 3); return; }   // огонь растапливает лёд
  if (g.burn <= 0) sfx('ignite', g.root.position.x, g.root.position.z);
  g.burn = Math.max(g.burn, secs); g.burnSfx = 0;
}

function damageEnemy(g, dmgRaw, W = {}) {
  const D = DIFF[state.diff] || DIFF.mega;
  let dmg = dmgRaw * (g.boss ? state.stats.bossDmg : 1);
  if (g.vuln > 0) dmg *= 1.3;
  const wasFrozen = g.freeze > 0;
  if (wasFrozen && W.elem !== 'ice') dmg *= 1.25;
  let guarded = false;
  if (g.guardT > 0) {                                                    // враг в защите: урон почти не проходит, но защита не вечна
    guarded = true;
    g.guardHp -= dmg * (W.breakArmor ? 3.5 : W.elem === 'wind' ? 1.4 : 1) * (state.diff === 'easy' ? 1.5 : 1);
    dmg *= 0.12;
    if (g.guardHp <= 0) {
      g.guardHp = g.guardMax * 0.6; g.guardT = 0; g.guardCd = 1.5; guarded = false;
      g.st = 'recover'; g.t = -1.0; g.resolved = true; g.combo = 0; g.poise = g.poiseMax * 0.4;
      sfx('guardBreak', g.root.position.x, g.root.position.z);
      showMessage('Защита врага пробита!', 1.0);
      dmg = dmgRaw * 1.2;
    }
  }
  g.hp -= dmg;
  const px = g.root.position.x, pz = g.root.position.z, py = 1.0 * g.scale;
  if (guarded) { sfx('clang', px, pz, { p: 1.2 }); fxSpark(px, py, pz, 3, 6, 3, 6); }
  else {
    sfx(W.elem === 'hammer' ? 'boom' : 'hitFlesh', px, pz, { e: W.elem });
    sfx('voice', px, pz, { t: g.type, k: 'hurt' });
    const ci = W.elem === 'fire' ? 0 : W.elem === 'ice' ? 1 : W.elem === 'wind' ? 2 : W.elem === 'hammer' ? 3 : 4;
    fxSpark(px, py, pz, ci, W.elem ? 12 : 7, 3, 6);
  }
  haptic('right', 0.9, 120);
  g.flashT = 0.12;

  // --- стихии
  if (!guarded) {
    if (W.elem === 'fire') igniteEnemy(g, W.burn);
    if (W.elem === 'ice' && g.frzImm <= 0) {                              // ХОЛОД: враг замерзает во льду
      const dur = g.boss ? W.freeze * 0.5 : W.freeze;
      g.freeze = dur; g.frzImm = dur + (g.boss ? 5 : 1.5); g.burn = 0;
      g.st = 'chase'; g.t = 0; g.resolved = true; g.stun = 0; g.combo = 0;
      sfx('freeze', px, pz); fxSpark(px, py, pz, 1, 16, 3, 2);
    }
    if (W.elem === 'hammer') fxSpark(px, 0.08, pz, 3, 18, 6, 9);              // ударная волна от молота
    if (wasFrozen && W.elem === 'hammer') {                                // молот разбивает лёд
      g.freeze = 0; g.hp -= 25; sfx('shatter', px, pz); fxSpark(px, py, pz, 1, 24, 5, 4);
    }
    if (W.breakArmor) g.vuln = W.breakArmor;
  }
  if (g.hp <= 0) { killEnemy(g); drawHud(); return; }
  if (g.phases) {
    const pct = g.hp / g.maxHp;
    const np = pct < 0.33 ? 2 : pct < 0.66 ? 1 : 0;
    if (np > g.phase) {
      g.phase = np; g.speedMul *= 1.2; g.windMul *= 0.85;
      sfx('roar', px, pz);
      showMessage('Дракон в ярости!\nФаза ' + (np + 1) + ' из 3', 3);
    }
  }
  if (guarded) { drawHud(); return; }

  // --- отбрасывание (ВЕТЕР отбрасывает далеко и сбивает с ног)
  tmp.subVectors(g.root.position, head); tmp.y = 0; tmp.normalize();
  const resist = (g.boss ? 0.35 : 1) / Math.max(1, g.scale * 0.8);
  let kv = (W.elem === 'wind' ? 12 : W.elem === 'hammer' ? 6 : 2.2) * resist * (wasFrozen ? 0.25 : 1);
  g.kv.addScaledVector(tmp, kv);
  if (W.elem === 'wind') {
    sfx('gust', px, pz);
    for (const o of state.enemies) {                                      // порыв задевает и соседей
      if (o === g || o.dead) continue;
      if (Math.hypot(o.root.position.x - px, o.root.position.z - pz) < 2.4) {
        const r2 = (o.boss ? 0.35 : 1) / Math.max(1, o.scale * 0.8);
        o.kv.addScaledVector(tmp, kv * 0.6 * r2 / resist);
        if (!o.boss && o.freeze <= 0) { o.st = 'recover'; o.t = -0.3; o.stun = 0.4; o.resolved = true; }
        fxSpark(o.root.position.x, 1.0 * o.scale, o.root.position.z, 2, 6, 3, 4);
      }
    }
  }

  // --- стойка: слабые удары не сбивают врага — он продолжает атаку и бьёт в ответ
  g.poise -= (W.poiseDmg || 1) * dmg;
  const windStagger = W.elem === 'wind' && !g.boss;
  const broke = g.poise <= 0 || windStagger || (W.stun && W.stun > 0.5 && g.poise < g.poiseMax * 0.6);
  if (broke) {
    g.poise = g.poiseMax * 0.7;
    g.st = 'recover'; g.t = -0.3; g.resolved = true; g.combo = 0;
    g.stun = W.stun || (g.boss ? 0.2 : 0.45);
  } else if (g.st === 'chase' && g.stun <= 0) {
    tmp.subVectors(head, g.root.position); tmp.y = 0;
    if (tmp.length() < g.reach + 0.9 && Math.random() < D.counter) {     // мгновенная контратака
      g.st = 'windup'; g.t = g.spec.windup * g.windMul * 0.5; g.resolved = false; g.combo = D.combo;
      sfx('voice', px, pz, { t: g.type, k: 'atk' });
    }
  }
  drawHud();
}

function updateMelee(dt) {
  const W = WEAPONS[state.weapon];
  holder.userData.tip.getWorldPosition(tipPos);
  holder.userData.mid.getWorldPosition(midPos);
  if (firstFrame) { prevTip.copy(tipPos); firstFrame = false; }
  const raw = tipPos.distanceTo(prevTip) / Math.max(dt, 0.001);
  swordSpeed = swordSpeed * 0.5 + raw * 0.5;
  prevTip.copy(tipPos);
  swingCd -= dt;
  updateTrail(dt, W);

  if (swordSpeed > 2.0 && !swinging) { swinging = true; sfx('swing', undefined, undefined, { s: Math.min(1, swordSpeed / 9), e: W.elem }); }
  if (swordSpeed < 1.0) swinging = false;
  if (swingCd > 0 || swordSpeed < W.speedMin) return;

  for (const g of state.enemies) {
    if (g.dead) continue;
    const rr = g.spec.hitR * g.scale;
    const hh = g.spec.height * g.scale + 0.2;
    for (const p of [tipPos, midPos]) {
      if (Math.hypot(p.x - g.root.position.x, p.z - g.root.position.z) < rr && p.y > 0.05 && p.y < hh) {
        damageEnemy(g, clamp((swordSpeed - 1.5) * 14, 8, 60) * W.dmg, W);
        swingCd = W.cd;
        return;
      }
    }
  }
}

// ---------------------------------------------------------------- шлейф клинка и частицы стихий
const TRAIL_N = 16;
const trailPos = new Float32Array(TRAIL_N * 2 * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
{
  const idx = [];
  for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  trailGeo.setIndex(idx);
}
const trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const trailMesh = new THREE.Mesh(trailGeo, trailMat);
trailMesh.frustumCulled = false;
trailMesh.visible = false;
if (!GUEST) scene.add(trailMesh);
const trailPts = [];
const TRAIL_COL = { fire: 0xff7a1a, ice: 0x8fe0ff, wind: 0x9fffe0, hammer: 0xc8ccd8 };
let fxT = 0;
function trailReset() { trailPts.length = 0; trailMesh.visible = false; }
function updateTrail(dt, W) {
  const a = tipPos, b = midPos;
  trailPts.unshift([a.x, a.y, a.z, b.x, b.y, b.z]);
  if (trailPts.length > TRAIL_N) trailPts.pop();
  const sp = clamp((swordSpeed - 1.5) / 6, 0, 1);
  trailMat.color.setHex(TRAIL_COL[W.elem] || 0xdfe8f5);
  trailMat.opacity = sp * 0.65;
  trailMesh.visible = sp > 0.02 && trailPts.length > 2;
  for (let i = 0; i < TRAIL_N; i++) {
    const p = trailPts[Math.min(i, trailPts.length - 1)];
    if (!p) continue;
    trailPos.set(p, i * 6);
  }
  trailGeo.attributes.position.needsUpdate = true;
  // частицы стихии
  fxT -= dt;
  if (fxT <= 0 && W.elem && W.elem !== 'hammer') {
    fxT = 0.045;
    const burst = swordSpeed > 2.5 ? 2 : (Math.random() < 0.25 ? 1 : 0);
    if (burst) {
      const ci = W.elem === 'fire' ? 0 : W.elem === 'ice' ? 1 : 2;
      spark(tipPos.x, tipPos.y, tipPos.z, ci, burst, W.elem === 'wind' ? 1.8 : 0.9, W.elem === 'fire' ? -2 : W.elem === 'ice' ? 1.5 : 0);
    }
  }
}

// --- лук
function bowStart() {
  if (bow.cd > 0 || bow.drawing || state.mode !== 'play') return;
  bow.drawing = true; bow.t = 0;
  sfx('bowDraw');
}
function bowRelease() {
  if (!bow.drawing) return;
  bow.drawing = false;
  const c = clamp(bow.t / 0.8, 0.2, 1);
  fireArrow(c);
  bow.cd = 0.3;
  if (weaponModel && weaponModel.userData.setDraw) weaponModel.userData.setDraw(0);
}
function fireArrow(c) {
  const o = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  if (vrActive) { holder.getWorldPosition(o); holder.getWorldQuaternion(q); dir.set(0, 0, -1).applyQuaternion(q); }
  else { camera.getWorldPosition(o); camera.getWorldDirection(dir); }
  o.addScaledVector(dir, 0.5);
  const m = makeArrowMesh();
  m.position.copy(o);
  state.arrows.push({ m, v: dir.multiplyScalar(16 + c * 20), life: 4, dmg: 10 + c * 34 });
  sfx('bow', undefined, undefined, { c });
  haptic('right', 0.7, 80);
}
function updateBow(dt) {
  if (trailMesh.visible) trailMesh.visible = false;
  bow.cd -= dt;
  if (bow.drawing) {
    bow.t += dt;
    const c = Math.min(1, bow.t / 0.8);
    if (weaponModel.userData.setDraw) weaponModel.userData.setDraw(c);
    if (vrActive) haptic('right', 0.1 + 0.25 * c, 30);
  }
}
function updateArrows(dt) {
  for (let i = state.arrows.length - 1; i >= 0; i--) {
    const a = state.arrows[i];
    a.life -= dt;
    a.v.y -= 4 * dt;
    a.m.position.addScaledVector(a.v, dt);
    tmp.copy(a.m.position).add(a.v);
    a.m.lookAt(tmp);
    let done = a.life <= 0 || a.m.position.y < 0.02;
    if (!done) {
      for (const g of state.enemies) {
        if (g.dead) continue;
        const p = a.m.position;
        if (Math.hypot(p.x - g.root.position.x, p.z - g.root.position.z) < g.spec.hitR * g.scale + 0.1 && p.y < g.spec.height * g.scale + 0.2) {
          damageEnemy(g, a.dmg, { knock: 0.4 });
          sfx('arrowHit', p.x, p.z);
          done = true;
          break;
        }
      }
    }
    if (done) { scene.remove(a.m); state.arrows.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- ИИ врага (хост)
const LUNGERS = new Set(['spider', 'dark', 'elite', 'fire', 'goblin', 'bog']);

function updateEnemy(g, dt, time) {
  const D = DIFF[state.diff] || DIFF.mega;
  if (g.flashT > 0) g.flashT -= dt;
  if (g.dead) { g.deadT += dt; poseEnemy(g, time); return; }

  if (g.vuln > 0) g.vuln -= dt;
  if (g.frzImm > 0) g.frzImm -= dt;
  if (g.dodgeCd > 0) g.dodgeCd -= dt;
  g.lungeCd -= dt;
  if (g.guardT > 0) g.guardT -= dt;
  if (g.guardCd > 0) g.guardCd -= dt;
  // скорость отбрасывания (ветер)
  if (g.kv.lengthSq() > 0.01) {
    g.root.position.x += g.kv.x * dt; g.root.position.z += g.kv.z * dt;
    g.kv.multiplyScalar(Math.exp(-dt * 5));
    const rr = Math.hypot(g.root.position.x, g.root.position.z);
    if (rr > state.radius) { g.root.position.x *= state.radius / rr; g.root.position.z *= state.radius / rr; }
  }
  if (g.burn > 0) {
    g.burn -= dt;
    g.hp -= 12 * dt * (g.boss ? state.stats.bossDmg : 1);
    g.burnSfx -= dt;
    if (g.burnSfx <= 0) { g.burnSfx = 0.9; sfx('burn', g.root.position.x, g.root.position.z); fxSpark(g.root.position.x, 1.2 * g.scale, g.root.position.z, 0, 3, 1.2, -1); }
    g.spreadT -= dt;
    if (g.spreadT <= 0) {                                                  // огонь перекидывается на соседей
      g.spreadT = 0.7;
      for (const o of state.enemies) {
        if (o === g || o.dead || o.burn > 0) continue;
        if (Math.hypot(o.root.position.x - g.root.position.x, o.root.position.z - g.root.position.z) < 1.8 * Math.max(g.scale, o.scale)) igniteEnemy(o, 2.5);
      }
    }
    if (g.hp <= 0) { killEnemy(g); poseEnemy(g, time); return; }
  }
  g.walk = 0;
  if (g.freeze > 0) {                                                      // заморожен: не двигается и не атакует
    g.freeze -= dt; g.warn = 0;
    if (g.freeze <= 0) { sfx('shatter', g.root.position.x, g.root.position.z); fxSpark(g.root.position.x, 1.0 * g.scale, g.root.position.z, 1, 14, 3, 3); g.st = 'chase'; g.t = 0; }
    poseEnemy(g, time);
    return;
  }

  tmp.subVectors(head, g.root.position); tmp.y = 0;
  const dist = tmp.length();
  const fwd = tmp.clone().normalize();
  let dy = Math.atan2(tmp.x, tmp.z) - g.root.rotation.y;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  g.root.rotation.y += dy * Math.min(1, dt * (g.st === 'strike' || g.st === 'lunge' ? 3 : 9));

  g.warn = (g.st === 'windup' || g.st === 'breath' || g.st === 'lunge') ? 0.4 + 0.4 * Math.sin(time * 30) : 0;
  if (g.stun > 0) g.stun -= dt;
  g.breathCd -= dt;
  if (g.st !== 'recover') g.poise = Math.min(g.poiseMax, g.poise + 12 * dt);
  const speed = g.spec.speed * g.speedMul;
  const windup = g.spec.windup * g.windMul;
  let armTarget = ARM_IDLE;
  const heavy = isHeavy(g);
  const stepSfx = (rate) => {
    g.stepT -= dt;
    if (g.stepT > 0 || dist >= 16) return;
    g.stepT = 0.5 / rate;
    if (heavy) {                                                       // огромный моб: грохот при каждом шаге
      sfx('stomp', g.root.position.x, g.root.position.z, { h: g.scale * (g.type === 'dragon' ? 2 : g.type === 'golem' ? 1.5 : 1.2) });
      if (dist < 10) { const k = 0.7 * (1 - dist / 10); haptic('left', k, 110); haptic('right', k, 110); }
    } else sfx('step', g.root.position.x, g.root.position.z, { h: g.scale });
  };

  switch (g.st) {
    case 'chase': {
      if (g.stun > 0) break;
      if (g.guardT > 0) {                                              // стоит в защите, пятится
        armTarget = -1.9;
        if (dist < g.reach + 0.8) { g.root.position.addScaledVector(fwd, -speed * 0.35 * dt); g.walk = 1; }
        break;
      }
      if (g.guardChance > 0 && g.guardCd <= 0 && swordSpeed > 3 && dist < g.reach + 1.6 && Math.random() < g.guardChance * (state.diff === 'mega' ? 1.5 : state.diff === 'easy' ? 0.3 : 1) * dt * 6) {
        g.guardT = 0.75; g.guardCd = 1.9;
        sfx('clang', g.root.position.x, g.root.position.z, { p: 0.9 });
        break;
      }
      if (g.fire && g.breathCd <= 0 && dist > g.reach + 1.0 && dist < 16) {
        g.st = 'breath'; g.t = 0;
        sfx('voice', g.root.position.x, g.root.position.z, { t: g.type, k: 'alert' });
        break;
      }
      const perp = tmp2.set(fwd.z, 0, -fwd.x);
      if (LUNGERS.has(g.type) && !g.boss && D.lunge > 0 && g.lungeCd <= 0 && dist > 2.4 && dist < 6 && Math.random() < D.lunge * dt * 3) {
        g.st = 'lunge'; g.t = 0; g.resolved = false; g.lungeCd = (3.5 + Math.random() * 3) / D.lunge;
        sfx('voice', g.root.position.x, g.root.position.z, { t: g.type, k: 'alert' });
        break;
      }
      if (D.dodge > 0 && swordSpeed > 4.5 && dist < g.reach + 1.8 && g.dodgeCd <= 0 && Math.random() < D.dodge * dt * 5) {
        g.kv.addScaledVector(perp, g.strafe * 6 * (g.boss ? 0.5 : 1)); g.dodgeCd = 1.5;
        g.strafe = -g.strafe;
      }
      if (dist > g.reach) {
        const orbit = dist < 7 ? 0.5 : 0;
        const dir = tmp.copy(fwd).addScaledVector(perp, g.strafe * orbit * Math.sin(time * 0.9 + g.id)).normalize();
        g.root.position.addScaledVector(dir, speed * dt);
        g.walk = 1;
        stepSfx(speed / 1.3);
      } else {
        g.st = 'windup'; g.t = 0; g.resolved = false; g.combo = D.combo + (g.boss ? 1 : 0);
        sfx('voice', g.root.position.x, g.root.position.z, { t: g.type, k: 'atk' });
      }
      break;
    }
    case 'windup':
      g.t += dt;
      armTarget = lerp(ARM_IDLE, ARM_UP, g.t / windup);
      if (dist > g.reach * 0.85) { g.root.position.addScaledVector(fwd, speed * 0.7 * dt); g.walk = 1; }   // подшаг к игроку
      if (g.t >= windup) { g.st = 'strike'; g.t = 0; }
      break;
    case 'strike':
      g.t += dt;
      armTarget = lerp(ARM_UP, ARM_HIT, g.t / 0.12);
      if (!g.resolved && g.t >= 0.1) { g.resolved = true; if (state.mode === 'play') resolveStrike(g); }
      if (g.t >= 0.3) {
        if (g.combo > 0 && g.st === 'strike' && dist < g.reach + 1.3) { g.combo--; g.st = 'windup'; g.t = windup * 0.55; g.resolved = false; }   // КОМБО
        else { g.st = 'recover'; g.t = 0; }
      }
      break;
    case 'lunge': {                                                         // прыжок/рывок: присел → бросок
      g.t += dt;
      if (g.t < 0.3) { armTarget = lerp(ARM_IDLE, ARM_UP * 0.6, g.t / 0.3); }
      else if (g.t < 0.7) {
        armTarget = ARM_HIT; g.walk = 1;
        g.root.position.addScaledVector(fwd, speed * 4.2 * dt);
        if (!g.resolved && dist < g.reach * 0.9) { g.resolved = true; if (state.mode === 'play') resolveStrike(g); }
      } else { g.st = 'recover'; g.t = 0.1; }
      break;
    }
    case 'breath': {                                 // огонь идёт из ПАСТИ: голова поднимается, челюсть открывается
      g.t += dt;
      const p = Math.min(1, g.t / 1.3);
      if (g.headG) { g.headTilt = lerp(0, 0.55, p); g.jawOpen = lerp(0, 0.9, p); }
      else armTarget = lerp(ARM_IDLE, ARM_UP, p);
      if (g.t >= 1.3) {
        if (state.mode === 'play') resolveBreath(g);
        g.breathCd = Math.max(2.5, 7 - g.phase * 2) + Math.random() * 2;
        g.st = 'recover'; g.t = 0;
      }
      break;
    }
    case 'recover':
      g.t += dt;
      armTarget = lerp(ARM_HIT, ARM_IDLE, Math.max(0, g.t) / 0.5);
      if (g.t >= 0.9 * D.wind + 0.15) g.st = 'chase';
      break;
    default: break;
  }
  if (g.st !== 'breath') {
    g.headTilt = lerp(g.headTilt, 0, dt * 5);
    g.jawOpen = lerp(g.jawOpen, 0, dt * 5);
  }
  g.armAngle = armTarget;
  poseEnemy(g, time);
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
  if (p.id === 'gate') {
    p.obj.userData.portal.material.opacity = 0.45 + 0.15 * Math.sin(time * 4);
    if (Math.hypot(head.x - p.obj.position.x, head.z - p.obj.position.z) < 1.0) enterTower();
    return;
  }
  p.obj.position.y = 1.0 + Math.sin(time * 3) * 0.06;
  p.obj.rotation.y += dt * 1.5;
  let taken = false;
  if (vrActive) {
    for (const gr of grips) { gr.getWorldPosition(tmp); if (tmp.distanceTo(p.obj.position) < 0.4) { taken = true; break; } }
  } else if (Math.hypot(head.x - p.obj.position.x, head.z - p.obj.position.z) < 1.3) taken = true;
  if (!taken) return;

  const id = p.id;
  scene.remove(p.obj); disposeTree(p.obj); state.pickup = null;
  sfx('pickup');
  haptic('right', 0.7, 150); haptic('left', 0.7, 150);
  state.mode = 'victory';
  const before = new Set(state.stats.weapons);
  state.got.push(id);
  computeStats();
  const fresh = state.stats.weapons.find((w) => !before.has(w));
  if (fresh) equip(fresh);
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
const isTyping = () => !!document.activeElement && document.activeElement.tagName === 'INPUT';
window.addEventListener('keydown', (e) => {
  if (isTyping()) return;
  keys[e.code] = true;
  if (e.key === 'Shift') blocking = true;
  if (GUEST) return;
  if (e.code.startsWith('Digit')) pickWeaponByNumber(parseInt(e.code.slice(5), 10) - 1);
  if (e.code === 'KeyQ') cycleWeapon(-1);
  if (e.code === 'KeyE') cycleWeapon(1);
  if (e.code === 'KeyM') toggleSound();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.key === 'Shift') blocking = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('wheel', (e) => {
  if (GUEST) { G.zoom = clamp(G.zoom + e.deltaY * 0.004, 1.2, 9); return; }
  if (!vrActive) cycleWeapon(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
renderer.domElement.addEventListener('mousedown', (e) => {
  if (GUEST) { dragging = true; return; }
  if (vrActive) return;
  dragging = true;
  if (e.button === 0) {
    if (WEAPONS[state.weapon].kind === 'bow') bowStart();
    else if (swingT <= 0) { swingT = 0.3; sfx('swing', undefined, undefined, { s: 0.7, e: WEAPONS[state.weapon].elem }); }
  }
  if (e.button === 2) blocking = true;
});
window.addEventListener('mouseup', (e) => {
  dragging = false;
  if (GUEST) return;
  if (e.button === 0 && WEAPONS[state.weapon].kind === 'bow') bowRelease();
  if (e.button === 2) blocking = false;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  if (GUEST) { if (G.view === 'free') { G.orbitYaw -= e.movementX * 0.006; G.orbitPitch = clamp(G.orbitPitch + e.movementY * 0.004, 0.05, 1.4); } return; }
  if (vrActive) return;
  rig.rotation.y -= e.movementX * 0.003;
  camera.rotation.x = clamp(camera.rotation.x - e.movementY * 0.003, -1.2, 1.2);
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

  const isBow = WEAPONS[state.weapon].kind === 'bow';
  if (isBow) {
    holder.position.set(0.28, -0.22 + (bow.drawing ? 0.03 : 0), -0.5);
    holder.rotation.set(0, 0, 0);
  } else if (swingT > 0) {
    swingT -= dt;
    const p = 1 - Math.max(0, swingT) / 0.3;
    holder.rotation.set(lerp(1.3, -0.9, p), 0.2, lerp(0.3, -0.3, p));
    holder.position.set(0.3 - p * 0.15, -0.3 + p * 0.05, -0.45 - Math.sin(p * Math.PI) * 0.3);
  } else {
    holder.rotation.set(0.9, 0.2, 0);
    holder.position.set(0.3, -0.3, -0.45);
  }
  const tgtPos = blocking ? tmp.set(-0.02, -0.12, -0.55) : tmp.set(-0.32, -0.25, -0.5);
  shield.position.lerp(tgtPos, Math.min(1, dt * 14));
  shield.rotation.y = lerp(shield.rotation.y, blocking ? 0 : 0.3, dt * 14);
}

// ---------------------------------------------------------------- управление (VR)
let snapCd = 0;
const prevBtn = { a: false, b: false, trig: false };
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
        rig.position.addScaledVector(fwd.multiplyScalar(-ay).addScaledVector(right, ax), 2.0 * dt);
      }
    } else if (src.handedness === 'right') {
      if (Math.abs(ax) > 0.7 && snapCd <= 0) {
        const a = -Math.sign(ax) * (Math.PI / 6);
        camera.getWorldPosition(tmp);
        rig.position.sub(tmp).applyAxisAngle(UP, a).add(tmp);
        rig.rotation.y += a;
        snapCd = 0.3;
      }
      const b = gp.buttons || [];
      const trig = !!(b[0] && b[0].pressed), btnA = !!(b[4] && b[4].pressed), btnB = !!(b[5] && b[5].pressed);
      if (btnA && !prevBtn.a) cycleWeapon(1);
      if (btnB && !prevBtn.b) cycleWeapon(-1);
      if (WEAPONS[state.weapon].kind === 'bow') {
        if (trig && !prevBtn.trig) bowStart();
        if (!trig && prevBtn.trig) bowRelease();
      }
      prevBtn.a = btnA; prevBtn.b = btnB; prevBtn.trig = trig;
    }
  }
}

function clampRig() {
  const r = Math.hypot(rig.position.x, rig.position.z);
  if (r > state.radius) {
    rig.position.x *= state.radius / r;
    rig.position.z *= state.radius / r;
  }
}

// ---------------------------------------------------------------- звук/музыка
let soundOn = true;
function toggleSound() {
  soundOn = !soundOn;
  A.setMuted(!soundOn);
  const b = $('soundBtn');
  if (b) b.textContent = soundOn ? '🔊 Звук' : '🔇 Звук выкл';
}
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => A.unlock(), { passive: true }));
let musicTimer = 0;
function updateMusic(dt) {
  musicTimer -= dt;
  if (musicTimer > 0) return;
  musicTimer = 0.6;
  const fighting = !state.inTower && state.enemies.some((e) => !e.dead && (e.boss || Math.hypot(e.root.position.x - head.x, e.root.position.z - head.z) < 9));
  A.music(fighting ? 'battle' : 'calm');
}

// ---------------------------------------------------------------- ЗРИТЕЛЬ
const G = {
  seq: -1, lv: -1, view: 'follow', zoom: 3.2, orbitYaw: 0, orbitPitch: 0.5, yaw: 0, snapNext: false, init: false,
  h: null, sw: null, sh: null, w: '', hp: 5, mh: 5, bp: 0,
  flame: null, enemies: new Map(), arrows: [], pk: null, princess: null, tw: 0, status: 'connecting', mode: 'play',
};
let avatar = null, avWeapon = null, avShield = null, avWid = '';

function ensureAvatar() {
  if (avatar) return;
  avatar = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a96a8, metalness: 0.7, roughness: 0.4 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2c4f9e, roughness: 0.6 });
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); avatar.add(m); return m; };
  avatar.userData.headMesh = mk(new THREE.SphereGeometry(0.17, 12, 10), steel, 0, 0, 0);
  mk(new THREE.BoxGeometry(0.2, 0.03, 0.04), new THREE.MeshBasicMaterial({ color: 0x111122 }), 0, 0.02, -0.15);
  mk(new THREE.CapsuleGeometry(0.2, 0.45, 4, 10), blue, 0, -0.55, 0);
  mk(new THREE.CylinderGeometry(0.08, 0.07, 0.6, 8), steel, -0.1, -1.2, 0);
  mk(new THREE.CylinderGeometry(0.08, 0.07, 0.6, 8), steel, 0.1, -1.2, 0);
  avatar.visible = false;
  scene.add(avatar);
  avWeapon = new THREE.Group(); scene.add(avWeapon);
  avShield = makeShield(); scene.add(avShield);
}
function setAvatarWeapon(id) {
  if (id === avWid || !WEAPONS[id]) return;
  avWid = id;
  while (avWeapon.children.length) { const c = avWeapon.children[0]; avWeapon.remove(c); disposeTree(c); }
  avWeapon.userData.model = makeWeaponModel(id);
  avWeapon.add(avWeapon.userData.model);
}

function loadView(lv) {
  clearEnemies();
  G.enemies.clear();
  G.pk = null; G.princess = null;
  const cfg = lv === TOWER_LV ? TOWER : LEVELS[lv];
  if (!cfg) return;
  state.inTower = lv === TOWER_LV;
  state.level = Math.min(lv, LEVELS.length - 1);
  buildEnv(cfg);
  if (state.inTower) {
    const pr = makePrincess();
    pr.g.position.set(0, 0.25, -3);
    scene.add(pr.g);
    G.princess = pr;
  }
}

function applyEvent(ev) {
  const [name, x, z, arg] = ev;
  if (name === 'msg') { showMessage(arg.t, arg.s, true); return; }
  if (name === 'say') { showMessage(arg.t, 3.6, true); speak(arg.t); A.play('princess'); return; }
  if (name === 'spark') { spark(x, arg.y, z, arg.c, arg.n, arg.s, arg.g); return; }
  A.play(name, x === null ? undefined : x, z === null ? undefined : z, arg || undefined);
}

function applySnapshot(s) {
  if (s.s <= G.seq) return;
  G.seq = s.s;
  if (s.lv !== G.lv) { G.lv = s.lv; loadView(s.lv); }
  G.status = 'live';
  G.h = s.h; G.sw = s.sw; G.sh = s.sh;
  G.hp = s.hp; G.mh = s.mh; G.bp = s.bp; G.mode = s.md; G.tw = s.tw || 0;
  state.hp = s.hp; state.stats.maxHp = s.mh;
  ensureAvatar();
  if (s.w !== G.w) { G.w = s.w; setAvatarWeapon(s.w); }
  avatar.visible = true;
  if (!G.init) { G.init = true; G.snapNext = true; }

  const seen = new Set();
  for (const a of s.en) {
    const [id, type, boss, scale, x, z, ry, arm, ht, jw, walk, deadT, hp, maxHp, burn, freeze, fl, warn, name] = a;
    seen.add(id);
    let e = G.enemies.get(id);
    if (!e) {
      e = makeEnemy(type, { scale, name }, !!boss);
      e.id = id;
      e.root.position.set(x, 0, z);
      e.root.rotation.y = ry;
      scene.add(e.root);
      G.enemies.set(id, e);
      state.enemies.push(e);
    }
    e.tx = x; e.tz = z; e.try = ry;
    e.armAngle = arm; e.headTilt = ht; e.jawOpen = jw; e.walk = walk;
    e.dead = deadT >= 0; e.deadT = Math.max(0, deadT);
    e.hp = hp; e.maxHp = maxHp; e.burn = burn; e.freeze = freeze; e.flashT = fl ? 0.1 : 0; e.warn = warn;
  }
  for (const [id, e] of G.enemies) {
    if (!seen.has(id)) { scene.remove(e.root, e.bar); disposeTree(e.root); G.enemies.delete(id); state.enemies = state.enemies.filter((x) => x !== e); }
  }

  const pk = s.pk;
  if (!pk && G.pk) { scene.remove(G.pk.obj); disposeTree(G.pk.obj); G.pk = null; }
  if (pk && (!G.pk || G.pk.id !== pk[0])) {
    if (G.pk) { scene.remove(G.pk.obj); disposeTree(G.pk.obj); }
    G.pk = makePickup(pk[0], { x: pk[1], z: pk[2] });
  }
  G.flame = s.bt || null;
  while (G.arrows.length > s.ar.length) scene.remove(G.arrows.pop());
  while (G.arrows.length < s.ar.length) G.arrows.push(makeArrowMesh());
  s.ar.forEach((a, i) => { G.arrows[i].position.set(a[0], a[1], a[2]); tmp.set(a[0] + a[3], a[1] + a[4], a[2] + a[5]); G.arrows[i].lookAt(tmp); });
  if (G.princess) { G.princess.g.rotation.y = s.pry || 0; G.princess.stage = s.tw || 0; }
  if (s.ev) for (const ev of s.ev) applyEvent(ev);
}

function guestFrame(dt, time) {
  const first = G.snapNext;
  const k = first ? 1 : 1 - Math.exp(-dt * 14);
  const kc = first ? 1 : 1 - Math.exp(-dt * 6);
  for (const e of G.enemies.values()) {
    if (e.tx !== undefined) {
      e.root.position.x += (e.tx - e.root.position.x) * k;
      e.root.position.z += (e.tz - e.root.position.z) * k;
      let d = e.try - e.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      e.root.rotation.y += d * k;
    }
    poseEnemy(e, time);
  }
  if (G.flame) { tmp.set(G.flame[0], G.flame[1], G.flame[2]); tmp2.set(G.flame[3], G.flame[4], G.flame[5]); placeFlame(tmp, tmp2, time); } else flameG.visible = false;
  if (G.pk && G.pk.id === 'gate') G.pk.obj.userData.portal.material.opacity = 0.45 + 0.15 * Math.sin(time * 4);
  else if (G.pk) { G.pk.obj.position.y = 1.0 + Math.sin(time * 3) * 0.06; G.pk.obj.rotation.y += dt * 1.5; }
  if (G.princess) {
    G.princess.wave.rotation.z = G.princess.stage >= 1 ? -2.4 + 0.35 * Math.sin(time * 6) : -0.3;
    if (G.princess.stage >= 1 && Math.random() < dt * 5) spark(G.princess.g.position.x + (Math.random() - 0.5) * 0.8, 1.3 + Math.random() * 0.5, G.princess.g.position.z + (Math.random() - 0.5) * 0.8, 5, 1, 0.4, -1.2);
  }
  if (!G.h) return;

  const hp = G.h;
  const hq = new THREE.Quaternion(hp[3], hp[4], hp[5], hp[6]);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(hq);
  const yaw = Math.atan2(fwd.x, fwd.z);
  if (first) G.yaw = yaw;
  let dyaw = yaw - G.yaw;
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  G.yaw += dyaw * (1 - Math.exp(-dt * 3));

  avatar.position.lerp(tmp.set(hp[0], hp[1], hp[2]), k);
  avatar.rotation.y = G.yaw + Math.PI;
  avatar.userData.headMesh.visible = G.view !== 'first';
  const setPose = (obj, p) => {
    if (!p) return;
    obj.position.lerp(tmp2.set(p[0], p[1], p[2]), k);
    obj.quaternion.slerp(new THREE.Quaternion(p[3], p[4], p[5], p[6]), k);
  };
  setPose(avWeapon, G.sw);
  setPose(avShield, G.sh);
  avShield.visible = !(G.w && WEAPONS[G.w] && WEAPONS[G.w].twoHanded);
  if (avWeapon.userData.model && avWeapon.userData.model.userData.tick) avWeapon.userData.model.userData.tick(time, 0.2);

  const target = new THREE.Vector3(avatar.position.x, avatar.position.y - 0.2, avatar.position.z);
  if (G.view === 'first') {
    camera.position.lerp(avatar.position, first ? 1 : 1 - Math.exp(-dt * 10));
    camera.quaternion.slerp(hq, first ? 1 : 1 - Math.exp(-dt * 6));
  } else if (G.view === 'free') {
    const r = G.zoom * 2.2;
    camera.position.set(target.x + Math.sin(G.orbitYaw) * Math.cos(G.orbitPitch) * r, target.y + 0.6 + Math.sin(G.orbitPitch) * r, target.z + Math.cos(G.orbitYaw) * Math.cos(G.orbitPitch) * r);
    camera.lookAt(target);
  } else {
    const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
    camera.position.lerp(tmp2.set(target.x - fx * G.zoom, target.y + 0.9 + G.zoom * 0.12, target.z - fz * G.zoom), kc);
    camera.lookAt(target.x + fx * 2.5, target.y - 0.1, target.z + fz * 2.5);
  }
  G.snapNext = false;
}

function setGuestView(v) {
  G.view = v;
  [['follow', 'vFollow'], ['first', 'vFirst'], ['free', 'vFree']].forEach(([n, id]) => { const b = $(id); if (b && b.classList) b.classList.toggle('on', n === v); });
}

function startGuestMode() {
  document.body.classList.add('guest');
  const overlay = $('gOverlay'), status = $('gStatus');
  overlay.style.display = 'flex';
  $('gStart').addEventListener('click', () => { A.unlock(); overlay.style.display = 'none'; });
  $('vFollow').addEventListener('click', () => setGuestView('follow'));
  $('vFirst').addEventListener('click', () => setGuestView('first'));
  $('vFree').addEventListener('click', () => setGuestView('free'));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') setGuestView(G.view === 'follow' ? 'first' : G.view === 'first' ? 'free' : 'follow');
    if (e.code === 'KeyM') toggleSound();
  });
  status.textContent = 'Подключение к игроку ' + WATCH + '…';
  const texts = {
    open: 'Подключено — смотришь игру', closed: 'Игрок вышел. Обнови страницу, чтобы подключиться снова',
    nohost: 'Игрок с кодом ' + WATCH + ' не в сети', timeout: 'Не удалось подключиться (сеть блокирует соединение?)', error: 'Ошибка соединения',
  };
  NET.startGuest(WATCH, {
    onData: (d) => { try { applySnapshot(d); } catch (e) { console.error(e); } },
    onStatus: (st) => { G.status = st; status.textContent = texts[st] || st; },
  }).catch(() => { status.textContent = 'Не удалось загрузить модуль связи'; });
}

// ---------------------------------------------------------------- ТРАНСЛЯЦИЯ (хост)
const rq = new THREE.Quaternion();
const rv = new THREE.Vector3();
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
function pose(o) {
  o.getWorldPosition(rv); o.getWorldQuaternion(rq);
  return [r2(rv.x), r2(rv.y), r2(rv.z), r3(rq.x), r3(rq.y), r3(rq.z), r3(rq.w)];
}
let seq = 0, netTimer = 0;
function buildSnapshot() {
  const en = state.enemies.map((e) => [e.id, e.type, e.boss ? 1 : 0, e.scale, r2(e.root.position.x), r2(e.root.position.z), r2(e.root.rotation.y),
    r2(e.armAngle), r2(e.headTilt), r2(e.jawOpen), e.walk ? 1 : 0, e.dead ? r2(e.deadT) : -1, Math.round(e.hp), Math.round(e.maxHp),
    e.burn > 0 ? 1 : 0, e.freeze > 0 ? 1 : 0, e.flashT > 0 ? 1 : 0, r2(e.warn), e.name]);
  let bt = null;
  if (state.flame) {
    const f = mouthPos(state.flame.src, new THREE.Vector3());
    bt = [r2(f.x), r2(f.y), r2(f.z), r2(state.flame.to.x), r2(state.flame.to.y), r2(state.flame.to.z)];
  }
  return {
    s: seq++, lv: state.inTower ? TOWER_LV : state.level, md: state.mode, hp: state.hp, mh: state.stats.maxHp, w: state.weapon, bp: state.bossPending ? 1 : 0,
    h: pose(camera), sw: pose(holder), sh: pose(shield),
    en, bt,
    pk: state.pickup ? [state.pickup.id, r2(state.pickup.obj.position.x), r2(state.pickup.obj.position.z)] : null,
    ar: state.arrows.map((a) => [r2(a.m.position.x), r2(a.m.position.y), r2(a.m.position.z), r2(a.v.x * 0.05), r2(a.v.y * 0.05), r2(a.v.z * 0.05)]),
    tw: state.tower ? state.tower.stage : 0, pry: state.tower ? r2(state.tower.ry) : 0,
    ev: evq.splice(0, evq.length),
  };
}
function netUpdate(dt) {
  if (!hosting()) { evq.length = 0; return; }
  netTimer -= dt;
  if (netTimer > 0) return;
  netTimer = 1 / 15;
  try { host.send(buildSnapshot()); } catch (e) { /* ignore */ }
}

async function startSharing() {
  const btn = $('shareBtn'), box = $('shareBox');
  btn.disabled = true; btn.textContent = 'Подключение…';
  try {
    host = await NET.startHost({
      onCount: (n) => { $('viewers').textContent = 'Зрителей: ' + n; },
      onError: () => { btn.textContent = '👁 Не удалось, повторить'; btn.disabled = false; },
    });
    const link = window.location.origin + window.location.pathname + '?watch=' + host.code;
    $('shareLink').value = link;
    $('shareCode').textContent = host.code;
    box.style.display = 'block';
    btn.textContent = '👁 Приглашение готово';
    btn.disabled = false;
    A.unlock();
  } catch (e) {
    btn.textContent = '👁 Не удалось, повторить';
    btn.disabled = false;
  }
}

function wireHostUi() {
  $('shareBtn').addEventListener('click', () => {
    if (host && host.code) { const b = $('shareBox'); b.style.display = b.style.display === 'block' ? 'none' : 'block'; } else startSharing();
  });
  $('soundBtn').addEventListener('click', toggleSound);
  const diffBtn = $('diffBtn');
  const showDiff = () => { diffBtn.textContent = '⚔ Сложность: ' + DIFF[state.diff].name.toUpperCase(); };
  showDiff();
  diffBtn.addEventListener('click', () => {
    const order = ['easy', 'normal', 'mega'];
    state.diff = order[(order.indexOf(state.diff) + 1) % 3];
    try { localStorage.setItem('kd_diff', state.diff); } catch (e) { /* ignore */ }
    showDiff();
    showMessage('Сложность: ' + DIFF[state.diff].name + '\nПрименится при перезапуске уровня', 3);
  });
  $('copyBtn').addEventListener('click', () => {
    const inp = $('shareLink');
    try { navigator.clipboard.writeText(inp.value); $('copyBtn').textContent = 'Скопировано ✓'; }
    catch (e) { if (inp.select) inp.select(); }
    setTimeout(() => { $('copyBtn').textContent = 'Скопировать ссылку'; }, 1800);
  });
  $('watchBtn').addEventListener('click', () => { const b = $('watchBox'); b.style.display = b.style.display === 'block' ? 'none' : 'block'; });
  $('watchGo').addEventListener('click', () => {
    const c = $('watchCode').value.trim().toUpperCase();
    if (c) window.location.search = '?watch=' + encodeURIComponent(c);
  });
}

// ---------------------------------------------------------------- главный цикл
const clock = new THREE.Clock();
let hudTimer = 0;
const fwdTmp = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  camera.getWorldPosition(head);
  camera.getWorldDirection(fwdTmp);
  A.setListener(head.x, head.z, fwdTmp.x, fwdTmp.z);

  if (GUEST) {
    guestFrame(dt, time);
    updateEnvLive(dt, time);
    updateSparks(dt);
    updateMessage(dt);
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.2;
      hpEl.textContent = '♥'.repeat(G.hp) + '♡'.repeat(Math.max(0, G.mh - G.hp));
      foeEl.textContent = foeText(state.enemies, G.bp);
      lvlEl.textContent = G.lv === TOWER_LV ? 'Башня дракона' : G.lv >= 0 ? 'Уровень ' + (G.lv + 1) + ' / ' + LEVELS.length + ' · ' + LEVELS[G.lv].name : '';
      wpnEl.textContent = G.w ? 'Оружие: ' + WEAPONS[G.w].name : '';
    }
    A.music(state.enemies.some((e) => !e.dead) ? 'battle' : 'calm');
    renderer.render(scene, camera);
    return;
  }

  if (vrActive) updateVR(dt); else updateDesktop(dt);
  clampRig();
  camera.getWorldPosition(head);
  if (weaponModel) {
    if (weaponModel.scale.x < 1) weaponModel.scale.setScalar(Math.min(1, weaponModel.scale.x + dt * 5));
    if (weaponModel.userData.tick) weaponModel.userData.tick(time, clamp(swordSpeed / 8, 0, 1));
  }
  updateEnvLive(dt, time);

  const playing = state.mode === 'play';
  if (playing) {
    if (WEAPONS[state.weapon].kind === 'bow') updateBow(dt); else updateMelee(dt);
  } else if (holder.userData.tip) holder.userData.tip.getWorldPosition(prevTip);

  for (const g of state.enemies) { if (playing || g.dead) updateEnemy(g, dt, time); }
  if (playing) {
    updateGuard(dt);
    if (hudDirty) { hudDirty = false; drawHud(); }
    separateEnemies();
    updateArrows(dt);
    if (state.inTower) updateTower(dt, time);
    else { levelClearCheck(); updatePickup(dt, time); }
  } else {
    if (state.inTower && state.tower) updateTower(dt, time);
    if (state.pickup && state.pickup.id !== 'gate') state.pickup.obj.rotation.y += dt;
  }

  if (state.mode === 'dead' || state.mode === 'victory') {
    state.timer -= dt;
    if (state.timer <= 0) {
      if (state.mode === 'dead') loadLevel(state.level, 'Новая попытка!\n' + LEVELS[state.level].name);
      else if (state.ending) {
        state.got = [];
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
        loadLevel(0, 'Новая игра\nУровень 1: ' + LEVELS[0].name);
      } else loadLevel(state.level + 1 < LEVELS.length ? state.level + 1 : 0);
    }
  }

  if (state.flame) {
    state.flame.t -= dt;
    if (state.flame.t <= 0) { state.flame = null; flameG.visible = false; }
    else placeFlame(mouthPos(state.flame.src, tmp), state.flame.to, time);
  }
  updateSparks(dt);
  if (flashT > 0) { flashT -= dt; flash.material.opacity = Math.max(0, flashT) * 0.9; } else flash.material.opacity = 0;
  updateMessage(dt);
  updateMusic(dt);
  netUpdate(dt);

  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.2;
    hpEl.textContent = '♥'.repeat(state.hp) + '♡'.repeat(Math.max(0, state.stats.maxHp - state.hp));
    foeEl.textContent = foeText();
    lvlEl.textContent = state.inTower ? 'Башня дракона' : 'Уровень ' + (state.level + 1) + ' / ' + LEVELS.length + ' · ' + LEVELS[state.level].name;
    if (vrActive) drawHud();
  }
  renderer.render(scene, camera);
});

// ---------------------------------------------------------------- старт
(function start() {
  window.__kd = { state, rig, camera, startSharing, applySnapshot, G, equip, bowStart, bowRelease, cycleWeapon };   // для отладки и тестов
  if (GUEST) { startGuestMode(); return; }
  wireHostUi();
  const raw = params.get('level');
  const param = raw === 'tower' ? 9 : parseInt(raw, 10);
  if (param >= 1 && param <= LEVELS.length + 1) {
    state.level = Math.min(param, LEVELS.length) - 1;
    state.got = LEVELS.slice(0, param - 1).map((l) => l.reward).filter((id) => REWARDS[id] && id !== 'gate');
    loadLevel(state.level);
    if (param === LEVELS.length + 1) enterTower();
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
