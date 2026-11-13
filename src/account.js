// Client du système de comptes (API /api/* du serveur) + profil invité local.
import { levelFromXp, matchXp } from './shared/progression.js';
import { defaultClasses, sanitizeClass, OPERATOR_LEVELS } from './shared/loadout.js';

const KEY = 'strikepoint.token';
const GUEST_KEY = 'strikepoint.guest';

export class Account {
  constructor() {
    try { this.token = localStorage.getItem(KEY) || null; } catch { this.token = null; }
    this.user = null;
    this.offline = false;
  }

  async api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error('Serveur injoignable. Lancez « npm run dev » (jeu + serveur).');
    }
    let data = {};
    try { data = await res.json(); } catch {
      throw new Error('Serveur de comptes indisponible. Lancez « npm run dev » (jeu + serveur).');
    }
    if (!res.ok) { const e = new Error(data.error || `Erreur ${res.status}`); e.status = res.status; throw e; }
    return data;
  }

  setToken(t) {
    this.token = t;
    try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  }

  async restore() {
    if (!this.token) return null;
    try {
      const d = await this.api('GET', '/api/me');
      this.user = d.user;
      return this.user;
    } catch (e) {
      if (e.status === 401) this.setToken(null);
      return null;
    }
  }

  async login(username, password) {
    const d = await this.api('POST', '/api/login', { username, password });
    this.setToken(d.token); this.user = d.user; this.offline = false;
    return d.user;
  }

  async register(username, password) {
    const d = await this.api('POST', '/api/register', { username, password });
    this.setToken(d.token); this.user = d.user; this.offline = false;
    return d.user;
  }

  async logout() {
    try { await this.api('POST', '/api/logout'); } catch { /* ignore */ }
    this.setToken(null); this.user = null;
  }

  async changePassword(oldPw, newPw) {
    const d = await this.api('POST', '/api/password', { old: oldPw, new: newPw });
    this.setToken(d.token); this.user = d.user;
  }

  /** Résultat de partie → XP. Retourne { before, gained, after }. */
  async recordMatch(r) {
    if (this.user && !this.offline) {
      try { const d = await this.api('POST', '/api/match', r); this.user = d.user; return d.xp; } catch { /* hors ligne */ }
    }
    const g = this.guestProfile();
    const before = g.xp, gained = matchXp(r);
    g.xp += gained;
    this.saveGuest(g);
    return { before, gained, after: g.xp };
  }

  // ---- profil (compte ou invité) ----
  guestProfile() {
    if (this._guest) return this._guest;
    let g = null;
    try { g = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null'); } catch { /* ignore */ }
    this._guest = { xp: g?.xp || 0, classes: Array.isArray(g?.classes) ? g.classes : defaultClasses() };
    return this._guest;
  }

  saveGuest(g) {
    this._guest = g;
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(g)); } catch { /* ignore */ }
  }

  get xp() { return this.user ? this.user.xp || 0 : this.guestProfile().xp; }
  get level() { return levelFromXp(this.xp); }
  get classes() {
    const list = (this.user ? this.user.classes : this.guestProfile().classes) || defaultClasses();
    return list.map((c) => sanitizeClass(c, this.level, OPERATOR_LEVELS));
  }

  async saveClasses(classes) {
    const clean = classes.map((c) => sanitizeClass(c, this.level, OPERATOR_LEVELS));
    if (this.user && !this.offline) {
      const d = await this.api('POST', '/api/classes', { classes: clean });
      this.user = d.user;
    } else {
      const g = this.guestProfile(); g.classes = clean; this.saveGuest(g);
    }
  }

  async leaderboard() {
    const d = await this.api('GET', '/api/leaderboard');
    return d.top;
  }

  guest() { this.offline = true; this.user = null; }
}
