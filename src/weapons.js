// Armes : modèles 1re personne procéduraux, tir hitscan, recul, visée, rechargement, couteau, grenades.
import * as THREE from 'three';
import { WEAPON_STATS, damageAt } from './shared/stats.js';
import { effectiveStats } from './shared/loadout.js';
import * as GM from './gunmodels.js';
import { buildArms } from './hands.js';
import { getTextures } from './textures.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

let M = null;
function mats() {
  if (M) return M;
  const t = getTextures();
  const n = (o) => ({ normalMap: t.gun_n, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: t.gun_r, ...o });
  M = {
    metal: new THREE.MeshStandardMaterial(n({ color: 0x232527, roughness: 0.55, metalness: 0.85 })),
    metal2: new THREE.MeshStandardMaterial(n({ color: 0x3a3d40, roughness: 0.4, metalness: 0.9 })),
    poly: new THREE.MeshStandardMaterial(n({ color: 0x18191a, roughness: 1.0, metalness: 0.05 })),
    tan: new THREE.MeshStandardMaterial(n({ color: 0x6e604a, roughness: 1.0, metalness: 0.02 })),
    wood: new THREE.MeshStandardMaterial({ color: 0x5c3d22, roughness: 0.5, metalness: 0.02, map: t.wood, normalMap: t.wood_n }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.95, normalMap: t.sandbag_n, normalScale: new THREE.Vector2(0.4, 0.4) }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98, map: t.camoA, normalMap: t.sandbag_n, normalScale: new THREE.Vector2(0.5, 0.5) }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a447, roughness: 0.3, metalness: 0.9 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0b1620, roughness: 0.05, metalness: 0.9 }),
    tube: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
    dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.4, 0.3), toneMapped: false }),
  };
  return M;
}

const B = (w, h, d) => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.22);
const C = (r1, r2, l, s = 12, open = false) => { const g = new THREE.CylinderGeometry(r1, r2, l, s, 1, open); g.rotateX(Math.PI / 2); return g; };
function add(p, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
  p.add(mesh);
  return mesh;
}
const UP = new THREE.Vector3(0, 1, 0);
function limb(p, a, b, t, m) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const d = Bv.clone().sub(A);
  const mesh = new THREE.Mesh(B(t, d.length(), t * 1.1), m);
  mesh.position.copy(A).add(Bv).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  p.add(mesh);
  return mesh;
}

function redDot(g, y, z) {
  const m = mats();
  add(g, B(0.04, 0.014, 0.07), m.metal, 0, y - 0.03, z);
  add(g, C(0.022, 0.022, 0.06, 18, true), m.tube, 0, y, z);
  add(g, new THREE.SphereGeometry(0.0013, 8, 6), m.dot, 0, y, z - 0.035);
}

/** Mains et avant-bras détaillés (voir hands.js). */
function arms(g, gripR, supL, opts = {}) {
  buildArms(g, gripR, supL, opts);
}

// Réglages des mains par arme : inclinaison de la poignée, rayon du garde-main, type d'appui.
const HAND_OPTS = {
  ar: { gripUp: [0, 1, -0.38], hgR: 0.028, gripRadius: 0.02 },
  smg: { gripUp: [0, 1, -0.3], hgR: 0.026 },
  dmr: { gripUp: [0, 1, -0.75], hgR: 0.03, gripRadius: 0.019 },
  sniper: { gripUp: [0, 1, -0.75], hgR: 0.03, gripRadius: 0.019 },
  shotgun: { gripUp: [0, 1, -0.45], hgR: 0.03 },
  pistol: { gripUp: [0, 1, -0.25], support: 'pistol' },
};

function rail(g, y, z0, len) {
  const m = mats();
  add(g, new THREE.BoxGeometry(0.022, 0.008, len), m.metal, 0, y, z0 - len / 2);
  for (let z = 0; z < len; z += 0.012) add(g, new THREE.BoxGeometry(0.026, 0.006, 0.006), m.metal, 0, y + 0.006, z0 - z - 0.006);
}

