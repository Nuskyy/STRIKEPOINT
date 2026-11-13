// Serveur multijoueur : sert le jeu compilé (dist/) et gère les parties en match à mort (WebSocket /ws).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { SPAWNS } from '../src/shared/spawns.js';
import { WEAPON_STATS, MELEE_DAMAGE, GRENADE_DAMAGE, MAX_HIT } from '../src/shared/stats.js';
import { Accounts } from './accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.GAME_PORT) || 8081;
const SCORE_LIMIT = 25;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const accounts = new Accounts(path.resolve(__dirname, 'data'));

const server = http.createServer((req, res) => {
  if (accounts.handle(req, res)) return;
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const fp = path.normalize(path.join(DIST, p));
  if (!fp.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Introuvable. Avez-vous lancé « npm run build » ?');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const players = new Map();
let nextId = 1;
let matchOver = false;

const now = () => Date.now();
function broadcast(o, except = null) {
  const s = JSON.stringify(o);
  for (const p of players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
}
function send(p, o) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(o)); }

function pickSpawn(self) {
  let best = SPAWNS.ffa[0], bestScore = -1;
  for (const s of SPAWNS.ffa) {
    let minD = 999;
    for (const o of players.values()) {
      if (o === self || !o.alive) continue;
      minD = Math.min(minD, Math.hypot(o.x - s[0], o.z - s[1]));
    }
    const score = minD + Math.random() * 8;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function sendScores() {
  broadcast({ t: 'score', list: [...players.values()].map((p) => [p.id, p.kills, p.deaths, p.score]) });
}

function kill(killer, victim, w, head) {
  victim.alive = false;
  victim.hp = 0;
  victim.deaths++;
  if (victim.user) victim.user.stats.deaths++;
  if (killer && killer !== victim) {
    killer.kills++; killer.score += 100 + (head ? 50 : 0);
    if (killer.user) { killer.user.stats.kills++; if (head) killer.user.stats.headshots++; accounts.killXp(killer.user, head); }
  }
  accounts.save();
  broadcast({ t: 'kill', k: killer ? killer.id : null, v: victim.id, w, head });
  sendScores();
  if (killer && killer.kills >= SCORE_LIMIT && !matchOver) {
    matchOver = true;
    broadcast({ t: 'end', winner: killer.id, name: killer.name });
    for (const p of players.values()) if (p.user) {
      p.user.stats.matches++;
      accounts.addXp(p.user, 200 + (p === killer ? 500 : 0));
      if (p === killer) p.user.stats.wins++;
    }
    accounts.save();
    setTimeout(() => {
      for (const p of players.values()) { p.kills = 0; p.deaths = 0; p.score = 0; }
      matchOver = false;
      broadcast({ t: 'reset' });
      sendScores();
    }, 8000);
  }
}

function maxDamage(w) {
  if (w === 'melee') return MELEE_DAMAGE;
  if (w === 'grenade') return GRENADE_DAMAGE + 10;
  const st = WEAPON_STATS[w];
  if (!st) return 0;
  return Math.min(MAX_HIT, st.damage * st.headMult * st.pellets) + 1;
}

wss.on('connection', (ws) => {
  const p = {
    id: 'p' + nextId++, ws, name: 'Soldat', joined: false,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, c: 0, w: 'ar', alive: false, hp: 100,
    kills: 0, deaths: 0, score: 0, lastDmg: 0, hitWindow: now(), hitCount: 0,
  };
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'join' && !p.joined) {
      const user = accounts.userFromToken(m.token);
      if (!user) { send(p, { t: 'auth', error: 'Connexion requise' }); ws.close(); return; }
      for (const o of players.values()) {
        if (o.user === user) { send(p, { t: 'auth', error: 'Ce compte est déjà connecté à la partie' }); ws.close(); return; }
      }
      p.joined = true;
      p.user = user;
      p.name = user.name;
      p.op = typeof m.op === 'string' && /^[a-z]{2,12}$/.test(m.op) ? m.op : 'ranger';
      players.set(p.id, p);
      send(p, {
        t: 'welcome', id: p.id, limit: SCORE_LIMIT,
        players: [...players.values()].filter((o) => o !== p).map((o) => ({ id: o.id, name: o.name, op: o.op, kills: o.kills, deaths: o.deaths, score: o.score, alive: o.alive, x: o.x, z: o.z })),
      });
      broadcast({ t: 'join', id: p.id, name: p.name, op: p.op }, p);
      console.log(`+ ${p.name} (${p.id}) — ${players.size} joueur(s)`);
      return;
    }
    if (!p.joined) return;
    switch (m.t) {
      case 'st': {
        const s = m.s;
        if (!Array.isArray(s) || s.length < 7) return;
        const [x, y, z, yaw, pitch, c, w] = s;
        if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
        if (Math.abs(x) > 80 || Math.abs(z) > 80 || y < -1 || y > 20) return;
        p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch; p.c = c ? 1 : 0;
        if (WEAPON_STATS[w]) p.w = w;
        break;
      }
      case 'shot': {
        if (!p.alive || !WEAPON_STATS[m.w] || !Array.isArray(m.o) || !Array.isArray(m.d)) return;
        broadcast({ t: 'shot', id: p.id, w: m.w, s: m.s ? 1 : 0, o: m.o.slice(0, 3).map(Number), d: m.d.slice(0, 3).map(Number) }, p);
        break;
      }
      case 'gren': {
        if (!p.alive || !Array.isArray(m.o) || !Array.isArray(m.v)) return;
        broadcast({ t: 'gren', id: p.id, o: m.o.slice(0, 3).map(Number), v: m.v.slice(0, 3).map(Number) }, p);
        break;
      }
      case 'hit': {
        const target = players.get(m.id);
        if (!target || !target.alive || matchOver) return;
        const self = target === p;
        if (!p.alive && !(m.w === 'grenade')) return;
        if (self && m.w !== 'grenade') return;
        // limitation de cadence des déclarations de dégâts
        const t = now();
        if (t - p.hitWindow > 1000) { p.hitWindow = t; p.hitCount = 0; }
        if (++p.hitCount > 25) return;
        const dmg = Math.max(0, Math.min(Number(m.dmg) || 0, maxDamage(m.w)));
        if (!dmg) return;
        // contrôle de distance grossier pour le couteau
        if (m.w === 'melee' && Math.hypot(target.x - p.x, target.z - p.z) > 4) return;
        target.hp -= dmg;
        target.lastDmg = t;
        if (target.hp <= 0) kill(p, target, m.w, !!m.head);
        else send(target, { t: 'dmg', id: target.id, by: p.id, hp: Math.round(target.hp), fx: p.x, fz: p.z });
        break;
      }
      case 'respawn': {
        if (p.alive) return;
        const s = pickSpawn(p);
        p.alive = true; p.hp = 100; p.x = s[0]; p.z = s[1]; p.y = 0;
        const yaw = Math.atan2(s[0], s[1]);
        broadcast({ t: 'spawn', id: p.id, x: s[0], z: s[1], yaw });
        break;
      }
    }
  });
  ws.on('close', () => {
    if (players.delete(p.id)) {
      broadcast({ t: 'leave', id: p.id });
      console.log(`- ${p.name} (${p.id}) — ${players.size} joueur(s)`);
    }
  });
});

// Boucle serveur : régénération + instantanés à 20 Hz
let last = now();
setInterval(() => {
  const t = now(), dt = (t - last) / 1000;
  last = t;
  for (const p of players.values()) {
    if (p.alive && p.hp < 100 && t - p.lastDmg > 4000) p.hp = Math.min(100, p.hp + 35 * dt);
  }
  if (!players.size) return;
  broadcast({
    t: 'snap', ts: t / 1000,
    ps: [...players.values()].map((p) => [p.id, p.x, p.y, p.z, p.yaw, p.pitch, p.c, p.w, p.alive ? 1 : 0, Math.round(p.hp)]),
  });
}, 50);

server.listen(PORT, () => {
  console.log(`STRIKEPOINT — serveur sur http://localhost:${PORT}  (WebSocket /ws)`);
  if (!fs.existsSync(DIST)) console.log('Note : dist/ absent. Lancez « npm run build » pour servir le jeu, ou utilisez « npm run dev » en parallèle.');
});
