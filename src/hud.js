// Interface en jeu : réticule, hitmarkers, munitions, vie, minimap, killfeed, messages, tableau des scores.
import { WEAPON_STATS } from './shared/stats.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.cross = $('crosshair');
    this.hit = $('hitmarker');
    this.dmgOverlay = $('damage-overlay');
    this.scope = $('scope-overlay');
    this.minimap = $('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.killfeed = $('killfeed');
    this.center = $('center-msg');
    this.sub = $('sub-msg');
    this.popups = $('popups');
    this.streakEl = $('streak');
    this.prompt = $('prompt');
    this.indicators = $('dmg-indicators');
    this.scoreboard = $('scoreboard');
    this.death = $('death-screen');
    this.fps = $('fps');
    this.hitT = 0;
    this.centerT = 0;
    this.mapImg = null;
    this.fpsAcc = 0; this.fpsN = 0;
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  setMinimap(img) { this.mapImg = img; }

  hitmarker(kill, head) {
    this.hit.classList.remove('kill', 'head', 'on');
    void this.hit.offsetWidth;
    if (kill) this.hit.classList.add('kill');
    if (head) this.hit.classList.add('head');
    this.hit.classList.add('on');
  }

  damageIndicator(from, p) {
    const dx = from.x - p.pos.x, dz = from.z - p.pos.z;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    const d = document.createElement('div');
    d.className = 'dmg-ind';
    d.style.transform = `rotate(${ang}rad)`;
    d.innerHTML = '<i></i>';
    this.indicators.appendChild(d);
    setTimeout(() => d.remove(), 1400);
  }

  kill(killer, victim, weapon, head) {
    const d = document.createElement('div');
    d.className = 'kf';
    const cls = (e) => (e.isPlayer ? 'me' : this.game.isFriendlyToPlayer(e) ? 'ally' : 'enemy');
    const wName = weapon === 'grenade' ? 'Grenade' : weapon === 'melee' ? 'Couteau' : weapon === 'artillery' ? 'Artillerie' : (WEAPON_STATS[weapon]?.name || weapon || '');
    if (killer && killer !== victim) {
      d.innerHTML = `<span class="${cls(killer)}">${esc(killer.name)}</span><span class="w">[${esc(wName)}${head ? ' ✛' : ''}]</span><span class="${cls(victim)}">${esc(victim.name)}</span>`;
    } else {
      d.innerHTML = `<span class="${cls(victim)}">${esc(victim.name)}</span><span class="w">[suicide]</span>`;
    }
    this.killfeed.prepend(d);
    while (this.killfeed.children.length > 6) this.killfeed.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 5000);
    setTimeout(() => d.remove(), 6000);
  }

  popup(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'pop ' + cls;
    d.textContent = text;
    this.popups.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }

  message(text, sub = '', dur = 2.5) {
    this.center.textContent = text;
    this.sub.textContent = sub;
    this.center.classList.add('on'); this.sub.classList.add('on');
    this.centerT = dur;
  }

  streak(text) {
    this.streakEl.textContent = text;
    this.streakEl.classList.remove('on');
    void this.streakEl.offsetWidth;
    this.streakEl.classList.add('on');
  }

  showDeath(killer, respawnIn) {
    this.death.classList.remove('hidden');
    $('death-by').textContent = killer && !killer.isPlayer ? `Tué par ${killer.name}` : '';
    this.respawnAt = respawnIn;
  }

  hideDeath() { this.death.classList.add('hidden'); }

  update(dt) {
    const g = this.game, p = g.player, w = g.weapons;
    if (this.centerT > 0) {
      this.centerT -= dt;
      if (this.centerT <= 0) { this.center.classList.remove('on'); this.sub.classList.remove('on'); }
    }
    // réticule
    const scoped = w.scoped();
    this.scope.classList.toggle('hidden', !scoped);
    const hideCross = w.adsT > 0.6 || p.sprinting || !p.alive || w.state === 'melee';
    this.cross.style.opacity = hideCross ? 0 : 1;
    if (p.alive) {
      const spread = w.currentSpread(p) + (w.stats.pellets > 1 ? w.stats.pelletSpread : 0);
      const px = Math.tan(spread) * (innerHeight / 2) / Math.tan((g.camera.fov * Math.PI) / 360);
      this.cross.style.setProperty('--gap', `${Math.max(4, px).toFixed(1)}px`);
    }
    // vie
    const hpR = p.hp / p.maxHp;
    this.dmgOverlay.style.opacity = p.alive ? Math.max(0, (1 - hpR) * 1.25 - 0.1).toFixed(3) : 0.9;
    $('health-bar').style.width = `${Math.max(0, hpR * 100)}%`;
    $('health-bar').classList.toggle('low', hpR < 0.35);
    // munitions
    const a = w.ammo[w.id];
    if (a) {
      $('ammo-mag').textContent = a.mag;
      $('ammo-mag').classList.toggle('low', a.mag <= Math.ceil(w.stats.mag * 0.25));
      $('ammo-res').textContent = a.reserve;
      $('weapon-name').textContent = w.stats.name;
      $('grenades').textContent = '◆'.repeat(w.grenades) + '◇'.repeat(Math.max(0, 4 - w.grenades));
      const rl = $('reload-hint');
      rl.classList.toggle('on', p.alive && a.mag === 0 && a.reserve > 0 && w.state !== 'reload');
      rl.textContent = a.reserve === 0 && a.mag === 0 ? 'PLUS DE MUNITIONS' : 'RECHARGER [R]';
      if (a.reserve === 0 && a.mag === 0) rl.classList.add('on');
    }
    // mort
    if (!this.death.classList.contains('hidden') && this.respawnAt != null) {
      const left = Math.max(0, this.respawnAt - g.time);
      $('respawn-timer').textContent = g.mode === 'waves' ? '' : left > 0 ? `Réapparition dans ${left.toFixed(1)} s` : 'Cliquez pour réapparaître';
    }
    // scoreboard
    const showSb = g.input.down('Tab') && g.state === 'playing';
    this.scoreboard.classList.toggle('hidden', !showSb);
    if (showSb) this.renderScoreboard();
    // FPS
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} FPS`;
      this.fpsAcc = 0; this.fpsN = 0;
    }
    this.fps.classList.toggle('hidden', !g.settings.showFps);
    this.drawMinimap();
  }

  setTop(left, mid, right) {
    $('score-a').textContent = left;
    $('mode-info').textContent = mid;
    $('score-b').textContent = right;
  }

  setPrompt(text) {
    this.prompt.textContent = text || '';
    this.prompt.classList.toggle('on', !!text);
  }

  renderScoreboard() {
    const g = this.game;
    const all = g.combatants().slice();
    const row = (e) => `<tr class="${e.isPlayer ? 'me' : ''}"><td>${esc(e.name)}</td><td>${e.score | 0}</td><td>${e.kills}</td><td>${e.deaths}</td></tr>`;
    const table = (title, list, cls) => `<div class="sb-team ${cls}"><h3>${title}</h3><table><tr><th>Nom</th><th>Score</th><th>É</th><th>M</th></tr>${list.sort((a, b) => b.score - a.score).map(row).join('')}</table></div>`;
    if (g.mode === 'tdm') {
      this.scoreboard.innerHTML = table('ALLIÉS', all.filter((e) => e.team === 'A'), 'a') + table('ENNEMIS', all.filter((e) => e.team === 'B'), 'b');
    } else if (g.mode === 'mp') {
      this.scoreboard.innerHTML = table('JOUEURS', all, 'a');
    } else {
      const p = g.player;
      const acc = p.shotsFired ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
      this.scoreboard.innerHTML = `<div class="sb-team a"><h3>SURVIE — VAGUE ${g.wave}</h3><table>
        <tr><th>Score</th><th>Éliminations</th><th>Tirs à la tête</th><th>Précision</th></tr>
        <tr class="me"><td>${p.score}</td><td>${p.kills}</td><td>${p.headshots}</td><td>${acc}%</td></tr></table></div>`;
    }
  }

  drawMinimap() {
    const g = this.game, p = g.player, ctx = this.mctx, img = this.mapImg;
    if (!img) return;
    const W = this.minimap.width, R = W / 2;
    const zoom = 1.4;
    const s = img.scale;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1a1a18'; ctx.fillRect(0, 0, W, W);
    ctx.translate(R, R);
    ctx.rotate(p.yaw);
    ctx.scale(zoom, zoom);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(img.canvas, -(p.pos.x + img.offset) * s, -(p.pos.z + img.offset) * s);
    ctx.globalAlpha = 1;
    const now = g.time;
    for (const e of g.combatants()) {
      if (e === p || !e.alive) continue;
      const friendly = g.isFriendlyToPlayer(e);
      const visible = friendly || g.uavUntil > now || now - e.lastShotTime < 1.6;
      if (!visible) continue;
      const x = (e.pos.x - p.pos.x) * s, y = (e.pos.z - p.pos.z) * s;
      ctx.save();
      ctx.translate(x, y);
      if (friendly) {
        ctx.rotate(-e.yaw);
        ctx.fillStyle = '#5aa9ff';
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3.5, 4); ctx.lineTo(-3.5, 4); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = '#ff3b3b';
        ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    for (const gr of g.grenades) {
      ctx.fillStyle = '#ffcc33';
      ctx.fillRect((gr.pos.x - p.pos.x) * s - 2, (gr.pos.z - p.pos.z) * s - 2, 4, 4);
    }
    ctx.restore();
    // joueur
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath(); ctx.moveTo(R, R - 7); ctx.lineTo(R + 5, R + 5); ctx.lineTo(R, R + 2); ctx.lineTo(R - 5, R + 5); ctx.closePath(); ctx.fill();
    // cône de vision
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.moveTo(R, R); ctx.arc(R, R, R, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = g.uavUntil > now ? 'rgba(255,80,80,0.9)' : 'rgba(220,220,210,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(230,230,220,0.85)'; ctx.font = 'bold 12px Rajdhani, sans-serif'; ctx.textAlign = 'center';
    const nx = Math.sin(p.yaw) * (R - 12), ny = -Math.cos(p.yaw) * (R - 12);
    ctx.fillText('N', R + nx, R + ny + 4);
  }
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