function buildAR() {
  const g = new THREE.Group(), m = mats();
  add(g, B(0.058, 0.05, 0.36), m.metal, 0, 0.022, -0.08);            // receveur supérieur
  add(g, B(0.054, 0.05, 0.22), m.metal, 0, -0.022, -0.02);           // receveur inférieur
  add(g, B(0.006, 0.022, 0.07), m.metal2, 0.03, 0.025, -0.04);       // fenêtre d'éjection
  add(g, B(0.02, 0.015, 0.05), m.metal2, 0, 0.05, 0.08);             // levier d'armement
  add(g, B(0.03, 0.03, 0.06), m.metal, -0.03, -0.01, -0.12);         // arrêtoir
  add(g, B(0.07, 0.072, 0.3), m.poly, 0, 0.012, -0.39);              // garde-main
  for (let i = 0; i < 6; i++) add(g, new THREE.BoxGeometry(0.074, 0.018, 0.022), m.metal2, 0, 0.005, -0.28 - i * 0.042);
  rail(g, 0.051, 0.1, 0.62);
  add(g, C(0.011, 0.011, 0.22), m.metal, 0, 0.02, -0.62);
  add(g, C(0.017, 0.017, 0.07), m.metal2, 0, 0.02, -0.75);
  add(g, C(0.014, 0.014, 0.16), m.metal, 0, 0.0, 0.17);              // tube de crosse
  add(g, B(0.05, 0.085, 0.16), m.poly, 0, -0.012, 0.24);             // crosse
  add(g, B(0.052, 0.12, 0.03), m.poly, 0, -0.01, 0.31);
  add(g, B(0.045, 0.1, 0.05), m.poly, 0, -0.085, 0.05, -0.35, 0, 0);
  add(g, B(0.012, 0.02, 0.06), m.metal, 0, -0.05, -0.02);
  const mag = add(g, B(0.045, 0.15, 0.075), m.metal, 0, -0.11, -0.12, 0.18, 0, 0);
  add(g, B(0.025, 0.03, 0.05), m.metal2, 0.035, 0.02, -0.02);
  redDot(g, 0.09, -0.08);
  arms(g, [0, -0.07, 0.05], [0, -0.03, -0.4]);
  return {
    group: g, mag, magBase: mag.position.clone(),
    sight: new THREE.Vector3(0, 0.09, -0.08), muzzle: new THREE.Vector3(0, 0.02, -0.79),
    eject: new THREE.Vector3(0.04, 0.03, -0.03), hip: new THREE.Vector3(0.15, -0.16, -0.34), adsDist: 0.2,
  };
}

function buildSMG() {
  const g = new THREE.Group(), m = mats();
  add(g, B(0.06, 0.09, 0.3), m.metal, 0, 0, -0.06);
  add(g, B(0.066, 0.07, 0.18), m.poly, 0, -0.005, -0.29);
  add(g, C(0.012, 0.012, 0.12), m.metal, 0, 0.015, -0.42);
  add(g, C(0.02, 0.02, 0.1), m.metal2, 0, 0.015, -0.5);
  add(g, B(0.022, 0.012, 0.36), m.metal, 0, 0.051, -0.14);
  add(g, B(0.014, 0.014, 0.22), m.metal, 0.02, 0.0, 0.18);
  add(g, B(0.014, 0.014, 0.22), m.metal, -0.02, 0.0, 0.18);
  add(g, B(0.05, 0.09, 0.02), m.poly, 0, -0.01, 0.29);
  add(g, B(0.045, 0.1, 0.05), m.poly, 0, -0.085, 0.04, -0.3, 0, 0);
  const mag = add(g, B(0.038, 0.2, 0.05), m.metal, 0, -0.13, -0.12, 0.05, 0, 0);
  add(g, B(0.03, 0.06, 0.04), m.poly, 0, -0.055, -0.32);
  redDot(g, 0.09, -0.06);
  arms(g, [0, -0.075, 0.04], [0, -0.07, -0.32]);
  return {
    group: g, mag, magBase: mag.position.clone(),
    sight: new THREE.Vector3(0, 0.09, -0.06), muzzle: new THREE.Vector3(0, 0.015, -0.56),
    eject: new THREE.Vector3(0.035, 0.03, -0.03), hip: new THREE.Vector3(0.14, -0.15, -0.3), adsDist: 0.2,
  };
}

