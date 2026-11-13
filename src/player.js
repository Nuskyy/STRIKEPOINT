// Contrôleur FPS : déplacement, sprint, accroupi, glissade, saut, penché, recul, régénération.
import * as THREE from 'three';
import { moveBody, blockedAt } from './physics.js';

const STAND = 1.8, CROUCH = 1.2, SLIDE = 1.0;

export class Player {
  constructor(game) {
    this.game = game;
    this.id = 'player';
    this.name = 'Vous';
    this.isPlayer = true;
    this.team = 'A';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.body = { pos: this.pos, vel: this.vel, radius: 0.35, height: STAND, stepHeight: 0.5, grounded: false, canStep: false };
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100;
    this.alive = false;
    this.kills = 0; this.deaths = 0; this.score = 0; this.streak = 0; this.headshots = 0;
    this.shotsFired = 0; this.shotsHit = 0;
    this.height = STAND;
    this.crouchToggle = false;
    this.crouching = false;
    this.sprinting = false;
    this.sliding = 0;
    this.slideDir = new THREE.Vector3();
    this.lean = 0;
    this.bobPhase = 0; this.bobAmount = 0;
    this.landDip = 0;
    this.trauma = 0;
    this.recoilAccum = 0;
    this.lastShot = -9;
    this.lastDamage = -99;
    this.lastShotTime = -99;
    this.deathTime = 0;
    this._hb = [
      { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, head: true },
      { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, head: false },
    ];
    this.eye = new THREE.Vector3();
  }

  spawn(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.hp = this.maxHp; this.alive = true;
    this.height = STAND; this.body.height = STAND;
    this.crouchToggle = false; this.sliding = 0; this.lean = 0;
    this.streak = 0; this.recoilAccum = 0; this.trauma = 0;
    this.lastDamage = -99;
  }

  addRecoil(p, y) {
    this.pitch += p; this.yaw += y;
    this.recoilAccum += p;
    this.lastShot = this.game.time;
  }

  getHitboxes() {
    const p = this.pos, h = this.height;
    const hb = this._hb[0], bb = this._hb[1];
    hb.min.x = p.x - 0.16; hb.min.y = p.y + h - 0.32; hb.min.z = p.z - 0.16;
    hb.max.x = p.x + 0.16; hb.max.y = p.y + h + 0.02; hb.max.z = p.z + 0.16;
    bb.min.x = p.x - 0.32; bb.min.y = p.y; bb.min.z = p.z - 0.32;
    bb.max.x = p.x + 0.32; bb.max.y = p.y + h - 0.32; bb.max.z = p.z + 0.32;
    return this._hb;
  }

  eyePos(out = this.eye) { return out.set(this.pos.x, this.pos.y + this.height - 0.14, this.pos.z); }

  onDamaged(amount, attacker, info) {
    this.lastDamage = this.game.time;
    this.trauma = Math.min(1, this.trauma + 0.15 + amount / 200);
    this.game.audio.hurt();
    const from = info?.from || attacker?.pos;
    if (from) this.game.hud.damageIndicator(from, this);
  }

  onDeath(info, killer) {
    this.alive = false;
    this.deathTime = this.game.time;
    this.vel.set(0, 0, 0);
    this.streak = 0;
  }

