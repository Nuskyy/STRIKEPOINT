// Orchestrateur : rendu, boucle de jeu, modes (Vagues / Match à mort par équipe / Multijoueur), dégâts, séries.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { Sky } from 'three/addons/objects/Sky.js';

import { GameMap, HALF } from './map.js';
import { Scenery } from './scenery.js';
import { WetSurfaces, GodRaysShader } from './wet.js';
import { World } from './physics.js';
import { NavGrid } from './nav.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { Bot } from './bot.js';
import { HUD } from './hud.js';
import { NetClient } from './net.js';
import { SPAWNS } from './shared/spawns.js';
import { MELEE_DAMAGE, GRENADE_DAMAGE } from './shared/stats.js';
import { rayAABB } from './physics.js';

const BOT_NAMES = ['Viper', 'Ghostline', 'Kodiak', 'Rook', 'Sable', 'Mako', 'Talon', 'Havoc', 'Nomad', 'Jackal', 'Onyx', 'Raptor', 'Bishop', 'Cobalt', 'Hex', 'Dune', 'Quill', 'Sparrow', 'Brute', 'Echo'];

class ViewmodelPass extends Pass {
  constructor(scene, camera) { super(); this.scene = scene; this.camera = camera; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }
}

// Étalonnage (avant tone mapping, espace linéaire) : aberration chromatique légère, désaturation
// "militaire", ombres froides / hautes lumières chaudes, vignettage.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uLow: { value: 0 }, uVignette: { value: 0.45 }, uCA: { value: 0.0012 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uLow; uniform float uVignette; uniform float uCA; varying vec2 vUv;
    void main(){
      vec2 dir = vUv - 0.5;
      float d = length(dir);
      vec2 off = dir * uCA * (1.0 + uLow * 3.0) * d * 2.0;
      vec4 c = texture2D(tDiffuse, vUv);
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, 0.86);                       // désaturation légère
      vec3 shadowTint = vec3(0.92, 0.98, 1.06), hiTint = vec3(1.06, 1.0, 0.9);
      float k = smoothstep(0.0, 0.6, l);
      c.rgb *= mix(shadowTint, hiTint, k);                     // split toning
      c.rgb = mix(c.rgb, vec3(l), uLow * 0.75);               // faible santé => gris
      c.rgb += vec3(0.08, 0.0, 0.0) * uLow * smoothstep(0.3, 0.8, d);
      c.rgb *= 1.0 - smoothstep(0.38, 0.9, d) * uVignette;
      gl_FragColor = c;
    }`,
};

// Grain de pellicule (après tone mapping)
const GrainShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 0.045 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float n = rand(vUv * 1000.0 + fract(uTime) * 100.0) - 0.5;
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb += n * uAmount * (1.0 - l * 0.6);
      gl_FragColor = c;
    }`,
};

const QUALITY = {
  low: { pr: 0.75, shadow: 1024, bloom: false, ao: false, msaa: 0, refl: 0 },
  medium: { pr: 1, shadow: 2048, bloom: true, ao: false, msaa: 2, refl: 0.3 },
  high: { pr: 1.25, shadow: 4096, bloom: true, ao: true, msaa: 4, refl: 0.45 },
  ultra: { pr: 1.5, shadow: 4096, bloom: true, ao: true, msaa: 4, refl: 0.6 },
};