function buildShotgun() {
  const g = new THREE.Group(), m = mats();
  add(g, B(0.065, 0.085, 0.3), m.metal, 0, 0, -0.06);
  add(g, C(0.014, 0.014, 0.5), m.metal, 0, 0.022, -0.45);
  add(g, C(0.013, 0.013, 0.42), m.metal2, 0, -0.018, -0.4);
  const pump = add(g, B(0.06, 0.055, 0.18), m.wood, 0, -0.018, -0.38);
  add(g, B(0.05, 0.09, 0.28), m.wood, 0, -0.03, 0.22, 0.12, 0, 0);
  add(g, B(0.045, 0.1, 0.05), m.wood, 0, -0.085, 0.06, -0.35, 0, 0);
  add(g, B(0.01, 0.012, 0.01), m.metal2, 0, 0.042, -0.69);
  add(g, B(0.03, 0.012, 0.02), m.metal, 0, 0.05, -0.02);
  arms(g, [0, -0.07, 0.06], [0, -0.04, -0.38]);
  return {
    group: g, mag: null, pump, pumpBase: pump.position.z,
    sight: new THREE.Vector3(0, 0.055, -0.05), muzzle: new THREE.Vector3(0, 0.022, -0.71),
    eject: new THREE.Vector3(0.04, 0.02, -0.05), hip: new THREE.Vector3(0.15, -0.16, -0.33), adsDist: 0.22,
  };
}

let ASSETS = null;
export function setWeaponAssets(a) { ASSETS = a?.ok ? a : null; GM.setGunAssets(ASSETS); }

/** Modèle Poly Haven orienté canon vers -z (le canon est sur +x dans le fichier). */
function photoModel(id, hideRe, offset) {
  const src = ASSETS?.clone(id);
  if (!src) return null;
  src.traverse((o) => { if (o.isMesh && hideRe.test(o.name)) o.visible = false; });
  src.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  src.rotation.y = Math.PI / 2;
  src.position.copy(offset);
  return src;
}

function buildSniperModel() {
  const inner = photoModel('bolt_action_rifle_7_62', /bolt_b|bullet/, new THREE.Vector3(0, 0, -0.24));
  if (!inner) return null;
  const g = new THREE.Group();
  g.add(inner);
  arms(g, [0, -0.06, 0.06], [0, -0.04, -0.36]);
  return {
    group: g, mag: null,
    sight: new THREE.Vector3(0, 0.075, -0.03), muzzle: new THREE.Vector3(0, 0.05, -0.86),
    eject: new THREE.Vector3(0.03, 0.04, -0.0), hip: new THREE.Vector3(0.14, -0.18, -0.4), adsDist: 0.25,
  };
}

function buildPistolModel() {
  const inner = photoModel('service_pistol', /_b$|magazine|bullet/, new THREE.Vector3(0, -0.03, -0.01));
  if (!inner) return null;
  const g = new THREE.Group();
  g.add(inner);
  let slide = null;
  inner.traverse((o) => { if (o.name === 'service_pistol_slide_a') slide = o; });
  arms(g, [0, -0.06, 0.03], [-0.01, -0.07, 0.02]);
  return {
    group: g, mag: null, slide, slideBase: slide ? slide.position.x : 0, slideAxisX: true,
    sight: new THREE.Vector3(0, 0.052, 0.01), muzzle: new THREE.Vector3(0, 0.035, -0.19),
    eject: new THREE.Vector3(0.02, 0.04, -0.04), hip: new THREE.Vector3(0.12, -0.16, -0.33), adsDist: 0.27,
  };
}

function buildSniper() {
  const sm = buildSniperModel();
  if (sm) return sm;
  const g = new THREE.Group(), m = mats();
  add(g, B(0.06, 0.08, 0.34), m.metal, 0, 0, -0.06);
  add(g, C(0.012, 0.015, 0.62), m.metal, 0, 0.015, -0.55);
  add(g, C(0.02, 0.02, 0.08), m.metal2, 0, 0.015, -0.88);
  add(g, B(0.062, 0.1, 0.34), m.tan, 0, -0.025, -0.33);
  add(g, B(0.06, 0.11, 0.38), m.tan, 0, -0.02, 0.26);
  add(g, B(0.045, 0.1, 0.05), m.tan, 0, -0.09, 0.07, -0.3, 0, 0);
  add(g, C(0.022, 0.022, 0.3), m.poly, 0, 0.09, -0.08);
  add(g, C(0.022, 0.032, 0.07), m.poly, 0, 0.09, -0.26);
  add(g, C(0.03, 0.022, 0.05), m.poly, 0, 0.09, 0.08);
  add(g, C(0.03, 0.03, 0.003), m.lens, 0, 0.09, -0.296);
  for (const z of [-0.16, 0.0]) add(g, B(0.03, 0.05, 0.02), m.metal, 0, 0.055, z);
  const bolt = add(g, C(0.008, 0.008, 0.06), m.metal2, 0.05, 0.02, 0.05, 0, Math.PI / 2, 0);
  const mag = add(g, B(0.045, 0.06, 0.08), m.metal, 0, -0.06, -0.1);
  arms(g, [0, -0.08, 0.07], [0, -0.06, -0.38]);
  return {
    group: g, mag, magBase: mag.position.clone(), bolt,
    sight: new THREE.Vector3(0, 0.09, -0.08), muzzle: new THREE.Vector3(0, 0.015, -0.92),
    eject: new THREE.Vector3(0.04, 0.03, -0.02), hip: new THREE.Vector3(0.15, -0.165, -0.33), adsDist: 0.25,
  };
}

