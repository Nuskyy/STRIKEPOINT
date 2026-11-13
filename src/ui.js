// Menus : accueil, équipement, paramètres, pause, fin de partie.
import { WEAPON_STATS, PRIMARIES } from './shared/stats.js';
import { SLOTS, ATTACHMENTS, COMPAT, WEAPON_LEVELS, SKINS, effectiveStats } from './shared/loadout.js';
import { levelProgress, rankName, MAX_LEVEL, levelFromXp, xpForLevel } from './shared/progression.js';
import { OPERATORS, OPERATOR_IDS } from './character.js';
import { esc } from './hud.js';

const DEFAULTS = { sens: 1, fov: 90, volume: 0.8, quality: 'high', difficulty: 'normal', primary: 'ar', name: 'Soldat', showFps: false, invertY: false };

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('strikepoint.settings') || '{}');
    return { ...DEFAULTS, ...s };
  } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem('strikepoint.settings', JSON.stringify(s)); } catch { /* ignore */ }
}

const DIFF_LABELS = { easy: 'Recrue', normal: 'Régulier', hard: 'Vétéran' };
const QUAL_LABELS = { low: 'Bas', medium: 'Moyen', high: 'Élevé', ultra: 'Ultra' };

export class UI {
  constructor(game, account) {
    this.game = game;
    this.account = account;
    this.s = game.settings;
    this.el = document.getElementById('menu');
    game.onPause = () => this.showPause();
    game.onEnd = (r) => this.showEnd(r);
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      game.audio.init();
      game.audio.ui();
      this.act(b.dataset.act, b.dataset.v);
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && game.state === 'paused' && !this.el.classList.contains('hidden') && this.screen === 'pause') {
        // l'échap libère déjà le pointeur ; on ne reprend pas automatiquement
      }
    });
    this.set('<div class="logo">STRIKE<span>POINT</span></div><div class="tagline">CONNEXION…</div>', 'boot');
    account.restore().then((u) => (u ? this.showMain() : this.showLogin()));
  }

  showLogin(mode = 'login', err = '') {
    const reg = mode === 'register';
    this.set(`
      <div class="logo">STRIKE<span>POINT</span></div>
      <div class="tagline">OPÉRATION ZONE DELTA</div>
      <div class="seg tabs">
        <button class="${!reg ? 'sel' : ''}" data-act="tab-login">Connexion</button>
        <button class="${reg ? 'sel' : ''}" data-act="tab-register">Créer un compte</button>
      </div>
      <form id="auth-form" class="auth" autocomplete="on">
        <label>Nom d'utilisateur
          <input type="text" name="username" required minlength="3" maxlength="16" pattern="[A-Za-z0-9_.\\-]{3,16}"
            autocomplete="username" spellcheck="false" autofocus></label>
        <label>Mot de passe
          <input type="password" name="password" required minlength="6" maxlength="128"
            autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
        ${reg ? `<label>Confirmer le mot de passe
          <input type="password" name="confirm" required minlength="6" maxlength="128" autocomplete="new-password"></label>` : ''}
        <div class="auth-err" role="alert">${esc(err)}</div>
        <button class="btn" type="submit">${reg ? 'Créer mon compte' : 'Se connecter'}</button>
      </form>
      <div class="hint">${reg ? "3 à 16 caractères (lettres, chiffres, _ - .). Aucune adresse e-mail n'est demandée : notez bien votre mot de passe, il ne peut pas être récupéré." : 'Pas encore de compte ? Créez-en un en quelques secondes.'}</div>
      <button class="btn secondary" data-act="guest">Jouer en invité <small>Solo uniquement, statistiques non enregistrées</small></button>
    `, 'login');
    const form = document.getElementById('auth-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = form.querySelector('.auth-err');
      const btn = form.querySelector('button[type=submit]');
      if (reg && fd.get('password') !== fd.get('confirm')) { errEl.textContent = 'Les mots de passe ne correspondent pas'; return; }
      btn.disabled = true; errEl.textContent = '';
      try {
        if (reg) await this.account.register(fd.get('username'), fd.get('password'));
        else await this.account.login(fd.get('username'), fd.get('password'));
        this.showMain();
      } catch (ex) {
        errEl.textContent = ex.message;
        btn.disabled = false;
      }
    });
  }

  async showProfile() {
    const u = this.account.user;
    if (!u) { this.showLogin(); return; }
    const s = u.stats;
    const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills.toFixed(2);
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    this.set(`
      <div class="logo" style="font-size:48px">${esc(u.name)}</div>
      <div class="tagline">MEMBRE DEPUIS ${new Date(u.created).toLocaleDateString('fr-FR')}</div>
      <div class="stats">
        <div><b>${s.kills}</b><span>ÉLIMINATIONS</span></div>
        <div><b>${kd}</b><span>RATIO É/M</span></div>
        <div><b>${s.headshots}</b><span>TIRS À LA TÊTE</span></div>
        <div><b>${acc}%</b><span>PRÉCISION</span></div>
        <div><b>${s.matches}</b><span>PARTIES</span></div>
        <div><b>${s.wins}</b><span>VICTOIRES</span></div>
        <div><b>${s.bestWave}</b><span>MEILLEURE VAGUE</span></div>
        <div><b>${s.bestScore}</b><span>MEILLEUR SCORE</span></div>
      </div>
      <h2 class="section">CLASSEMENT (MEILLEUR SCORE)</h2>
      <div id="lb" class="hint">Chargement…</div>
      <h2 class="section">CHANGER DE MOT DE PASSE</h2>
      <form id="pw-form" class="auth">
        <input type="text" name="username" value="${esc(u.name)}" autocomplete="username" hidden>
        <label>Mot de passe actuel<input type="password" name="old" required autocomplete="current-password"></label>
        <label>Nouveau mot de passe<input type="password" name="new" required minlength="6" maxlength="128" autocomplete="new-password"></label>
        <div class="auth-err" role="alert"></div>
        <button class="btn secondary" type="submit">Mettre à jour</button>
      </form>
      <div style="display:flex;gap:6px">
        <button class="btn secondary" data-act="back">← Retour</button>
        <button class="btn secondary" data-act="logout">Se déconnecter</button>
      </div>
    `, 'profile');
    this.back = 'main';
    const form = document.getElementById('pw-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = form.querySelector('.auth-err');
      try {
        await this.account.changePassword(fd.get('old'), fd.get('new'));
        errEl.textContent = 'Mot de passe modifié. Vos autres sessions ont été déconnectées.';
        errEl.classList.add('ok');
        form.reset();
      } catch (ex) { errEl.classList.remove('ok'); errEl.textContent = ex.message; }
    });
    try {
      const top = await this.account.leaderboard();
      const lb = document.getElementById('lb');
      if (lb) lb.innerHTML = `<table class="lb">${top.map((r, i) => `<tr class="${r.name === u.name ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.bestScore}</td><td>vague ${r.bestWave}</td><td>${r.kills} élim.</td></tr>`).join('')}</table>`;
    } catch { /* ignore */ }
  }

  set(html, screen) {
    this.screen = screen;
    this.el.innerHTML = `<div class="screen">${html}</div>`;
    this.el.classList.remove('hidden');
  }

  hide() { this.el.classList.add('hidden'); }

  act(a, v) {
    const g = this.game, s = this.s;
    switch (a) {
      case 'tab-login': this.showLogin('login'); break;
      case 'tab-register': this.showLogin('register'); break;
      case 'guest': this.account.guest(); this.showMain(); break;
      case 'profile': this.showProfile(); break;
      case 'logout': this.account.logout().then(() => this.showLogin()); break;
      case 'login': this.showLogin(); break;
      case 'mp':
        if (!this.account.user) { this.showLogin('login', 'Le multijoueur nécessite un compte.'); break; }
      // fallthrough
      case 'waves': case 'tdm':
        saveSettings(s);
        this.hide();
        g.start(a);
        break;
      case 'pickclass': s.classIdx = +v; saveSettings(s); this.showMain(); break;
      case 'pickclass-pause': s.classIdx = +v; saveSettings(s); this.showPause(true); break;
      case 'classes': this.draft = null; this.classBack = this.screen; this.showClasses(s.classIdx || 0); break;
      case 'cedit': this.showClasses(+v); break;
      case 'cw': {
        const c = this.draft[this.editIdx];
        c.primary = v;
        for (const slot of Object.keys(SLOTS)) if (!COMPAT[v][slot].includes(c.att[slot])) c.att[slot] = COMPAT[v][slot][0];
        this.showClasses();
        break;
      }
      case 'ca': { const [slot, a] = v.split(':'); this.draft[this.editIdx].att[slot] = a; this.showClasses(); break; }
      case 'cs': this.draft[this.editIdx].skin = v; this.showClasses(); break;
      case 'co': this.draft[this.editIdx].operator = v; this.showClasses(); break;
      case 'csave':
        this.account.saveClasses(this.draft).then(() => {
          this.draft = null;
          if (this.classBack === 'pause') this.showPause(true); else this.showMain();
        }).catch((e) => { const el = document.getElementById('cls-err'); if (el) el.textContent = e.message; });
        break;
      case 'ccancel': this.draft = null; if (this.classBack === 'pause') this.showPause(true); else this.showMain(); break;
      case 'diff': s.difficulty = v; saveSettings(s); this.showMain(); break;
      case 'settings': this.showSettings(this.screen); break;
      case 'quality': s.quality = v; saveSettings(s); g.applySettings(); this.showSettings(this.back); break;
      case 'back': if (this.back === 'pause') this.showPause(); else this.showMain(); break;
      case 'controls': this.showControls(this.screen); break;
      case 'resume': this.hide(); g.resume(); break;
      case 'quit': g.quitToMenu(); this.showMain(); if (this.account.user) this.account.restore().then(() => this.screen === 'main' && this.showMain()); break;
      case 'again': { const m = g.mode; this.hide(); g.start(m); break; }
      case 'menu': g.quitToMenu(); this.showMain(); break;
    }
  }

  levelBadge() {
    const p = levelProgress(this.account.xp);
    return `<div class="lvl">
      <div class="lvl-badge">${p.level}</div>
      <div class="lvl-info"><b>${rankName(p.level)}</b><span>${p.level >= MAX_LEVEL ? 'Niveau maximum' : `${p.cur} / ${p.need} XP`}</span>
        <div class="xpbar"><i style="width:${Math.round(p.ratio * 100)}%"></i></div></div>
    </div>`;
  }

  classPicker(act = 'pickclass') {
    const idx = this.s.classIdx || 0;
    return `<div class="seg">${this.account.classes.map((c, i) =>
      `<button class="${i === idx ? 'sel' : ''}" data-act="${act}" data-v="${i}">${esc(c.name)} <small>${WEAPON_STATS[c.primary].name}</small></button>`).join('')}
      <button data-act="classes">✎ Modifier les classes</button></div>`;
  }

  statBars(id, att) {
    const w = effectiveStats(id, att);
    const v = {
      'Dégâts': Math.min(1, (w.damage * w.pellets) / 140),
      'Cadence': Math.min(1, w.rpm / 900),
      'Portée': Math.min(1, w.range[1] / 100),
      'Contrôle': Math.max(0.05, Math.min(1, 1 - w.recoilPitch / 0.065)),
      'Visée': Math.max(0.05, Math.min(1, 1 - (w.adsTime - 0.12) / 0.3)),
      'Mobilité': Math.max(0.05, Math.min(1, (w.moveMult - 0.85) / 0.23)),
    };
    return `<div class="statbars">${Object.entries(v).map(([k, x]) => `<div><span>${k}</span><div class="bar"><i style="width:${Math.round(x * 100)}%"></i></div></div>`).join('')}
      <div><span>Chargeur</span><b>${w.mag}</b></div></div>`;
  }

  /** Éditeur de classes (5 classes : arme, accessoires, finition, opérateur). */
  showClasses(sel = this.editIdx || 0) {
    this.editIdx = sel;
    if (!this.draft) this.draft = JSON.parse(JSON.stringify(this.account.classes));
    const c = this.draft[sel];
    const lvl = this.account.level;
    const lock = (need) => (need > lvl ? `disabled title="Débloqué au niveau ${need}"` : '');
    const lk = (need) => (need > lvl ? ` <small>🔒 niv. ${need}</small>` : '');
    const weapons = PRIMARIES.map((id) => `<button class="card ${c.primary === id ? 'sel' : ''}" data-act="cw" data-v="${id}" ${lock(WEAPON_LEVELS[id])}>
        <b>${WEAPON_STATS[id].name}${lk(WEAPON_LEVELS[id])}</b><span>${WEAPON_STATS[id].cls}</span></button>`).join('');
    const slots = Object.entries(SLOTS).map(([slot, label]) => {
      const opts = COMPAT[c.primary][slot];
      if (opts.length <= 1) return '';
      return `<div class="slot"><h4>${label}</h4><div class="seg">${opts.map((a) => {
        const A = ATTACHMENTS[slot][a];
        return `<button class="${c.att[slot] === a ? 'sel' : ''}" data-act="ca" data-v="${slot}:${a}" ${lock(A.level)} title="${esc(A.desc)}">${A.name}${lk(A.level)}</button>`;
      }).join('')}</div><div class="att-desc">${esc(ATTACHMENTS[slot][c.att[slot]]?.desc || '')}</div></div>`;
    }).join('');
    const skins = Object.entries(SKINS).map(([k, s]) => `<button class="${c.skin === k ? 'sel' : ''}" data-act="cs" data-v="${k}" ${lock(s.level)}>${s.name}${lk(s.level)}</button>`).join('');
    const ops = OPERATOR_IDS.map((k) => { const o = OPERATORS[k]; return `<button class="${c.operator === k ? 'sel' : ''}" data-act="co" data-v="${k}" ${lock(o.level)} title="${esc(o.desc)}">${o.name}${lk(o.level)}</button>`; }).join('');
    this.set(`
      <div class="logo" style="font-size:44px">CLASSES</div>
      ${this.levelBadge()}
      <div class="seg">${this.draft.map((k, i) => `<button class="${i === sel ? 'sel' : ''}" data-act="cedit" data-v="${i}">${esc(k.name)}</button>`).join('')}</div>
      <div class="row"><label>Nom de la classe</label><input type="text" id="cls-name" maxlength="20" value="${esc(c.name)}"></div>
      <h2 class="section">ARME PRINCIPALE</h2>
      <div class="cards">${weapons}</div>
      ${this.statBars(c.primary, c.att)}
      <h2 class="section">ACCESSOIRES</h2>
      ${slots || '<div class="hint">Aucun accessoire pour cette arme.</div>'}
      <h2 class="section">FINITION</h2><div class="seg">${skins}</div>
      <h2 class="section">OPÉRATEUR</h2><div class="seg">${ops}</div>
      <div class="hint">${esc(OPERATORS[c.operator]?.desc || '')} — Arme secondaire : P-17 Warden · Équipement : grenade à fragmentation.</div>
      <div class="auth-err" id="cls-err"></div>
      <div style="display:flex;gap:6px">
        <button class="btn" data-act="csave">Enregistrer</button>
        <button class="btn secondary" data-act="ccancel">Annuler</button>
      </div>
    `, 'classes');
    document.getElementById('cls-name').addEventListener('input', (e) => { c.name = e.target.value.slice(0, 20); });
  }

  showMain() {
    const s = this.s;
    this.set(`
      <div class="logo">STRIKE<span>POINT</span></div>
      <div class="tagline">OPÉRATION ZONE DELTA</div>
      <div class="userbar">${this.account.user
        ? `<span>Connecté : <b>${esc(this.account.user.name)}</b></span><button class="link" data-act="profile">Profil &amp; stats</button><button class="link" data-act="logout">Déconnexion</button>`
        : '<span>Mode invité</span><button class="link" data-act="login">Se connecter / créer un compte</button>'}</div>
      <button class="btn" data-act="waves">Survie<small>Repoussez des vagues d'ennemis de plus en plus redoutables</small></button>
      <button class="btn" data-act="tdm">Match à mort par équipe<small>Vous + 4 alliés contre 5 ennemis — premier à 40</small></button>
      <button class="btn" data-act="mp">Multijoueur<small>Match à mort en ligne contre d'autres joueurs (compte requis)</small></button>
      ${this.levelBadge()}
      <h2 class="section">CLASSE</h2>
      ${this.classPicker()}
      <h2 class="section">DIFFICULTÉ DES BOTS</h2>
      <div class="seg">${Object.entries(DIFF_LABELS).map(([k, l]) => `<button class="${s.difficulty === k ? 'sel' : ''}" data-act="diff" data-v="${k}">${l}</button>`).join('')}</div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn secondary" data-act="settings">Paramètres</button>
        <button class="btn secondary" data-act="controls">Commandes</button>
      </div>
    `, 'main');
  }

  showSettings(from) {
    this.back = from === 'pause' ? 'pause' : 'main';
    const s = this.s;
    this.set(`
      <div class="logo" style="font-size:48px">PARAMÈTRES</div>
      <div class="row"><label>Sensibilité souris</label><input type="range" id="set-sens" min="0.1" max="3" step="0.05" value="${s.sens}"><output>${s.sens}</output></div>
      <div class="row"><label>Champ de vision</label><input type="range" id="set-fov" min="70" max="115" step="1" value="${s.fov}"><output>${s.fov}</output></div>
      <div class="row"><label>Volume</label><input type="range" id="set-vol" min="0" max="1" step="0.05" value="${s.volume}"><output>${Math.round(s.volume * 100)}</output></div>
      <div class="row"><label>Inverser l'axe Y</label><input type="checkbox" id="set-inv" ${s.invertY ? 'checked' : ''}></div>
      <div class="row"><label>Afficher les FPS</label><input type="checkbox" id="set-fps" ${s.showFps ? 'checked' : ''}></div>
      <h2 class="section">QUALITÉ GRAPHIQUE</h2>
      <div class="seg">${Object.entries(QUAL_LABELS).map(([k, l]) => `<button class="${s.quality === k ? 'sel' : ''}" data-act="quality" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="hint">Ultra active l'occlusion ambiante (GTAO) — gourmand. Bas désactive le bloom et réduit les ombres.</div>
      <button class="btn secondary" data-act="back">← Retour</button>
    `, 'settings');
    const bind = (id, key, fmt = (v) => v, parse = Number) => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        s[key] = el.type === 'checkbox' ? el.checked : parse(el.value);
        const out = el.nextElementSibling;
        if (out && out.tagName === 'OUTPUT') out.textContent = fmt(s[key]);
        if (key === 'volume') this.game.audio.setVolume(s.volume);
        saveSettings(s);
      });
    };
    bind('set-sens', 'sens');
    bind('set-fov', 'fov');
    bind('set-vol', 'volume', (v) => Math.round(v * 100));
    bind('set-inv', 'invertY');
    bind('set-fps', 'showFps');
  }

  showControls(from) {
    this.back = from === 'pause' ? 'pause' : 'main';
    const k = (a, b) => `<div>${a.split(' ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</div><div>${b}</div>`;
    this.set(`
      <div class="logo" style="font-size:48px">COMMANDES</div>
      <div class="controls">
        ${k('Z Q S D', 'Se déplacer (W A S D en QWERTY)')}
        ${k('Souris', 'Viser')}
        ${k('Clic G', 'Tirer')}
        ${k('Clic D', 'Viser avec le viseur (ADS)')}
        ${k('Maj', 'Sprinter')}
        ${k('Espace', 'Sauter')}
        ${k('C', "S'accroupir — en sprint : glissade")}
        ${k('A E', 'Se pencher à gauche / droite')}
        ${k('R', 'Recharger')}
        ${k('1 2 Molette', "Changer d'arme")}
        ${k('V', 'Couteau')}
        ${k('G', 'Grenade à fragmentation')}
        ${k('F', 'Caisse de munitions')}
        ${k('Tab', 'Tableau des scores')}
        ${k('Échap', 'Pause')}
      </div>
      <div class="hint">Séries d'éliminations : 3 = drone de reconnaissance (ennemis visibles sur la minimap), 6 = frappe d'artillerie, 10 = munitions max.<br>
      Les ennemis apparaissent sur la minimap lorsqu'ils tirent. La santé se régénère après quelques secondes à couvert.</div>
      <button class="btn secondary" data-act="back">← Retour</button>
    `, 'controls');
  }

  showPause(changed = false) {
    const canSwap = this.game.mode !== 'waves';
    this.set(`
      <div class="logo" style="font-size:56px">PAUSE</div>
      <button class="btn" data-act="resume">Reprendre</button>
      ${canSwap ? `<h2 class="section">CLASSE</h2>${this.classPicker('pickclass-pause')}
        <div class="hint">${changed ? 'Classe modifiée : elle sera équipée à votre prochaine réapparition.' : 'Le changement de classe prend effet à la prochaine réapparition.'}</div>` : ''}
      <button class="btn secondary" data-act="settings">Paramètres</button>
      <button class="btn secondary" data-act="controls">Commandes</button>
      <button class="btn secondary" data-act="quit">Quitter la partie</button>
      ${this.game.mode === 'mp' ? '<div class="hint">En multijoueur, la partie continue pendant la pause.</div>' : ''}
    `, 'pause');
  }

  /** Récapitulatif d'XP : barre animée, montée de niveau, déblocages. */
  xpSummary(x) {
    const l0 = levelFromXp(x.before), l1 = levelFromXp(x.after);
    const p1 = levelProgress(x.after);
    const p0 = l0 === l1 ? levelProgress(x.before).ratio : 0;
    const unlocks = [];
    if (l1 > l0) {
      const inRange = (n) => n > l0 && n <= l1;
      for (const [id, n] of Object.entries(WEAPON_LEVELS)) if (inRange(n)) unlocks.push(WEAPON_STATS[id].name);
      for (const slot of Object.keys(ATTACHMENTS)) for (const a of Object.values(ATTACHMENTS[slot])) if (inRange(a.level)) unlocks.push(a.name);
      for (const s of Object.values(SKINS)) if (inRange(s.level)) unlocks.push(`Finition ${s.name}`);
      for (const o of Object.values(OPERATORS)) if (inRange(o.level)) unlocks.push(`Opérateur ${o.name}`);
    }
    setTimeout(() => { const b = document.getElementById('xp-fill'); if (b) b.style.width = `${Math.round(p1.ratio * 100)}%`; }, 80);
    return `<div class="xp-sum">
      <div class="lvl"><div class="lvl-badge">${l1}</div><div class="lvl-info"><b>+${x.gained} XP${l1 > l0 ? ` — NIVEAU ${l1} ATTEINT !` : ''}</b>
      <span>${rankName(l1)} · ${p1.cur} / ${p1.need} XP</span><div class="xpbar"><i id="xp-fill" style="width:${Math.round(p0 * 100)}%"></i></div></div></div>
      ${unlocks.length ? `<div class="unlocks">Débloqué : ${unlocks.map(esc).join(' · ')}</div>` : ''}
    </div>`;
  }

  showEnd(r) {
    const st = r.stats;
    const cls = r.win ? 'win' : 'lose';
    const extra = this.game.mode === 'waves' ? `<div><b>${st.wave}</b><span>VAGUE</span></div>` : `<div><b>${st.deaths}</b><span>MORTS</span></div>`;
    this.set(`
      <div class="big-title ${cls}">${r.title}</div>
      <div class="tagline">${esc(r.sub)}</div>
      <div class="stats">
        <div><b>${st.score}</b><span>SCORE</span></div>
        <div><b>${st.kills}</b><span>ÉLIMINATIONS</span></div>
        ${extra}
        <div><b>${st.headshots}</b><span>TIRS À LA TÊTE</span></div>
        <div><b>${st.acc}%</b><span>PRÉCISION</span></div>
      </div>
      ${r.xp ? this.xpSummary(r.xp) : ''}
      <button class="btn" data-act="again">Rejouer</button>
      <button class="btn secondary" data-act="menu">Menu principal</button>
    `, 'end');
  }
}
