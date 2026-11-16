import * as THREE from 'three';

/* =====================================================================
   Враги. У каждого типа своя модель со СКЕЛЕТОМ: ноги с коленями, подвижный
   торс, свободная рука, паук — с восемью двухсуставными ногами и походкой
   «тетрапод» (ноги ходят парами по диагонали).
   Каждый строитель возвращает { model, arm, mouth, headG, jaw, tick }.
   tick(t, e) читает сглаженные поля: e.gait (фаза шага), e.wb (0..1 «иду»),
   e.armD (угол атакующей руки), e.k (0..1 замах), e.hitK (отдача от удара).
   ===================================================================== */

export const ENEMY = {
  goblin:   { name: 'Гоблин',            hp: 100, speed: 1.3, windup: 0.9,  skin: 0x5fa043, cloth: 0x5a3b22, eyes: 0xffe14d, dmg: 1, hitR: 0.55, height: 1.7, reach: 1.7, guard: 0.15 },
  spider:   { name: 'Паук',              hp: 90,  speed: 2.1, windup: 0.55, skin: 0x2b2b33, cloth: 0x1a1a20, eyes: 0xff2a2a, dmg: 1, hitR: 0.6,  height: 0.9, reach: 1.5, deadStyle: 'flip' },
  skeleton: { name: 'Скелет-шахтёр',     hp: 110, speed: 1.4, windup: 0.8,  skin: 0xe8e4d0, cloth: 0x8a8a80, eyes: 0x66ccff, dmg: 1, hitR: 0.5,  height: 1.7, reach: 1.7, guard: 0.3 },
  golem:    { name: 'Каменный голем',    hp: 230, speed: 0.8, windup: 1.2,  skin: 0x8a8f99, cloth: 0x6a6f79, eyes: 0xff8a2a, dmg: 1, hitR: 0.75, height: 2.1, reach: 1.9, guard: 0.45 },
  bog:      { name: 'Болотник',          hp: 120, speed: 1.5, windup: 0.8,  skin: 0x3f6b6b, cloth: 0x24403a, eyes: 0xb8ff5a, dmg: 1, hitR: 0.6,  height: 1.6, reach: 1.7, guard: 0.2 },
  dark:     { name: 'Воин ордена',       hp: 140, speed: 1.6, windup: 0.7,  skin: 0x2c2c3a, cloth: 0x16161e, eyes: 0xff3a3a, dmg: 1, hitR: 0.55, height: 1.9, reach: 1.8, guard: 0.7 },
  fire:     { name: 'Огненное создание', hp: 120, speed: 1.8, windup: 0.6,  skin: 0xff7a1a, cloth: 0xb02a10, eyes: 0xffff66, dmg: 1, hitR: 0.55, height: 1.9, reach: 1.7, hover: 0.25 },
  elite:    { name: 'Страж дракона',     hp: 180, speed: 1.7, windup: 0.6,  skin: 0x9a3a3a, cloth: 0x3a1c1c, eyes: 0xffd24a, dmg: 1, hitR: 0.55, height: 1.9, reach: 2.2, guard: 0.6 },
  dragon:   { name: 'Дракон',            hp: 520, speed: 1.1, windup: 0.9,  skin: 0x8a2222, cloth: 0x5a1414, eyes: 0xffe14d, dmg: 2, hitR: 0.9,  height: 2.2, reach: 2.0, fire: true, phases: true, guard: 0.12 },
};

const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const caps = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 12);
const tor = (r, t, rs = 6, ts = 14) => new THREE.TorusGeometry(r, t, rs, ts);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o });
const glow = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function M(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
const G = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };

/* нога из двух звеньев: бедро + колено + голень + стопа. Вперёд = минус по X. */
function leg(mat, x, hipY, len, r, bootMat) {
  const hip = G(x, hipY, 0);
  const knee = G(0, -len / 2, 0);
  hip.add(M(cyl(r * 1.15, r * 0.9, len / 2 + r * 0.4), mat, 0, -len / 4, 0), M(sph(r * 0.95, 8, 6), mat, 0, -len / 2, 0));
  knee.add(M(cyl(r * 0.9, r * 0.7, len / 2 + r * 0.3), mat, 0, -len / 4, 0), M(box(r * 2, r * 0.9, r * 3.4), bootMat || mat, 0, -len / 2 + r * 0.3, r * 0.9));
  hip.add(knee);
  hip.userData.knee = knee;
  return hip;
}
function legs(model, mat, x, hipY, len, r, boot) {
  const L = leg(mat, -x, hipY, len, r, boot), R = leg(mat, x, hipY, len, r, boot);
  model.add(L, R);
  return [L, R];
}
function walkLegs([L, R], e, amp = 0.75) {
  const w = e.wb, p = e.gait;
  L.rotation.x = -Math.sin(p) * amp * w;
  R.rotation.x = Math.sin(p) * amp * w;
  L.userData.knee.rotation.x = Math.max(0, Math.cos(p)) * amp * 1.4 * w + 0.05;
  R.userData.knee.rotation.x = Math.max(0, -Math.cos(p)) * amp * 1.4 * w + 0.05;
}

/* общая анимация торса: качание при ходьбе, замах, отдача от удара, дыхание */
function torsoMotion(upper, e, t, lean = 1) {
  const w = e.wb;
  const strike = e.st === 'strike' ? 0.28 : 0;
  upper.rotation.x = (0.07 * w - e.k * 0.32 + strike - e.hitK * 0.35) * lean;
  upper.rotation.y = Math.sin(e.gait) * 0.14 * w;
  upper.rotation.z = Math.sin(e.gait * 0.5 + 1) * 0.04 * w;
  const br = 1 + 0.015 * Math.sin(t * 2.2 + e.id);
  upper.scale.y = br;
  upper.position.y = upper.userData.py + Math.abs(Math.cos(e.gait)) * 0.045 * w;
}
function mkUpper(py) { const u = G(0, py, 0); u.userData.py = py; return u; }

