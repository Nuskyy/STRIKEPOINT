// Chargement des assets Poly Haven (textures PBR, HDRI, modèles glTF) avec progression.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export const WEAPON_IDS = ['AK47', 'MP5', 'M700', '1911', 'M14'];

export const TEX_IDS = ['container_side', 'rusty_corrugated_iron', 'worn_asphalt', 'dirt', 'concrete_wall_008', 'red_brick_03', 'plastered_wall_02', 'rusty_metal_02', 'concrete_floor_worn_001'];
export const MODEL_IDS = ['bolt_action_rifle_7_62', 'service_pistol', 'overhead_crane', 'flood_lights', 'street_lamp_01', 'utility_box_01',
  'portable_generator', 'concrete_road_barrier', 'Barrel_01', 'wooden_crate_01', 'old_military_crate', 'old_tyre', 'covered_car',
  'fire_hydrant', 'metal_jerrycan', 'cardboard_box_01', 'trashbag', 'ammo_box',
  'shrub_01', 'shrub_02', 'shrub_04', 'grass_medium_01', 'grass_bermuda_01', 'boulder_01', 'rock_07', 'dead_tree_trunk', 'tree_stump_01',
  'modular_factory_facade', 'modular_urban_apartments_facade', 'modular_chainlink_fence', 'modular_industrial_pipes_01',
  'modular_airduct_rectangular_01', 'exterior_aircon_unit', 'security_light', 'rollershutter_door', 'power_box_01', 'modular_fire_escape',
  'metal_trash_can', 'plastic_crate_01', 'industrial_pastic_container', 'propane_tank', 'concrete_road_barrier_02', 'cement_bag',
  'wooden_military_crate', 'modular_electricity_poles', 'street_lamp_02', 'water_manhole_cover'];
export const HDRI_ID = 'industrial_sunset_02_puresky';

const BASE = 'assets/';

/**
 * Convertit un modèle à squelette (export Unreal) en maillages statiques dans la pose de repos,
 * exprimés en mètres (le FBX est en centimètres). Seul le LOD le plus détaillé est conservé.
 */
function bakeStatic(root, mat) {
  root.updateMatrixWorld(true);
  const out = new THREE.Group();
  const v = new THREE.Vector3();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const g = o.geometry.clone();
    if (o.isSkinnedMesh) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); o.applyBoneTransform(i, v); pos.setXYZ(i, v.x, v.y, v.z); }
      g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
    }
    g.applyMatrix4(o.matrixWorld);
    g.scale(0.01, 0.01, 0.01);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv1 && g.attributes.uv) g.setAttribute('uv1', g.attributes.uv);
    const m = new THREE.Mesh(g, mat);
    m.name = o.name;
    m.castShadow = true;
    m.frustumCulled = false;
    out.add(m);
  }
  return out;
}

export class Assets {
  constructor() {
    this.textures = {};
    this.models = {};
    this.sizes = {};
    this.weapons = {};
    this.hdri = null;
    this.ok = false;
  }

  /** onProgress(fraction, label) */
  async load(renderer, onProgress = () => {}) {
    const manager = new THREE.LoadingManager();
    let done = 0;
    const total = TEX_IDS.length * 3 + MODEL_IDS.length + WEAPON_IDS.length + 2;
    const step = (label) => { done++; onProgress(done / total, label); };
    const tl = new THREE.TextureLoader(manager);
    const gl = new GLTFLoader(manager);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const loadTex = (url, srgb) => new Promise((res) => {
      tl.load(url, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = aniso;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        res(t);
      }, undefined, () => res(null));
    });