  update(dt, input) {
    const g = this.game, w = g.weapons, cam = g.camera;
    if (!this.alive) {
      // caméra de mort
      const k = Math.min(1, (g.time - this.deathTime) / 0.7);
      const e = 1 - Math.pow(1 - k, 3);
      cam.position.set(this.pos.x, this.pos.y + THREE.MathUtils.lerp(this.height - 0.14, 0.35, e), this.pos.z);
      cam.rotation.set(this.pitch * (1 - e) - 0.2 * e, this.yaw, 0.5 * e, 'YXZ');
      return;
    }
    const s = g.settings;
    // --- Visée ---
    const zoom = w.zoom();
    const sens = (0.0022 * s.sens) / Math.pow(zoom, 0.9);
    this.yaw -= input.mx * sens;
    this.pitch -= input.my * sens * (s.invertY ? -1 : 1);
    // récupération du recul
    if (g.time - this.lastShot > 0.09 && this.recoilAccum > 0) {
      const rec = this.recoilAccum * (1 - Math.exp(-dt * 7));
      this.pitch -= rec * 0.85;
      this.recoilAccum -= rec;
    }
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));

    // --- Entrées de déplacement ---
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const sd = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const grounded = this.body.grounded;
    const hs = Math.hypot(this.vel.x, this.vel.z);

    if (input.hit('KeyC')) {
      if (this.sprinting && hs > 5.5 && grounded && this.sliding <= 0) {
        this.sliding = 0.75;
        this.slideDir.set(this.vel.x, 0, this.vel.z).normalize();
        this.slideSpeed = Math.min(11, hs * 1.35);
        g.audio.swoosh();
      } else {
        this.crouchToggle = !this.crouchToggle;
      }
    }

    const wantsSprint = input.down('ShiftLeft') && f > 0 && !w.isAds() && !input.mouseDown(0) && w.canSprint();
    if (wantsSprint && this.crouchToggle && this.sliding <= 0 && !blockedAt(g.world, this.pos.x, this.pos.y + 0.05, this.pos.z, 0.34, STAND)) this.crouchToggle = false;
    this.sprinting = wantsSprint && !this.crouchToggle && this.sliding <= 0;

    // --- Saut ---
    if (input.hit('Space') && grounded) {
      if (this.crouchToggle && this.sliding <= 0) {
        if (!blockedAt(g.world, this.pos.x, this.pos.y + 0.05, this.pos.z, 0.34, STAND)) this.crouchToggle = false;
      } else {
        this.vel.y = 7.4;
        if (this.sliding > 0) { this.sliding = 0; this.crouchToggle = false; }
        this.body.grounded = false;
      }
    }

    // --- Vitesse cible ---
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = fx * f + rx * sd, wz = fz * f + rz * sd;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const st = w.stats;
    let speed = 5.0 * (st ? st.moveMult : 1);
    if (this.sprinting) speed = 7.4;
    else if (this.crouchToggle) speed = 2.6;
    if (w.adsT > 0.3) speed *= 0.6;

    if (this.sliding > 0) {
      this.sliding -= dt;
      const k = 1 - this.sliding / 0.75;
      const sp = THREE.MathUtils.lerp(this.slideSpeed, 3.5, k * k);
      // léger contrôle latéral
      this.slideDir.x += rx * sd * dt * 0.8; this.slideDir.z += rz * sd * dt * 0.8;
      this.slideDir.normalize();
      this.vel.x = this.slideDir.x * sp; this.vel.z = this.slideDir.z * sp;
      if (this.sliding <= 0) this.crouchToggle = true;
    } else {
      const tx = wx * speed, tz = wz * speed;
      const accel = grounded ? (wl > 0 ? 60 : 45) : 10;
      const dx = tx - this.vel.x, dz = tz - this.vel.z;
      const dl = Math.hypot(dx, dz), md = accel * dt;
      if (grounded || wl > 0) {
        if (dl <= md) { this.vel.x = tx; this.vel.z = tz; } else { this.vel.x += (dx / dl) * md; this.vel.z += (dz / dl) * md; }
      }
    }
    this.vel.y -= 22 * dt;

    // --- Hauteur (accroupi / glissade) ---
    let targetH = this.sliding > 0 ? SLIDE : this.crouchToggle ? CROUCH : STAND;
    if (targetH > this.height && blockedAt(g.world, this.pos.x, this.pos.y + 0.05, this.pos.z, 0.34, targetH)) {
      targetH = this.height;
      if (!this.crouchToggle && this.sliding <= 0) this.crouchToggle = true;
    }
    this.height += (targetH - this.height) * Math.min(1, dt * 12);
    this.body.height = this.height;
    this.crouching = this.height < 1.5;

    // --- Physique ---
    const prevVy = this.vel.y;
    const wasGrounded = grounded;
    moveBody(g.world, this.body, dt);
    if (!wasGrounded && this.body.grounded && prevVy < -4) {
      this.landDip = Math.min(0.18, -prevVy * 0.016);
      g.audio.land(Math.min(0.8, -prevVy * 0.06));
    }
    this.landDip *= Math.exp(-dt * 9);

    // --- Balancement de tête + bruits de pas ---
    const hs2 = Math.hypot(this.vel.x, this.vel.z);
    const prevSin = Math.sin(this.bobPhase);
    if (this.body.grounded && hs2 > 0.5 && this.sliding <= 0) {
      this.bobPhase += dt * hs2 * (this.sprinting ? 1.25 : 1.55);
      this.bobAmount += (Math.min(1.3, hs2 / 5) - this.bobAmount) * Math.min(1, dt * 8);
      const cur = Math.sin(this.bobPhase);
      if (prevSin * cur < 0 && !this.crouching) {
        g.audio.footstep(this.sprinting ? 0.32 : 0.2);
        g.noise(this.pos, this.sprinting ? 18 : 10, this);
      }
    } else {
      this.bobAmount += (0 - this.bobAmount) * Math.min(1, dt * 6);
    }

    // --- Penché ---
    const leanIn = (input.down('KeyE') ? 1 : 0) - (input.down('KeyQ') ? 1 : 0);
    const leanT = this.sprinting || this.sliding > 0 ? 0 : leanIn;
    this.lean += (leanT - this.lean) * Math.min(1, dt * 9);

    // --- Régénération ---
    if (g.time - this.lastDamage > 4 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 35 * dt);

    // --- Caméra ---
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const tr = this.trauma * this.trauma;
    const ads = w.adsT;
    const bobK = this.bobAmount * (1 - ads * 0.85);
    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * bobK;
    const bobX = Math.cos(this.bobPhase) * 0.025 * bobK;
    let leanOff = this.lean * 0.38;
    if (Math.abs(leanOff) > 0.01) {
      const eye = this.eyePos(new THREE.Vector3());
      const dir = { x: rx * Math.sign(leanOff), y: 0, z: rz * Math.sign(leanOff) };
      const hit = g.world.raycast(eye, dir, Math.abs(leanOff) + 0.2);
      if (hit) leanOff = Math.sign(leanOff) * Math.max(0, hit.t - 0.2);
    }
    const ey = this.pos.y + this.height - 0.14 - this.landDip + bobY;
    cam.position.set(this.pos.x + rx * (bobX + leanOff), ey, this.pos.z + rz * (bobX + leanOff));
    const strafeTilt = -sd * 0.012 * (this.body.grounded ? 1 : 0);
    cam.rotation.set(
      this.pitch + (Math.random() - 0.5) * tr * 0.06,
      this.yaw + (Math.random() - 0.5) * tr * 0.06,
      -this.lean * 0.12 + strafeTilt + (this.sliding > 0 ? 0.06 : 0) + (Math.random() - 0.5) * tr * 0.05,
      'YXZ',
    );
  }
}