// ------------------------------------------------------------------ гоблин
function goblin(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const dark = std(0x3a2a1a), leather = std(0x6b4a2a), eye = glow(spec.eyes), tooth = std(0xf0ecd0);
  const PY = 0.72;
  const up = mkUpper(PY);
  const U = (g, m, x, y, z, rx, ry, rz) => up.add(M(g, m, x, y - PY, z, rx, ry, rz));
  const lg = legs(model, skin, 0.13, PY, 0.7, 0.075, leather);
  model.add(M(box(0.34, 0.14, 0.24), leather, 0, PY - 0.03, 0));              // набедренная повязка
  U(caps(0.26, 0.34), cloth, 0, 0.98, 0);
  U(sph(0.27, 12, 10), skin, 0, 0.85, 0.12).scale.set(1, 0.9, 0.75);          // пузо
  U(cyl(0.285, 0.285, 0.07, 12), leather, 0, 0.72, 0);                        // пояс
  const headG = G(0, 1.42 - PY, 0.04); up.add(headG);
  const head = M(sph(0.25, 16, 12), skin, 0, 0, 0); head.scale.set(1.05, 0.95, 1);
  const ear = cone(0.08, 0.42, 8);
  const jaw = G(0, -0.12, 0.08); jaw.add(M(box(0.2, 0.07, 0.17), skin, 0, 0, 0.06));
  for (const s of [-1, 1]) jaw.add(M(cone(0.018, 0.07, 4), tooth, s * 0.07, 0.05, 0.12));
  headG.add(head, M(ear, skin, -0.3, 0.08, 0, 0, 0, Math.PI / 2 + 0.35), M(ear, skin, 0.3, 0.08, 0, 0, 0, -Math.PI / 2 - 0.35),
    M(sph(0.055, 8, 8), glow(0xffffff), -0.1, 0.05, 0.2), M(sph(0.055, 8, 8), glow(0xffffff), 0.1, 0.05, 0.2),
    M(sph(0.03, 8, 8), eye, -0.1, 0.05, 0.245), M(sph(0.03, 8, 8), eye, 0.1, 0.05, 0.245),
    M(box(0.24, 0.035, 0.05), dark, 0, 0.14, 0.2, -0.3, 0, 0), M(cone(0.05, 0.16, 6), skin, 0, -0.02, 0.27, Math.PI / 2, 0, 0), jaw);
  const armL = G(-0.37, 1.18 - PY, 0.04); armL.add(M(cyl(0.065, 0.055, 0.55), skin, 0, -0.27, 0), M(sph(0.07, 8, 8), skin, 0, -0.56, 0));
  const arm = G(0.37, 1.18 - PY, 0.04);
  const club = G(0, -0.52, 0);
  club.add(M(cyl(0.04, 0.06, 0.72), dark, 0, -0.1, 0), M(sph(0.15, 12, 10), dark, 0, -0.52, 0));
  for (let i = 0; i < (boss ? 7 : 3); i++) { const a = i * 0.9; club.add(M(cone(0.025, 0.12, 5), glow(0xb8b8b8), Math.cos(a) * 0.15, -0.5 + Math.sin(i) * 0.06, Math.sin(a) * 0.15, Math.sin(a) * 1.5, 0, -Math.cos(a) * 1.5)); }
  arm.add(M(cyl(0.075, 0.06, 0.55), skin, 0, -0.27, 0), M(sph(0.085, 8, 8), skin, 0, -0.55, 0), club);
  up.add(armL, arm, M(sph(0.1, 8, 6), leather, -0.34, 1.3 - PY, 0), M(sph(0.1, 8, 6), leather, 0.34, 1.3 - PY, 0));
  model.add(up);
  const mouth = new THREE.Object3D(); mouth.position.set(0, -0.1, 0.24); headG.add(mouth);
  if (boss) {
    const gold = std(0xd9a933, { metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < 7; i++) { const a = i * 0.9; headG.add(M(cone(0.05, 0.22, 5), gold, Math.cos(a) * 0.2, 0.26, Math.sin(a) * 0.2)); }
    for (let i = 0; i < 9; i++) { const a = i * 0.7; up.add(M(sph(0.05, 6, 6), glow(0xeeeedd), Math.cos(a) * 0.3, 1.1 - PY, Math.sin(a) * 0.3 + 0.05)); }
  }
  const tick = (t, e) => {
    walkLegs(lg, e); torsoMotion(up, e, t);
    armL.rotation.x = Math.sin(e.gait) * 0.7 * e.wb;
    headG.rotation.x = e.k * 0.3 - e.hitK * 0.3 + Math.sin(t * 1.7 + e.id) * 0.03;
    headG.rotation.y = Math.sin(t * 0.9 + e.id) * 0.12 * (1 - e.k);
    jaw.rotation.x = e.k * 0.5 + (e.st === 'strike' ? 0.4 : 0);
  };
  return { model, arm, mouth, tick };
}

// ------------------------------------------------------------------ паук (8 двухсуставных ног)
function spider(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const eyeM = glow(spec.eyes), fang = std(0xe8dcc0, { roughness: 0.4 });
  const pad = std(0x3a3a46, { roughness: 0.5 });
  const BODY_Y = 0.52;
  const body = G(0, BODY_Y, 0); model.add(body);
  // брюшко с узором, грудь, голова
  const abd = M(sph(0.4, 16, 12), cloth, 0, 0.06, -0.52); abd.scale.set(1, 0.85, 1.35);
  const thorax = M(sph(0.26, 14, 10), skin, 0, 0, 0.0); thorax.scale.set(1, 0.7, 1.2);
  const front = G(0, 0.02, 0.28);                                            // голова поднимается при замахе
  front.add(M(sph(0.2, 14, 10), skin, 0, 0, 0.1));
  for (const [x, y, s] of [[-0.07, 0.07, 0.045], [0.07, 0.07, 0.045], [-0.13, 0.04, 0.03], [0.13, 0.04, 0.03], [-0.035, 0.12, 0.025], [0.035, 0.12, 0.025]])
    front.add(M(sph(s, 8, 8), eyeM, x, y, 0.27));
  const armG = G(0, -0.06, 0.28);                                            // хелицеры (клыки) — «arm»
  for (const s of [-1, 1]) armG.add(M(cone(0.04, 0.26, 6), fang, s * 0.07, -0.08, 0.1, 0.4, 0, 0), M(sph(0.055, 8, 6), skin, s * 0.07, 0, 0.0));
  front.add(armG);
  const palps = [];
  for (const s of [-1, 1]) { const p = G(s * 0.16, -0.04, 0.3); p.add(M(cyl(0.025, 0.02, 0.32, 6), skin, 0, 0, 0.14, Math.PI / 2, 0, 0), M(sph(0.035, 6, 6), pad, 0, 0, 0.3)); front.add(p); palps.push(p); }
  body.add(abd, thorax, front);
  // узор «песочные часы» на брюшке
  body.add(M(new THREE.OctahedronGeometry(0.09), glow(0xcc1111), 0, 0.34, -0.48));
  body.add(M(new THREE.OctahedronGeometry(0.06), glow(0xcc1111), 0, 0.31, -0.7));
  for (let i = 0; i < 6; i++) body.add(M(cone(0.025, 0.1, 4), cloth, (i % 2 ? 1 : -1) * 0.12, 0.23, -0.2 - i * 0.12, 0, 0, 0));

  // восемь ног: бедро (поворот и подъём) + голень
  const L1 = 0.5, L2 = 0.95, UP = 1.0, DOWN = -1.15;
  const legsA = [];
  const yaw0 = [-0.75, -0.25, 0.3, 0.8];                                     // спереди назад
  const zPos = [0.22, 0.08, -0.06, -0.24];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const hip = G(s * 0.15, 0, zPos[i]);
    hip.scale.x = s;
    const fem = G(0, 0, 0);
    fem.add(M(cyl(0.04, 0.03, L1, 6), skin, L1 / 2, 0, 0, 0, 0, Math.PI / 2), M(sph(0.045, 8, 6), skin, 0, 0, 0));
    const tib = G(L1, 0, 0);
    tib.add(M(cyl(0.03, 0.012, L2, 5), skin, L2 / 2, 0, 0, 0, 0, Math.PI / 2), M(sph(0.04, 8, 6), pad, 0, 0, 0));
    fem.add(tib);
    hip.add(fem); body.add(hip);
    // тетрапод: (чёт.ряд, право) и (нечёт.ряд, лево) — одна группа
    const grp = ((i % 2 === 0) === (s === 1)) ? 0 : Math.PI;
    legsA.push({ hip, fem, tib, s, i, grp });
  }
  const mouth = new THREE.Object3D(); mouth.position.set(0, -0.05, 0.5); front.add(mouth);
  if (boss) {                                                                // матка: огромное брюшко с коконами и корона-шипы
    const big = M(sph(0.62, 16, 12), cloth, 0, 0.14, -1.15); big.scale.set(1, 0.9, 1.3);
    body.add(big);
    for (let i = 0; i < 7; i++) body.add(M(sph(0.11, 8, 8), glow(0xf2f2e0), Math.cos(i * 1.2) * 0.42, 0.62, -1.15 + Math.sin(i * 2) * 0.55));
    for (let i = 0; i < 5; i++) front.add(M(cone(0.04, 0.22, 5), glow(0xaa1010), (i - 2) * 0.07, 0.22, 0.05));
    body.add(M(new THREE.OctahedronGeometry(0.16), glow(0xcc1111), 0, 0.75, -1.15));
  }
  const tick = (t, e) => {
    const w = e.wb, k = e.k;
    const dead = e.dead ? clamp(e.deadT * 2, 0, 1) : 0;
    for (const l of legsA) {
      const ph = e.gait * 1.0 + l.grp + l.i * 0.0;
      const lift = Math.max(0, Math.sin(ph)) * w;
      const sweep = Math.cos(ph) * 0.34 * w;
      let up = UP + 0.38 * lift, dn = DOWN - 0.45 * lift;
      if (l.i === 0) { up += k * 0.9 + (e.st === 'strike' ? -0.5 : 0); dn -= k * 0.6; }      // передние ноги поднимаются в замахе
      if (e.st === 'windup' || e.st === 'strike') up += 0.0;
      const idle = (1 - w) * 0.04 * Math.sin(t * 1.5 + l.i * 1.3 + l.s);
      l.hip.rotation.y = l.s * (yaw0[l.i] + sweep) + 0;
      l.fem.rotation.z = up + idle + dead * 0.9;
      l.tib.rotation.z = dn - idle * 2 - dead * 1.6;
    }
    front.rotation.x = -k * 0.55 + (e.st === 'strike' ? 0.35 : 0) - e.hitK * 0.3;
    armG.rotation.x = k * 0.5 + (e.st === 'strike' ? 0.5 : 0);
    palps.forEach((p, i) => { p.rotation.x = Math.sin(t * 6 + i * 2) * 0.12 * (1 - w) + 0.1; p.rotation.y = (i ? -1 : 1) * 0.12; });
    body.position.y = BODY_Y + Math.abs(Math.sin(e.gait)) * 0.03 * w + Math.sin(t * 2 + e.id) * 0.012;
    body.rotation.z = Math.sin(e.gait) * 0.05 * w;
    body.rotation.x = Math.sin(e.gait * 2) * 0.02 * w;
    abd.scale.y = 0.85 + 0.03 * Math.sin(t * 2.5 + e.id);
  };
  return { model, arm: new THREE.Group(), mouth, tick };
}

