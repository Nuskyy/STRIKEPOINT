// Client multijoueur (WebSocket) + joueurs distants interpolés.
import * as THREE from 'three';
import { SoldierModel, TEAM_COLORS } from './soldier.js';
import { CharacterModel, OPERATORS } from './character.js';
import { WEAPON_STATS } from './shared/stats.js';

const INTERP_DELAY = 0.1; // s

class RemotePlayer {
  constructor(game, id, name, op) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.team = id;
    this.isRemote = true;
    this.model = game.assets?.character
      ? new CharacterModel(game.assets, 'C', { operator: OPERATORS[op] ? op : 'ghost', weapon: 'ar' })
      : new SoldierModel(TEAM_COLORS.C);
    this.model.addTag(name, '#ff5a5a');
    this.model.tag.material.depthTest = true;
    game.scene.add(this.model.group);
    this.pos = this.model.group.position;
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.crouching = false;
    this.alive = false;
    this.hp = 100; this.maxHp = 100;
    this.kills = 0; this.deaths = 0; this.score = 0; this.streak = 0;
    this.lastShotTime = -99;
    this.buf = [];
    this.deathT = 0;
    this._hb = [
      { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, head: true },
      { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, head: false },
    ];
    this.model.group.visible = false;
  }

  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + (this.crouching ? 1.15 : 1.6), this.pos.z); }

  getHitboxes() {
    const p = this.pos, c = this.crouching ? 0.5 : 0;
    const hb = this._hb[0], bb = this._hb[1];
    hb.min.x = p.x - 0.17; hb.min.y = p.y + 1.48 - c; hb.min.z = p.z - 0.17;
    hb.max.x = p.x + 0.17; hb.max.y = p.y + 1.86 - c; hb.max.z = p.z + 0.17;
    bb.min.x = p.x - 0.34; bb.min.y = p.y; bb.min.z = p.z - 0.34;
    bb.max.x = p.x + 0.34; bb.max.y = p.y + 1.48 - c; bb.max.z = p.z + 0.34;
    return this._hb;
  }

  push(t, s) {
    this.buf.push({ t, x: s[1], y: s[2], z: s[3], yaw: s[4], pitch: s[5], c: s[6] });
    if (this.buf.length > 30) this.buf.shift();
  }

  setAlive(v, x, z) {
    this.alive = v;
    if (v) {
      this.deathT = 0;
      this.buf.length = 0;
      if (x !== undefined) this.pos.set(x, 0, z);
      this.model.root.rotation.set(0, 0, 0);
      this.model.root.position.set(0, 0, 0);
      this.model.revive?.();
      this.model.group.visible = true;
      this.model.tag.visible = true;
    } else {
      this.model.tag.visible = false;
    }
  }

  update(dt, renderT) {
    const m = this.model;
    if (!this.alive) {
      if (!m.group.visible) return;
      this.deathT += dt;
      const e = 1 - Math.pow(1 - Math.min(1, this.deathT / 0.5), 3);
      m.root.rotation.x = (Math.PI / 2) * e;
      m.root.position.y = 0.12 * e;
      if (this.deathT > 3.5) m.group.visible = false;
      return;
    }
    const b = this.buf;
    if (b.length) {
      let i = b.length - 1;
      while (i > 0 && b[i - 1].t > renderT) i--;
      const a = b[Math.max(0, i - 1)], c = b[i];
      let k = c.t === a.t ? 1 : (renderT - a.t) / (c.t - a.t);
      k = Math.max(0, Math.min(1.2, k));
      const px = this.pos.x, pz = this.pos.z;
      this.pos.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
      let dy = c.yaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw = a.yaw + dy * k;
      this.pitch = a.pitch + (c.pitch - a.pitch) * k;
      this.crouching = !!c.c;
      if (dt > 0) this.vel.set((this.pos.x - px) / dt, 0, (this.pos.z - pz) / dt);
    }
    m.group.rotation.y = this.yaw;
    m.animate(dt, Math.min(8, Math.hypot(this.vel.x, this.vel.z)), this.pitch, this.crouching);
  }

  dispose() { this.game.scene.remove(this.model.group); }
}

