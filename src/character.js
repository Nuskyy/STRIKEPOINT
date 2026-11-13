// Personnage réaliste (Soldier.glb, squelette Mixamo) : animations repos/marche/course fondues,
// buste qui suit la visée, bras en position de tir, arme dans la main, équipement par opérateur.
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { buildThirdPersonGun } from './gunmodels.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Opérateurs disponibles (variations d'équipement et de teinte). level = niveau de déblocage. */
export const OPERATORS = {
  ranger: { name: 'Ranger', level: 1, tint: 0xffffff, helmet: 'combat', vest: 0x3d4434, pack: true, desc: 'Casque de combat, gilet olive' },
  ghost: { name: 'Ghost', level: 1, tint: 0x9a9a98, helmet: 'none', balaclava: 0x1d1e1f, vest: 0x2a2b2c, pack: false, desc: 'Cagoule noire, gilet léger' },
  desert: { name: 'Mirage', level: 5, tint: 0xd8c4a0, helmet: 'combat', helmetColor: 0x8a7656, vest: 0x7d6a4c, pack: true, desc: 'Tenue désert, casque sable' },
  arctic: { name: 'Blizzard', level: 10, tint: 0xe8eef2, helmet: 'combat', helmetColor: 0xd5dadd, vest: 0xb7bec4, pack: true, desc: 'Camouflage hivernal' },
  urban: { name: 'Vandal', level: 15, tint: 0x8c9098, helmet: 'cap', capColor: 0x2b2d33, vest: 0x34373d, pack: false, desc: 'Casquette, gilet urbain' },
  elite: { name: 'Spectre', level: 25, tint: 0x6c6c6c, helmet: 'combat', helmetColor: 0x1e1f21, visor: true, vest: 0x1e1f21, pack: true, desc: 'Visière tactique, tenue noire' },
};
export const OPERATOR_IDS = Object.keys(OPERATORS);

// Position de l'arme épaulée (repère du personnage, m) et pôles des coudes.
export const POSE = {
  shoulder: [0.14, 1.43, -0.06],
  gunOffset: [0, -0.02, -0.17],
  poleR: [0.9, -1, 0.5], poleL: [-0.6, -1, -0.2],
};

export let SPINE_SIGN = -1;
export function setSpineSign(s) { SPINE_SIGN = s; }
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3(), _el = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

/** Oriente `bone` pour que la direction vers `child` pointe vers la position monde `target`. */
function aimBone(bone, child, target) {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  const cur = _c.copy(_b).sub(_a).normalize();
  const want = _d.copy(target).sub(_a).normalize();
  _q.setFromUnitVectors(cur, want);
  bone.getWorldQuaternion(_qa);
  _qa.premultiply(_q);
  bone.parent.getWorldQuaternion(_qb);
  bone.quaternion.copy(_qb.invert().multiply(_qa));
  bone.updateWorldMatrix(false, true);
}

/** IK à deux os (épaule → coude → main) vers `target`, coude orienté vers `pole` (direction monde). */
function twoBoneIK(upper, lower, end, target, pole) {
  upper.updateWorldMatrix(true, true);
  const A = upper.getWorldPosition(new THREE.Vector3());
  const E0 = lower.getWorldPosition(new THREE.Vector3());
  const H0 = end.getWorldPosition(new THREE.Vector3());
  const L1 = A.distanceTo(E0), L2 = E0.distanceTo(H0);
  const toT = _t.copy(target).sub(A);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const n = _n.copy(toT).normalize();
  const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const b = _p.copy(pole).addScaledVector(n, -pole.dot(n)).normalize();
  const elbow = _el.copy(A).addScaledVector(n, L1 * cosA).addScaledVector(b, L1 * Math.sqrt(1 - cosA * cosA));
  aimBone(upper, lower, elbow);
  aimBone(lower, end, _t.copy(A).addScaledVector(n, d));
}