// ------------------------------------------------------------------ скелет-шахтёр
function skeleton(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const bone = skin, dark = std(0x0d0d10), eye = glow(spec.eyes), rag = std(0x6a5a44), steel = std(0x77777f, { metalness: 0.6, roughness: 0.4 });
  const PY = 0.78;
  const up = mkUpper(PY);
  const U = (g, m, x, y, z, rx, ry, rz) => up.add(M(g, m, x, y - PY, z, rx, ry, rz));
  const lg = legs(model, bone, 0.1, PY, 0.74, 0.03, bone);
  model.add(M(box(0.34, 0.1, 0.18), bone, 0, PY - 0.02, 0), M(box(0.4, 0.2, 0.2), rag, 0, PY - 0.14, 0));
  U(cyl(0.032, 0.032, 0.5, 6), bone, 0, 0.98, 0);                              // позвоночник
  for (let i = 0; i < 5; i++) { const r = M(tor(0.2 - 0.018 * i, 0.014), bone, 0, 0.84 + i * 0.09, 0.02, Math.PI / 2, 0, 0); r.scale.y = 0.65; up.add(r); r.position.y -= PY; }
  U(box(0.54, 0.045, 0.08), bone, 0, 1.24, 0);
  const headG = G(0, 1.4 - PY, 0.02); up.add(headG);
  const skull = M(sph(0.17, 14, 12), bone, 0, 0.0, 0); skull.scale.set(1, 1.05, 1.05);
  const jaw = G(0, -0.1, 0.06); jaw.add(M(box(0.15, 0.05, 0.13), bone, 0, 0, 0.04));
  for (let i = 0; i < 4; i++) jaw.add(M(box(0.02, 0.03, 0.02), glow(0xf8f4e0), -0.045 + i * 0.03, 0.04, 0.1));
  headG.add(skull, jaw, M(sph(0.048, 8, 8), dark, -0.07, 0.03, 0.13), M(sph(0.048, 8, 8), dark, 0.07, 0.03, 0.13),
    M(sph(0.022, 6, 6), eye, -0.07, 0.03, 0.17), M(sph(0.022, 6, 6), eye, 0.07, 0.03, 0.17), M(cone(0.025, 0.05, 4), dark, 0, -0.03, 0.17, Math.PI, 0, 0),
    M(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x8a6a2a, { metalness: 0.5, roughness: 0.5 }), 0, 0.05, 0),
    M(cyl(0.21, 0.21, 0.025, 14), std(0x6a4a1a, { metalness: 0.5 }), 0, 0.06, 0), M(sph(0.045, 8, 8), glow(0xfff0a0), 0, 0.14, 0.17));
  const armL = G(-0.3, 1.2 - PY, 0); armL.add(M(cyl(0.028, 0.026, 0.55), bone, 0, -0.27, 0), M(sph(0.045, 6, 6), bone, 0, -0.55, 0));
  const arm = G(0.3, 1.2 - PY, 0);
  arm.add(M(cyl(0.03, 0.027, 0.55), bone, 0, -0.27, 0), M(sph(0.045, 6, 6), bone, 0, -0.55, 0));
  const pick = G(0, -0.55, 0);
  pick.add(M(cyl(0.025, 0.025, 0.85, 6), std(0x5b3d22), 0, -0.2, 0),
    M(cone(0.055, 0.34, 5), steel, 0.2, -0.62, 0, 0, 0, -Math.PI / 2), M(cone(0.055, 0.34, 5), steel, -0.2, -0.62, 0, 0, 0, Math.PI / 2), M(box(0.1, 0.1, 0.07), steel, 0, -0.62, 0));
  arm.add(pick);
  up.add(armL, arm, M(sph(0.1, 8, 6), bone, -0.3, 1.2 - PY, 0), M(sph(0.1, 8, 6), bone, 0.3, 1.2 - PY, 0));
  model.add(up);
  if (boss) for (const s of [-1, 1]) model.add(M(cone(0.05, 0.3, 5), steel, s * 0.2, 1.7, 0, 0, 0, -s * 0.5));
  const tick = (t, e) => {
    walkLegs(lg, e, 0.7); torsoMotion(up, e, t, 0.9);
    armL.rotation.x = Math.sin(e.gait) * 0.6 * e.wb;
    headG.rotation.x = e.k * 0.25 - e.hitK * 0.35;
    headG.rotation.z = Math.sin(t * 1.3 + e.id) * 0.05 + Math.sin(e.gait * 2) * 0.04 * e.wb;
    jaw.rotation.x = 0.15 + e.k * 0.6 + Math.abs(Math.sin(e.gait * 2)) * 0.12 * e.wb;
  };
  return { model, arm, mouth: null, headG, jaw: null, tick };
}

