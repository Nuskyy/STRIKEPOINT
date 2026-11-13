// Bâtiments réalistes assemblés à partir des kits modulaires Poly Haven (façades d'usine et d'immeuble).
// Chaque façade = panneaux de 3 × 3 m (+ fenêtres / portes insérées), corniches et couronnement,
// fusionnés par matériau pour limiter les appels de rendu.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

class FacadeKit {
  constructor(model, prefix) {
    model.updateMatrixWorld(true);
    this.parts = {};
    for (const c of model.children) {
      const name = c.name.replace(prefix, '');
      const box = new THREE.Box3().setFromObject(c);
      this.parts[name] = { obj: c, min: box.min.clone(), max: box.max.clone() };
    }
  }

  /** Indices disponibles pour un type de fenêtre (wall_window_<type>_NN). */
  variants(type) {
    const re = new RegExp(`^wall_window_${type}_(\\d+)$`);
    return Object.keys(this.parts).map((n) => n.match(re)).filter(Boolean).map((m) => m[1]).sort((a, b) => +a - +b);
  }

  /** Place `name` en reprenant le décalage de la pièce d'ancrage `anchor` (coin bas-gauche-avant en x, y, 0). */
  add(group, name, anchor, x, y) {
    const p = this.parts[name], a = this.parts[anchor];
    if (!p || !a) return;
    const o = p.obj.clone(true);
    o.position.x += x - a.min.x;
    o.position.y += y - a.min.y;
    o.position.z += -a.max.z;
    group.add(o);
  }
}

/** Fusionne tous les maillages d'un groupe par matériau. */
export function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const k = o.material.uuid;
    if (!buckets.has(k)) buckets.set(k, { mat: o.material, geos: [] });
    buckets.get(k).geos.push(g);
  });
  const out = new THREE.Group();
  for (const { mat, geos } of buckets.values()) {
    const names = geos.map((g) => new Set(Object.keys(g.attributes)));
    const common = [...names[0]].filter((n) => names.every((s) => s.has(n)));
    const anyNonIndexed = geos.some((g) => !g.index);
    const clean = geos.map((g) => {
      for (const n of Object.keys(g.attributes)) if (!common.includes(n)) g.deleteAttribute(n);
      for (const n of Object.keys(g.morphAttributes)) delete g.morphAttributes[n];
      return anyNonIndexed && g.index ? g.toNonIndexed() : g;
    });
    const merged = mergeGeometries(clean, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true; m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

const rnd = (r, a, b) => a + r() * (b - a);

export class BuildingFactory {
  constructor(assets) {
    const f = assets.models.modular_factory_facade, a = assets.models.modular_urban_apartments_facade;
    this.kits = {
      factory: f ? new FacadeKit(f, 'modular_factory_facade_') : null,
      apartments: a ? new FacadeKit(a, 'modular_urban_apartments_facade_') : null,
    };
    this.massMats = {
      factory: new THREE.MeshStandardMaterial({ color: 0x5b4a40, roughness: 0.95 }),
      apartments: new THREE.MeshStandardMaterial({ color: 0x8c8478, roughness: 0.95 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 }),
    };
  }

  /** Façade (avant = +z, coin bas-gauche en 0,0,0) + volume du bâtiment derrière. */
  build(kind, cols, floors, r) {
    const K = this.kits[kind];
    if (!K) return null;
    const g = new THREE.Group();
    const types = kind === 'factory'
      ? ['tall_large', 'tall_small', 'centered_large', 'centered_medium', 'centered_double']
      : ['centered_large', 'centered_small', 'centered_double', 'offset_small'];
    const type = types[Math.floor(r() * types.length)];
    const vars = K.variants(type);
    const doorCol = Math.floor(cols / 2);
    const garage = kind === 'factory' && cols >= 6 && r() < 0.6;
    for (let f = 0; f < floors; f++) {
      const y = f * 3;
      for (let c = 0; c < cols; c++) {
        const x = c * 3;
        if (f === 0) {
          if (garage && c === doorCol - 1) {
            K.add(g, 'wall_door_garage_door_01', 'wall_door_garage_door_01', x, y);
            K.add(g, 'door_garage_door_01', 'wall_door_garage_door_01', x, y);
            c++;
            continue;
          }
          if (c === doorCol) {
            K.add(g, 'wall_door_centered_large_01', 'wall_door_centered_large_01', x, y);
            K.add(g, 'door_centered_large_01', 'wall_door_centered_large_01', x, y);
            continue;
          }
          if (kind === 'apartments' && r() < 0.5) { K.add(g, 'wall_standard_standard_01', 'wall_standard_standard_01', x, y); continue; }
        }
        const v = vars.length ? vars[Math.min(Math.max(0, f - 1), vars.length - 1)] : null;
        if (!v) { K.add(g, 'wall_standard_standard_01', 'wall_standard_standard_01', x, y); continue; }
        const wall = `wall_window_${type}_${v}`;
        K.add(g, wall, wall, x, y);
        K.add(g, `window_${type}_${v}`, wall, x, y);
      }
      if (f > 0) {
        const band = kind === 'factory' ? 'cornice03_standard_standard_01' : 'cornice_standard_standard_01';
        for (let c = 0; c < cols; c++) K.add(g, band, band, c * 3, y - 0.06);
      }
    }
    const crown = 'crown_standard_standard_01';
    for (let c = 0; c < cols; c++) K.add(g, crown, crown, c * 3, floors * 3);
    const merged = mergeByMaterial(g);
    // volume du bâtiment derrière la façade
    const W = cols * 3, H = floors * 3, D = 10 + r() * 6;
    const mass = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), this.massMats[kind]);
    mass.position.set(W / 2, H / 2, -D / 2 - 0.25);
    mass.castShadow = true; mass.receiveShadow = true;
    merged.add(mass);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.4, D + 0.4), this.massMats.roof);
    roof.position.set(W / 2, H + 0.6, -D / 2 - 0.25);
    merged.add(roof);
    merged.userData = { W, H, D };
    return merged;
  }

  /** Ceinture de bâtiments à l'extérieur de l'enceinte (half = demi-côté de la zone). */
  skyline(scene, half, seed = 7) {
    let s = seed;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const root = new THREE.Group();
    const front = half + 3;
    const sides = [
      { rot: 0, place: (u, W) => [u, -front] },               // nord (face +z)
      { rot: Math.PI, place: (u, W) => [u + W, front] },      // sud (face -z)
      { rot: Math.PI / 2, place: (u, W) => [-front, u + W] }, // ouest (face +x)
      { rot: -Math.PI / 2, place: (u, W) => [front, u] },     // est (face -x)
    ];
    for (const side of sides) {
      let u = -half - 4;
      while (u < half) {
        const kind = r() < 0.55 ? 'factory' : 'apartments';
        const cols = 5 + Math.floor(r() * 5);
        const floors = kind === 'factory' ? 3 + Math.floor(r() * 4) : 3 + Math.floor(r() * 3);
        const W = cols * 3;
        if (u + W > half + 4) break;
        const b = this.build(kind, cols, floors, r);
        if (!b) break;
        const [x, z] = side.place(u, W);
        b.position.set(x, 0, z);
        b.rotation.y = side.rot;
        root.add(b);
        u += W + 3 + r() * 6;
      }
    }
    scene.add(root);
    return root;
  }
}
