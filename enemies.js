import * as THREE from 'three';

/* =====================================================================
   Враги. У каждого типа своя собственная модель (не клонированная
   «капсула с ушами»): гоблин, паук, скелет-шахтёр, голем, болотник,
   воин ордена, огненное создание, страж дракона, дракон.
   У боссов — свои отличия (корона, плащ, рога, кристаллы...).
   ===================================================================== */

export const ENEMY = {
  goblin:   { name: 'Гоблин',            hp: 100, speed: 1.3, windup: 0.9,  skin: 0x5fa043, cloth: 0x5a3b22, eyes: 0xffe14d, dmg: 1, hitR: 0.55, height: 1.7, reach: 1.7 },
  spider:   { name: 'Паук',              hp: 90,  speed: 2.1, windup: 0.55, skin: 0x2b2b33, cloth: 0x1a1a20, eyes: 0xff2a2a, dmg: 1, hitR: 0.6,  height: 0.9, reach: 1.5 },
  skeleton: { name: 'Скелет-шахтёр',     hp: 110, speed: 1.4, windup: 0.8,  skin: 0xe8e4d0, cloth: 0x8a8a80, eyes: 0x66ccff, dmg: 1, hitR: 0.5,  height: 1.7, reach: 1.7 },
  golem:    { name: 'Каменный голем',    hp: 230, speed: 0.8, windup: 1.2,  skin: 0x8a8f99, cloth: 0x6a6f79, eyes: 0xff8a2a, dmg: 1, hitR: 0.75, height: 2.1, reach: 1.9 },
  bog:      { name: 'Болотник',          hp: 120, speed: 1.5, windup: 0.8,  skin: 0x3f6b6b, cloth: 0x24403a, eyes: 0xb8ff5a, dmg: 1, hitR: 0.6,  height: 1.6, reach: 1.7 },
  dark:     { name: 'Воин ордена',       hp: 140, speed: 1.6, windup: 0.7,  skin: 0x2c2c3a, cloth: 0x16161e, eyes: 0xff3a3a, dmg: 1, hitR: 0.55, height: 1.9, reach: 1.8 },
  fire:     { name: 'Огненное создание', hp: 120, speed: 1.8, windup: 0.6,  skin: 0xff7a1a, cloth: 0xb02a10, eyes: 0xffff66, dmg: 1, hitR: 0.55, height: 1.9, reach: 1.7, hover: 0.25 },
  elite:    { name: 'Страж дракона',     hp: 180, speed: 1.7, windup: 0.6,  skin: 0x9a3a3a, cloth: 0x3a1c1c, eyes: 0xffd24a, dmg: 1, hitR: 0.55, height: 1.9, reach: 2.2 },
  dragon:   { name: 'Дракон',            hp: 520, speed: 1.1, windup: 0.9,  skin: 0x8a2222, cloth: 0x5a1414, eyes: 0xffe14d, dmg: 2, hitR: 0.9,  height: 2.2, reach: 2.0, fire: true, phases: true },
};

const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const caps = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
const tor = (r, t, rs = 6, ts = 14) => new THREE.TorusGeometry(r, t, rs, ts);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o });
const glow = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });

function M(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

// ------------------------------------------------------------------ гоблин
function goblin(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const dark = std(0x3a2a1a);
  const eye = glow(spec.eyes);
  const ear = cone(0.08, 0.35, 8);
  const arm = new THREE.Group(); arm.position.set(0.36, 1.15, 0.05);
  const club = new THREE.Group(); club.position.y = -0.5;
  club.add(M(cyl(0.04, 0.05, 0.7), dark, 0, -0.1, 0), M(sph(0.14, 10, 8), dark, 0, -0.5, 0));
  if (boss) for (let i = 0; i < 6; i++) { const a = i * 1.047; club.add(M(cone(0.03, 0.1, 5), glow(0xbbbbbb), Math.cos(a) * 0.14, -0.5, Math.sin(a) * 0.14, 0, 0, Math.PI / 2 * Math.cos(a))); }
  arm.add(M(cyl(0.07, 0.07, 0.5), skin, 0, -0.25, 0), club);
  const mouth = new THREE.Object3D(); mouth.position.set(0, 1.36, 0.24);
  model.add(
    M(caps(0.28, 0.45), cloth, 0, 0.8, 0), M(sph(0.24, 14, 12), skin, 0, 1.42, 0),
    M(ear, skin, -0.3, 1.5, 0, 0, 0, Math.PI / 2 + 0.3), M(ear, skin, 0.3, 1.5, 0, 0, 0, -Math.PI / 2 - 0.3),
    M(sph(0.04, 8, 8), eye, -0.09, 1.47, 0.2), M(sph(0.04, 8, 8), eye, 0.09, 1.47, 0.2),
    M(cone(0.04, 0.12, 6), skin, 0, 1.4, 0.26, Math.PI / 2, 0, 0),
    M(cyl(0.08, 0.08, 0.5), skin, -0.12, 0.25, 0), M(cyl(0.08, 0.08, 0.5), skin, 0.12, 0.25, 0),
    M(cyl(0.07, 0.07, 0.5), skin, -0.36, 0.95, 0.05), arm, mouth,
  );
  if (boss) {                                        // главарь: корона из клыков и ожерелье из костей
    const gold = std(0xd9a933, { metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < 6; i++) { const a = i * 1.047; model.add(M(cone(0.05, 0.2, 5), gold, Math.cos(a) * 0.2, 1.66, Math.sin(a) * 0.2)); }
    for (let i = 0; i < 8; i++) { const a = i * 0.785; model.add(M(sph(0.05, 6, 6), glow(0xeeeedd), Math.cos(a) * 0.3, 1.1, Math.sin(a) * 0.3)); }
  }
  return { model, arm, mouth };
}

// ------------------------------------------------------------------ паук
function spider(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const eye = glow(spec.eyes);
  const abd = M(sph(0.38, 12, 10), cloth, 0, 0.55, -0.15); abd.scale.set(1, 0.75, 1.4);
  model.add(abd, M(sph(0.22, 10, 8), skin, 0, 0.55, 0.5));
  [[-0.09, 0.62], [0.09, 0.62], [-0.05, 0.55], [0.05, 0.55]].forEach(([x, y]) => model.add(M(sph(0.035, 6, 6), eye, x, y, 0.69)));
  const legGeo = cyl(0.03, 0.025, 0.85, 5);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) model.add(M(legGeo, skin, s * 0.5, 0.35, -0.3 + i * 0.28, 0, s * (i - 1.5) * 0.25, s * 1.1));
  // красный рисунок на спине
  model.add(M(sph(0.09, 6, 6), glow(0xaa1010), 0, 0.82, -0.2));
  const arm = new THREE.Group(); arm.position.set(0.18, 0.6, 0.45);
  arm.add(M(cyl(0.05, 0.02, 0.9, 6), skin, 0, -0.45, 0));
  model.add(arm);
  const mouth = new THREE.Object3D(); mouth.position.set(0, 0.5, 0.7); model.add(mouth);
  if (boss) {                                       // матка: огромное брюшко с коконами и шипы-корона
    const big = M(sph(0.6, 12, 10), cloth, 0, 0.7, -1.0); big.scale.set(1, 0.85, 1.3);
    model.add(big);
    for (let i = 0; i < 6; i++) model.add(M(sph(0.1, 6, 6), glow(0xf2f2e0), Math.cos(i) * 0.4, 1.05, -1.0 + Math.sin(i * 2) * 0.5));
    for (let i = 0; i < 5; i++) model.add(M(cone(0.04, 0.22, 5), glow(0xaa1010), (i - 2) * 0.07, 0.82, 0.5));
  }
  return { model, arm, mouth };
}

// ------------------------------------------------------------------ скелет-шахтёр
function skeleton(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const bone = skin;
  const dark = std(0x0d0d10);
  const eye = glow(spec.eyes);
  model.add(M(box(0.34, 0.12, 0.2), bone, 0, 0.62, 0), M(cyl(0.035, 0.035, 0.5, 6), bone, 0, 0.92, 0));
  for (let i = 0; i < 4; i++) { const r = M(tor(0.2 - 0.02 * i, 0.016), bone, 0, 0.78 + i * 0.1, 0, Math.PI / 2, 0, 0); r.scale.y = 0.65; model.add(r); }
  model.add(M(box(0.5, 0.05, 0.08), bone, 0, 1.18, 0));             // ключицы
  const skull = M(sph(0.17, 12, 10), bone, 0, 1.4, 0);
  const jaw = M(box(0.16, 0.05, 0.14), bone, 0, 1.27, 0.06);
  model.add(skull, jaw, M(sph(0.045, 8, 8), dark, -0.07, 1.42, 0.14), M(sph(0.045, 8, 8), dark, 0.07, 1.42, 0.14),
    M(sph(0.02, 6, 6), eye, -0.07, 1.42, 0.17), M(sph(0.02, 6, 6), eye, 0.07, 1.42, 0.17));
  // шахтёрская каска с лампой
  model.add(M(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x8a6a2a, { metalness: 0.5 }), 0, 1.45, 0),
    M(sph(0.04, 8, 8), glow(0xfff0a0), 0, 1.55, 0.17));
  for (const s of [-1, 1]) {
    model.add(M(cyl(0.035, 0.03, 0.34), bone, s * 0.1, 0.43, 0), M(cyl(0.03, 0.03, 0.34), bone, s * 0.1, 0.17, 0.02), M(box(0.07, 0.04, 0.14), bone, s * 0.1, 0.02, 0.05));
  }
  model.add(M(cyl(0.03, 0.03, 0.55), bone, -0.28, 0.95, 0.03));
  const arm = new THREE.Group(); arm.position.set(0.28, 1.15, 0);
  arm.add(M(cyl(0.03, 0.03, 0.5), bone, 0, -0.25, 0));
  const pick = new THREE.Group(); pick.position.y = -0.5;                      // кирка
  pick.add(M(cyl(0.025, 0.025, 0.75, 6), std(0x5b3d22), 0, -0.2, 0),
    M(cone(0.05, 0.3, 5), std(0x77777f, { metalness: 0.6 }), 0.17, -0.58, 0, 0, 0, -Math.PI / 2),
    M(cone(0.05, 0.3, 5), std(0x77777f, { metalness: 0.6 }), -0.17, -0.58, 0, 0, 0, Math.PI / 2));
  arm.add(pick);
  model.add(arm);
  return { model, arm, mouth: null };
}