// ------------------------------------------------------------------ каменный голем
function golem(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const col = boss ? 0xc27bff : 0xff8a2a;
  const crys = glow(col), moss = std(0x4a6a3a);
  const PY = 0.9;
  const up = mkUpper(PY);
  const U = (g, m, x, y, z, rx, ry, rz) => up.add(M(g, m, x, y - PY, z, rx, ry, rz));
  const lg = [0, 1].map((i) => { const l = G((i ? 1 : -1) * 0.26, PY, 0); l.add(M(box(0.36, 0.55, 0.38), cloth, 0, -0.28, 0)); const kn = G(0, -0.5, 0); kn.add(M(box(0.32, 0.5, 0.34), skin, 0, -0.22, 0), M(box(0.38, 0.14, 0.52), cloth, 0, -0.45, 0.07)); l.add(kn); l.userData.knee = kn; model.add(l); return l; });
  U(box(0.9, 0.95, 0.6), skin, 0, 1.15, 0); U(box(0.62, 0.3, 0.5), cloth, 0, 0.75, 0);
  U(box(0.5, 0.18, 0.04), moss, 0.05, 1.5, 0.31); U(box(0.2, 0.22, 0.04), moss, -0.3, 0.95, 0.31);
  for (let i = 0; i < 3; i++) U(box(0.5 - i * 0.08, 0.04, 0.02), glow(col), 0, 1.0 + i * 0.12, 0.31);   // светящиеся трещины
  const headG = G(0, 1.78 - PY, 0.05); up.add(headG);
  headG.add(M(box(0.44, 0.38, 0.42), skin, 0, 0, 0), M(box(0.5, 0.1, 0.46), cloth, 0, 0.2, 0), M(box(0.1, 0.05, 0.05), glow(spec.eyes), -0.1, 0.02, 0.22), M(box(0.1, 0.05, 0.05), glow(spec.eyes), 0.1, 0.02, 0.22));
  const armL = G(-0.62, 1.4 - PY, 0); armL.add(M(new THREE.DodecahedronGeometry(0.3), skin, 0, 0, 0), M(box(0.3, 0.55, 0.32), skin, 0, -0.4, 0), M(box(0.4, 0.4, 0.4), cloth, 0, -0.8, 0));
  const arm = G(0.62, 1.4 - PY, 0);
  arm.add(M(new THREE.DodecahedronGeometry(0.32), skin, 0, 0, 0), M(box(0.3, 0.55, 0.32), skin, 0, -0.4, 0), M(box(0.46, 0.46, 0.46), cloth, 0, -0.85, 0));
  for (let i = 0; i < 3; i++) arm.add(M(cone(0.05, 0.16, 5), skin, (i - 1) * 0.14, -1.12, 0.1, Math.PI, 0, 0));
  up.add(armL, arm);
  const ncr = boss ? 8 : 4;
  const cr = [];
  for (let i = 0; i < ncr; i++) { const c = M(new THREE.OctahedronGeometry(0.14 + (i % 3) * 0.04), crys, (i - (ncr - 1) / 2) * 0.2, 1.62 + (i % 2) * 0.22 - PY, -0.38, i, i * 2, 0); up.add(c); cr.push(c); }
  const core = M(sph(0.16, 10, 8), crys, 0, 1.12 - PY, 0.33); up.add(core);
  model.add(up);
  const tick = (t, e) => {
    const w = e.wb;
    lg.forEach((l, i) => { const ph = e.gait + (i ? Math.PI : 0); l.rotation.x = -Math.sin(ph) * 0.5 * w; l.userData.knee.rotation.x = Math.max(0, Math.cos(ph)) * 0.5 * w; });
    torsoMotion(up, e, t, 0.8);
    up.rotation.z = Math.sin(e.gait) * 0.07 * w;                              // тяжёлая переваливающаяся походка
    armL.rotation.x = Math.sin(e.gait) * 0.4 * w - 0.1;
    headG.rotation.x = e.k * 0.2 - e.hitK * 0.2;
    core.scale.setScalar(1 + 0.15 * Math.sin(t * 3 + e.id) + e.k * 0.4);
    cr.forEach((c, i) => { c.rotation.y = t * 0.5 + i; });
  };
  return { model, arm, mouth: null, headG, tick };
}

