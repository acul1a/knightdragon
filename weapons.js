import * as THREE from 'three';

/* Оружие. Меч — в начале; остальное открывается наградами за уровни. */
export const WEAPONS = {
  sword:  { name: 'Меч',          kind: 'melee', dmg: 1.0,  speedMin: 2.2, cd: 0.4,  elem: null },
  hammer: { name: 'Боевой молот', kind: 'melee', dmg: 2.3,  speedMin: 2.6, cd: 0.85, elem: 'hammer', stun: 0.9, breakArmor: 4 },
  bow:    { name: 'Лук',          kind: 'bow',   dmg: 1.0,  elem: null },
  frost:  { name: 'Ледяной меч',  kind: 'melee', dmg: 1.0,  speedMin: 2.2, cd: 0.4,  elem: 'ice',  freeze: 3.2 },
  wind:   { name: 'Меч ветра',    kind: 'melee', dmg: 0.85, speedMin: 1.7, cd: 0.26, elem: 'wind', knock: 1.5 },
  fire:   { name: 'Огненный меч', kind: 'melee', dmg: 1.1,  speedMin: 2.2, cd: 0.4,  elem: 'fire', burn: 3.5 },
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

const gold = () => std(0xd9a933, { roughness: 0.4 });
const wood = () => std(0x5b3d22, { roughness: 1, metalness: 0 });

function swordBase(g, bladeMat, guardMat) {
  add(g, new THREE.BoxGeometry(0.05, 0.012, 0.85), bladeMat, 0, 0, -0.55);
  add(g, new THREE.BoxGeometry(0.22, 0.03, 0.04), guardMat, 0, 0, -0.12);
  add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), wood(), 0, 0, 0, Math.PI / 2, 0, 0);
  add(g, new THREE.SphereGeometry(0.03, 8, 8), guardMat, 0, 0, 0.08);
}

export function makeWeaponModel(id) {
  const g = new THREE.Group();
  const tip = new THREE.Object3D();
  const mid = new THREE.Object3D();
  g.userData = { tip, mid, tick: null };
  tip.position.z = -0.97; mid.position.z = -0.55;

  if (id === 'sword') {
    swordBase(g, std(0xcfd8e3, { roughness: 0.25 }), gold());
  } else if (id === 'fire') {
    const blade = std(0xff8a2a, { emissive: 0xff4400, emissiveIntensity: 1.1, roughness: 0.3 });
    swordBase(g, blade, std(0x3a2418));
    const fm = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const flames = [];
    for (let i = 0; i < 4; i++) flames.push(add(g, new THREE.ConeGeometry(0.035, 0.22, 5), fm, 0, 0.03, -0.3 - i * 0.2));
    g.userData.tick = (t) => flames.forEach((f, i) => { f.scale.y = 1 + 0.5 * Math.sin(t * 14 + i * 1.9); f.scale.x = 1 + 0.3 * Math.sin(t * 11 + i); });
  } else if (id === 'frost') {
    swordBase(g, std(0xbfefff, { emissive: 0x66ccff, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.92 }), std(0x7aa8d8));
    const cr = std(0xe8fbff, { emissive: 0x88ddff, emissiveIntensity: 0.7, roughness: 0.1 });
    for (let i = 0; i < 5; i++) add(g, new THREE.OctahedronGeometry(0.03), cr, (i % 2 ? 0.045 : -0.045), 0.01, -0.25 - i * 0.13, i, i * 2, 0);
    g.userData.tick = (t) => { cr.emissiveIntensity = 0.6 + 0.3 * Math.sin(t * 4); };
  } else if (id === 'wind') {
    swordBase(g, std(0xbfffe8, { emissive: 0x44ffbb, emissiveIntensity: 0.55, roughness: 0.2 }), std(0x4a9a82));
    const rm = new THREE.MeshBasicMaterial({ color: 0xaaffee, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const rings = [];
    for (let i = 0; i < 3; i++) rings.push(add(g, new THREE.TorusGeometry(0.07 + i * 0.01, 0.006, 6, 18), rm, 0, 0, -0.35 - i * 0.22));
    g.userData.tick = (t) => rings.forEach((r, i) => { r.rotation.z = t * (4 + i); r.rotation.x = 0.3 * Math.sin(t * 5 + i); });
  } else if (id === 'hammer') {
    add(g, new THREE.CylinderGeometry(0.025, 0.03, 0.8, 8), wood(), 0, 0, -0.35, Math.PI / 2, 0, 0);
    add(g, new THREE.BoxGeometry(0.2, 0.2, 0.36), std(0x8f98a6, { roughness: 0.5 }), 0, 0, -0.78);
    add(g, new THREE.BoxGeometry(0.22, 0.22, 0.05), gold(), 0, 0, -0.62);
    add(g, new THREE.BoxGeometry(0.22, 0.22, 0.05), gold(), 0, 0, -0.94);
    tip.position.z = -0.95; mid.position.z = -0.78;
  } else if (id === 'bow') {
    const arc = new THREE.TorusGeometry(0.4, 0.016, 6, 24, Math.PI);
    arc.rotateZ(-Math.PI / 2);            // «⊃»: выпуклость вперёд по +x
    const limb = add(g, arc, std(0x7a4a22, { roughness: 0.8, metalness: 0 }), 0, 0, 0);
    limb.rotation.y = Math.PI / 2;        // выпуклость смотрит в -z (вперёд)
    add(g, new THREE.CylinderGeometry(0.004, 0.004, 0.8, 4), new THREE.MeshBasicMaterial({ color: 0xeeeeee }), 0, 0, 0.0);
    const arrow = new THREE.Group();
    add(arrow, new THREE.CylinderGeometry(0.006, 0.006, 0.7, 5), wood(), 0, 0, -0.3, Math.PI / 2, 0, 0);
    add(arrow, new THREE.ConeGeometry(0.018, 0.06, 6), std(0xcfd8e3), 0, 0, -0.67, -Math.PI / 2, 0, 0);
    arrow.position.z = 0;
    g.add(arrow);
    g.userData.arrow = arrow;
    g.userData.setDraw = (v) => { arrow.visible = true; arrow.position.z = v * 0.28; };
    g.userData.setDraw(0);
  }

  g.add(tip, mid);
  return g;
}