export class NetClient {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.myId = null;
    this.sendT = 0;
    this.serverOffset = null;
    this.connected = false;
  }

  connect(token, op = 'ranger') {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { this.connected = true; this.send({ t: 'join', token, op }); };
    ws.onmessage = (e) => { try { this.handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => {
      if (this.denied) return;
      if (this.connected) this.game.hud.message('DÉCONNECTÉ', 'Le serveur a fermé la connexion', 4);
      else this.game.hud.message('SERVEUR INTROUVABLE', 'Lancez « npm run server » dans un terminal', 6);
      this.connected = false;
    };
    ws.onerror = () => {};
  }

  disconnect() {
    this.connected = false;
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
  }

  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }

  entity(id) {
    if (id === this.myId) return this.game.player;
    return this.game.remotes.get(id) || null;
  }

  addRemote(id, name, op) {
    if (id === this.myId || this.game.remotes.has(id)) return this.game.remotes.get(id);
    const r = new RemotePlayer(this.game, id, name, op);
    this.game.remotes.set(id, r);
    return r;
  }

  handle(m) {
    const g = this.game, p = g.player;
    switch (m.t) {
      case 'auth': {
        this.connected = false;
        this.denied = true;
        g.hud.message('ACCÈS REFUSÉ', m.error, 6);
        break;
      }
      case 'welcome': {
        this.myId = m.id;
        p.team = m.id;
        p.id = m.id;
        this.scoreLimit = m.limit;
        for (const o of m.players) {
          const r = this.addRemote(o.id, o.name, o.op);
          if (r) { r.kills = o.kills; r.deaths = o.deaths; r.score = o.score; r.setAlive(o.alive, o.x, o.z); }
        }
        g.hud.message('CONNECTÉ', `Match à mort — premier à ${m.limit} éliminations`, 3);
        this.send({ t: 'respawn' });
        break;
      }
      case 'join': {
        this.addRemote(m.id, m.name, m.op);
        g.hud.popup(`${m.name} a rejoint la partie`);
        break;
      }
      case 'leave': {
        const r = g.remotes.get(m.id);
        if (r) { g.hud.popup(`${r.name} a quitté la partie`); r.dispose(); g.remotes.delete(m.id); }
        break;
      }
      case 'snap': {
        const now = performance.now() / 1000;
        if (this.serverOffset === null) this.serverOffset = now - m.ts;
        else this.serverOffset += ((now - m.ts) - this.serverOffset) * 0.05;
        for (const s of m.ps) {
          if (s[0] === this.myId) { if (p.alive) p.hp = s[9]; continue; }
          const r = g.remotes.get(s[0]);
          if (r) r.push(m.ts, s);
        }
        break;
      }
      case 'shot': {
        const r = g.remotes.get(m.id);
        if (!r) break;
        if (!m.s) r.lastShotTime = g.time;
        const st = WEAPON_STATS[m.w] || WEAPON_STATS.ar;
        const muzzle = r.model.muzzle.getWorldPosition(new THREE.Vector3());
        const dir = new THREE.Vector3(...m.d);
        g.audio.shot(m.s ? { ...st.sound, freq: st.sound.freq * 0.55, low: 0.3, crack: 0.15, tail: 0.2 } : st.sound, muzzle, m.s ? 0.35 : 1);
        g.effects.muzzleWorld(muzzle, dir);
        const res = g.world.raycast(new THREE.Vector3(...m.o), dir, 250);
        const end = res ? new THREE.Vector3(res.point.x, res.point.y, res.point.z) : muzzle.clone().addScaledVector(dir, 200);
        if (Math.random() < 0.6) g.effects.tracer(muzzle, end);
        if (res) g.effects.impact(res.point, res.normal, res.box.mat);
        break;
      }
      case 'gren': {
        const r = g.remotes.get(m.id);
        g.throwGrenade(r, new THREE.Vector3(...m.o), new THREE.Vector3(...m.v), true);
        break;
      }
      case 'dmg': {
        if (m.id === this.myId) {
          p.hp = m.hp;
          p.onDamaged(0, null, { from: { x: m.fx, z: m.fz } });
        }
        break;
      }
      case 'kill': {
        const killer = this.entity(m.k), victim = this.entity(m.v);
        if (!victim) break;
        g.hud.kill(killer, victim, m.w, m.head);
        if (victim === p) {
          p.hp = 0;
          p.onDeath({}, killer);
          g.respawnAt = g.time + 3;
          g.hud.showDeath(killer, g.respawnAt);
        } else {
          victim.setAlive(false);
        }
        if (killer === p && victim !== p) {
          p.streak++;
          g.audio.killConfirm();
          g.hud.hitmarker(true, m.head);
          g.hud.popup(m.head ? '+150  TIR À LA TÊTE' : '+100  ÉLIMINATION', m.head ? 'head' : '');
          if (m.head) p.headshots++;
          g.checkStreak(p.streak);
        }
        break;
      }
      case 'spawn': {
        if (m.id === this.myId) {
          p.spawn(m.x, m.z, m.yaw);
          g.weapons.setLoadout(g.currentClass());
          g.hud.hideDeath();
          g.respawnAt = null;
        } else {
          const r = g.remotes.get(m.id);
          if (r) r.setAlive(true, m.x, m.z);
        }
        break;
      }
      case 'score': {
        for (const [id, k, d, s] of m.list) {
          const e = this.entity(id);
          if (e) { e.kills = k; e.deaths = d; e.score = s; }
        }
        break;
      }
      case 'end': {
        const win = m.winner === this.myId;
        g.hud.message(win ? 'VICTOIRE' : 'FIN DU MATCH', `${m.name} remporte la partie — nouvelle manche dans 8 s`, 7);
        g.audio.announce(win ? 'win' : 'lose');
        break;
      }
      case 'reset': {
        p.kills = 0; p.deaths = 0; p.score = 0; p.streak = 0;
        for (const r of g.remotes.values()) { r.kills = 0; r.deaths = 0; r.score = 0; }
        break;
      }
    }
  }

  sendHit(target, dmg, info) {
    this.send({ t: 'hit', id: target.isPlayer ? this.myId : target.id, dmg: Math.round(dmg), head: !!info.headshot, w: info.weapon || 'ar' });
  }

  sendShot(w, o, d, s = false) {
    this.send({ t: 'shot', w, s: s ? 1 : 0, o: [+o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)], d: [+d.x.toFixed(3), +d.y.toFixed(3), +d.z.toFixed(3)] });
  }

  sendGrenade(o, v) {
    this.send({ t: 'gren', o: [o.x, o.y, o.z], v: [v.x, v.y, v.z] });
  }

  requestRespawn() { this.send({ t: 'respawn' }); }

  update(dt) {
    const g = this.game, p = g.player;
    this.sendT -= dt;
    if (this.sendT <= 0 && this.myId) {
      this.sendT = 0.05;
      this.send({ t: 'st', s: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(3), p.crouching ? 1 : 0, g.weapons.id] });
    }
    const renderT = this.serverOffset === null ? 0 : performance.now() / 1000 - this.serverOffset - INTERP_DELAY;
    for (const r of g.remotes.values()) r.update(dt, renderT);
    const mp = this.scoreLimit || 30;
    const sorted = g.combatants().slice().sort((a, b) => b.kills - a.kills);
    const leader = sorted[0];
    g.hud.setTop(`${p.kills}`, `FFA — ${mp}`, leader ? `${leader.name}: ${leader.kills}` : '');
    if (!p.alive && g.respawnAt != null && g.time > g.respawnAt + 4) g.respawnPlayer();
  }
}