// ------------------------------------------------------------------ болотник
function bog(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const eye = glow(spec.eyes), moss = std(0x3d5a2a), slime = std(0x5a8a6a, { roughness: 0.3 });
  const PY = 0.68;
  const up = mkUpper(PY);
  const U = (g, m, x, y, z, rx, ry, rz) => up.add(M(g, m, x, y - PY, z, rx, ry, rz));
  const lg = legs(model, skin, 0.17, PY, 0.66, 0.09, cloth);
  const body = M(sph(0.38, 14, 12), cloth, 0, 0.9 - PY, -0.04); body.scale.set(1, 1.1, 0.9); up.add(body);
  U(sph(0.3, 12, 10), slime, 0, 0.82, 0.16).scale.set(1, 1.1, 0.8);
  const headG = G(0, 1.36 - PY, 0.22); up.add(headG);
  const head = M(sph(0.27, 14, 12), skin, 0, 0, 0); head.scale.set(1.25, 0.88, 1.1);
  const jaw = G(0, -0.1, 0.1); jaw.add(M(box(0.3, 0.06, 0.2), skin, 0, 0, 0.08));
  for (let i = 0; i < 5; i++) jaw.add(M(cone(0.015, 0.07, 4), glow(0xd8e0c0), -0.1 + i * 0.05, 0.05, 0.17));
  headG.add(head, jaw, M(sph(0.085, 10, 8), eye, -0.15, 0.16, 0.1), M(sph(0.085, 10, 8), eye, 0.15, 0.16, 0.1),
    M(sph(0.035, 8, 8), std(0x0a0a0a), -0.15, 0.16, 0.17), M(sph(0.035, 8, 8), std(0x0a0a0a), 0.15, 0.16, 0.17),
    M(cone(0.07, 0.4, 5), skin, -0.36, 0.05, -0.04, 0, 0, Math.PI / 2), M(cone(0.07, 0.4, 5), skin, 0.36, 0.05, -0.04, 0, 0, -Math.PI / 2));
  for (let i = 0; i < 5; i++) up.add(M(cone(0.05, 0.22, 4), skin, 0, 1.28 - i * 0.14 - PY, -0.38 - i * 0.015, -0.7, 0, 0));
  U(sph(0.14, 8, 6), moss, -0.28, 1.25, -0.1); U(sph(0.11, 8, 6), moss, 0.28, 1.2, -0.15); U(sph(0.1, 8, 6), moss, 0.05, 1.45, -0.12);
  const armL = G(-0.42, 1.08 - PY, 0.08); armL.add(M(cyl(0.08, 0.06, 0.7), skin, 0, -0.34, 0), M(sph(0.09, 8, 6), skin, 0, -0.72, 0));
  const arm = G(0.42, 1.08 - PY, 0.08);
  arm.add(M(cyl(0.08, 0.06, 0.62), skin, 0, -0.3, 0), M(sph(0.09, 8, 6), skin, 0, -0.64, 0));
  for (let i = -1; i <= 1; i++) arm.add(M(cone(0.032, 0.24, 4), glow(0xd8e0c0), i * 0.07, -0.78, 0.02, Math.PI, 0, 0));
  up.add(armL, arm); model.add(up);
  const mouth = new THREE.Object3D(); mouth.position.set(0, -0.1, 0.3); headG.add(mouth);
  if (boss) {
    headG.add(M(box(0.36, 0.4, 0.05), std(0x777770), 0, 0.02, 0.36));
    for (const s of [-1, 1]) {
      headG.add(M(cyl(0.025, 0.02, 0.6, 5), std(0x7a6a3a), s * 0.2, 0.5, 0, 0, 0, -s * 0.5), M(cyl(0.02, 0.015, 0.3, 5), std(0x7a6a3a), s * 0.42, 0.78, 0, 0, 0, s * 0.5));
    }
    for (let i = 0; i < 4; i++) up.add(M(box(0.06, 0.06, 0.02), glow(0x66ffcc), -0.12 + i * 0.08, 0.9 - PY + (i % 2) * 0.12, 0.44));
  }
  const tick = (t, e) => {
    walkLegs(lg, e, 0.65); torsoMotion(up, e, t, 1.1);
    up.rotation.z += Math.sin(e.gait) * 0.08 * e.wb;                          // раскачивается, как жаба
    armL.rotation.x = Math.sin(e.gait) * 0.8 * e.wb;
    headG.rotation.x = e.k * 0.3 - e.hitK * 0.3;
    jaw.rotation.x = 0.08 + e.k * 0.55 + Math.sin(t * 3 + e.id) * 0.04;
    body.scale.y = 1.1 + 0.04 * Math.sin(t * 3 + e.id);                      // дышит
  };
  return { model, arm, mouth, headG, jaw: null, tick };
}