// ------------------------------------------------------------------ каменный голем
function golem(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const col = boss ? 0xc27bff : 0xff8a2a;
  const crys = glow(col);
  model.add(M(box(0.9, 0.95, 0.6), skin, 0, 1.05, 0), M(box(0.55, 0.3, 0.5), cloth, 0, 0.55, 0),
    M(box(0.42, 0.38, 0.4), skin, 0, 1.78, 0.05), M(box(0.09, 0.05, 0.05), glow(spec.eyes), -0.1, 1.8, 0.26), M(box(0.09, 0.05, 0.05), glow(spec.eyes), 0.1, 1.8, 0.26),
    M(new THREE.DodecahedronGeometry(0.32), skin, -0.62, 1.4, 0), M(box(0.3, 0.8, 0.32), skin, -0.72, 0.85, 0),
    M(box(0.34, 0.7, 0.36), cloth, -0.24, 0.2, 0), M(box(0.34, 0.7, 0.36), cloth, 0.24, 0.2, 0));
  const ncr = boss ? 7 : 3;
  for (let i = 0; i < ncr; i++) model.add(M(new THREE.OctahedronGeometry(0.14 + (i % 3) * 0.04), crys, (i - (ncr - 1) / 2) * 0.22, 1.55 + (i % 2) * 0.2, -0.38, i, i * 2, 0));
  if (boss) model.add(M(sph(0.16, 10, 8), crys, 0, 1.1, 0.32));       // светящееся ядро на груди
  const arm = new THREE.Group(); arm.position.set(0.62, 1.4, 0);
  arm.add(M(new THREE.DodecahedronGeometry(0.32), skin, 0, 0, 0), M(box(0.3, 0.55, 0.32), skin, 0, -0.4, 0), M(box(0.44, 0.44, 0.44), cloth, 0, -0.85, 0));
  model.add(arm);
  return { model, arm, mouth: null };
}