    const jobs = [];
    for (const id of TEX_IDS) {
      const set = (this.textures[id] = {});
      for (const [k, file, srgb] of [['map', 'diff', true], ['normal', 'nor', false], ['arm', 'arm', false]]) {
        jobs.push(loadTex(`${BASE}textures/${id}/${file}.jpg`, srgb).then((t) => { set[k] = t; step(id); }));
      }
    }
    for (const id of MODEL_IDS) {
      jobs.push(new Promise((res) => {
        gl.load(`${BASE}models/${id}/${id}.gltf`, (g) => {
          const root = g.scene;
          root.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true; o.receiveShadow = true;
              const ms = Array.isArray(o.material) ? o.material : [o.material];
              for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (m[k]) m[k].anisotropy = aniso;
            }
          });
          root.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(root);
          this.models[id] = root;
          this.sizes[id] = { min: box.min.clone(), max: box.max.clone(), size: box.getSize(new THREE.Vector3()) };
          step(id); res();
        }, undefined, (e) => { console.warn('modèle manquant', id, e); step(id); res(); });
      }));
    }
    // armes réelles (FBX + textures PBR)
    const fbx = new FBXLoader(manager);
    for (const id of WEAPON_IDS) {
      jobs.push((async () => {
        try {
          const obj = await fbx.loadAsync(`${BASE}weapons/${id}/${id}.fbx`);
          const [map, normal, arm] = await Promise.all([
            loadTex(`${BASE}weapons/${id}/color.jpg`, true), loadTex(`${BASE}weapons/${id}/normal.jpg`, false), loadTex(`${BASE}weapons/${id}/arm.jpg`, false),
          ]);
          const mat = new THREE.MeshStandardMaterial({ map, normalMap: normal, aoMap: arm, roughnessMap: arm, metalnessMap: arm, roughness: 1, metalness: 1 });
          const baked = bakeStatic(obj, mat);
          const box = new THREE.Box3().setFromObject(baked);
          this.weapons[id] = { scene: baked, min: box.min.clone(), max: box.max.clone(), size: box.getSize(new THREE.Vector3()) };
        } catch (e) { console.warn('arme manquante', id, e); }
        step(id);
      })());
    }
    jobs.push(new Promise((res) => {
      gl.load(`${BASE}characters/Soldier.glb`, (g) => {
        g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        this.character = { scene: g.scene, animations: g.animations };
        step('soldat'); res();
      }, undefined, () => { step('soldat'); res(); });
    }));
    jobs.push(new Promise((res) => {
      new RGBELoader(manager).load(`${BASE}hdri/${HDRI_ID}.hdr`, (t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        this.hdri = t;
        step('ciel'); res();
      }, undefined, () => { step('ciel'); res(); });
    }));
    await Promise.all(jobs);
    this.ok = !!this.hdri && Object.keys(this.models).length > 0;
    return this;
  }

  /** Copie d'un modèle (géométries/matériaux partagés). */
  clone(id) {
    const m = this.models[id];
    return m ? m.clone(true) : null;
  }

  /** Matériau PBR complet pour une texture Poly Haven. */
  material(id, opts = {}) {
    const t = this.textures[id];
    if (!t || !t.map) return null;
    const m = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normal, aoMap: t.arm, roughnessMap: t.arm, metalnessMap: t.arm,
      roughness: opts.roughness ?? 1, metalness: opts.metalness ?? 1, color: opts.color ?? 0xffffff,
      aoMapIntensity: 1,
    });
    if (opts.normalScale) m.normalScale.set(opts.normalScale, opts.normalScale);
    return m;
  }

  /** Direction du soleil estimée à partir du pixel le plus lumineux de l'HDRI. */
  sunDirection() {
    const t = this.hdri;
    if (!t) return null;
    const { data, width, height } = t.image;
    const stride = data.length / (width * height);
    const toF = data instanceof Uint16Array ? THREE.DataUtils.fromHalfFloat : (v) => v;
    let best = -1, bi = 0;
    for (let i = 0; i < width * height; i += 3) {
      const l = toF(data[i * stride]) + toF(data[i * stride + 1]) + toF(data[i * stride + 2]);
      if (l > best) { best = l; bi = i; }
    }
    const x = bi % width, y = Math.floor(bi / width);
    const u = (x + 0.5) / width, v = 1 - (y + 0.5) / height;
    const phi = (u - 0.5) * Math.PI * 2, lat = (v - 0.5) * Math.PI;
    return new THREE.Vector3(Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat)).normalize();
  }
}