// ------------------------------------------------------------------ воин тёмного ордена
function dark(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const steel = std(0x3a3a48, { metalness: 0.7, roughness: 0.4 }), trim = std(0x8a1f2b), steel2 = std(0x55556a, { metalness: 0.8, roughness: 0.3 });
  const PY = 0.86;
  const up = mkUpper(PY);
  const U = (g, m, x, y, z, rx, ry, rz) => up.add(M(g, m, x, y - PY, z, rx, ry, rz));
  const lg = legs(model, steel, 0.14, PY, 0.84, 0.085, steel2);
  model.add(M(cyl(0.3, 0.34, 0.2, 12), trim, 0, PY - 0.08, 0));                // набедренный доспех
  U(caps(0.28, 0.36), steel, 0, 1.08, 0); U(cyl(0.3, 0.3, 0.06, 14), trim, 0, 0.82, 0);
  U(box(0.3, 0.38, 0.06), steel2, 0, 1.12, 0.26);                              // нагрудник
  const headG = G(0, 1.58 - PY, 0); up.add(headG);
  headG.add(M(sph(0.23, 16, 12), steel, 0, 0, 0), M(box(0.34, 0.045, 0.05), glow(spec.eyes), 0, 0.01, 0.2), M(box(0.05, 0.22, 0.05), steel2, 0, -0.03, 0.22),
    M(cone(0.07, 0.42, 6), trim, 0, 0.28, -0.08, -0.5, 0, 0), M(cyl(0.1, 0.13, 0.1, 10), steel2, 0, -0.2, 0));
  U(sph(0.2, 12, 10), steel2, -0.4, 1.4, 0); U(sph(0.2, 12, 10), steel2, 0.4, 1.4, 0);
  for (const s of [-1, 1]) U(cone(0.04, 0.16, 5), steel2, s * 0.4, 1.58, 0);
  const armL = G(-0.4, 1.38 - PY, 0.02);                                      // рука со щитом
  armL.add(M(cyl(0.075, 0.065, 0.5), steel, 0, -0.25, 0), M(sph(0.075, 8, 8), steel2, 0, -0.52, 0),
    M(cyl(0.34, 0.34, 0.05, 18), steel, -0.12, -0.45, 0.22, Math.PI / 2, 0, 0), M(cyl(0.12, 0.12, 0.07, 12), trim, -0.12, -0.45, 0.25, Math.PI / 2, 0, 0));
  const arm = G(0.4, 1.38 - PY, 0.02);
  const blade = std(0xe8eef5, { metalness: 0.9, roughness: 0.2 });
  arm.add(M(cyl(0.08, 0.07, 0.5), steel, 0, -0.25, 0), M(sph(0.075, 8, 8), steel2, 0, -0.52, 0), M(box(0.075, 0.95, 0.02), blade, 0, -1.05, 0), M(cone(0.04, 0.12, 4), blade, 0, -1.58, 0, Math.PI, 0, 0),
    M(box(0.34, 0.05, 0.06), std(0xd9a933, { metalness: 0.7 }), 0, -0.56, 0), M(cyl(0.025, 0.025, 0.14), trim, 0, -0.5, 0));
  up.add(armL, arm); model.add(up);
  const cape = new THREE.Group(); cape.position.set(0, 1.45, -0.28);
  cape.add(M(new THREE.PlaneGeometry(boss ? 0.8 : 0.55, boss ? 1.3 : 0.9), std(boss ? 0x7a1020 : 0x4a1018, { side: THREE.DoubleSide }), 0, boss ? -0.6 : -0.42, 0));
  model.add(cape);
  if (boss) {
    for (const s of [-1, 1]) headG.add(M(cone(0.06, 0.44, 6), steel, s * 0.2, 0.2, 0, 0, 0, -s * 0.7));
    arm.add(M(box(0.03, 0.92, 0.03), glow(0xff3030), 0, -1.05, 0.015));
  }
  const tick = (t, e) => {
    walkLegs(lg, e, 0.7); torsoMotion(up, e, t, 0.85);
    armL.rotation.x = -0.35 + Math.sin(e.gait) * 0.12 * e.wb - e.k * 0.1;      // щит держит перед собой
    headG.rotation.x = e.k * 0.15 - e.hitK * 0.25;
    cape.rotation.x = 0.1 + Math.abs(Math.sin(e.gait)) * 0.3 * e.wb + e.hitK * 0.3 + Math.sin(t * 2 + e.id) * 0.03;
  };
  return { model, arm, mouth: null, headG, tick };
}

// ------------------------------------------------------------------ огненное создание
function fire(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const flame = new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame2 = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = glow(0xffb040), rock = std(0x2a1a14, { roughness: 1 });
  const PY = 0.72;
  const up = mkUpper(PY);
  const U = (g, m, x, y, z, rx, ry, rz) => up.add(M(g, m, x, y - PY, z, rx, ry, rz));
  const shell = M(new THREE.DodecahedronGeometry(0.42), cloth, 0, 1.0 - PY, 0); shell.scale.set(1, 1.1, 0.9); up.add(shell);
  const heart = M(new THREE.IcosahedronGeometry(0.3, 1), core, 0, 1.0 - PY, 0.18); up.add(heart);
  const headG = G(0, 1.58 - PY, 0.05); up.add(headG);
  const jaw = G(0, -0.1, 0.08); jaw.add(M(box(0.16, 0.04, 0.12), rock, 0, 0, 0.05));
  headG.add(M(new THREE.IcosahedronGeometry(0.22, 1), skin, 0, 0, 0), M(sph(0.055, 6, 6), glow(0xffffcc), -0.08, 0.05, 0.2), M(sph(0.055, 6, 6), glow(0xffffcc), 0.08, 0.05, 0.2), jaw);
  // «ноги» — две языка пламени, которые переступают
  const tails = [-1, 1].map((s) => { const g = G(s * 0.16, PY, 0); g.add(M(cone(0.16, 0.7, 7), flame, 0, -0.34, 0, Math.PI, 0, 0), M(cone(0.09, 0.5, 6), flame2, 0, -0.26, 0, Math.PI, 0, 0)); model.add(g); return g; });
  const flames = [];
  const nf = boss ? 9 : 6;
  for (let i = 0; i < nf; i++) {
    const a = (i / nf) * Math.PI * 2;
    const f = M(cone(0.1 + (boss ? 0.04 : 0), 0.45 + (i % 2) * 0.2, 6), i % 2 ? flame : flame2, Math.cos(a) * 0.28, 1.0 + 0.9 - PY, Math.sin(a) * 0.28);
    flames.push(f); up.add(f);
  }
  const armL = G(-0.45, 1.2 - PY, 0); armL.add(M(cyl(0.08, 0.05, 0.6), skin, 0, -0.3, 0), M(sph(0.12, 8, 8), core, 0, -0.64, 0), M(cone(0.09, 0.3, 6), flame, 0, -0.82, 0, Math.PI, 0, 0));
  const arm = G(0.45, 1.2 - PY, 0);
  arm.add(M(cyl(0.08, 0.05, 0.6), skin, 0, -0.3, 0), M(sph(0.17, 10, 8), core, 0, -0.66, 0), M(cone(0.12, 0.4, 6), flame, 0, -0.92, 0, Math.PI, 0, 0), M(cone(0.06, 0.3, 6), flame2, 0, -0.85, 0, Math.PI, 0, 0));
  up.add(armL, arm); model.add(up);
  const mouth = new THREE.Object3D(); mouth.position.set(0, -0.06, 0.22); headG.add(mouth);
  if (boss) for (let i = 0; i < 6; i++) { const a = i * 1.047; headG.add(M(cone(0.06, 0.38, 5), rock, Math.cos(a) * 0.2, 0.22, Math.sin(a) * 0.2, 0.3 * Math.sin(a), 0, -0.3 * Math.cos(a))); }
  const tick = (t, e) => {
    torsoMotion(up, e, t, 0.7);
    tails.forEach((g, i) => { g.rotation.x = Math.sin(e.gait + i * Math.PI) * 0.4 * e.wb; g.scale.y = 1 + 0.12 * Math.sin(t * 10 + i * 2); });
    armL.rotation.x = Math.sin(e.gait) * 0.5 * e.wb;
    flames.forEach((f, i) => { f.scale.y = 1 + 0.35 * Math.sin(t * 9 + i * 1.7); f.rotation.z = 0.18 * Math.sin(t * 6 + i); f.rotation.x = 0.1 * Math.cos(t * 5 + i); });
    heart.scale.setScalar(1 + 0.08 * Math.sin(t * 7 + e.id) + e.k * 0.25);
    headG.rotation.x = e.k * 0.2 - e.hitK * 0.25 - e.headTilt; jaw.rotation.x = e.k * 0.5 + e.jawOpen;
  };
  return { model, arm, mouth, headG, jaw, tick };
}