// ------------------------------------------------------------------ болотник
function bog(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const eye = glow(spec.eyes);
  const moss = std(0x3d5a2a);
  const body = M(sph(0.38, 12, 10), cloth, 0, 0.85, -0.05); body.scale.set(1, 1.1, 0.9);
  const belly = M(sph(0.28, 10, 8), skin, 0, 0.8, 0.15);
  const head = M(sph(0.26, 12, 10), skin, 0, 1.35, 0.2); head.scale.set(1.2, 0.9, 1.1);
  model.add(body, belly, head, M(box(0.32, 0.04, 0.08), std(0x0b1a1a), 0, 1.27, 0.42),
    M(sph(0.07, 8, 8), eye, -0.14, 1.5, 0.3), M(sph(0.07, 8, 8), eye, 0.14, 1.5, 0.3),
    M(cone(0.07, 0.4, 4), skin, -0.34, 1.4, 0.1, 0, 0, Math.PI / 2), M(cone(0.07, 0.4, 4), skin, 0.34, 1.4, 0.1, 0, 0, -Math.PI / 2),
    M(cyl(0.09, 0.07, 0.5), skin, -0.18, 0.3, 0.05), M(cyl(0.09, 0.07, 0.5), skin, 0.18, 0.3, 0.05),
    M(cyl(0.07, 0.05, 0.7), skin, -0.42, 0.65, 0.1, 0, 0, 0.25),
    M(sph(0.12, 6, 6), moss, -0.3, 1.2, -0.1), M(sph(0.1, 6, 6), moss, 0.28, 1.15, -0.15));
  for (let i = 0; i < 4; i++) model.add(M(cone(0.05, 0.22, 4), skin, 0, 1.25 - i * 0.18, -0.38 - i * 0.02, -0.7, 0, 0));
  const arm = new THREE.Group(); arm.position.set(0.4, 1.0, 0.1);
  arm.add(M(cyl(0.07, 0.05, 0.55), skin, 0, -0.28, 0));
  for (let i = -1; i <= 1; i++) arm.add(M(cone(0.03, 0.2, 4), glow(0xd8e0c0), i * 0.06, -0.66, 0, Math.PI, 0, 0));
  model.add(arm);
  const mouth = new THREE.Object3D(); mouth.position.set(0, 1.3, 0.42); model.add(mouth);
  if (boss) {                                       // хранитель: каменная маска, тростниковые рога, руны
    model.add(M(box(0.34, 0.38, 0.05), std(0x777770), 0, 1.36, 0.5));
    for (const s of [-1, 1]) {
      model.add(M(cyl(0.025, 0.02, 0.6, 5), std(0x7a6a3a), s * 0.2, 1.8, 0.1, 0, 0, -s * 0.5));
      model.add(M(cyl(0.02, 0.015, 0.3, 5), std(0x7a6a3a), s * 0.42, 2.05, 0.1, 0, 0, s * 0.5));
    }
    for (let i = 0; i < 4; i++) model.add(M(box(0.06, 0.06, 0.02), glow(0x66ffcc), -0.12 + i * 0.08, 0.9 + (i % 2) * 0.12, 0.42));
  }
  return { model, arm, mouth };
}

