// IA de soldat : perception (vue/ouïe), patrouille, poursuite, combat, mise à couvert, rechargement.
import * as THREE from 'three';
import { SoldierModel, TEAM_COLORS } from './soldier.js';
import { CharacterModel } from './character.js';
import { moveBody } from './physics.js';
import { WEAPON_STATS } from './shared/stats.js';

const BOT_WEAPONS = {
  ar: { rpm: 600, damage: 22, burst: [3, 6], range: 70, mag: 30, reload: 2.4, sound: WEAPON_STATS.ar.sound },
  smg: { rpm: 820, damage: 17, burst: [4, 8], range: 40, mag: 32, reload: 2.0, sound: WEAPON_STATS.smg.sound },
};

export const DIFFICULTY = {
  easy: { acc: 0.2, react: [0.7, 1.1], dmg: 0.65, turn: 4 },
  normal: { acc: 0.32, react: [0.45, 0.8], dmg: 0.9, turn: 6 },
  hard: { acc: 0.46, react: [0.25, 0.5], dmg: 1.15, turn: 8 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
let NEXT_ID = 1;

export class Bot {
  constructor(game, team, name, opts = {}) {
    this.game = game;
    this.team = team;
    this.name = name;
    this.id = 'bot_' + NEXT_ID++;
    this.isBot = true;
    this.weaponKey = opts.weapon || (Math.random() < 0.7 ? 'ar' : 'smg');
    if (game.assets?.character) {
      const ops = team === 'A' ? ['ranger', 'desert', 'arctic', 'elite'] : ['ghost', 'urban', 'elite', 'desert'];
      this.model = new CharacterModel(game.assets, team, { operator: opts.operator || ops[Math.floor(Math.random() * ops.length)], weapon: this.weaponKey });
    } else this.model = new SoldierModel(TEAM_COLORS[team]);
    if (opts.ally) this.model.addTag(name);
    game.scene.add(this.model.group);
    this.model.group.visible = false;
    this.pos = this.model.group.position;
    this.vel = new THREE.Vector3();
    this.body = { pos: this.pos, vel: this.vel, radius: 0.4, height: 1.8, stepHeight: 0.45, grounded: true, canStep: true };
    this.yaw = 0; this.pitch = 0;
    this.maxHp = opts.hp || 100;
    this.hp = this.maxHp;
    this.alive = false;
    this.kills = 0; this.deaths = 0; this.score = 0; this.streak = 0;
    this.weapon = BOT_WEAPONS[this.weaponKey];
    this.accBonus = opts.accBonus || 0;
    this.hunter = !!opts.hunter;
    this.crouching = false;
    this.lastShotTime = -99;
    this.removed = false;
    this._hb = [
      { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, head: true },
      { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, head: false },
    ];
    this.lastSeenPos = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  get diff() { return DIFFICULTY[this.game.settings.difficulty] || DIFFICULTY.normal; }

  spawn(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.hp = this.maxHp;
    this.alive = true;
    this.removed = false;
    this.state = 'patrol';
    this.stateTime = 0;
    this.target = null;
    this.targetVisible = false;
    this.lastSeenTime = -99;
    this.path = null; this.pathIdx = 0;
    this.repath = 0;
    this.thinkT = Math.random() * 0.2;
    this.fireCd = 0;
    this.burstLeft = 0;
    this.reaction = 0;
    this.reloadT = 0;
    this.ammo = this.weapon.mag;
    this.strafeT = 0; this.strafeDir = 0;
    this.coverT = 0;
    this.stuckT = 0;
    this.shotsAtTarget = 0;
    this.crouching = false;
    this.model.root.rotation.set(0, 0, 0);
    this.model.root.position.set(0, 0, 0);
    this.model.revive?.();
    this.model.group.visible = true;
    if (this.model.tag) this.model.tag.visible = true;
  }

  eyePos(out = this.eye) { return out.set(this.pos.x, this.pos.y + (this.crouching ? 1.15 : 1.6), this.pos.z); }

  getHitboxes() {
    const p = this.pos, c = this.crouching ? 0.38 : 0;
    const hb = this._hb[0], bb = this._hb[1];
    hb.min.x = p.x - 0.16; hb.min.y = p.y + 1.5 - c; hb.min.z = p.z - 0.16;
    hb.max.x = p.x + 0.16; hb.max.y = p.y + 1.86 - c; hb.max.z = p.z + 0.16;
    bb.min.x = p.x - 0.32; bb.min.y = p.y; bb.min.z = p.z - 0.32;
    bb.max.x = p.x + 0.32; bb.max.y = p.y + 1.5 - c; bb.max.z = p.z + 0.32;
    return this._hb;
  }

  setState(s) { this.state = s; this.stateTime = 0; this.path = null; }

  requestPath(x, z) {
    const g = this.game;
    if (g.pathBudget <= 0) { this.repath = 0.1; return false; }
    g.pathBudget--;
    this.path = g.nav.findPath(this.pos.x, this.pos.z, x, z);
    this.pathIdx = 1;
    this.repath = 3 + Math.random() * 2;
    return !!this.path;
  }

  followPath(speed, out) {
    if (!this.path) return false;
    let wp = this.path[this.pathIdx];
    while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.7) { this.pathIdx++; wp = this.path[this.pathIdx]; }
    if (!wp) { this.path = null; return false; }
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
    out.x = (dx / d) * speed; out.z = (dz / d) * speed;
    return true;
  }

  hear(pos, source) {
    if (!this.alive || this.targetVisible) return;
    if (this.state === 'combat' || this.state === 'cover') return;
    this.lastSeenPos.copy(pos);
    if (source && source.alive) this.target = source;
    this.setState('investigate');
  }

  onDamaged(amount, attacker, info) {
    this.model.flinch = 1;
    if (attacker && attacker.alive && attacker !== this) {
      if (!this.targetVisible || this.target !== attacker) {
        this.target = attacker;
        this.lastSeenPos.copy(attacker.pos);
        this.lastSeenTime = this.game.time;
        this.reaction = Math.min(this.reaction, 0.25);
        if (this.state !== 'combat' && this.state !== 'cover') this.setState('chase');
      }
    }
    if (this.hp < this.maxHp * 0.45 && this.state !== 'cover' && Math.random() < 0.6) this.seekCover();
  }

  onDeath(info, killer) {
    this.alive = false;
    this.deathT = 0;
    this.crouching = false;
    const from = killer ? killer.pos : info?.from;
    let back = 1;
    if (from) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      back = (from.x - this.pos.x) * fx + (from.z - this.pos.z) * fz > 0 ? 1 : -1;
    }
    this.fallDir = back;
    this.fallSide = (Math.random() - 0.5) * 0.6;
    if (this.model.tag) this.model.tag.visible = false;
  }

  perceive() {
    const g = this.game;
    const eye = this.eyePos();
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const cands = [];
    for (const c of g.combatants()) {
      if (!c.alive || c.team === this.team) continue;
      const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 85) continue;
      const dot = (dx * fx + dz * fz) / Math.max(d, 0.01);
      if (d > 7 && dot < 0.2 && c !== this.target) continue;
      cands.push([d, c]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    let best = null;
    for (let i = 0; i < Math.min(3, cands.length); i++) {
      const c = cands[i][1];
      const t = c.eyePos(this._t);
      t.y -= 0.35;
      if (g.world.clear(eye, t)) { best = c; break; }
      t.y += 0.4;
      if (g.world.clear(eye, t)) { best = c; break; }
    }
    if (best) {
      if (this.target !== best || !this.targetVisible) {
        const r = this.diff.react;
        this.reaction = rand(r[0], r[1]) * (this.state === 'combat' ? 0.5 : 1);
        this.shotsAtTarget = 0;
      }
      this.target = best;
      this.targetVisible = true;
      this.lastSeenPos.copy(best.pos);
      this.lastSeenTime = g.time;
      if (this.state !== 'combat' && this.state !== 'cover') this.setState('combat');
    } else {
      this.targetVisible = false;
      if (this.target && !this.target.alive) {
        this.target = null;
        if (this.state === 'combat' || this.state === 'chase') this.setState('patrol');
      }
    }
  }

  seekCover() {
    const g = this.game;
    const threat = this.target ? this.target.eyePos(new THREE.Vector3()) : null;
    if (!threat) return;
    let best = null, bestD = 1e9;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, r = 3 + Math.random() * 8;
      const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      if (!g.nav.walkableAt(x, z)) continue;
      if (g.world.clear(threat, { x, y: 1.1, z })) continue;
      if (r < bestD) { bestD = r; best = { x, z }; }
    }
    if (best) {
      this.setState('cover');
      this.coverPos = best;
      this.coverT = rand(2, 3.5);
      this.requestPath(best.x, best.z);
    }
  }

  faceTowards(x, z, dt, rate) {
    const want = Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
    const d = angDiff(this.yaw, want);
    const step = rate * dt;
    this.yaw += Math.abs(d) < step ? d : Math.sign(d) * step;
    return Math.abs(angDiff(this.yaw, want));
  }

  update(dt) {
    if (!this.alive) { this.updateDeath(dt); return; }
    const g = this.game;
    this.stateTime += dt;
    this.thinkT -= dt;
    this.repath -= dt;
    this.fireCd -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.16 + Math.random() * 0.08; this.perceive(); }

    const want = { x: 0, z: 0 };
    let faceMove = true;
    let speed = 0;
    let targetPitch = 0;

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.ammo = this.weapon.mag;
    }

    switch (this.state) {
      case 'patrol': {
        speed = this.hunter ? 4.2 : 2.6;
        if (!this.path || this.repath <= 0) {
          let dest;
          const pl = g.player;
          if (this.hunter && pl && pl.alive) dest = g.nav.randomPoint(pl.pos.x, pl.pos.z, 14);
          else if (g.mode === 'tdm') dest = g.nav.randomPoint(this.team === 'A' ? 15 : -15, 0, 45);
          else dest = g.nav.randomPoint();
          this.requestPath(dest.x, dest.z);
          this.repath = this.hunter ? 5 : 10;
        }
        if (!this.followPath(speed, want)) this.path = null;
        break;
      }
      case 'investigate':
      case 'chase': {
        speed = this.state === 'chase' ? 4.8 : 3.8;
        if (!this.path && this.repath <= 0) this.requestPath(this.lastSeenPos.x, this.lastSeenPos.z);
        if (!this.followPath(speed, want)) {
          if (this.stateTime > 0.5 && !this.path) this.setState('search');
        }
        if (this.stateTime > 14) this.setState('patrol');
        break;
      }
      case 'search': {
        this.yaw += dt * 1.5;
        if (this.stateTime > 2.5) this.setState('patrol');
        faceMove = false;
        break;
      }
      case 'cover': {
        speed = 5;
        const moving = this.followPath(speed, want);
        if (!moving) {
          this.crouching = true;
          this.coverT -= dt;
          if (this.reloadT <= 0 && this.ammo < this.weapon.mag) this.reloadT = this.weapon.reload;
          if (this.target) this.faceTowards(this.lastSeenPos.x, this.lastSeenPos.z, dt, 3);
          faceMove = false;
          if (this.coverT <= 0) { this.crouching = false; this.setState('chase'); this.repath = 0; }
          if (this.targetVisible && this.coverT < 1.5) { this.crouching = false; this.setState('combat'); }
        }
        if (this.stateTime > 8) { this.crouching = false; this.setState('chase'); }
        break;
      }
      case 'combat': {
        faceMove = false;
        const t = this.target;
        if (!t || !t.alive) { this.setState('patrol'); break; }
        const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
        if (this.targetVisible) {
          const err = this.faceTowards(t.pos.x, t.pos.z, dt, this.diff.turn);
          targetPitch = Math.atan2(t.pos.y + 1.2 - (this.pos.y + 1.5), dist);
          if (this.reaction > 0) this.reaction -= dt;
          else if (this.ammo <= 0) {
            if (this.reloadT <= 0) {
              this.reloadT = this.weapon.reload;
              if (Math.random() < 0.5) this.seekCover();
            }
          } else if (err < 0.25 && this.fireCd <= 0 && this.reloadT <= 0) {
            if (this.burstLeft <= 0) this.burstLeft = Math.round(rand(this.weapon.burst[0], this.weapon.burst[1]));
            this.shoot();
            this.burstLeft--;
            this.fireCd = this.burstLeft > 0 ? 60 / this.weapon.rpm : rand(0.35, 0.85);
          }
          // déplacement latéral
          this.strafeT -= dt;
          if (this.strafeT <= 0) {
            this.strafeT = rand(0.6, 1.6);
            const r = Math.random();
            this.strafeDir = r < 0.3 ? 0 : r < 0.65 ? -1 : 1;
            this.crouching = Math.random() < 0.15 && dist > 12;
          }
          if (this.strafeDir !== 0 && !this.crouching) {
            const rx = Math.cos(this.yaw) * this.strafeDir, rz = -Math.sin(this.yaw) * this.strafeDir;
            if (g.nav.walkableAt(this.pos.x + rx * 1.2, this.pos.z + rz * 1.2)) { want.x = rx * 2.4; want.z = rz * 2.4; }
            else this.strafeDir = -this.strafeDir;
          }
          // trop loin => avancer
          if (dist > this.weapon.range * 0.85) {
            if (!this.path || this.repath <= 0) this.requestPath(t.pos.x, t.pos.z);
            this.followPath(3.5, want);
          }
        } else {
          this.crouching = false;
          if (g.time - this.lastSeenTime > 0.9) { this.setState('chase'); this.repath = 0; }
          else this.faceTowards(this.lastSeenPos.x, this.lastSeenPos.z, dt, this.diff.turn);
        }
        break;
      }
    }

    // --- mouvement ---
    const accel = 18;
    this.vel.x += (want.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, accel * dt);
    this.vel.y -= 22 * dt;
    const px = this.pos.x, pz = this.pos.z;
    moveBody(g.world, this.body, dt);
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    const wantSp = Math.hypot(want.x, want.z);
    if (wantSp > 1 && moved < wantSp * dt * 0.25) {
      this.stuckT += dt;
      if (this.stuckT > 1.2) { this.stuckT = 0; this.path = null; this.repath = 0; if (this.state === 'combat') this.strafeDir = -this.strafeDir; }
    } else this.stuckT = 0;

    if (faceMove && wantSp > 0.3) this.faceTowards(this.pos.x + want.x, this.pos.z + want.z, dt, 5);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6);

    this.model.group.rotation.y = this.yaw;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.model.animate(dt, hs, this.pitch, this.crouching);

    // bruits de pas
    if (hs > 3.5 && this.body.grounded) {
      this.stepT = (this.stepT || 0) - dt;
      if (this.stepT <= 0) {
        this.stepT = 0.36;
        const pl = g.player;
        if (pl && Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < 22) g.audio.footstep(0.35, this.pos);
      }
    }
  }

  shoot() {
    const g = this.game, t = this.target;
    this.ammo--;
    this.lastShotTime = g.time;
    const muzzle = this.model.muzzle.getWorldPosition(new THREE.Vector3());
    const aim = t.eyePos(new THREE.Vector3());
    aim.y -= 0.4;
    const dist = muzzle.distanceTo(aim);
    let acc = (this.diff.acc + this.accBonus) * THREE.MathUtils.clamp(1.15 - dist / 70, 0.25, 1.1);
    const tsp = Math.hypot(t.vel.x, t.vel.z);
    if (tsp > 3) acc *= 0.75;
    if (t.crouching) acc *= 0.85;
    if (t.sliding > 0) acc *= 0.5;
    if (this.shotsAtTarget < 2) acc *= 0.6;
    if (this.crouching) acc *= 1.1;
    this.shotsAtTarget++;
    acc = Math.min(acc, 0.85);
    const hit = Math.random() < acc;
    const dir = aim.clone().sub(muzzle).normalize();
    g.audio.shot(this.weapon.sound, muzzle, 1);
    g.effects.muzzleWorld(muzzle, dir);
    g.noise(this.pos, 40, this);
    if (hit) {
      const head = Math.random() < 0.1;
      const dmg = this.weapon.damage * this.diff.dmg * (head ? 1.5 : 1);
      if (Math.random() < 0.6) g.effects.tracer(muzzle, aim);
      if (!t.isPlayer) g.effects.blood(aim, dir);
      g.applyDamage(t, dmg, this, { from: this.pos.clone(), headshot: head, weapon: this.weaponKey });
    } else {
      const off = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.3) * 0.8, Math.random() - 0.5).normalize().multiplyScalar(0.5 + Math.random() * 1.3);
      const end = aim.clone().add(off);
      const d2 = end.sub(muzzle).normalize();
      const res = g.world.raycast(muzzle, d2, 150);
      const endP = res ? new THREE.Vector3(res.point.x, res.point.y, res.point.z) : muzzle.clone().addScaledVector(d2, 150);
      if (Math.random() < 0.6) g.effects.tracer(muzzle, endP);
      if (res) g.effects.impact(res.point, res.normal, res.box.mat);
      if (t.isPlayer) {
        // balle qui frôle le joueur
        const eye = t.eyePos(new THREE.Vector3());
        const v = eye.clone().sub(muzzle);
        const proj = v.dot(d2);
        if (proj > 0 && (!res || proj < res.t)) {
          const closest = muzzle.clone().addScaledVector(d2, proj);
          if (closest.distanceTo(eye) < 2.5) { g.audio.whiz(); t.trauma = Math.min(1, t.trauma + 0.08); }
        }
      }
    }
  }

  updateDeath(dt) {
    if (this.removed) return;
    this.deathT += dt;
    const k = Math.min(1, this.deathT / 0.55);
    const e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
    const bounce = k >= 1 ? Math.max(0, Math.sin((this.deathT - 0.55) * 14) * 0.06 * Math.exp(-(this.deathT - 0.55) * 8)) : 0;
    const M = this.model;
    if (M.die && !M.dead) M.die();
    if (M.mixer && this.deathT < 0.3) { M.setWeights(0); M.mixer.update(dt); }
    M.root.rotation.x = this.fallDir * (Math.PI / 2) * e - this.fallDir * bounce;
    M.root.rotation.z = this.fallSide * e;
    if (M.legL) {
      M.legL.knee.rotation.x = -0.6 * e;
      M.legR.knee.rotation.x = -0.2 * e;
      M.upper.rotation.x = -0.3 * e;
    }
    M.root.position.y = 0.12 * e;
    if (this.deathT > 6) this.model.root.position.y -= (this.deathT - 6) * 0.4;
    if (this.deathT > 8) { this.model.group.visible = false; this.removed = true; }
  }

  dispose() {
    this.game.scene.remove(this.model.group);
  }
}
