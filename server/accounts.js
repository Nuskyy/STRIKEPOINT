// Comptes joueurs : nom d'utilisateur + mot de passe (aucun e-mail).
// Mots de passe hachés avec scrypt + sel aléatoire, sessions par jeton aléatoire, stats persistées en JSON.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { levelFromXp, matchXp, XP } from '../src/shared/progression.js';
import { defaultClasses, sanitizeClass, OPERATOR_LEVELS } from '../src/shared/loadout.js';

const USER_RE = /^[A-Za-z0-9_\-.]{3,16}$/;
const SESSION_TTL = 30 * 24 * 3600 * 1000; // 30 jours
const MAX_BODY = 4096;

export class Accounts {
  constructor(dir) {
    this.file = path.join(dir, 'users.json');
    fs.mkdirSync(dir, { recursive: true });
    this.db = { users: {}, sessions: {} };
    try { this.db = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* nouveau fichier */ }
    this.db.users ||= {};
    this.db.sessions ||= {};
    this.attempts = new Map(); // ip -> {n, t}
    this.saveTimer = null;
    this.purge();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.db, null, 1));
      fs.renameSync(tmp, this.file);
    }, 200);
  }

  purge() {
    const now = Date.now();
    for (const [t, s] of Object.entries(this.db.sessions)) if (s.exp < now) delete this.db.sessions[t];
  }

  key(name) { return name.toLowerCase(); }

  hash(password, salt) {
    return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  }

  rateLimited(ip) {
    const now = Date.now();
    const a = this.attempts.get(ip) || { n: 0, t: now };
    if (now - a.t > 10 * 60 * 1000) { a.n = 0; a.t = now; }
    a.n++;
    this.attempts.set(ip, a);
    return a.n > 20;
  }

  publicUser(u) {
    u.xp ||= 0;
    u.classes ||= defaultClasses();
    return { name: u.name, created: u.created, stats: u.stats, xp: u.xp, level: levelFromXp(u.xp), classes: u.classes };
  }

  addXp(u, n) {
    u.xp = Math.max(0, (u.xp || 0) + Math.floor(n));
    this.save();
  }

  setClasses(u, list) {
    if (!Array.isArray(list)) return { error: 'Classes invalides' };
    const lvl = levelFromXp(u.xp || 0);
    u.classes = list.slice(0, 5).map((c) => sanitizeClass(c, lvl, OPERATOR_LEVELS));
    while (u.classes.length < 5) u.classes.push(defaultClasses()[u.classes.length]);
    this.save();
    return { user: this.publicUser(u) };
  }

  killXp(u, head) { this.addXp(u, XP.kill + (head ? XP.headshot : 0)); }

  newSession(u) {
    const token = crypto.randomBytes(32).toString('hex');
    this.db.sessions[token] = { user: this.key(u.name), exp: Date.now() + SESSION_TTL };
    this.save();
    return token;
  }

  register(name, password) {
    name = String(name || '').trim();
    password = String(password || '');
    if (!USER_RE.test(name)) return { error: "Nom d'utilisateur invalide (3 à 16 caractères : lettres, chiffres, _ - .)" };
    if (password.length < 6 || password.length > 128) return { error: 'Le mot de passe doit contenir entre 6 et 128 caractères' };
    const k = this.key(name);
    if (this.db.users[k]) return { error: "Ce nom d'utilisateur est déjà pris" };
    const salt = crypto.randomBytes(16).toString('hex');
    const u = {
      name, salt, hash: this.hash(password, salt), created: Date.now(),
      stats: { kills: 0, deaths: 0, headshots: 0, matches: 0, wins: 0, bestWave: 0, bestScore: 0, shots: 0, hits: 0 },
    };
    this.db.users[k] = u;
    this.save();
    return { token: this.newSession(u), user: this.publicUser(u) };
  }

  login(name, password) {
    const u = this.db.users[this.key(String(name || '').trim())];
    // calcul systématique pour éviter de révéler l'existence du compte par le temps de réponse
    const salt = u ? u.salt : '00000000000000000000000000000000';
    const h = this.hash(String(password || ''), salt);
    if (!u || !crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.hash, 'hex'))) {
      return { error: "Nom d'utilisateur ou mot de passe incorrect" };
    }
    return { token: this.newSession(u), user: this.publicUser(u) };
  }

  userFromToken(token) {
    if (typeof token !== 'string') return null;
    const s = this.db.sessions[token];
    if (!s || s.exp < Date.now()) return null;
    return this.db.users[s.user] || null;
  }

  logout(token) {
    if (this.db.sessions[token]) { delete this.db.sessions[token]; this.save(); }
  }

  changePassword(u, oldPw, newPw) {
    const h = this.hash(String(oldPw || ''), u.salt);
    if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.hash, 'hex'))) return { error: 'Mot de passe actuel incorrect' };
    newPw = String(newPw || '');
    if (newPw.length < 6 || newPw.length > 128) return { error: 'Le mot de passe doit contenir entre 6 et 128 caractères' };
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = this.hash(newPw, u.salt);
    // invalide les autres sessions
    for (const [t, s] of Object.entries(this.db.sessions)) if (s.user === this.key(u.name)) delete this.db.sessions[t];
    this.save();
    return { token: this.newSession(u), user: this.publicUser(u) };
  }

  /** Enregistre le résultat d'une partie (valeurs bornées). */
  recordMatch(u, r) {
    const n = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
    const s = u.stats;
    s.matches++;
    s.kills += n(r.kills, 500);
    s.deaths += n(r.deaths, 500);
    s.headshots += n(r.headshots, 500);
    s.shots += n(r.shots, 20000);
    s.hits += n(r.hits, 20000);
    if (r.win) s.wins++;
    s.bestWave = Math.max(s.bestWave, n(r.wave, 200));
    s.bestScore = Math.max(s.bestScore, n(r.score, 1e6));
    const before = u.xp || 0;
    const gained = Math.min(60000, matchXp(r));
    u.xp = before + gained;
    this.save();
    return { user: this.publicUser(u), xp: { before, gained, after: u.xp } };
  }

  leaderboard() {
    return Object.values(this.db.users)
      .map((u) => ({ name: u.name, kills: u.stats.kills, bestWave: u.stats.bestWave, bestScore: u.stats.bestScore, level: levelFromXp(u.xp || 0) }))
      .sort((a, b) => b.level - a.level || b.bestScore - a.bestScore)
      .slice(0, 10);
  }

  /** Gestionnaire HTTP pour /api/*. Retourne true si la requête a été traitée. */
  handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return false;
    const reply = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    // derrière un proxy (nginx), l'IP réelle est dans X-Forwarded-For (activer avec TRUST_PROXY=1)
    const fwd = process.env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
    const ip = fwd || req.socket.remoteAddress || '?';
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /api/me') {
      const u = this.userFromToken(auth);
      if (u) reply(200, { user: this.publicUser(u) }); else reply(401, { error: 'Session expirée' });
      return true;
    }
    if (route === 'GET /api/leaderboard') { reply(200, { top: this.leaderboard() }); return true; }

    if (req.method !== 'POST') { reply(404, { error: 'Introuvable' }); return true; }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > MAX_BODY) req.destroy(); });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body || '{}'); } catch { reply(400, { error: 'Requête invalide' }); return; }
      if (route === 'POST /api/register' || route === 'POST /api/login') {
        if (this.rateLimited(ip)) { reply(429, { error: 'Trop de tentatives, réessayez dans quelques minutes' }); return; }
        const r = route === 'POST /api/register' ? this.register(data.username, data.password) : this.login(data.username, data.password);
        reply(r.error ? 400 : 200, r);
        return;
      }
      const u = this.userFromToken(auth);
      if (!u) { reply(401, { error: 'Non connecté' }); return; }
      if (route === 'POST /api/logout') { this.logout(auth); reply(200, { ok: true }); return; }
      if (route === 'POST /api/password') { const r = this.changePassword(u, data.old, data.new); reply(r.error ? 400 : 200, r); return; }
      if (route === 'POST /api/match') { reply(200, this.recordMatch(u, data)); return; }
      if (route === 'POST /api/classes') { const r = this.setClasses(u, data.classes); reply(r.error ? 400 : 200, r); return; }
      reply(404, { error: 'Introuvable' });
    });
    return true;
  }
}