// ------------------------------------------------------------------ страж дракона
function elite(spec, skin, cloth, boss) {
  const model = new THREE.Group();
  const armor = std(0x7a2a2a, { metalness: 0.6, roughness: 0.45 }), goldM = std(0xd0a030, { metalness: 0.8, roughness: 0.3 });
  const wing = std(0xd0a030, { metalness: 0.6, side: THREE.DoubleSide }), steel = std(0xe8eef5, { metalness: 0.9, roughness: 0.2 });
  const PY = 0.86;
  const up = mkUpper(PY);
  const U = (g, m, x, y, z, rx, ry, rz) => up.add(M(g, m, x, y - PY, z, rx, ry, rz));
  const lg = legs(model, cloth, 0.13, PY, 0.84, 0.08, goldM);
  model.add(M(box(0.34, 0.22, 0.24), armor, 0, PY - 0.08, 0.02));
  U(caps(0.27, 0.4), armor, 0, 1.08, 0); U(box(0.3, 0.08, 0.12), goldM, 0, 0.84, 0.04); U(box(0.18, 0.34, 0.05), goldM, 0, 1.12, 0.26);
  const headG = G(0, 1.56 - PY, 0); up.add(headG);
  headG.add(M(sph(0.23, 16, 12), armor, 0, 0, 0), M(box(0.28, 0.04, 0.05), glow(spec.eyes), 0, 0.0, 0.2),
    M(new THREE.PlaneGeometry(0.38, 0.3), wing, -0.24, 0.18, 0, 0, 0, 0.6), M(new THREE.PlaneGeometry(0.38, 0.3), wing, 0.24, 0.18, 0, 0, 0, -0.6), M(cone(0.04, 0.3, 5), goldM, 0, 0.28, 0));
  U(sph(0.2, 12, 10), armor, -0.38, 1.38, 0); U(sph(0.2, 12, 10), armor, 0.38, 1.38, 0);
  U(cone(0.06, 0.3, 5), goldM, -0.38, 1.62, 0); U(cone(0.06, 0.3, 5), goldM, 0.38, 1.62, 0);
  const armL = G(-0.38, 1.36 - PY, 0.04); armL.add(M(cyl(0.07, 0.06, 0.5), armor, 0, -0.25, 0), M(sph(0.07, 8, 8), goldM, 0, -0.52, 0));
  const arm = G(0.38, 1.36 - PY, 0.05);
  arm.add(M(cyl(0.075, 0.07, 0.5), armor, 0, -0.25, 0), M(sph(0.07, 8, 8), goldM, 0, -0.52, 0),
    M(cyl(0.03, 0.03, 1.55), std(0x5b3d22), 0, -0.9, 0), M(box(0.3, 0.36, 0.03), steel, 0.14, -1.6, 0), M(cone(0.05, 0.34, 5), goldM, 0, -1.84, 0, Math.PI, 0, 0), M(cone(0.04, 0.2, 5), goldM, 0, -0.06, 0));
  up.add(armL, arm); model.add(up);
  const cape = new THREE.Group(); cape.position.set(0, 1.4, -0.28);
  cape.add(M(new THREE.PlaneGeometry(boss ? 0.8 : 0.5, boss ? 1.3 : 0.8), std(0xa01820, { side: THREE.DoubleSide }), 0, boss ? -0.6 : -0.36, 0));
  model.add(cape);
  if (boss) model.add(M(cyl(0.02, 0.02, 1.8), std(0x5b3d22), 0.1, 1.7, -0.4), M(new THREE.PlaneGeometry(0.5, 0.35), std(0xa01820, { side: THREE.DoubleSide }), 0.35, 2.35, -0.4), M(sph(0.07, 8, 8), glow(0xffd24a), 0.35, 2.35, -0.38));
  const tick = (t, e) => {
    walkLegs(lg, e, 0.8); torsoMotion(up, e, t);
    armL.rotation.x = Math.sin(e.gait) * 0.6 * e.wb;
    headG.rotation.x = e.k * 0.15 - e.hitK * 0.3;
    cape.rotation.x = 0.1 + Math.abs(Math.sin(e.gait)) * 0.35 * e.wb + e.hitK * 0.3;
  };
  return { model, arm, mouth: null, headG, tick };
}

