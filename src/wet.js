// Surfaces mouillées : reflet planaire du décor (le sol est plat en y = 0) injecté dans les matériaux
// du sol, flaques procédurales, ondulations de pluie, assombrissement et rugosité réduite.
import * as THREE from 'three';

const NOISE = /* glsl */`
float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1,0)), u.x), mix(wHash(i + vec2(0,1)), wHash(i + vec2(1,1)), u.x), u.y);
}
// anneaux d'impact de gouttes (cellules aléatoires)
vec2 wRipple(vec2 p, float t){
  vec2 cell = floor(p), f = fract(p);
  vec2 acc = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(i, j);
    float h = wHash(c);
    vec2 center = vec2(i, j) + vec2(wHash(c + 3.1), wHash(c + 7.7));
    float ph = fract(t * 0.9 + h);
    vec2 d = f - center;
    float r = length(d);
    float ring = sin((r - ph * 0.9) * 40.0) * smoothstep(0.0, 0.08, ph * 0.9 - r + 0.08) * (1.0 - ph) * smoothstep(0.9, 0.0, r);
    acc += normalize(d + 1e-4) * ring;
  }
  return acc;
}`;

export class WetSurfaces {
  constructor() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.rt.texture.generateMipmaps = true;
    this.rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.mirror = new THREE.PerspectiveCamera();
    this.texMatrix = new THREE.Matrix4();
    this.uniforms = {
      tReflect: { value: this.rt.texture },
      uReflMat: { value: this.texMatrix },
      uWet: { value: 0.75 },
      uTime: { value: 0 },
      uReflOn: { value: 1 },
    };
    this.hide = [];
    this.scale = 0.5;
    this.enabled = true;
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._la = new THREE.Vector3();
    this._r = new THREE.Matrix4(); this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._q = new THREE.Vector4();
  }

  /** strength : 1 = route (flaques fréquentes), 0.6 = terre, etc. */
  apply(mat, strength = 1) {
    const U = this.uniforms;
    const str = { value: strength };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uWetStr: str });
      sh.vertexShader = 'uniform mat4 uReflMat;\nvarying vec4 vReflUv;\nvarying vec3 vWetWorld;\n' + sh.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vec4 wetWp = modelMatrix * vec4(transformed, 1.0);
         vWetWorld = wetWp.xyz;
         vReflUv = uReflMat * wetWp;`);
      sh.fragmentShader = `uniform sampler2D tReflect; uniform float uWet; uniform float uTime; uniform float uWetStr; uniform float uReflOn;
varying vec4 vReflUv; varying vec3 vWetWorld;
${NOISE}
` + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          float wn = wNoise(vWetWorld.xz * 0.16) * 0.6 + wNoise(vWetWorld.xz * 0.55 + 7.0) * 0.3 + wNoise(vWetWorld.xz * 2.1) * 0.1;
          float wetK = uWet * uWetStr;
          float pThr = 0.715 - 0.13 * uWetStr;
          float puddle = smoothstep(pThr, pThr + 0.035, wn) * wetK * (1.0 - smoothstep(0.15, 0.6, vWetWorld.y));
          diffuseColor.rgb *= mix(1.0, 0.6, wetK * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35, puddle);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, wetK);
          roughnessFactor = mix(roughnessFactor, 0.02, puddle);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec3 wetUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          vec2 rip = (wNoise(vWetWorld.xz * 6.0 + uTime * 0.15) - 0.5) * vec2(0.25, 0.18); // légère brise, pas de gouttes
          vec3 ripN = normalize(vec3(rip.x * 0.25, 1.0, rip.y * 0.25));
          vec3 ripV = normalize((viewMatrix * vec4(ripN, 0.0)).xyz);
          normal = normalize(mix(normal, ripV, puddle));`)
        .replace('#include <opaque_fragment>', `
          {
            vec4 ruv = vReflUv;
            ruv.xy += rip * 0.012 * ruv.w * puddle;
            ruv.xy += (normal.xy - wetUp.xy) * 0.04 * ruv.w * (1.0 - puddle);
            float lod = mix(5.0, 0.0, puddle) + roughnessFactor * 2.0;
            vec3 refl = textureProj(tReflect, ruv, lod).rgb;
            float NdV = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
            float fres = 0.03 + 0.97 * pow(1.0 - NdV, 5.0);
            float k = uReflOn * clamp(puddle * mix(0.5, 0.92, fres) + wetK * (1.0 - puddle) * fres * 0.55, 0.0, 1.0);
            outgoingLight = mix(outgoingLight, refl * 0.85, k);
          }
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'wet';
    mat.needsUpdate = true;
  }

  setSize(w, h) {
    const s = this.scale;
    this.rt.setSize(Math.max(4, Math.floor(w * s)), Math.max(4, Math.floor(h * s)));
  }

  /** Rend la scène vue depuis la caméra miroir (plan y = 0). */
  render(renderer, scene, camera) {
    this.uniforms.uReflOn.value = this.enabled ? 1 : 0;
    if (!this.enabled) return;
    const normal = this._t.set(0, 1, 0);
    camera.updateMatrixWorld();
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y <= 0.01) return;
    const view = this._v.set(0, 0, 0).sub(camPos);
    view.reflect(normal).negate();
    this._r.extractRotation(camera.matrixWorld);
    const look = this._la.set(0, 0, -1).applyMatrix4(this._r).add(camPos);
    const target = new THREE.Vector3(0, 0, 0).sub(look).reflect(normal).negate();
    const m = this.mirror;
    m.position.copy(view);
    m.up.set(0, 1, 0).applyMatrix4(this._r).reflect(normal);
    m.lookAt(target);
    m.far = camera.far; m.near = camera.near;
    m.updateMatrixWorld();
    m.projectionMatrix.copy(camera.projectionMatrix);
    this.texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMatrix.multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);
    // plan de coupe oblique (ne rien rendre sous le sol)
    this._plane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, 0.02, 0)).applyMatrix4(m.matrixWorldInverse);
    const cp = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = m.projectionMatrix.elements, q = this._q;
    q.x = (Math.sign(cp.x) + pm[8]) / pm[0];
    q.y = (Math.sign(cp.y) + pm[9]) / pm[5];
    q.z = -1;
    q.w = (1 + pm[10]) / pm[14];
    cp.multiplyScalar(2 / cp.dot(q));
    pm[2] = cp.x; pm[6] = cp.y; pm[10] = cp.z + 1; pm[14] = cp.w;

    const vis = this.hide.map((o) => o.visible);
    for (const o of this.hide) o.visible = false;
    const prevRT = renderer.getRenderTarget();
    const sm = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, m);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = sm;
    this.hide.forEach((o, i) => { o.visible = vis[i]; });
  }
}

/** Rayons de soleil (diffusion radiale des zones très lumineuses autour du soleil). */
export const GodRaysShader = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uIntensity: { value: 0 }, uThreshold: { value: 3 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uIntensity; uniform float uThreshold; varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uIntensity <= 0.001) { gl_FragColor = base; return; }
      const int N = 56;
      vec2 delta = (vUv - uSun) / float(N) * 0.92;
      vec2 uv = vUv; float decay = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < N; i++) {
        uv -= delta;
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
        acc += min(s * smoothstep(uThreshold, uThreshold * 2.5, l), vec3(8.0)) * decay;
        decay *= 0.962;
      }
      acc /= float(N);
      gl_FragColor = vec4(base.rgb + acc * uIntensity * vec3(1.0, 0.82, 0.6), base.a);
    }`,
};