// ------------------------------------------------------------------ воин тёмного ордена
function dark(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const steel = std(0x3a3a48, { metalness: 0.7, roughness: 0.4 });
  const trim = std(0x8a1f2b);
  const torso = M(caps(0.3, 0.4), steel, 0, 0.95, 0);
  const helmet = M(sph(0.24, 14, 12), steel, 0, 1.55, 0);
  model.add(torso, M(cyl(0.31, 0.31, 0.06, 12), trim, 0, 0.7, 0), helmet,
    M(box(0.3, 0.04, 0.05), glow(spec.eyes), 0, 1.55, 0.21), M(cone(0.08, 0.4, 6), trim, 0, 1.85, -0.05, -0.4, 0, 0),
    M(sph(0.2, 10, 8), steel, -0.4, 1.35, 0), M(sph(0.2, 10, 8), steel, 0.4, 1.35, 0),
    M(cyl(0.1, 0.09, 0.6), steel, -0.14, 0.3, 0), M(cyl(0.1, 0.09, 0.6), steel, 0.14, 0.3, 0),
    M(cyl(0.32, 0.32, 0.05, 16), steel, -0.5, 1.0, 0.2, Math.PI / 2, 0, 0), M(cyl(0.12, 0.12, 0.06, 12), trim, -0.5, 1.0, 0.23, Math.PI / 2, 0, 0),
    M(cyl(0.07, 0.07, 0.4), steel, -0.42, 1.2, 0.05, 0, 0, 0.3));
  const arm = new THREE.Group(); arm.position.set(0.4, 1.2, 0.05);
  arm.add(M(cyl(0.08, 0.07, 0.5), steel, 0, -0.25, 0), M(box(0.07, 0.9, 0.02), std(0xe8eef5, { metalness: 0.9, roughness: 0.2 }), 0, -0.95, 0),
    M(box(0.3, 0.05, 0.05), std(0xd9a933, { metalness: 0.7 }), 0, -0.52, 0), M(cyl(0.025, 0.025, 0.14), trim, 0, -0.45, 0));
  model.add(arm);
  if (boss) {                                       // чёрный рыцарь: рога, красный плащ, раскалённый клинок
    for (const s of [-1, 1]) model.add(M(cone(0.06, 0.4, 6), steel, s * 0.22, 1.72, 0, 0, 0, -s * 0.7));
    const cape = M(new THREE.PlaneGeometry(0.8, 1.2), std(0x7a1020, { side: THREE.DoubleSide }), 0, 1.0, -0.32);
    model.add(cape);
    arm.add(M(box(0.03, 0.88, 0.03), glow(0xff3030), 0, -0.95, 0.02));
  }
  return { model, arm, mouth: null };
}

// ------------------------------------------------------------------ огненное создание
function fire(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const flame = new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = glow(0xffb040);
  const shell = M(new THREE.DodecahedronGeometry(0.42), cloth, 0, 1.0, 0); shell.scale.set(1, 1.1, 0.9);
  const head = M(new THREE.IcosahedronGeometry(0.22, 0), skin, 0, 1.58, 0.05);
  model.add(shell, M(new THREE.IcosahedronGeometry(0.3, 1), core, 0, 1.0, 0.18), head,
    M(sph(0.05, 6, 6), glow(0xffffcc), -0.08, 1.62, 0.22), M(sph(0.05, 6, 6), glow(0xffffcc), 0.08, 1.62, 0.22),
    M(cone(0.3, 0.8, 8), flame, 0, 0.4, 0, Math.PI, 0, 0),
    M(cyl(0.07, 0.05, 0.6), skin, -0.45, 1.0, 0, 0, 0, 0.3));
  const flames = [];
  const nf = boss ? 9 : 6;
  for (let i = 0; i < nf; i++) {
    const a = (i / nf) * Math.PI * 2;
    const f = M(cone(0.1 + (boss ? 0.04 : 0), 0.45 + (i % 2) * 0.2, 6), flame, Math.cos(a) * 0.28, 1.85, Math.sin(a) * 0.28);
    flames.push(f); model.add(f);
  }
  const arm = new THREE.Group(); arm.position.set(0.45, 1.2, 0);
  arm.add(M(cyl(0.08, 0.05, 0.6), skin, 0, -0.3, 0), M(sph(0.15, 8, 8), core, 0, -0.66, 0), M(cone(0.1, 0.3, 6), flame, 0, -0.85, 0, Math.PI, 0, 0));
  model.add(arm);
  const mouth = new THREE.Object3D(); mouth.position.set(0, 1.52, 0.26); model.add(mouth);
  if (boss) for (let i = 0; i < 6; i++) { const a = i * 1.047; model.add(M(cone(0.06, 0.35, 5), std(0x2a1a14), Math.cos(a) * 0.2, 1.8, Math.sin(a) * 0.2, 0.3 * Math.sin(a), 0, -0.3 * Math.cos(a))); }
  const tick = (t) => flames.forEach((f, i) => { f.scale.y = 1 + 0.35 * Math.sin(t * 9 + i * 1.7); f.rotation.z = 0.18 * Math.sin(t * 6 + i); });
  return { model, arm, mouth, tick };
}

