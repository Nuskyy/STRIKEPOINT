// Audio 100 % procédural (Web Audio API) : tirs, rechargements, impacts, explosions, ambiance.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.heartbeatT = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    // bruit blanc
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // réverbération (réponse impulsionnelle générée)
    const rl = ctx.sampleRate * 1.6;
    const ir = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const c = ir.getChannelData(ch);
      for (let i = 0; i < rl; i++) c[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    this.reverb.connect(wet).connect(this.master);
    // écho extérieur (réflexion lointaine sur les collines)
    this.echo = ctx.createDelay(1.5);
    this.echo.delayTime.value = 0.32;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const elp = ctx.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 900;
    const eg = ctx.createGain(); eg.gain.value = 0.28;
    this.echo.connect(elp).connect(fb).connect(this.echo);
    elp.connect(eg).connect(this.master);
    this.startAmbient();
    this.loadSamples();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    this.listenerPos = { x: pos.x, y: pos.y, z: pos.z };
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  _out(pos, vol, reverb = false) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (pos) {
      const lp = this.listenerPos;
      const dist = Math.hypot(pos.x - lp.x, pos.y - lp.y, pos.z - lp.z);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(700, 18000 * Math.pow(Math.max(0, 1 - dist / 160), 2));
      const pn = ctx.createPanner();
      pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse';
      pn.refDistance = 4; pn.rolloffFactor = 1.1; pn.maxDistance = 300;
      if (pn.positionX) { pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z; }
      else pn.setPosition(pos.x, pos.y, pos.z);
      g.connect(f).connect(pn).connect(this.master);
      if (reverb) { pn.connect(this.reverb); pn.connect(this.echo); }
    } else {
      g.connect(this.master);
      if (reverb) { g.connect(this.reverb); g.connect(this.echo); }
    }
    return g;
  }

  _noise(t, dur, out, type, f0, f1, gain, attack = 0.001, q = 0.8) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random() * 1.5);
    n.stop(t + dur + 0.05);
  }

  _tone(t, dur, out, type, f0, f1, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Charge les enregistrements réels (pack CC0 Stein Games) listés dans assets/sounds/manifest.json. */
  async loadSamples() {
    if (this.samples || !this.ctx) return;
    this.samples = {};
    try {
      const man = await (await fetch('assets/sounds/manifest.json')).json();
      await Promise.all(Object.entries(man).map(async ([k, n]) => {
        const list = [];
        for (let i = 0; i < n; i++) {
          try {
            const ab = await (await fetch(`assets/sounds/${k}/${i}.ogg`)).arrayBuffer();
            list.push(await this.ctx.decodeAudioData(ab));
          } catch { /* format non pris en charge */ }
        }
        this.samples[k] = list;
      }));
    } catch { /* pas d'enregistrements : sons synthétisés */ }
  }

  playSample(key, pos = null, vol = 1, delay = 0, reverb = false) {
    const list = this.samples?.[key];
    if (!this.ctx || !list?.length) return false;
    const s = this.ctx.createBufferSource();
    s.buffer = list[Math.floor(Math.random() * list.length)];
    s.playbackRate.value = 0.97 + Math.random() * 0.06;
    s.connect(this._out(pos, vol, reverb));
    s.start(this.ctx.currentTime + delay);
    return true;
  }

  /** Bruit mécanique de rechargement selon l'arme (enregistrements si disponibles). */
  mech(kind, delay, pistol = false) {
    const key = pistol ? { out: 'pmagout', in: 'pmagin', bolt: 'pslide' }[kind] : { out: 'magout', in: 'magin', bolt: 'charge' }[kind];
    if (this.playSample(key, null, 0.8, delay)) return true;
    return false;
  }

  /** p: profil sonore (stats.sound), pos: null = joueur local */
  shot(p, pos = null, vol = 1) {
    if (!this.ctx) return;
    if (p.sample && this.samples) {
      const lp = this.listenerPos;
      const far = pos && Math.hypot(pos.x - lp.x, pos.y - lp.y, pos.z - lp.z) > 40;
      const key = far && this.samples[p.sample + '_far']?.length ? p.sample + '_far' : p.sample;
      if (this.playSample(key, pos, vol * (pos ? 1.7 : 0.95), 0, true)) {
        if (!pos && this.samples[p.sample + '_tail']?.length) this.playSample(p.sample + '_tail', null, 0.45, 0.04);
        return;
      }
    }
    const t = this.ctx.currentTime;
    const out = this._out(pos, vol * (pos ? 1.4 : 0.85), true);
    const pr = 0.95 + Math.random() * 0.1;
    this._noise(t, p.decay * 1.8, out, 'lowpass', p.freq * 2.6 * pr, p.freq * 0.35, 1.0);
    this._tone(t, 0.16, out, 'sine', 150 * pr, 42, p.low);
    this._noise(t, 0.035, out, 'highpass', 3500, 3500, 0.55 * p.crack);
    this._noise(t + 0.01, 0.5 * p.tail, out, 'lowpass', 900, 200, 0.22 * p.tail, 0.02);
  }

  dry() { if (!this.playSample('dry', null, 0.7)) this.click(3200, 0.03, 0.35); }

  shellDrop(pistol = false) { this.playSample(pistol ? 'pshell' : 'shell', null, 0.35, 0.35 + Math.random() * 0.15); }

  draw() { this.playSample('draw', null, 0.6); }

  click(freq, dur, vol, delay = 0, pos = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const out = this._out(pos, vol);
    this._noise(t, dur, out, 'bandpass', freq, freq * 0.7, 1, 0.001, 3);
  }

  magOut(delay = 0) { this.click(1800, 0.04, 0.5, delay); this.click(900, 0.06, 0.4, delay + 0.03); }
  magIn(delay = 0) { this.click(2600, 0.03, 0.6, delay); this.click(1200, 0.07, 0.6, delay + 0.02); }
  bolt(delay = 0) { this.click(2200, 0.04, 0.5, delay); this.click(1500, 0.05, 0.5, delay + 0.12); }
  shellIn(delay = 0) { this.click(1700, 0.05, 0.5, delay); }
  pump(delay = 0) { this.click(900, 0.08, 0.6, delay); this.click(1300, 0.07, 0.6, delay + 0.16); }

  footstep(vol = 0.25, pos = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, vol);
    this._noise(t, 0.09, out, 'lowpass', 500 + Math.random() * 300, 150, 0.7, 0.005);
    this._noise(t, 0.04, out, 'highpass', 2500, 2500, 0.08);
  }

  land(vol = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, vol);
    this._noise(t, 0.15, out, 'lowpass', 400, 100, 1, 0.003);
  }

  hitmarker(head = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.35);
    if (head) {
      this._tone(t, 0.25, out, 'sine', 2500, 2400, 0.5);
      this._tone(t, 0.3, out, 'sine', 3700, 3600, 0.3);
    } else {
      this._noise(t, 0.04, out, 'bandpass', 2000, 1500, 1, 0.001, 2);
      this._tone(t, 0.04, out, 'square', 1700, 1600, 0.15);
    }
  }

  killConfirm() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.35);
    this._tone(t, 0.12, out, 'triangle', 1100, 900, 0.5);
    this._tone(t + 0.07, 0.15, out, 'triangle', 1500, 1300, 0.4);
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.6);
    this._noise(t, 0.2, out, 'lowpass', 600, 120, 1, 0.003);
    this._tone(t, 0.18, out, 'sine', 90, 50, 0.6);
  }

  heartbeat(intensity) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.5 * intensity);
    this._tone(t, 0.12, out, 'sine', 60, 40, 1);
    this._tone(t + 0.18, 0.12, out, 'sine', 55, 38, 0.8);
  }

  whiz() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.35);
    const f = 2500 + Math.random() * 2000;
    this._noise(t, 0.16, out, 'bandpass', f, f * 0.5, 1, 0.03, 6);
  }

  impact(pos, metal = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.25);
    if (metal) this._tone(t, 0.12, out, 'triangle', 2500 + Math.random() * 1500, 1800, 0.3);
    this._noise(t, 0.07, out, 'bandpass', 1200, 500, 1, 0.001, 1.5);
  }

  explosion(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 2.4, true);
    this._noise(t, 1.6, out, 'lowpass', 2200, 90, 1.2, 0.003);
    this._tone(t, 0.9, out, 'sine', 75, 28, 1.3);
    this._noise(t, 0.08, out, 'highpass', 2000, 2000, 0.6);
  }

  bounce(pos) { this.click(2800 + Math.random() * 800, 0.05, 0.3, 0, pos); }

  swoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.35);
    this._noise(t, 0.22, out, 'bandpass', 600, 2400, 1, 0.08, 2);
  }

  thud() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.7);
    this._tone(t, 0.12, out, 'sine', 120, 50, 1);
    this._noise(t, 0.08, out, 'lowpass', 800, 200, 0.8);
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.3);
    this._tone(t, 0.08, out, 'triangle', 900, 900, 0.5);
    this._tone(t + 0.08, 0.12, out, 'triangle', 1350, 1350, 0.5);
  }

  ui() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.05, this._out(null, 0.2), 'square', 900, 700, 0.3);
  }

  announce(type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.35);
    const notes = type === 'wave' ? [440, 554, 659] : type === 'streak' ? [660, 880, 990, 1320] : type === 'win' ? [523, 659, 784, 1046] : [392, 330, 262];
    notes.forEach((f, i) => this._tone(t + i * 0.12, 0.3, out, 'triangle', f, f, 0.5));
  }

  whistle(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.8);
    this._tone(t, 1.1, out, 'sine', 2200, 600, 0.25);
  }

  startAmbient() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lg = ctx.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg).connect(g.gain);
    n.connect(f).connect(g).connect(this.master);
    n.start(); lfo.start();
  }

  update(dt, hpRatio, alive) {
    if (!this.ctx) return;
    if (alive && hpRatio < 0.4) {
      this.heartbeatT -= dt;
      if (this.heartbeatT <= 0) { this.heartbeatT = 0.75 + hpRatio; this.heartbeat(1 - hpRatio); }
    }
  }
}