function buildPistol() {
  const pm = buildPistolModel();
  if (pm) return pm;
  const g = new THREE.Group(), m = mats();
  const slide = add(g, B(0.032, 0.04, 0.19), m.metal, 0, 0.03, -0.06);
  add(g, B(0.03, 0.025, 0.17), m.poly, 0, 0.0, -0.06);
  add(g, B(0.03, 0.1, 0.045), m.poly, 0, -0.055, 0.0, -0.25, 0, 0);
  add(g, B(0.006, 0.012, 0.006), m.metal2, 0, 0.056, -0.145);
  add(g, B(0.022, 0.012, 0.006), m.metal2, 0, 0.056, 0.025);
  const mag = add(g, B(0.024, 0.06, 0.035), m.metal, 0, -0.09, 0.005, -0.25, 0, 0);
  arms(g, [0, -0.05, 0.01], [-0.01, -0.06, 0.0]);
  return {
    group: g, mag, magBase: mag.position.clone(), slide, slideBase: slide.position.z,
    sight: new THREE.Vector3(0, 0.058, -0.03), muzzle: new THREE.Vector3(0, 0.03, -0.16),
    eject: new THREE.Vector3(0.025, 0.04, -0.04), hip: new THREE.Vector3(0.13, -0.14, -0.3), adsDist: 0.26,
  };
}

/** Modèle 1re personne : arme réaliste + mains/bras. */
function buildViewmodel(id, att, skin) {
  const real = GM.buildRealGun(id, att, skin);
  const hopt = { ...(HAND_OPTS[id] || {}) };
  if (att.underbarrel === 'vgrip') hopt.support = 'vgrip';
  if (real) { arms(real.group, real.gripR, real.supL, hopt); return real; }
  if (id === 'sniper') return buildSniper();
  if (id === 'pistol') return buildPistol();
  const fn = { ar: GM.buildAR, smg: GM.buildSMG, shotgun: GM.buildShotgun, dmr: GM.buildAR }[id];
  const m = fn(att, skin);
  arms(m.group, m.gripR, m.supL, hopt);
  return m;
}

