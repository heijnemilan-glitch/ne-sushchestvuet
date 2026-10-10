// Кинематографичная постобработка хоррора:
// свечение ламп (bloom) → «плёнка»: зерно, виньетка, хроматическая аберрация, цветокоррекция,
// и «страх» — чем ближе монстр, тем сильнее искажения, пульс и красный край кадра.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    fear: { value: 0 },
    hit: { value: 0 },
    distort: { value: 0 },
    aspect: { value: 1.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, fear, hit, distort, aspect;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      // лёгкая «бочка» объектива + дрожь при страхе
      float r2 = dot(c, c);
      uv = 0.5 + c * (1.0 + 0.06 * r2 + 0.04 * fear * r2);
      float jit = (fear * 0.0025 + distort * 0.01) * sin(time * 47.0 + uv.y * 80.0);
      uv.x += jit * step(0.92 - distort * 0.3, rand(vec2(floor(uv.y * 40.0), floor(time * 18.0))));
      // хроматическая аберрация к краям
      float ca = 0.0012 + 0.004 * r2 + 0.004 * fear + 0.012 * distort + 0.01 * hit;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // цветокоррекция: холодные тени, чуть зелени, приглушённая насыщенность
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 0.72 - fear * 0.25);
      col *= vec3(0.96, 1.0, 1.02);
      col += vec3(-0.004, 0.003, 0.006) * (1.0 - l);
      // виньетка, сужается от страха; красная пульсация по краям
      float vig = 1.0 - smoothstep(0.22 - fear * 0.08, 0.85, length(c * vec2(aspect / 1.6, 1.0)) * 1.15);
      col *= mix(0.25, 1.0, vig);
      float pulse = pow(0.5 + 0.5 * sin(time * (6.0 + fear * 6.0)), 3.0);
      col += vec3(0.16, 0.0, 0.0) * (1.0 - vig) * fear * fear * (0.35 + pulse * 0.65);
      col = mix(col, vec3(0.6, 0.02, 0.02), hit * 0.55);
      // плёночное зерно и редкая полоса развёртки
      float g = rand(uv * vec2(1920.0, 1080.0) + fract(time * 13.7)) - 0.5;
      col += g * (0.035 + fear * 0.035);
      col *= 1.0 - 0.025 * step(0.995, rand(vec2(floor(uv.y * 300.0), floor(time * 24.0))));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.enabled = quality !== 'low';
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), quality === 'high' ? 0.75 : 0.6, 0.55, 0.72);
    this.composer.addPass(this.bloom);
    this.horror = new ShaderPass(HorrorShader);
    this.composer.addPass(this.horror);
    this.composer.addPass(new OutputPass());
    this.fear = 0;
    this.hit = 0;
    this.distort = 0;
  }

  setScene(scene, camera) {
    this.render.scene = scene;
    this.render.camera = camera;
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.horror.uniforms.aspect.value = w / h;
  }

  draw(time) {
    const u = this.horror.uniforms;
    u.time.value = time;
    u.fear.value = this.fear;
    u.hit.value = this.hit;
    u.distort.value = this.distort;
    this.composer.render();
  }
}