// ------------------------------------------------------------------ страж дракона
function elite(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const armor = std(0x7a2a2a, { metalness: 0.6, roughness: 0.45 });
  const goldM = std(0xd0a030, { metalness: 0.8, roughness: 0.3 });
  const wing = std(0xd0a030, { metalness: 0.6, side: THREE.DoubleSide });
  model.add(M(caps(0.28, 0.42), armor, 0, 0.95, 0), M(sph(0.23, 14, 12), armor, 0, 1.55, 0), M(box(0.28, 0.04, 0.05), glow(spec.eyes), 0, 1.55, 0.2),
    M(new THREE.PlaneGeometry(0.35, 0.28), wing, -0.24, 1.72, 0, 0, 0, 0.6), M(new THREE.PlaneGeometry(0.35, 0.28), wing, 0.24, 1.72, 0, 0, 0, -0.6),
    M(cyl(0.09, 0.08, 0.6), cloth, -0.13, 0.3, 0), M(cyl(0.09, 0.08, 0.6), cloth, 0.13, 0.3, 0),
    M(sph(0.2, 10, 8), armor, -0.38, 1.35, 0), M(cone(0.06, 0.3, 5), goldM, -0.38, 1.6, 0), M(sph(0.2, 10, 8), armor, 0.38, 1.35, 0), M(cone(0.06, 0.3, 5), goldM, 0.38, 1.6, 0),
    M(cyl(0.07, 0.06, 0.5), armor, -0.4, 0.95, 0.15, 1.0, 0, 0.1), M(box(0.3, 0.08, 0.12), goldM, 0, 0.7, 0.04));
  const arm = new THREE.Group(); arm.position.set(0.38, 1.2, 0.05);
  arm.add(M(cyl(0.07, 0.07, 0.5), armor, 0, -0.25, 0),
    M(cyl(0.03, 0.03, 1.5), std(0x5b3d22), 0, -0.9, 0), M(box(0.28, 0.32, 0.03), std(0xe8eef5, { metalness: 0.9, roughness: 0.2 }), 0.14, -1.55, 0),
    M(cone(0.04, 0.3, 5), goldM, 0, -1.75, 0, Math.PI, 0, 0));
  model.add(arm);
  if (boss) {                                       // командир: плащ и знамя
    model.add(M(new THREE.PlaneGeometry(0.8, 1.3), std(0xa01820, { side: THREE.DoubleSide }), 0, 1.0, -0.3),
      M(cyl(0.02, 0.02, 1.8), std(0x5b3d22), 0.1, 1.7, -0.4), M(new THREE.PlaneGeometry(0.5, 0.35), std(0xa01820, { side: THREE.DoubleSide }), 0.35, 2.35, -0.4),
      M(sph(0.07, 8, 8), glow(0xffd24a), 0.35, 2.35, -0.38));
  }
  return { model, arm, mouth: null };
}