const ease = (t) => t * t * (3 - 2 * t);
const bell = (t) => Math.sin(Math.PI * Math.max(0, Math.min(1, t)));

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.scene = game.viewScene;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.models = {};
    this.statCache = {};
    this.slots = ['ar', 'pistol'];
    this.cur = 0;
    this.ammo = {};
    this.state = 'idle';
    this.timer = 0;
    this.fireCd = 0;
    this.adsT = 0;
    this.sprintT = 0;
    this.kickZ = 0; this.kickRot = 0; this.kickRand = 0;
    this.sway = new THREE.Vector2();
    this.bloom = 0;
    this.grenades = 2;
    this.cycleT = 0;
    this.flashT = 0;
    this.visible = true;

    // flash de bouche
    const tex = getTextures();
    const fm = new THREE.MeshBasicMaterial({ map: tex.flash, color: new THREE.Color(9, 6.5, 4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), fm);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.3), fm); p2.rotation.y = Math.PI / 2; p2.position.z = -0.1;
    const p3 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), fm); p3.rotation.x = Math.PI / 2; p3.position.z = -0.1;
    this.flash.add(p1, p2, p3);
    this.flash.visible = false;

    // douilles
    this.shells = [];
    const sg = new THREE.CylinderGeometry(0.005, 0.005, 0.028, 6);
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Mesh(sg, mats().brass);
      s.visible = false;
      this.scene.add(s);
      this.shells.push({ mesh: s, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    this.shellIdx = 0;
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }

  get id() { return this.slots[this.cur]; }
  get stats() { return this.statCache[this.id] || WEAPON_STATS[this.id]; }
  get model() { return this.models[this.id]; }

  /** cls : id d'arme ou classe { primary, att, skin } */
  setLoadout(cls) {
    if (typeof cls === 'string') cls = { primary: cls, att: {}, skin: 'black' };
    const key = JSON.stringify([cls.primary, cls.att, cls.skin]);
    this.slots = [cls.primary, 'pistol'];
    this.statCache = { [cls.primary]: effectiveStats(cls.primary, cls.att || {}), pistol: WEAPON_STATS.pistol };
    if (this.loadoutKey !== key) {
      for (const m of Object.values(this.models)) this.root.remove(m.group);
      this.models = {};
      this.loadoutKey = key;
    }
    for (const id of this.slots) {
      if (!this.models[id]) {
        const m = buildViewmodel(id, cls.att || {}, cls.skin || 'black');
        m.group.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
        m.ads = new THREE.Vector3(-m.sight.x, -m.sight.y, -m.adsDist - m.sight.z);
        m.muzzleObj = new THREE.Object3D(); m.muzzleObj.position.copy(m.muzzle); m.group.add(m.muzzleObj);
        m.ejectObj = new THREE.Object3D(); m.ejectObj.position.copy(m.eject); m.group.add(m.ejectObj);
        this.models[id] = m;
        this.root.add(m.group);
      }
    }
    this.refill(true);
    this.grenades = 2;
    this.cur = 0;
    this.showCurrent();
    this.state = 'raise'; this.timer = 0.4;
    this.adsT = 0; this.bloom = 0; this.fireCd = 0;
  }

  showCurrent() {
    for (const [id, m] of Object.entries(this.models)) m.group.visible = id === this.id;
    this.model.muzzleObj.add(this.flash);
  }

  refill(full = false) {
    for (const id of this.slots) {
      const st = this.statCache[id];
      if (full || !this.ammo[id]) this.ammo[id] = { mag: st.mag, reserve: st.reserve };
      else this.ammo[id].reserve = st.reserve;
    }
  }

  addAmmo(mags = 1) {
    for (const id of this.slots) {
      const st = this.statCache[id];
      this.ammo[id].reserve = Math.min(st.reserve, this.ammo[id].reserve + st.mag * mags);
    }
  }

  isAds() { return this.adsT > 0.5; }
  zoom() { const e = ease(this.adsT); return 1 + (this.stats.zoom - 1) * e; }
  canSprint() { return this.state !== 'reload' || true; }
  scoped() { return this.stats.scope && this.adsT > 0.92; }

  currentSpread(p) {
    const st = this.stats, ae = ease(this.adsT);
    let s = THREE.MathUtils.lerp(st.spreadHip, st.spreadAds, ae);
    const hs = Math.hypot(p.vel.x, p.vel.z);
    s += st.spreadMove * Math.min(1, hs / 5) * (1 - ae * 0.8);
    if (!p.body.grounded) s += 0.05 * (1 - ae * 0.5);
    if (p.crouching) s *= 0.8;
    s += this.bloom * (1 - ae * 0.6);
    return s;
  }

  startReload() {
    const st = this.stats, a = this.ammo[this.id], au = this.game.audio;
    if (a.mag >= st.mag || a.reserve <= 0) return;
    this.state = 'reload';
    if (st.mode === 'pump') {
      this.timer = st.reloadStart;
      this.reloadDur = st.reloadStart;
      this.shellLoop = true;
    } else {
      const empty = a.mag === 0;
      this.reloadDur = empty ? st.reloadEmpty : st.reload;
      this.timer = this.reloadDur;
      this.shellLoop = false;
      const pistol = this.id === 'pistol';
      if (!au.mech('out', this.reloadDur * 0.18, pistol)) au.magOut(this.reloadDur * 0.18);
      if (!au.mech('in', this.reloadDur * 0.58, pistol)) au.magIn(this.reloadDur * 0.58);
      if (empty && !au.mech('bolt', this.reloadDur * 0.8, pistol)) au.bolt(this.reloadDur * 0.8);
    }
  }

  switchTo(slot) {
    if (slot === this.cur || slot < 0 || slot >= this.slots.length) return;
    if (['lower', 'melee', 'throw'].includes(this.state)) return;
    this.pending = slot;
    this.state = 'lower';
    this.timer = 0.2;
    this.game.audio.draw();
  }

  update(dt, input, p) {
    const g = this.game, st = this.stats, a = this.ammo[this.id];
    this.fireCd -= dt; this.timer -= dt; this.cycleT -= dt; this.flashT -= dt;
    this.bloom *= Math.exp(-dt * 5);

    if (!p.alive) { this.root.visible = false; this.adsT = 0; return; }
    this.root.visible = this.visible && !this.scoped();

    // --- changement d'arme ---
    if (input.hit('Digit1')) this.switchTo(0);
    if (input.hit('Digit2')) this.switchTo(1);
    if (input.wheel !== 0) this.switchTo((this.cur + 1) % this.slots.length);
    if (this.state === 'lower' && this.timer <= 0) {
      this.cur = this.pending; this.showCurrent();
      this.state = 'raise'; this.timer = 0.3; this.adsT = 0;
      return;
    }
    if (this.state === 'raise' && this.timer <= 0) this.state = 'idle';

    // --- rechargement ---
    if (input.hit('KeyR') && this.state === 'idle') this.startReload();
    if (this.state === 'reload') {
      if (this.shellLoop) {
        if (input.mouseHit(0) && a.mag > 0) { this.state = 'idle'; g.audio.pump(); this.cycleT = 0.35; }
        else if (this.timer <= 0) {
          if (a.mag < st.mag && a.reserve > 0) {
            if (this.reloadDur !== st.reloadShell) { this.reloadDur = st.reloadShell; }
            else { a.mag++; a.reserve--; g.audio.shellIn(); }
            if (a.mag < st.mag && a.reserve > 0) this.timer = st.reloadShell;
            else { this.state = 'idle'; g.audio.pump(0.05); this.cycleT = 0.35; }
          } else { this.state = 'idle'; }
        }
      } else if (this.timer <= 0) {
        const take = Math.min(st.mag - a.mag, a.reserve);
        a.mag += take; a.reserve -= take;
        this.state = 'idle';
      }
    }

    // --- couteau ---
    if (input.hit('KeyV') && !['lower', 'raise', 'melee', 'throw'].includes(this.state)) {
      this.state = 'melee'; this.timer = 0.55; this.meleeDone = false;
      g.audio.swoosh();
    }
    if (this.state === 'melee') {
      if (!this.meleeDone && this.timer < 0.4) { this.meleeDone = true; g.melee(p); }
      if (this.timer <= 0) this.state = 'idle';
    }

    // --- grenade ---
    if (input.hit('KeyG') && this.grenades > 0 && !['lower', 'raise', 'melee', 'throw'].includes(this.state)) {
      this.state = 'throw'; this.timer = 0.7; this.thrown = false;
    }
    if (this.state === 'throw') {
      if (!this.thrown && this.timer < 0.42) {
        this.thrown = true; this.grenades--;
        const cam = g.camera;
        const dir = cam.getWorldDirection(new THREE.Vector3());
        const origin = cam.position.clone().addScaledVector(dir, 0.5);
        origin.y -= 0.1;
        const vel = dir.multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)).add(p.vel.clone().multiplyScalar(0.6));
        g.throwGrenade(p, origin, vel);
        g.audio.swoosh();
      }
      if (this.timer <= 0) this.state = 'idle';
    }

    // --- visée ---
    const wantAds = input.mouseDown(2) && !p.sprinting && (this.state === 'idle' || this.state === 'raise' || (this.state === 'reload' && st.mode === 'pump'));
    const rate = dt / st.adsTime;
    this.adsT = Math.max(0, Math.min(1, this.adsT + (wantAds ? rate : -rate * 1.3)));
    this.sprintT += ((p.sprinting && this.state !== 'melee' && this.state !== 'throw' ? 1 : 0) - this.sprintT) * Math.min(1, dt * 9);

    // --- tir ---
    if (this.state === 'idle' && this.sprintT < 0.35 && this.fireCd <= 0 && this.cycleT <= 0) {
      const trig = st.mode === 'auto' ? input.mouseDown(0) : input.mouseHit(0);
      if (trig) {
        if (a.mag > 0) this.fire(p);
        else if (input.mouseHit(0)) { g.audio.dry(); if (a.reserve > 0) this.startReload(); }
      } else if (a.mag === 0 && a.reserve > 0 && this.fireCd < -0.15) this.startReload();
    }

    this.updatePose(dt, input, p);
    this.updateShells(dt);
  }

  fire(p) {
    const g = this.game, st = this.stats, a = this.ammo[this.id], m = this.model;
    a.mag--;
    this.fireCd = 60 / st.rpm;
    p.shotsFired++;
    const cam = g.camera;
    const origin = cam.position.clone();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const spread = this.currentSpread(p);
    const ae = ease(this.adsT);
    // position monde approximative de la bouche du canon
    m.muzzleObj.getWorldPosition(this._v);
    const muzzleWorld = this._v.clone().applyMatrix4(cam.matrixWorld);
    if (this.scoped()) muzzleWorld.copy(origin).addScaledVector(fwd, 0.5).addScaledVector(up, -0.1);

    const hits = new Map();
    for (let i = 0; i < st.pellets; i++) {
      const cone = spread + (st.pellets > 1 ? st.pelletSpread * (1 - ae * 0.25) : 0);
      const r = Math.sqrt(Math.random()) * Math.tan(cone), th = Math.random() * Math.PI * 2;
      const dir = fwd.clone().addScaledVector(right, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r).normalize();
      const res = g.traceShot(origin, dir, 300, p);
      if (res.entity) {
        const dmg = damageAt(st, res.t) * (res.head ? st.headMult : 1);
        const h = hits.get(res.entity) || { dmg: 0, head: false, point: res.point };
        h.dmg += dmg; h.head = h.head || res.head;
        hits.set(res.entity, h);
        g.effects.blood(res.point, dir);
        if (Math.random() < 0.5) g.effects.bloodSplat(res.point, dir, g.world);
      } else if (res.hitWorld) {
        g.effects.impact(res.point, res.normal, res.box.mat);
        if (i === 0) g.audio.impact(res.point, res.box.mat && (res.box.mat.startsWith('c_') || res.box.mat.startsWith('metal') || res.box.mat.startsWith('car')));
      }
      if ((st.pellets === 1 && Math.random() < 0.55) || (st.pellets > 1 && i < 3)) g.effects.tracer(muzzleWorld, res.point);
    }
    let anyHit = false;
    for (const [ent, h] of hits) {
      anyHit = true;
      g.applyDamage(ent, h.dmg, p, { headshot: h.head, weapon: this.id, from: p.pos.clone(), point: h.point });
      const killed = !ent.alive && !ent.isRemote;
      g.hud.hitmarker(killed, h.head);
      g.audio.hitmarker(h.head);
    }
    if (anyHit) p.shotsHit++;

    // recul
    const rk = (1 - ae * 0.3) * (p.crouching ? 0.8 : 1);
    p.addRecoil(st.recoilPitch * rk, (Math.random() - 0.5 + st.recoilBias * 0.5) * 2 * st.recoilYaw * rk);
    p.trauma = Math.min(1, p.trauma + (st.pellets > 1 || st.mode === 'bolt' ? 0.25 : 0.04));
    this.bloom += st.bloom;
    const heavy = st.mode === 'pump' || st.mode === 'bolt';
    this.kickZ += (heavy ? 0.09 : 0.035) * (1 - ae * 0.4);
    this.kickRot += (heavy ? 0.16 : 0.045) * (1 - ae * 0.5);
    this.kickRand = (Math.random() - 0.5) * 0.02;

    // flash + lumière
    this.flashT = 0.045;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar((0.7 + Math.random() * 0.6) * (st.suppressed ? 0.25 : st.flashMul || 1));
    g.effects.flash(muzzleWorld, 0xffb060, 18, 9, 0.06);
    g.effects.gunSmoke(muzzleWorld, fwd);

    g.audio.shot(st.sound);
    g.onPlayerFire(this.id, origin, fwd, !!st.suppressed);

    if (st.mode === 'pump') { this.cycleT = 60 / st.rpm; g.audio.pump(0.25); setTimeout(() => this.ejectShell(), 350); }
    else if (st.mode === 'bolt') { this.cycleT = 60 / st.rpm; if (!g.audio.mech('bolt', 0.35)) g.audio.bolt(0.35); setTimeout(() => this.ejectShell(), 600); }
    else this.ejectShell();
  }

  ejectShell() {
    const m = this.model;
    if (!m || this.scoped()) return;
    const s = this.shells[this.shellIdx];
    this.shellIdx = (this.shellIdx + 1) % this.shells.length;
    m.ejectObj.getWorldPosition(s.mesh.position);
    s.vel.set(1.2 + Math.random() * 0.6, 1.4 + Math.random() * 0.6, 0.2 + Math.random() * 0.3);
    s.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    s.mesh.rotation.set(0, 0, Math.PI / 2);
    s.life = 0.7;
    s.mesh.visible = true;
    if (Math.random() < 0.5) this.game.audio.shellDrop(this.id === 'pistol');
  }

  updateShells(dt) {
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 9 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt; s.mesh.rotation.y += s.spin.y * dt;
      if (s.life <= 0) s.mesh.visible = false;
    }
  }

  updatePose(dt, input, p) {
    const m = this.model, st = this.stats;
    const ae = ease(this.adsT);
    const pos = this._v2.copy(m.hip).lerp(m.ads, ae);
    // arme légèrement inclinée en position hanche pour montrer son flanc
    let rx = 0, ry = 0.075 * (1 - ae), rz = -0.12 * (1 - ae);

    // balancement selon la souris
    this.sway.x += (-input.mx * 0.00035 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (input.my * 0.00035 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.x = Math.max(-0.04, Math.min(0.04, this.sway.x));
    this.sway.y = Math.max(-0.04, Math.min(0.04, this.sway.y));
    const sk = 1 - ae * 0.75;
    pos.x += this.sway.x * sk; pos.y += this.sway.y * sk;
    ry += this.sway.x * 1.5 * sk; rx += this.sway.y * 1.2 * sk;

    // marche
    const bob = p.bobAmount * (1 - ae * 0.9);
    pos.x += Math.cos(p.bobPhase) * 0.011 * bob;
    pos.y -= Math.abs(Math.sin(p.bobPhase)) * 0.013 * bob;
    rz += Math.cos(p.bobPhase) * 0.012 * bob;
    // respiration
    const t = this.game.time;
    pos.y += Math.sin(t * 1.6) * 0.0018 * (1 - ae * 0.7);
    pos.x += Math.sin(t * 0.8) * 0.0012 * (1 - ae * 0.7);

    // sprint
    const sp = ease(this.sprintT);
    pos.x += -0.04 * sp; pos.y += -0.05 * sp; pos.z += 0.04 * sp;
    ry += 0.75 * sp; rx += -0.2 * sp; rz += 0.25 * sp;

    // glissade
    if (p.sliding > 0) { rz += 0.25; pos.x -= 0.02; }

    // recul
    this.kickZ *= Math.exp(-dt * 14); this.kickRot *= Math.exp(-dt * 12);
    pos.z += this.kickZ; rx += this.kickRot; ry += this.kickRand * this.kickRot * 10;

    // atterrissage
    pos.y -= p.landDip * 0.4;

    // rechargement
    if (m.mag) m.mag.position.copy(m.magBase);
    if (this.state === 'reload') {
      const prog = 1 - this.timer / this.reloadDur;
      if (this.shellLoop) {
        const b = 0.6;
        rx += 0.15 * b; rz += -0.3 * b; pos.y -= 0.03 * b;
        pos.y += Math.sin(prog * Math.PI) * 0.01;
      } else {
        const b = bell(Math.min(1, prog * 1.1));
        rx += 0.35 * b; rz += -0.55 * b; pos.y -= 0.06 * b; pos.x -= 0.03 * b;
        if (m.mag) {
          const out = prog < 0.15 ? prog / 0.15 : prog < 0.45 ? 1 : prog < 0.6 ? 1 - (prog - 0.45) / 0.15 : 0;
          m.mag.position.y = m.magBase.y - out * 0.3;
        }
      }
    }
    // changement
    if (this.state === 'lower') { const k = 1 - Math.max(0, this.timer) / 0.2; pos.y -= 0.3 * k; rx -= 0.6 * k; }
    if (this.state === 'raise') { const k = Math.max(0, this.timer) / 0.3; pos.y -= 0.3 * k; rx -= 0.6 * k; }
    // couteau
    if (this.state === 'melee') {
      const k = bell(1 - this.timer / 0.55);
      pos.x -= 0.18 * k; pos.z -= 0.12 * k; pos.y += 0.02 * k; rz += 0.9 * k; ry += 0.6 * k;
    }
    // lancer de grenade
    if (this.state === 'throw') {
      const k = bell(1 - this.timer / 0.7);
      pos.y -= 0.35 * k; rx -= 0.8 * k;
    }
    // pompe / culasse
    if (m.pump) {
      const k = this.cycleT > 0 ? bell(1 - this.cycleT / (60 / st.rpm)) : 0;
      m.pump.position.z = m.pumpBase + 0.08 * k;
    }
    if (m.slide) {
      const k = Math.max(0, this.fireCd) / (60 / st.rpm);
      if (m.slideAxisX) m.slide.position.x = m.slideBase - k * 0.025;
      else m.slide.position.z = m.slideBase + k * 0.03;
    }
    if (m.bolt && this.cycleT > 0) {
      const k = bell(1 - this.cycleT / (60 / st.rpm));
      m.bolt.position.z = 0.05 + 0.06 * k; rz -= 0.12 * k;
    }

    this.root.position.copy(pos);
    this.root.rotation.set(rx, ry, rz);
    this.flash.visible = this.flashT > 0;
  }
}
