// 3D-персонажи. Модель со скелетом и анимациями (Xbot, Mixamo) встроена прямо в сборку игры —
// игра остаётся одним файлом и работает без интернета.
// Из одной модели делаются три разных существа: Монстр, Наблюдатель и Копия (свои материалы и пропорции).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import XBOT from '../../assets/xbot.glb';

let base = null;

export async function loadModels() {
  if (base) return base;
  const loader = new GLTFLoader();
  const buf = XBOT.buffer.slice(XBOT.byteOffset, XBOT.byteOffset + XBOT.byteLength);
  const gltf = await new Promise((resolve, reject) => loader.parse(buf, '', resolve, reject));
  base = { scene: gltf.scene, clips: gltf.animations };
  return base;
}

// Новый экземпляр персонажа со своим материалом и миксером анимаций.
export function makeCreature(kind) {
  const root = cloneSkinned(base.scene);
  let mat;
  if (kind === 'monster') {
    mat = new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 0.55, metalness: 0.1, emissive: 0x120404, emissiveIntensity: 0.4 });
  } else if (kind === 'drowned') {
    // утопленник: бледная раздутая мокрая кожа
    mat = new THREE.MeshStandardMaterial({ color: 0x10130f, roughness: 0.68, metalness: 0 });
  } else if (kind === 'observer') {
    mat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, metalness: 0, transparent: true });
  } else {
    mat = new THREE.MeshStandardMaterial({ color: 0xcfe3ea, emissive: 0x7aa2ae, emissiveIntensity: 0.5, roughness: 0.6, transparent: true, opacity: 0.35, depthWrite: false });
  }
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.material = mat;
      o.castShadow = kind !== 'copy';
      o.frustumCulled = false;
    }
  });
  const holder = new THREE.Group();
  holder.add(root);
  if (kind === 'monster') root.scale.set(1.05, 1.3, 1.05); // вытянутый, неестественно высокий
  if (kind === 'observer') root.scale.set(0.95, 1.28, 0.95);
  if (kind === 'drowned') root.scale.set(1.25, 1.05, 1.3); // раздутый
  // глаза: два тусклых огонька на кости головы
  let head = null;
  root.traverse((o) => {
    if (o.isBone && /Head$/i.test(o.name) && !head) head = o;
  });
  if (head && kind !== 'copy') {
    const eyeMat = new THREE.MeshBasicMaterial({ color: kind === 'monster' ? 0xffe6c8 : kind === 'drowned' ? 0xe8f4e0 : 0x9aa0a0 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(kind === 'monster' ? 1.6 : 1.1, 8, 6), eyeMat);
      eye.position.set(s * 3.4, 9, 9.5); // кость головы Xbot в сантиметрах
      head.add(eye);
    }
  }
  // утопленник: мокрые чёрные волосы свисают на лицо
  if (head && kind === 'drowned') {
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x040504, roughness: 0.75, metalness: 0 });
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const len = (Math.cos(a) > 0.3 ? 34 : 24) + Math.random() * 20;
      const strand = new THREE.Mesh(new THREE.BoxGeometry(0.8, len, 0.6), hairMat);
      const front = Math.cos(a) > 0;
      strand.position.set(Math.sin(a) * 7.5, 16 - len / 2, Math.cos(a) * 7.5 + (front ? 3 : 0));
      strand.rotation.set(front ? -0.12 : 0.15, 0, Math.sin(a) * 0.2);
      head.add(strand);
    }
  }
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of base.clips) actions[clip.name] = mixer.clipAction(clip);
  return { holder, root, mixer, actions, head, mat };
}
