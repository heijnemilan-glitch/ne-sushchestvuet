// Атмосфера: отражения окружения (вода и металл блестят), объёмные лучи света в тумане,
// стелющийся над водой туман и блики от воды на стенах (каустика).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Тусклая карта окружения: даёт воде, мокрому бетону и металлу настоящие блики.
let envTex = null;
export function setupEnvironment(renderer, scene, quality) {
  if (quality === 'low') {
    scene.environment = null;
    return;
  }
  if (!envTex) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  scene.environment = envTex;
  scene.environmentIntensity = 0.1;
}

// ── объёмный луч света (конус, светится в тумане, гаснет к низу) ────────────
const CONE_VS = /* glsl */ `
  varying float vY;
  varying vec3 vN;
  varying vec3 vV;
  #include <fog_pars_vertex>
  void main() {
    vY = uv.y;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const CONE_FS = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  uniform float time;
  varying float vY;
  varying vec3 vN;
  varying vec3 vV;
  #include <fog_pars_fragment>
  void main() {
    float edge = pow(abs(dot(vN, vV)), 2.0);
    float shimmer = 0.85 + 0.15 * sin(time * 1.7 + vY * 9.0);
    float a = pow(vY, 1.8) * edge * strength * shimmer;
    gl_FragColor = vec4(color * a, a);
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      gl_FragColor.rgb *= 1.0 - fogFactor * 0.6;
    #endif
  }`;

export function coneMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { color: { value: new THREE.Color(color) }, strength: { value: strength }, time: { value: 0 } }]),
    vertexShader: CONE_VS,
    fragmentShader: CONE_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
}

// Конус от точки pos вдоль направления dir длиной len.
export function makeCone(pos, dir, len, r0, r1, color, strength) {
  const geo = new THREE.CylinderGeometry(r0, r1, len, 28, 1, true);
  geo.translate(0, -len / 2, 0);
  const mesh = new THREE.Mesh(geo, coneMaterial(color, strength));
  mesh.position.copy(pos);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  mesh.renderOrder = 5;
  mesh.frustumCulled = true;
  return mesh;
}

// ── туман над водой: бесшовная текстура клочьев ────────────────────────────
let mistTex = null;
export function mistTexture() {
  if (mistTex) return mistTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 18 + rnd() * 60;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.12 + rnd() * 0.12})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
    }
  }
  mistTex = new THREE.CanvasTexture(c);
  mistTex.wrapS = mistTex.wrapT = THREE.RepeatWrapping;
  return mistTex;
}

export function mistLayer(x0, z0, x1, z1, y, opacity, repeat, color = 0xa8c2ba) {
  const tex = mistTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(repeat, repeat * ((z1 - z0) / (x1 - x0)));
  const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.renderOrder = 4;
  return m;
}

// ── блики от воды на стенах (каустика) ──────────────────────────────────────
let causticTex = null;
export function causticTexture() {
  if (causticTex) return causticTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  // сетка «ячеек»: яркие изогнутые линии на стыках, как свет сквозь рябь
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let i = 0; i < 26; i++) pts.push([rnd() * S, rnd() * S]);
  const img = g.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let d1 = 1e9;
      let d2 = 1e9;
      for (const [px, py] of pts) {
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const d = (x - px - ox) ** 2 + (y - py - oy) ** 2;
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1);
      const v = Math.max(0, 1 - e / 7) ** 2 * 255;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  causticTex = new THREE.CanvasTexture(c);
  causticTex.wrapS = causticTex.wrapT = THREE.RepeatWrapping;
  return causticTex;
}

export function causticStrip(x, z, len, axis, y0, h, color = 0x3aa890, opacity = 0.32) {
  const tex = causticTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(len / 3, h / 3);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, alphaMap: fadeTex() });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
  m.position.set(x, y0 + h / 2, z);
  if (axis === 'z') m.rotation.y = Math.PI / 2;
  m.renderOrder = 3;
  return m;
}

// вертикальное затухание (ярче у воды, гаснет вверх)
let fade = null;
function fadeTex() {
  if (fade) return fade;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#000');
  gr.addColorStop(0.6, '#555');
  gr.addColorStop(1, '#fff');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  fade = new THREE.CanvasTexture(c);
  return fade;
}
