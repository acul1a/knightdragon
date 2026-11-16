import * as THREE from 'three';

/* Оружие. Меч — в начале; остальное открывается наградами за уровни.
   Стихии: огонь — поджигает (и огонь перекидывается на соседей), холод — замораживает
   во льду (молот разбивает лёд), ветер — отбрасывает врага и сбивает с ног соседей. */
export const WEAPONS = {
  sword:  { name: 'Меч',          kind: 'melee', dmg: 1.0,  speedMin: 2.2, cd: 0.4,  elem: null },
  hammer: { name: 'Боевой молот', kind: 'melee', dmg: 2.3,  speedMin: 2.6, cd: 0.85, elem: 'hammer', twoHanded: true, stun: 0.9, breakArmor: 4, poiseDmg: 3 },
  bow:    { name: 'Лук',          kind: 'bow',   dmg: 1.0,  elem: null, twoHanded: true },
  frost:  { name: 'Ледяной меч',  kind: 'melee', dmg: 1.0,  speedMin: 2.2, cd: 0.4,  elem: 'ice',  freeze: 3.6 },
  wind:   { name: 'Меч ветра',    kind: 'melee', dmg: 0.85, speedMin: 1.7, cd: 0.26, elem: 'wind', knock: 1.5, poiseDmg: 1.4 },
  fire:   { name: 'Огненный меч', kind: 'melee', dmg: 1.1,  speedMin: 2.2, cd: 0.4,  elem: 'fire', burn: 4.5 },
};
export const WEAPON_ORDER = ['sword', 'hammer', 'bow', 'frost', 'wind', 'fire'];

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.7, ...o });
const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
};
const glowMat = (c, op = 0.5) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });

const gold = () => std(0xd9a933, { roughness: 0.3 });
const wood = () => std(0x4a2f1a, { roughness: 0.9, metalness: 0 });
const leather = () => std(0x3a2418, { roughness: 0.95, metalness: 0 });

/* клинок с остриём: длина вдоль -Z, плоскость клинка горизонтальна (ширина по X) */
function bladeGeo(len, w, t, z0 = -0.1, jag = 0) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0);
  if (jag) { for (let i = 1; i <= 4; i++) { sh.lineTo(w / 2 + (i % 2 ? jag : 0), len * (i / 5)); } }
  else sh.lineTo(w / 2, len * 0.86);
  sh.lineTo(0, len);
  if (jag) { for (let i = 4; i >= 1; i--) { sh.lineTo(-w / 2 - (i % 2 ? 0 : jag), len * (i / 5)); } }
  else sh.lineTo(-w / 2, len * 0.86);
  sh.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  g.rotateX(-Math.PI / 2);        // y -> -z
  g.translate(0, 0, z0);
  return g;
}

function hilt(g, guardMat, gripMat, pommelMat, wide = 0.26) {
  add(g, new THREE.CylinderGeometry(0.022, 0.025, 0.17, 10), gripMat, 0, 0, 0.0, Math.PI / 2, 0, 0);
  for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(0.025, 0.004, 4, 10), guardMat, 0, 0, -0.05 + i * 0.04, 0, 0, 0);
  add(g, new THREE.BoxGeometry(wide, 0.03, 0.045), guardMat, 0, 0, -0.1);
  add(g, new THREE.SphereGeometry(0.03, 10, 8), guardMat, wide / 2, 0, -0.1);
  add(g, new THREE.SphereGeometry(0.03, 10, 8), guardMat, -wide / 2, 0, -0.1);
  add(g, new THREE.SphereGeometry(0.038, 12, 10), pommelMat, 0, 0, 0.1);
}