// ------------------------------------------------------------------ дракон
function dragon(spec, skin, cloth) {
  const model = new THREE.Group();
  const belly = std(0xc9a25a);
  const membrane = std(0x5a1a1a, { side: THREE.DoubleSide });
  const eye = glow(spec.eyes);
  const body = M(sph(0.72, 14, 12), skin, 0, 1.0, 0); body.scale.set(1, 0.9, 1.7);
  const bel = M(sph(0.6, 12, 10), belly, 0, 0.88, 0.1); bel.scale.set(0.9, 0.7, 1.5);
  model.add(body, bel, M(cyl(0.2, 0.34, 1.2, 10), skin, 0, 1.6, 1.05, 0.75, 0, 0), M(cone(0.34, 2.4, 8), skin, 0, 0.9, -2.0, -Math.PI / 2, 0, 0));
  for (let i = 0; i < 7; i++) model.add(M(cone(0.08, 0.3, 5), cloth, 0, 1.75 - i * 0.02, 0.9 - i * 0.37));

  // голова: череп, морда, ПОДВИЖНАЯ нижняя челюсть, рога, глаза
  const headG = new THREE.Group(); headG.position.set(0, 2.0, 1.45);
  const skull = M(sph(0.3, 12, 10), skin, 0, 0, 0); skull.scale.set(1, 0.85, 1.2);
  headG.add(skull, M(cone(0.22, 0.7, 8), skin, 0, -0.02, 0.5, Math.PI / 2, 0, 0),
    M(cone(0.07, 0.45, 6), cloth, -0.18, 0.22, -0.2, -0.6, 0, 0), M(cone(0.07, 0.45, 6), cloth, 0.18, 0.22, -0.2, -0.6, 0, 0),
    M(sph(0.06, 8, 8), eye, -0.17, 0.1, 0.18), M(sph(0.06, 8, 8), eye, 0.17, 0.1, 0.18),
    M(sph(0.03, 6, 6), glow(0xff6a1a), -0.07, 0.05, 0.82), M(sph(0.03, 6, 6), glow(0xff6a1a), 0.07, 0.05, 0.82));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.12, 0.05);
  jaw.add(M(cone(0.17, 0.62, 8), skin, 0, -0.02, 0.3, Math.PI / 2, 0, 0));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) jaw.add(M(cone(0.025, 0.09, 4), glow(0xf4f0e0), s * 0.09, 0.05, 0.2 + i * 0.12, Math.PI, 0, 0));
  headG.add(jaw);
  const mouth = new THREE.Object3D(); mouth.position.set(0, -0.1, 0.85); headG.add(mouth);
  model.add(headG);

  // крылья (машут)
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.5, 1.6, -0.2);
    w.add(M(cyl(0.05, 0.04, 2.3, 6), skin, s * 1.15, 0.3, 0, 0, 0, Math.PI / 2 * -s + s * 0.3), M(new THREE.PlaneGeometry(2.2, 1.4), membrane, s * 1.15, -0.1, -0.1, 0.1, 0, 0));
    model.add(w); wings.push(w);
  }
  for (const [x, z] of [[-0.55, -0.7], [0.55, -0.7], [-0.55, 0.7]]) model.add(M(cyl(0.14, 0.12, 0.8), skin, x, 0.4, z), M(cone(0.09, 0.2, 5), cloth, x, 0.02, z + 0.1, Math.PI / 2, 0, 0));
  const arm = new THREE.Group(); arm.position.set(0.6, 1.0, 0.8);
  arm.add(M(cyl(0.15, 0.12, 0.9), skin, 0, -0.45, 0), M(cone(0.16, 0.4, 6), cloth, 0, -1.05, 0, Math.PI, 0, 0));
  model.add(arm);
  const tick = (t) => wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.15 + 0.2 * Math.sin(t * 2.2)); });
  return { model, arm, mouth, headG, jaw, tick };
}

const BUILDERS = { goblin, spider, skeleton, golem, bog, dark, fire, elite, dragon };

export function buildModel(type, spec, skin, cloth, boss) {
  return (BUILDERS[type] || goblin)(spec, skin, cloth, boss);
}