export class CharacterModel {
  constructor(assets, team, opts = {}) {
    const src = assets.character;
    this.op = OPERATORS[opts.operator] || OPERATORS[team === 'A' ? 'ranger' : 'ghost'];
    this.group = new THREE.Group();
    this.root = new THREE.Group();
    this.group.add(this.root);
    const body = this.body = skeletonClone(src.scene);
    this.root.add(body); // le modèle regarde déjà -z (avant du jeu)

    // teinte d'équipe / d'opérateur (matériaux clonés)
    const teamTint = new THREE.Color(team === 'A' ? 0xc8d4bc : team === 'B' ? 0xe0cdb0 : 0xc4c8d4);
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (o.name === 'vanguard_Mesh') o.material.color.copy(new THREE.Color(this.op.tint)).multiply(teamTint);
      o.material.roughness = 0.85;
    });

    this.bones = {};
    body.traverse((o) => { if (o.isBone) this.bones[o.name.replace('mixamorig', '')] = o; });

    this.mixer = new THREE.AnimationMixer(body);
    this.actions = {};
    for (const clip of src.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const k of ['Idle', 'Walk', 'Run']) { const a = this.actions[k]; if (a) { a.play(); a.setEffectiveWeight(k === 'Idle' ? 1 : 0); } }
    this.mixer.update(Math.random() * 2);

    this.addGear(team);

    // arme épaulée : pivot à l'épaule droite, incliné selon la visée ; les mains suivent par IK
    const gun = this.gun = buildThirdPersonGun(opts.weapon || 'ar');
    this.aimPivot = new THREE.Group();
    this.root.add(this.aimPivot);
    this.aimPivot.add(gun.group);
    this.muzzle = gun.muzzle;
    this.gripTarget = new THREE.Object3D(); this.gripTarget.position.set(...gun.gripR); gun.group.add(this.gripTarget);
    this.supTarget = new THREE.Object3D(); this.supTarget.position.set(...gun.supL); gun.group.add(this.supTarget);
    this.applyGunPose();

    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.flinch = 0;
    this.crouchT = 0;
    this.speedT = 0;
    this.dead = false;
  }

  applyGunPose() {
    this.aimPivot.position.set(...POSE.shoulder);
    this.gun.group.position.set(...POSE.gunOffset);
  }

  addGear(team) {
    const op = this.op, B = this.bones;
    const S = 100;
    const mat = (c, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const head = B.Head, spine = B.Spine2;
    if (head && op.helmet === 'combat') {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(op.helmetColor || 0x4a5236, 0.75));
      h.scale.set(S * 1.02, S * 0.92, S * 1.1);
      h.position.set(0, 0.11 * S, 0.005 * S);
      head.add(h);
      const nv = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.03), mat(0x1c1c1c, 0.5, 0.4));
      nv.scale.setScalar(S); nv.position.set(0, 0.2 * S, 0.12 * S); head.add(nv);
      if (op.visor) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: 0x0b0f12, roughness: 0.05, metalness: 0.9 }));
        v.scale.setScalar(S); v.position.set(0, 0.085 * S, 0.115 * S); head.add(v);
      }
    } else if (head && op.helmet === 'cap') {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(op.capColor, 0.9));
      cap.scale.set(S, S * 0.75, S * 1.05); cap.position.set(0, 0.12 * S, 0); head.add(cap);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 18, 1, false, -Math.PI / 2, Math.PI), mat(op.capColor, 0.9));
      brim.scale.setScalar(S); brim.position.set(0, 0.125 * S, 0.06 * S); head.add(brim);
    }
    if (head && op.balaclava) {
      const bc = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 12), mat(op.balaclava, 0.95));
      bc.scale.set(S, S * 1.15, S * 1.05); bc.position.set(0, 0.075 * S, 0.012 * S); head.add(bc);
      const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.02), mat(0x2a2018, 0.8));
      eyes.scale.setScalar(S); eyes.position.set(0, 0.095 * S, 0.105 * S); head.add(eyes);
    }
    if (spine) {
      if (op.pack) {
        const pack = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.32, 0.12, 2, 0.03), mat(op.vest, 0.95));
        pack.scale.setScalar(S); pack.position.set(0, 0.0, -0.17 * S); spine.add(pack);
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 12), mat(0x3b3a30, 0.95));
        roll.rotation.z = Math.PI / 2; roll.scale.setScalar(S); roll.position.set(0, 0.17 * S, -0.17 * S); spine.add(roll);
      }
    }
    // marqueur d'équipe discret (brassard)
    if (B.LeftArm) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: team === 'A' ? 0x2d6bd0 : 0xb02a20, roughness: 0.7, side: THREE.DoubleSide }));
      band.scale.setScalar(S); band.position.set(0, 0.12 * S, 0); B.LeftArm.add(band);
    }
  }

  addTag(text, color = '#5aa9ff') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 28px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, 128, 26); ctx.fillStyle = color; ctx.fillText(text, 128, 26);
    ctx.beginPath(); ctx.moveTo(116, 40); ctx.lineTo(140, 40); ctx.lineTo(128, 56); ctx.closePath(); ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(1.1, 0.275, 1);
    sp.position.y = 2.2;
    sp.renderOrder = 10;
    this.group.add(sp);
    this.tag = sp;
  }

  setWeights(speed) {
    const A = this.actions;
    this.speedT += (speed - this.speedT) * 0.2;
    const s = this.speedT;
    const run = THREE.MathUtils.smoothstep(s, 3.2, 4.6);
    const walk = THREE.MathUtils.smoothstep(s, 0.3, 1.2) * (1 - run);
    const idle = 1 - walk - run;
    A.Idle?.setEffectiveWeight(idle);
    A.Walk?.setEffectiveWeight(walk);
    A.Run?.setEffectiveWeight(run);
    if (A.Walk) A.Walk.timeScale = THREE.MathUtils.clamp(s / 1.6, 0.6, 1.6);
    if (A.Run) A.Run.timeScale = THREE.MathUtils.clamp(s / 5, 0.7, 1.3);
  }

  rot(name, x, y, z) {
    const b = this.bones[name];
    if (!b) return;
    _q.setFromEuler(_e.set(x, y, z));
    b.quaternion.multiply(_q);
  }

  animate(dt, speed, aimPitch, crouch) {
    if (this.dead) return;
    this.setWeights(speed);
    this.mixer.update(dt);
    this.crouchT += ((crouch ? 1 : 0) - this.crouchT) * Math.min(1, dt * 8);
    this.flinch = Math.max(0, this.flinch - dt * 5);
    const c = this.crouchT;
    // visée verticale répartie sur la colonne
    const ap = aimPitch * 0.25 - this.flinch * 0.15;
    this.rot('Spine', SPINE_SIGN * ap, 0, 0); this.rot('Spine1', SPINE_SIGN * ap, 0, 0); this.rot('Spine2', SPINE_SIGN * ap, 0, 0);
    // accroupi
    if (c > 0.01) {
      this.rot('LeftUpLeg', -1.1 * c, 0, 0); this.rot('RightUpLeg', -1.1 * c, 0, 0);
      this.rot('LeftLeg', 1.7 * c, 0, 0); this.rot('RightLeg', 1.7 * c, 0, 0);
      this.body.position.y = -0.42 * c;
    } else this.body.position.y = 0;
    // arme : suit la respiration / la marche légèrement
    const bob = Math.sin(this.mixer.time * 9) * 0.008 * Math.min(1, this.speedT / 3);
    this.aimPivot.position.set(POSE.shoulder[0], POSE.shoulder[1] - 0.42 * c + bob, POSE.shoulder[2]);
    this.aimPivot.rotation.set(aimPitch - this.flinch * 0.2, 0, 0);
    // bras par IK vers la poignée et le garde-main
    const B = this.bones;
    if (B.RightArm && B.LeftArm) {
      this.root.updateWorldMatrix(true, true);
      this.root.getWorldQuaternion(_qa);
      const gR = this.gripTarget.getWorldPosition(new THREE.Vector3());
      const gL = this.supTarget.getWorldPosition(new THREE.Vector3());
      twoBoneIK(B.RightArm, B.RightForeArm, B.RightHand, gR, new THREE.Vector3(...POSE.poleR).applyQuaternion(_qa).normalize());
      twoBoneIK(B.LeftArm, B.LeftForeArm, B.LeftHand, gL, new THREE.Vector3(...POSE.poleL).applyQuaternion(_qa).normalize());
    }
  }

  die() {
    this.dead = true;
  }

  revive() {
    this.dead = false;
  }
}