export class Game {
  constructor(container, settings, assets = null, renderer = null) {
    this.container = container;
    this.settings = settings;
    this.assets = assets;
    this._renderer = renderer;
    this.state = 'menu';
    this.mode = null;
    this.time = 0;
    this.grenades = [];
    this.pickups = [];
    this.bots = [];
    this.remotes = new Map();
    this.uavUntil = -99;
    this.pathBudget = 4;
    this.scheduled = [];

    // --- Rendu ---
    const r = this.renderer = this._renderer || new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.62;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 1500);
    this.camera.rotation.order = 'YXZ';
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.01, 10);

    this.setupLighting();

    // --- Monde ---
    this.map = new GameMap(this.scene, this.assets);
    this.map.buildMeshes();
    this.world = new World(this.map.boxes);
    this.nav = new NavGrid(this.map.boxes, HALF);
    this.scenery = new Scenery(this.scene, this.map, this.world, this.assets);

    // sol mouillé : reflets + flaques
    this.wet = new WetSurfaces();
    for (const m of this.map.wetMaterials) this.wet.apply(m, 1);
    for (const m of this.scenery.wetMaterials) this.wet.apply(m, 0.55);
    const wetSet = new Set([...this.map.wetMaterials, ...this.scenery.wetMaterials]);
    this.scene.traverse((o) => { if (o.isMesh && wetSet.has(o.material)) this.wet.hide.push(o); });
    this.wet.hide.push(this.scenery.rainLines, this.scenery.splashes, this.scenery.dustPts);
    if (this.scenery.grassMesh) this.wet.hide.push(this.scenery.grassMesh);
    for (const m of this.scenery.grassMeshes || []) this.wet.hide.push(m);

    this.input = new Input(r.domElement);
    this.audio = new AudioEngine();
    this.audio.setVolume(settings.volume);
    this.effects = new Effects(this.scene);
    this.player = new Player(this);
    this.weapons = new WeaponSystem(this);
    this.weapons.setLoadout(settings.primary || 'ar');
    this.hud = new HUD(this);
    this.hud.setMinimap(this.map.buildMinimap(3));

    this.setupComposer();

    this.grenadeGeo = new THREE.SphereGeometry(0.07, 10, 8);
    this.grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2c, roughness: 0.6, metalness: 0.3 });
    this.pickupGeo = new THREE.BoxGeometry(0.42, 0.26, 0.3);
    this.pickupMat = new THREE.MeshStandardMaterial({ color: 0x55703a, roughness: 0.6, emissive: 0x2a3a10, emissiveIntensity: 0.6 });

    addEventListener('resize', () => this.onResize());
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    r.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.lock();
      if (this.state === 'playing' && !this.player.alive) this.tryRespawn();
    });

    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- rendu
  setupLighting() {
    const A = this.assets;
    if (A?.hdri) { this.setupHDRLighting(A); return; }
    const sky = new Sky();
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u.turbidity.value = 9; u.rayleigh.value = 1.9; u.mieCoefficient.value = 0.008; u.mieDirectionalG.value = 0.86;
    const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(65), THREE.MathUtils.degToRad(140));
    u.sunPosition.value.copy(sun);
    this.scene.add(sky);

    // environnement (reflets) à partir du ciel
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(1000);
    for (const k of Object.keys(u)) sky2.material.uniforms[k].value = u[k].value;
    envScene.add(sky2);
    const env = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.55;
    this.viewScene.environment = env;
    this.viewScene.environmentIntensity = 0.4;

    this.scene.fog = new THREE.FogExp2(0xb4b9b2, 0.0042);

    const hemi = new THREE.HemisphereLight(0xb7cbe0, 0x5a4e3a, 0.9);
    this.scene.add(hemi);
    const dl = this.sun = new THREE.DirectionalLight(0xffd6a0, 4.6);
    dl.position.copy(sun).multiplyScalar(120);
    this.sunOffset = dl.position.clone();
    dl.castShadow = true;
    const sc = dl.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 360;
    dl.shadow.bias = -0.0004;
    dl.shadow.normalBias = 0.04;
    this.scene.add(dl, dl.target);

    const vh = new THREE.HemisphereLight(0xcfe0f0, 0x4a4030, 0.7);
    const vd = new THREE.DirectionalLight(0xffe8cc, 1.8);
    vd.position.set(-0.5, 1, 0.6);
    this.viewScene.add(vh, vd);
  }

  /** Éclairage à partir de l'HDRI de coucher de soleil : environnement, fond, soleil aligné. */
  setupHDRLighting(A) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromEquirectangular(A.hdri).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.75;
    this.scene.background = A.hdri;
    this.scene.backgroundIntensity = 0.75;
    this.viewScene.environment = env;
    this.viewScene.environmentIntensity = 0.5;
    this.renderer.toneMappingExposure = 0.68;

    // direction réelle du soleil dans l'HDRI (pour le fond et les rayons)
    const sd = A.sunDirection() || new THREE.Vector3(0.8, 0.1, 0.6).normalize();
    this.sunDir = sd.clone();
    // la lumière directionnelle reste un peu plus haute pour des ombres jouables
    const light = sd.clone();
    const elev = Math.asin(light.y), minElev = THREE.MathUtils.degToRad(13);
    if (elev < minElev) {
      const h = Math.hypot(light.x, light.z);
      light.set((light.x / h) * Math.cos(minElev), Math.sin(minElev), (light.z / h) * Math.cos(minElev));
    }
    this.scene.fog = new THREE.FogExp2(0x6f6a64, 0.0038);

    const hemi = new THREE.HemisphereLight(0x9fb0c8, 0x3a3228, 0.35);
    this.scene.add(hemi);
    const dl = this.sun = new THREE.DirectionalLight(0xffb36b, 5.2);
    dl.position.copy(light).multiplyScalar(140);
    this.sunOffset = dl.position.clone();
    dl.castShadow = true;
    const sc = dl.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 400;
    dl.shadow.bias = -0.0003;
    dl.shadow.normalBias = 0.05;
    this.scene.add(dl, dl.target);

    const vh = new THREE.HemisphereLight(0xb0bccc, 0x40382c, 0.35);
    const vd = new THREE.DirectionalLight(0xffc48a, 1.6);
    vd.position.set(0.6, 0.6, -1);
    const rim = new THREE.DirectionalLight(0x8fa6c4, 0.6);
    rim.position.set(-1, 0.3, 0.5);
    const fill = new THREE.DirectionalLight(0xdfe6f0, 1.4);
    fill.position.set(-0.8, 0.5, -0.6);
    this.viewScene.add(vh, vd, rim, fill);
  }

  setupComposer() {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, q.pr));
    if (this.sun.shadow.mapSize.x !== q.shadow) {
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    if (this.composer) this.composer.dispose();
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    const c = this.composer = new EffectComposer(r, rt);
    c.setPixelRatio(r.getPixelRatio());
    c.setSize(innerWidth, innerHeight);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) {
      const ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.8;
      c.addPass(ao);
    }
    this.godrays = null;
    if (q.bloom && this.sunDir) {
      this.godrays = new ShaderPass(GodRaysShader);
      c.addPass(this.godrays);
    }
    if (this.wet) {
      this.wet.enabled = q.refl > 0;
      this.wet.scale = q.refl || 0.25;
      this.wet.setSize(size.x, size.y);
    }
    this.vmPass = new ViewmodelPass(this.viewScene, this.viewCamera);
    c.addPass(this.vmPass);
    if (q.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.3, 3.5));
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    c.addPass(new OutputPass());
    this.grain = new ShaderPass(GrainShader);
    c.addPass(this.grain);
  }

  applySettings() {
    this.audio.setVolume(this.settings.volume);
    this.setupComposer();
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = innerWidth / innerHeight;
    this.viewCamera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.wet.setSize(s.x, s.y);
  }

  // ---------------------------------------------------------------- entités
  combatants() {
    const list = [this.player];
    for (const b of this.bots) list.push(b);
    for (const r of this.remotes.values()) list.push(r);
    return list;
  }

  isEnemy(a, b) { return a !== b && a.team !== b.team; }
  isFriendlyToPlayer(e) { return e === this.player || e.team === this.player.team; }

  traceShot(origin, dir, maxDist, shooter) {
    const w = this.world.raycast(origin, dir, maxDist);
    let best = w ? w.t : maxDist, ent = null, head = false;
    for (const c of this.combatants()) {
      if (c === shooter || !c.alive || !this.isEnemy(shooter, c)) continue;
      // rejet rapide
      const vx = c.pos.x - origin.x, vy = c.pos.y + 1 - origin.y, vz = c.pos.z - origin.z;
      const proj = vx * dir.x + vy * dir.y + vz * dir.z;
      if (proj < 0 || proj > best + 1) continue;
      const px = vx - dir.x * proj, py = vy - dir.y * proj, pz = vz - dir.z * proj;
      if (px * px + py * py + pz * pz > 4) continue;
      for (const hb of c.getHitboxes()) {
        const t = rayAABB(origin, dir, hb, best);
        if (t >= 0 && t < best) { best = t; ent = c; head = hb.head; }
      }
    }
    const point = new THREE.Vector3(origin.x + dir.x * best, origin.y + dir.y * best, origin.z + dir.z * best);
    return { t: best, point, entity: ent, head, hitWorld: !ent && !!w, normal: w?.normal, box: w?.box };
  }

  applyDamage(target, amount, attacker, info = {}) {
    if (!target || !target.alive) return;
    if (target.isRemote) { this.net?.sendHit(target, amount, info); return; }
    if (this.mode === 'mp' && target.isPlayer) {
      if (attacker === this.player) this.net?.sendHit(target, amount, info);
      return;
    }
    if (attacker && attacker !== target && !this.isEnemy(attacker, target)) return;
    if (target.isPlayer && this.god) return;
    target.hp -= amount;
    target.onDamaged?.(amount, attacker, info);
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      this.onKill(attacker, target, info);
    }
  }

  onKill(killer, victim, info = {}) {
    victim.deaths++;
    victim.onDeath(info, killer);
    this.hud.kill(killer, victim, info.weapon, info.headshot);
    if (killer && killer !== victim) {
      killer.kills++;
      killer.streak = (killer.streak || 0) + 1;
      killer.score += 100 + (info.headshot ? 50 : 0);
      if (killer.isPlayer) {
        this.audio.killConfirm();
        this.hud.popup(info.headshot ? '+150  TIR À LA TÊTE' : '+100  ÉLIMINATION', info.headshot ? 'head' : '');
        if (info.headshot) killer.headshots++;
        this.checkStreak(killer.streak);
      }
      if (this.mode === 'tdm') {
        this.teamScore[killer.team]++;
        if (this.teamScore[killer.team] >= this.scoreLimit) this.endMatch(killer.team === this.player.team);
      }
    }
    if (victim.isBot && Math.random() < (this.mode === 'waves' ? 0.6 : 0.4)) this.spawnPickup(victim.pos);
    if (victim.isPlayer) {
      if (this.mode === 'waves') {
        this.hud.showDeath(killer, null);
        setTimeout(() => { if (this.mode === 'waves' && this.state === 'playing') this.endMatch(false); }, 2200);
      } else {
        this.respawnAt = this.time + 3.5;
        this.hud.showDeath(killer, this.respawnAt);
      }
    }
    if (this.mode === 'waves' && victim.isBot) this.waveKilled++;
  }

  checkStreak(n) {
    if (n === 3) {
      this.uavUntil = this.time + 25;
      this.hud.streak('DRONE DE RECONNAISSANCE EN LIGNE');
      this.audio.announce('streak');
    } else if (n === 6 && this.mode !== 'mp') {
      this.hud.streak("FRAPPE D'ARTILLERIE EN APPROCHE");
      this.audio.announce('streak');
      this.artillery(this.player);
    } else if (n === 10) {
      this.hud.streak('INARRÊTABLE — MUNITIONS MAX');
      this.weapons.refill(false);
      this.weapons.grenades = 4;
      this.audio.announce('streak');
    }
  }

  noise(pos, radius, source) {
    for (const b of this.bots) {
      if (!b.alive || b.team === source.team) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
      if (d < radius) b.hear(pos, source);
    }
  }

  onPlayerFire(weaponId, origin, dir, suppressed = false) {
    // silencieux : pas de point rouge sur la minimap ennemie, bruit très réduit
    if (!suppressed) this.player.lastShotTime = this.time;
    this.noise(this.player.pos, suppressed ? 9 : 55, this.player);
    if (this.mode === 'mp') this.net?.sendShot(weaponId, origin, dir, suppressed);
  }

  melee(p) {
    const cam = this.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    let best = null, bestD = 2.4;
    for (const c of this.combatants()) {
      if (!c.alive || !this.isEnemy(p, c)) continue;
      const v = new THREE.Vector3(c.pos.x - p.pos.x, 0, c.pos.z - p.pos.z);
      const d = v.length();
      if (d > bestD) continue;
      v.normalize();
      if (v.x * dir.x + v.z * dir.z < 0.45) continue;
      best = c; bestD = d;
    }
    if (best) {
      const pt = best.eyePos(new THREE.Vector3()); pt.y -= 0.4;
      this.effects.blood(pt, dir);
      this.audio.thud();
      this.applyDamage(best, MELEE_DAMAGE, p, { weapon: 'melee', from: p.pos.clone() });
      this.hud.hitmarker(!best.alive && !best.isRemote, false);
    }
  }

  // ---------------------------------------------------------------- grenades
  throwGrenade(owner, origin, vel, remote = false) {
    const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.grenades.push({ owner, pos: mesh.position, vel: vel.clone(), fuse: 2.6, mesh, remote });
    if (!remote && this.mode === 'mp') this.net?.sendGrenade(origin, vel);
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const gr = this.grenades[i];
      gr.fuse -= dt;
      gr.vel.y -= 18 * dt;
      const steps = 3, sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (const ax of ['x', 'y', 'z']) {
          const prev = gr.pos[ax];
          gr.pos[ax] += gr.vel[ax] * sdt;
          if (this.pointBlocked(gr.pos)) {
            gr.pos[ax] = prev;
            const sp = Math.abs(gr.vel[ax]);
            gr.vel[ax] *= -0.35;
            const o = ax === 'y' ? ['x', 'z'] : ['y'];
            for (const k of o) if (k !== 'y') gr.vel[k] *= 0.7;
            if (sp > 2) this.audio.bounce(gr.pos);
          }
        }
      }
      gr.mesh.rotation.x += dt * 8; gr.mesh.rotation.z += dt * 5;
      if (gr.fuse <= 0) {
        this.explode(gr.pos.clone(), gr.owner, 'grenade', gr.remote);
        this.scene.remove(gr.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  pointBlocked(p) {
    if (p.y < 0.07) return true;
    const list = this.world.query(p.x - 0.07, p.z - 0.07, p.x + 0.07, p.z + 0.07, this._gq || (this._gq = []));
    for (const b of list) {
      if (p.x + 0.07 > b.min.x && p.x - 0.07 < b.max.x && p.y + 0.07 > b.min.y && p.y - 0.07 < b.max.y && p.z + 0.07 > b.min.z && p.z - 0.07 < b.max.z) return true;
    }
    return false;
  }

  explode(pos, owner, weapon = 'grenade', visualOnly = false) {
    this.effects.explosion(pos);
    this.audio.explosion(pos);
    const R = 8;
    const p = this.player;
    const de = p.eyePos(new THREE.Vector3()).distanceTo(pos);
    if (de < 30) p.trauma = Math.min(1, p.trauma + (1 - de / 30) * 0.9);
    if (owner) this.noise(pos, 50, owner);
    if (visualOnly) return;
    const src = pos.clone(); src.y += 0.3;
    for (const c of this.combatants()) {
      if (!c.alive) continue;
      const chest = c.eyePos(new THREE.Vector3()); chest.y -= 0.5;
      const d = chest.distanceTo(pos);
      if (d > R) continue;
      if (!this.world.clear(src, chest)) continue;
      const self = c === owner;
      if (!self && owner && !this.isEnemy(owner, c)) continue;
      let dmg = GRENADE_DAMAGE * Math.pow(1 - d / R, 1.3) + 10;
      if (self) dmg *= 0.6;
      if (c.isRemote || (this.mode === 'mp' && c.isPlayer)) {
        if (owner === p) this.net?.sendHit(c, dmg, { weapon, from: pos });
        continue;
      }
      this.applyDamage(c, dmg, self ? c : owner, { weapon, from: pos.clone() });
      if (owner === p && !self) this.hud.hitmarker(!c.alive, false);
    }
  }

  artillery(owner) {
    const targets = this.bots.filter((b) => b.alive && this.isEnemy(owner, b));
    for (let i = 0; i < 9; i++) {
      const t = targets.length ? targets[i % targets.length].pos : this.nav.randomPoint();
      const x = t.x + (Math.random() - 0.5) * 8, z = t.z + (Math.random() - 0.5) * 8;
      const at = this.time + 1.5 + i * 0.45;
      this.schedule(at - 1.1, () => this.audio.whistle({ x, y: 10, z }));
      this.schedule(at, () => this.explode(new THREE.Vector3(x, 0.2, z), owner, 'artillery'));
    }
  }

  schedule(t, fn) { this.scheduled.push({ t, fn }); }

  // ---------------------------------------------------------------- ramassables
  spawnPickup(pos) {
    let mesh = this.assets?.clone('ammo_box');
    if (mesh) { mesh.scale.setScalar(1.6); }
    else { mesh = new THREE.Mesh(this.pickupGeo, this.pickupMat); mesh.castShadow = true; }
    mesh.position.set(pos.x, 0.3, pos.z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, life: 25 });
  }

  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.life -= dt;
      k.mesh.rotation.y += dt * 1.5;
      k.mesh.position.y = 0.12 + Math.sin(this.time * 3 + i) * 0.05;
      const d = Math.hypot(p.pos.x - k.mesh.position.x, p.pos.z - k.mesh.position.z);
      if (p.alive && d < 1.3) {
        this.weapons.addAmmo(1);
        if (this.weapons.grenades < 4) this.weapons.grenades++;
        this.audio.pickup();
        this.hud.popup('+ MUNITIONS', 'ammo');
        k.life = 0;
      }
      if (k.life <= 0) { this.scene.remove(k.mesh); this.pickups.splice(i, 1); }
    }
    // caisses fixes
    let prompt = '';
    for (const c of this.map.ammoCrates) {
      c.cooldown = Math.max(0, c.cooldown - dt);
      const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      if (p.alive && d < 2.0) {
        if (c.cooldown > 0) prompt = `Caisse de munitions vide (${Math.ceil(c.cooldown)} s)`;
        else {
          prompt = 'Appuyez sur [F] pour vous réapprovisionner';
          if (this.input.hit('KeyF')) {
            this.weapons.refill(false);
            this.weapons.grenades = Math.max(this.weapons.grenades, 2);
            c.cooldown = this.mode === 'waves' ? 40 : 25;
            this.audio.pickup();
            this.hud.popup('MUNITIONS RECHARGÉES', 'ammo');
          }
        }
      }
    }
    this.hud.setPrompt(prompt);
  }

  // ---------------------------------------------------------------- modes
  clearMatch() {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
    for (const k of this.pickups) this.scene.remove(k.mesh);
    this.pickups = [];
    this.scheduled = [];
    if (this.net) { this.net.disconnect(); this.net = null; }
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    this.effects.clear();
    this.uavUntil = -99;
    for (const c of this.map.ammoCrates) c.cooldown = 0;
  }

  pickSpawn(list, team) {
    const enemies = this.combatants().filter((c) => c.alive && c.team !== team);
    let best = list[0], bestScore = -1;
    for (const s of list) {
      let minD = 999;
      for (const e of enemies) minD = Math.min(minD, Math.hypot(e.pos.x - s[0], e.pos.z - s[1]));
      const score = minD + Math.random() * 6;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    const n = this.nav.nearestWorld(best[0], best[1]) || { x: best[0], z: best[1] };
    return n;
  }

  start(mode, opts = {}) {
    this.audio.init();
    this.clearMatch();
    this.mode = mode;
    this.time = 0;
    this.state = 'playing';
    const p = this.player;
    p.kills = 0; p.deaths = 0; p.score = 0; p.streak = 0; p.headshots = 0; p.shotsFired = 0; p.shotsHit = 0;
    p.name = this.account?.user?.name || 'Invité';
    p.team = 'A';
    this.weapons.setLoadout(this.currentClass());
    this.hud.show(true);
    this.hud.hideDeath();
    this.respawnAt = null;

    if (mode === 'waves') {
      const s = this.pickSpawn(SPAWNS.A, 'A');
      p.spawn(s.x, s.z, -Math.PI / 2);
      this.wave = 0;
      this.waveState = 'intermission';
      this.waveTimer = 4;
      this.hud.message('SURVIE', 'Tenez le plus longtemps possible', 3.5);
    } else if (mode === 'tdm') {
      this.teamScore = { A: 0, B: 0 };
      this.scoreLimit = 40;
      this.timeLimit = 600;
      const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      for (let i = 0; i < 4; i++) this.bots.push(new Bot(this, 'A', names[i], { ally: true }));
      for (let i = 0; i < 5; i++) this.bots.push(new Bot(this, 'B', names[4 + i]));
      const s = this.pickSpawn(SPAWNS.A, 'A');
      p.spawn(s.x, s.z, -Math.PI / 2);
      this.bots.forEach((b, i) => {
        const list = SPAWNS[b.team];
        const sp = list[(i * 3) % list.length];
        const n = this.nav.nearestWorld(sp[0] + (Math.random() - 0.5) * 3, sp[1] + (Math.random() - 0.5) * 3);
        b.spawn(n.x, n.z, b.team === 'A' ? -Math.PI / 2 : Math.PI / 2);
      });
      this.hud.message('MATCH À MORT PAR ÉQUIPE', `Première équipe à ${this.scoreLimit} éliminations`, 3.5);
    } else if (mode === 'mp') {
      p.alive = false;
      this.net = new NetClient(this);
      this.net.connect(this.account?.token, this.currentClass().operator);
      this.hud.message('MULTIJOUEUR', 'Connexion au serveur…', 3);
    }
    this.audio.announce('wave');
    this.input.lock();
  }

  tryRespawn() {
    if (this.mode === 'waves' || this.respawnAt == null || this.time < this.respawnAt) return;
    this.respawnPlayer();
  }

  respawnPlayer() {
    this.hud.hideDeath();
    this.respawnAt = null;
    if (this.mode === 'mp') { this.net?.requestRespawn(); return; }
    const s = this.pickSpawn(SPAWNS[this.player.team] || SPAWNS.ffa, this.player.team);
    this.player.spawn(s.x, s.z, this.player.team === 'A' ? -Math.PI / 2 : Math.PI / 2);
    this.weapons.setLoadout(this.currentClass());
  }

  updateWaves(dt) {
    const alive = this.bots.filter((b) => b.alive).length;
    if (this.waveState === 'intermission') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.wave++;
        this.waveState = 'fight';
        this.waveTotal = 4 + this.wave * 2;
        this.waveSpawned = 0;
        this.waveKilled = 0;
        this.spawnT = 0;
        this.hud.message(`VAGUE ${this.wave}`, `${this.waveTotal} hostiles en approche`, 3);
        this.audio.announce('wave');
      }
    } else {
      this.spawnT -= dt;
      const maxAlive = Math.min(10, 3 + this.wave);
      if (this.waveSpawned < this.waveTotal && alive < maxAlive && this.spawnT <= 0) {
        this.spawnT = 1.2;
        this.spawnWaveBot();
      }
      if (this.waveKilled >= this.waveTotal) {
        this.waveState = 'intermission';
        this.waveTimer = 10;
        const bonus = 250 * this.wave;
        this.player.score += bonus;
        this.hud.message(`VAGUE ${this.wave} TERMINÉE`, `Bonus +${bonus} — Préparez-vous`, 4);
        this.hud.popup(`+${bonus} BONUS DE VAGUE`, 'head');
        this.weapons.addAmmo(2);
        this.weapons.grenades = Math.max(this.weapons.grenades, 2);
        this.audio.announce('win');
        // nettoyage des cadavres
        this.bots = this.bots.filter((b) => { if (!b.alive && b.removed) { b.dispose(); return false; } return true; });
      }
    }
    const left = this.waveState === 'fight' ? this.waveTotal - this.waveKilled : 0;
    this.hud.setTop(`${this.player.score}`, `VAGUE ${this.wave}`, this.waveState === 'fight' ? `${left} restants` : `Prochaine vague ${Math.ceil(this.waveTimer)} s`);
  }

  spawnWaveBot() {
    const p = this.player;
    // point d'apparition loin du joueur et hors de sa vue si possible
    const cands = [...SPAWNS.B, ...SPAWNS.ffa]
      .map(([x, z]) => ({ x, z, d: Math.hypot(x - p.pos.x, z - p.pos.z) }))
      .filter((s) => s.d > 30);
    const eye = p.eyePos(new THREE.Vector3());
    const hidden = cands.filter((s) => !this.world.clear(eye, { x: s.x, y: 1.5, z: s.z }));
    const pool = hidden.length ? hidden : cands.length ? cands : [{ x: 60, z: 0 }];
    const s = pool[Math.floor(Math.random() * pool.length)];
    const n = this.nav.nearestWorld(s.x + (Math.random() - 0.5) * 3, s.z + (Math.random() - 0.5) * 3) || s;
    let bot = this.bots.find((b) => !b.alive && b.removed);
    const hp = 100 + (this.wave - 1) * 12;
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    if (!bot) {
      bot = new Bot(this, 'B', name, { hp, hunter: true, accBonus: Math.min(0.15, this.wave * 0.015) });
      this.bots.push(bot);
    } else {
      bot.name = name; bot.maxHp = hp; bot.accBonus = Math.min(0.15, this.wave * 0.015);
    }
    bot.spawn(n.x, n.z, Math.atan2(-(p.pos.x - n.x), -(p.pos.z - n.z)));
    this.waveSpawned++;
  }

  updateTDM(dt) {
    this.timeLimit -= dt;
    for (const b of this.bots) {
      if (!b.alive && b.deathT > 4) {
        const s = this.pickSpawn(SPAWNS[b.team], b.team);
        b.spawn(s.x + (Math.random() - 0.5) * 2, s.z + (Math.random() - 0.5) * 2, b.team === 'A' ? -Math.PI / 2 : Math.PI / 2);
      }
    }
    if (!this.player.alive && this.respawnAt != null && this.time > this.respawnAt + 4) this.respawnPlayer();
    const m = Math.max(0, Math.floor(this.timeLimit / 60)), s = Math.max(0, Math.floor(this.timeLimit % 60));
    this.hud.setTop(`${this.teamScore.A}`, `${m}:${String(s).padStart(2, '0')}  —  ${this.scoreLimit}`, `${this.teamScore.B}`);
    if (this.timeLimit <= 0) this.endMatch(this.teamScore.A > this.teamScore.B, this.teamScore.A === this.teamScore.B);
  }

  endMatch(win, draw = false) {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.input.unlock();
    this.hud.show(false);
    const p = this.player;
    const acc = p.shotsFired ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
    let title, sub;
    if (this.mode === 'waves') { title = 'MISSION TERMINÉE'; sub = `Vous avez tenu jusqu'à la vague ${this.wave}`; }
    else if (draw) { title = 'ÉGALITÉ'; sub = `${this.teamScore.A} - ${this.teamScore.B}`; }
    else if (this.mode === 'tdm') { title = win ? 'VICTOIRE' : 'DÉFAITE'; sub = `${this.teamScore.A} - ${this.teamScore.B}`; }
    else { title = win ? 'VICTOIRE' : 'FIN DU MATCH'; sub = win ? 'Vous remportez la partie' : ''; }
    this.audio.announce(win ? 'win' : 'lose');
    const result = { title, sub, win, stats: { score: p.score, kills: p.kills, deaths: p.deaths, headshots: p.headshots, acc, wave: this.wave } };
    if (this.mode !== 'mp' && this.account) {
      this.account.recordMatch({ kills: p.kills, deaths: p.deaths, headshots: p.headshots, shots: p.shotsFired, hits: p.shotsHit, win: !!win, wave: this.mode === 'waves' ? this.wave : 0, score: p.score })
        .then((xp) => this.onEnd?.({ ...result, xp }))
        .catch(() => this.onEnd?.(result));
    } else this.onEnd?.(result);
  }

  /** Classe actuellement équipée (profil du compte ou invité). */
  currentClass() {
    const list = this.account?.classes;
    if (!list?.length) return { primary: 'ar', att: { optic: 'reddot' }, skin: 'black', operator: 'ranger' };
    return list[Math.min(list.length - 1, this.settings.classIdx || 0)];
  }

  pause() {
    if (this.state !== 'playing') return;
    if (this.mode === 'mp') { this.onPause?.(); return; }
    this.state = 'paused';
    this.onPause?.();
  }

  resume() {
    if (this.state === 'paused') this.state = 'playing';
    this.input.lock();
  }

  quitToMenu() {
    this.clearMatch();
    this.state = 'menu';
    this.mode = null;
    this.player.alive = false;
    this.hud.show(false);
    this.input.unlock();
  }

  // ---------------------------------------------------------------- boucle
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const p = this.player;

    if (this.state === 'playing' || (this.state === 'paused' && this.mode === 'mp')) {
      this.time += dt;
      this.pathBudget = 4;
      const inp = this.input;
      p.update(dt, inp);
      this.camera.updateMatrixWorld();
      this.weapons.update(dt, inp, p);
      for (const b of this.bots) b.update(dt);
      this.separate();
      this.updateGrenades(dt);
      this.updatePickups(dt);
      for (let i = this.scheduled.length - 1; i >= 0; i--) {
        if (this.time >= this.scheduled[i].t) { const s = this.scheduled[i]; this.scheduled.splice(i, 1); s.fn(); }
      }
      if (this.mode === 'waves') this.updateWaves(dt);
      else if (this.mode === 'tdm') this.updateTDM(dt);
      else if (this.mode === 'mp') this.net?.update(dt);
      this.hud.update(dt);
      this.audio.update(dt, p.hp / p.maxHp, p.alive);
      inp.endFrame();
    } else if (this.state === 'menu' || this.state === 'ended') {
      this.time += dt;
      const a = this.time * 0.05;
      this.camera.position.set(Math.cos(a) * 55, 22, Math.sin(a) * 55);
      this.camera.lookAt(0, 2, 0);
      this.weapons.root.visible = false;
      this.input.endFrame();
    } else {
      this.input.endFrame();
    }

    // FOV
    const base = this.settings.fov;
    const vfov = (2 * Math.atan(Math.tan((base * Math.PI) / 360) / (innerWidth / innerHeight)) * 180) / Math.PI;
    const inGame = this.state !== 'menu' && this.state !== 'ended';
    const zoom = inGame ? this.weapons.zoom() : 1;
    const sprint = inGame ? this.weapons.sprintT * 4 : 0;
    const target = (2 * Math.atan(Math.tan((vfov * Math.PI) / 360) / zoom) * 180) / Math.PI + sprint;
    const f = inGame ? target : 55;
    if (Math.abs(this.camera.fov - f) > 0.01) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }
    this.effects.setScale(this.renderer.getDrawingBufferSize(this._sz || (this._sz = new THREE.Vector2())).y, this.camera.fov);

    this.effects.update(dt);
    this.scenery.update(dt, this.camera.position);
    if (this.grain) this.grain.uniforms.uTime.value += dt;
    if (this.grade) this.grade.uniforms.uLow.value = inGame && p.alive ? Math.max(0, 1 - p.hp / p.maxHp - 0.3) * 1.4 : inGame ? 0.8 : 0;
    // ombres centrées sur la caméra
    const c = this.camera.position;
    const sx = Math.round(c.x / 4) * 4, sz = Math.round(c.z / 4) * 4;
    this.sun.target.position.set(Math.max(-30, Math.min(30, sx)), 0, Math.max(-30, Math.min(30, sz)));
    this.sun.position.copy(this.sun.target.position).add(this.sunOffset);
    const fwd = this.camera.getWorldDirection(this._fwd || (this._fwd = new THREE.Vector3()));
    this.audio.setListener(this.camera.position, fwd);
    // reflets du sol mouillé
    this.wet.uniforms.uTime.value += dt;
    this.camera.updateMatrixWorld();
    this.wet.render(this.renderer, this.scene, this.camera);
    // rayons de soleil : position écran du soleil
    if (this.godrays && this.sunDir) {
      const sp = this._sp || (this._sp = new THREE.Vector3());
      sp.copy(this.camera.position).addScaledVector(this.sunDir, 500).project(this.camera);
      const facing = fwd.dot(this.sunDir);
      const onScreen = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(sp.x), Math.abs(sp.y)), 0.9, 1.8);
      this.godrays.uniforms.uSun.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
      this.godrays.uniforms.uIntensity.value = facing > 0 && sp.z < 1 ? onScreen * THREE.MathUtils.smoothstep(facing, 0.1, 0.6) * 1.3 : 0;
    }
    this.composer.render(dt);
  }

  separate() {
    const list = this.combatants().filter((c) => c.alive && !c.isRemote);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz), min = 0.75;
        if (d < min && d > 1e-4 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
          const push = (min - d) / 2, nx = dx / d, nz = dz / d;
          if (!a.isPlayer) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
          if (!b.isPlayer) { b.pos.x += nx * push; b.pos.z += nz * push; }
          if (a.isPlayer || b.isPlayer) {
            const o = a.isPlayer ? b : a, s = a.isPlayer ? 1 : -1;
            o.pos.x += nx * push * s; o.pos.z += nz * push * s;
          }
        }
      }
  }
}