// ------------------------------------------------------------------ дракон
function dragon(spec, skin, cloth) {
  const model = new THREE.Group();
  const belly = std(0xc9a25a), membrane = std(0x5a1a1a, { side: THREE.DoubleSide, roughness: 0.6 });
  const eye = glow(spec.eyes), claw = std(0xe8e0c8);
  const body = G(0, 0, 0); model.add(body);
  const torso = M(sph(0.72, 18, 14), skin, 0, 1.0, 0); torso.scale.set(1, 0.9, 1.7);
  const bel = M(sph(0.6, 14, 10), belly, 0, 0.88, 0.1); bel.scale.set(0.9, 0.7, 1.5);
  body.add(torso, bel);
  for (let i = 0; i < 8; i++) body.add(M(cone(0.08, 0.32, 5), cloth, 0, 1.75 - Math.abs(i - 3) * 0.04, 1.0 - i * 0.34));
  // шея — цепочка сегментов, голова на конце
  const neck = G(0, 1.35, 0.9); body.add(neck);
  const nseg = [];
  let parent = neck;
  for (let i = 0; i < 3; i++) { const s = G(0, 0, 0.28); s.add(M(cyl(0.2 - i * 0.03, 0.27 - i * 0.03, 0.4, 10), skin, 0, 0.12, 0.04, 0.9, 0, 0)); parent.add(s); nseg.push(s); parent = s; }
  const headG = G(0, 0.3, 0.3); parent.add(headG);
  const skull = M(sph(0.3, 14, 12), skin, 0, 0, 0); skull.scale.set(1, 0.85, 1.2);
  headG.add(skull, M(cone(0.22, 0.7, 10), skin, 0, -0.02, 0.5, Math.PI / 2, 0, 0),
    M(cone(0.07, 0.5, 6), cloth, -0.18, 0.22, -0.2, -0.6, 0, 0), M(cone(0.07, 0.5, 6), cloth, 0.18, 0.22, -0.2, -0.6, 0, 0),
    M(cone(0.04, 0.25, 5), cloth, -0.26, 0.05, -0.1, 0, 0, 1.3), M(cone(0.04, 0.25, 5), cloth, 0.26, 0.05, -0.1, 0, 0, -1.3),
    M(sph(0.065, 8, 8), eye, -0.17, 0.1, 0.18), M(sph(0.065, 8, 8), eye, 0.17, 0.1, 0.18),
    M(sph(0.03, 6, 6), glow(0xff6a1a), -0.07, 0.05, 0.84), M(sph(0.03, 6, 6), glow(0xff6a1a), 0.07, 0.05, 0.84));
  const jaw = G(0, -0.12, 0.05);
  jaw.add(M(cone(0.17, 0.62, 10), skin, 0, -0.02, 0.3, Math.PI / 2, 0, 0));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) jaw.add(M(cone(0.025, 0.1, 4), glow(0xf4f0e0), s * 0.09, 0.05, 0.2 + i * 0.12, Math.PI, 0, 0));
  headG.add(jaw);
  const mouth = new THREE.Object3D(); mouth.position.set(0, -0.1, 0.85); headG.add(mouth);
  // хвост — три сегмента
  const tail = G(0, 0.95, -1.15); body.add(tail);
  const tseg = []; parent = tail;
  for (let i = 0; i < 4; i++) { const s = G(0, 0, -0.55); s.add(M(cone(0.3 - i * 0.06, 0.7, 8), skin, 0, 0, -0.1, -Math.PI / 2, 0, 0)); parent.add(s); tseg.push(s); parent = s; }
  // крылья с костями
  const wings = [];
  for (const s of [-1, 1]) {
    const w = G(s * 0.5, 1.6, -0.2); const w2 = G(s * 1.2, 0.3, 0);
    w.add(M(cyl(0.05, 0.04, 1.3, 6), skin, s * 0.6, 0.15, 0, 0, 0, Math.PI / 2 * -s + s * 0.3), M(new THREE.PlaneGeometry(1.4, 1.3), membrane, s * 0.7, -0.25, -0.1, 0.1, 0, 0));
    w2.add(M(cyl(0.035, 0.03, 1.2, 6), skin, s * 0.55, 0.0, 0, 0, 0, Math.PI / 2 * -s + s * 0.15), M(new THREE.PlaneGeometry(1.2, 1.0), membrane, s * 0.6, -0.35, -0.1, 0.1, 0, 0), M(cone(0.04, 0.18, 4), claw, s * 1.2, 0.0, 0, 0, 0, -s * 1.6));
    w.add(w2); body.add(w); wings.push([w, w2, s]);
  }
  // лапы с коленями
  const paws = [];
  for (const [x, z] of [[-0.55, -0.7], [0.55, -0.7], [-0.55, 0.7], [0.55, 0.7]]) {
    if (x > 0 && z > 0) continue;                                              // правая передняя — «arm»
    const l = G(x, 0.85, z); const kn = G(0, -0.42, 0);
    l.add(M(cyl(0.16, 0.13, 0.5), skin, 0, -0.2, 0)); kn.add(M(cyl(0.12, 0.1, 0.45), skin, 0, -0.2, 0), M(box(0.2, 0.08, 0.3), skin, 0, -0.4, 0.08));
    for (let i = -1; i <= 1; i++) kn.add(M(cone(0.035, 0.14, 4), claw, i * 0.07, -0.4, 0.26, Math.PI / 2, 0, 0));
    l.add(kn); l.userData.knee = kn; body.add(l); paws.push(l);
  }
  const arm = G(0.6, 1.0, 0.8);
  arm.add(M(cyl(0.15, 0.12, 0.9), skin, 0, -0.45, 0), M(cone(0.16, 0.4, 7), claw, 0, -1.05, 0, Math.PI, 0, 0));
  body.add(arm);
  const tick = (t, e) => {
    const flap = Math.sin(t * 2.2 + e.id);
    wings.forEach(([w, w2, s]) => { w.rotation.z = s * -(0.15 + 0.25 * flap); w2.rotation.z = s * -(0.1 + 0.3 * Math.sin(t * 2.2 + e.id - 0.7)); });
    tseg.forEach((sg, i) => { sg.rotation.y = Math.sin(t * 1.6 + i * 0.7 - e.gait * 0.2) * 0.22; sg.rotation.x = 0.02; });
    nseg.forEach((sg, i) => { sg.rotation.x = -0.12 - e.k * 0.05 + Math.sin(t * 1.3 + i) * 0.03 + (e.st === 'breath' ? -e.headTilt * 0.12 : 0); sg.rotation.y = Math.sin(t * 0.8 + i) * 0.05; });
    headG.rotation.x = -e.headTilt; jaw.rotation.x = e.jawOpen;
    const w = e.wb;
    paws.forEach((l, i) => { const ph = e.gait + (i % 2 ? Math.PI : 0); l.rotation.x = -Math.sin(ph) * 0.45 * w; l.userData.knee.rotation.x = Math.max(0, Math.cos(ph)) * 0.6 * w; });
    body.rotation.z = Math.sin(e.gait) * 0.035 * w; body.rotation.x = -e.k * 0.08 + e.hitK * 0.06;
    body.position.y = Math.abs(Math.sin(e.gait)) * 0.05 * w + Math.sin(t * 2.2 + e.id) * 0.02;
  };
  return { model, arm, mouth, headG, jaw, tick };
}

const BUILDERS = { goblin, spider, skeleton, golem, bog, dark, fire, elite, dragon };

export function buildModel(type, spec, skin, cloth, boss) {
  return (BUILDERS[type] || goblin)(spec, skin, cloth, boss);
}