export function makeWeaponModel(id) {
  const g = new THREE.Group();
  const tip = new THREE.Object3D();
  const mid = new THREE.Object3D();
  g.userData = { tip, mid, tick: null };
  tip.position.z = -0.97; mid.position.z = -0.55;

  if (id === 'sword') {
    const steel = std(0xdfe6ee, { roughness: 0.18, metalness: 0.95 });
    add(g, bladeGeo(0.88, 0.065, 0.012, -0.12), steel);
    add(g, new THREE.BoxGeometry(0.012, 0.016, 0.7), std(0x9aa6b4, { roughness: 0.3 }), 0, 0, -0.5);   // долы
    hilt(g, gold(), leather(), gold());
    add(g, new THREE.OctahedronGeometry(0.02), std(0xc01830, { emissive: 0x500010, emissiveIntensity: 0.6, metalness: 0.2 }), 0, 0.02, -0.1);
  } else if (id === 'fire') {
    const steel = std(0x2a2226, { roughness: 0.3, metalness: 0.9 });
    const lava = std(0xff6a1a, { emissive: 0xff3800, emissiveIntensity: 1.3, roughness: 0.4, metalness: 0.1 });
    add(g, bladeGeo(0.9, 0.07, 0.014, -0.12), steel);
    add(g, new THREE.BoxGeometry(0.014, 0.018, 0.74), lava, 0, 0, -0.5);                                  // раскалённый жёлоб
    add(g, new THREE.BoxGeometry(0.075, 0.004, 0.012), lava, 0, 0, -0.97);
    hilt(g, std(0x4a1a10, { roughness: 0.4 }), leather(), lava, 0.3);
    for (const s of [-1, 1]) add(g, new THREE.ConeGeometry(0.03, 0.16, 5), lava, s * 0.15, 0, -0.13, -Math.PI / 2 - 0.2, 0, 0);   // рожки гарды
    const fm = glowMat(0xff8a22, 0.4), fm2 = glowMat(0xffd060, 0.45);
    const flames = [];
    for (let i = 0; i < 7; i++) {
      const f = add(g, new THREE.ConeGeometry(0.022, 0.16, 5), i % 2 ? fm : fm2, (i % 2 ? 0.032 : -0.032), 0.012, -0.28 - i * 0.1, -Math.PI / 2 + 0.0, 0, 0);
      f.rotation.set(0, 0, 0); f.rotation.x = -Math.PI / 2;      // язычки вдоль клинка, повёрнуты назад
      flames.push(f);
    }
    const embers = [];
    for (let i = 0; i < 5; i++) { const em = add(g, new THREE.SphereGeometry(0.008, 4, 4), glowMat(0xffc060, 0.9), 0, 0.03, -0.3); embers.push(em); }
    g.userData.tick = (t, sp = 0) => {
      flames.forEach((f, i) => { f.scale.set(1 + 0.3 * Math.sin(t * 12 + i), (1 + 0.4 * Math.sin(t * 14 + i * 1.9)) * (1 + sp * 2.2), 1); f.position.y = 0.012 + 0.012 * Math.sin(t * 9 + i); });
      embers.forEach((em, i) => { const p = (t * 0.8 + i * 0.2) % 1; em.position.set(Math.sin(i * 3 + t * 3) * 0.04, 0.03 + p * 0.25, -0.2 - i * 0.16); em.scale.setScalar(1 - p); });
      lava.emissiveIntensity = 1.1 + 0.4 * Math.sin(t * 7) + sp * 1.2;
    };
  } else if (id === 'frost') {
    const ice = std(0xcdf3ff, { emissive: 0x4ab8e8, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.9 });
    const deep = std(0x6ab8e8, { emissive: 0x2a88c8, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.4 });
    add(g, bladeGeo(0.9, 0.07, 0.016, -0.12, 0.018), ice);
    add(g, new THREE.BoxGeometry(0.012, 0.02, 0.72), deep, 0, 0, -0.5);
    hilt(g, std(0x7aa8d8, { roughness: 0.25 }), std(0x1c3a5a, { roughness: 0.9, metalness: 0 }), deep, 0.3);
    for (const s of [-1, 1]) add(g, new THREE.ConeGeometry(0.02, 0.14, 5), ice, s * 0.15, 0, -0.1, -Math.PI / 2 - 0.1, 0, 0);
    const cr = std(0xe8fbff, { emissive: 0x88ddff, emissiveIntensity: 0.7, roughness: 0.1 });
    const crystals = [];
    for (let i = 0; i < 6; i++) crystals.push(add(g, new THREE.OctahedronGeometry(0.026), cr, (i % 2 ? 0.05 : -0.05), 0.012, -0.25 - i * 0.11, i, i * 2, 0));
    const snow = [];
    for (let i = 0; i < 6; i++) snow.push(add(g, new THREE.OctahedronGeometry(0.008), glowMat(0xffffff, 0.9), 0, 0.03, -0.3));
    g.userData.tick = (t, sp = 0) => {
      cr.emissiveIntensity = 0.6 + 0.3 * Math.sin(t * 4) + sp * 0.8;
      crystals.forEach((c, i) => { c.rotation.y = t * (0.8 + sp * 6) + i; c.scale.setScalar(1 + sp * 0.6); });
      snow.forEach((s, i) => { const p = (t * 0.5 + i / 6) % 1; s.position.set(Math.sin(i * 2.2 + t) * 0.06, 0.02 - p * 0.18, -0.2 - i * 0.13); s.scale.setScalar(1 - p); });
    };
  } else if (id === 'wind') {
    const jade = std(0xcffff0, { emissive: 0x38e8b0, emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.7 });
    add(g, bladeGeo(0.92, 0.055, 0.011, -0.12), jade);
    add(g, new THREE.BoxGeometry(0.01, 0.014, 0.7), std(0x38c898, { emissive: 0x20a070, emissiveIntensity: 0.6 }), 0, 0, -0.5);
    hilt(g, std(0x4a9a82, { roughness: 0.3 }), std(0x2a5a4a, { roughness: 0.9, metalness: 0 }), jade, 0.1);
    // крылья вместо гарды
    const wing = std(0xe8fff6, { roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const f = add(g, new THREE.ConeGeometry(0.024 - i * 0.004, 0.2 - i * 0.03, 4), wing, s * (0.1 + i * 0.05), 0, -0.1 + i * 0.035, 0, 0, -s * (1.35 + i * 0.12));
      f.scale.z = 0.4;
    }
    const rm = glowMat(0xaaffee, 0.35);
    const rings = [];
    for (let i = 0; i < 3; i++) rings.push(add(g, new THREE.TorusGeometry(0.06 + i * 0.012, 0.004, 5, 20), rm, 0, 0, -0.35 - i * 0.2));
    g.userData.tick = (t, sp = 0) => rings.forEach((r, i) => { r.rotation.z = t * (4 + i + sp * 18); r.scale.setScalar(1 + sp * 0.5); r.material.opacity = 0.35 + sp * 0.5; r.rotation.x = 0.4 * Math.sin(t * 5 + i); r.position.z = -0.35 - i * 0.2 + 0.06 * Math.sin(t * 3 + i); });
  } else if (id === 'hammer') {
    const iron = std(0x8f98a6, { roughness: 0.4 });
    add(g, new THREE.CylinderGeometry(0.025, 0.03, 0.82, 10), wood(), 0, 0, -0.34, Math.PI / 2, 0, 0);
    for (let i = 0; i < 6; i++) add(g, new THREE.TorusGeometry(0.03, 0.006, 4, 10), leather(), 0, 0, -0.02 + i * 0.045, 0, 0, 0);
    add(g, new THREE.BoxGeometry(0.2, 0.2, 0.34), iron, 0, 0, -0.8);
    add(g, new THREE.BoxGeometry(0.23, 0.23, 0.05), gold(), 0, 0, -0.64);
    add(g, new THREE.BoxGeometry(0.23, 0.23, 0.05), gold(), 0, 0, -0.96);
    for (const [x, y] of [[0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]]) add(g, new THREE.ConeGeometry(0.035, 0.1, 6), iron, x * 1.3, y * 1.3, -0.8, 0, 0, 0).rotation.set(y ? (y > 0 ? 0 : Math.PI) : 0, 0, x ? (x > 0 ? -Math.PI / 2 : Math.PI / 2) : 0);
    const rune = add(g, new THREE.BoxGeometry(0.05, 0.05, 0.005), glowMat(0xffc040, 0.9), 0, 0.101, -0.8, -Math.PI / 2, 0, Math.PI / 4);
    add(g, new THREE.SphereGeometry(0.035, 10, 8), gold(), 0, 0, 0.1);
    tip.position.z = -0.98; mid.position.z = -0.8;
    g.userData.tick = (t) => { rune.material.opacity = 0.6 + 0.3 * Math.sin(t * 3); };
  } else if (id === 'bow') {
    const arc = new THREE.TorusGeometry(0.42, 0.017, 8, 28, Math.PI);
    arc.rotateZ(-Math.PI / 2);            // «⊃»: выпуклость вперёд по +x
    const limb = add(g, arc, std(0x7a4a22, { roughness: 0.6, metalness: 0 }), 0, 0, 0);
    limb.rotation.y = Math.PI / 2;        // выпуклость смотрит в -z (вперёд)
    add(g, new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10), leather(), 0, 0, -0.42, 0, 0, 0);            // обмотка рукояти
    for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.02, 8, 6), gold(), 0, s * 0.42, 0);
    add(g, new THREE.CylinderGeometry(0.0035, 0.0035, 0.84, 4), new THREE.MeshBasicMaterial({ color: 0xf2efe0 }), 0, 0, 0.0);
    const arrow = new THREE.Group();
    add(arrow, new THREE.CylinderGeometry(0.006, 0.006, 0.7, 6), wood(), 0, 0, -0.3, Math.PI / 2, 0, 0);
    add(arrow, new THREE.ConeGeometry(0.018, 0.07, 6), std(0xcfd8e3), 0, 0, -0.68, -Math.PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) add(arrow, new THREE.BoxGeometry(0.002, 0.03, 0.08), std(0xcc2a2a, { metalness: 0 }), 0, 0, 0.02 + i * 0.0, 0, 0, i * Math.PI / 3).position.z = 0.0;
    arrow.position.z = 0;
    g.add(arrow);
    g.userData.arrow = arrow;
    g.userData.setDraw = (v) => { arrow.visible = true; arrow.position.z = v * 0.28; };
    g.userData.setDraw(0);
  }

  g.add(tip, mid);
  return g;
}
