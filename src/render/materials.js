// Процедурные текстуры (canvas) и материалы. Без внешних файлов — игра полностью автономна.
// Текстуры бесшовные; UV вычисляются в метрах (см. builder.js), поэтому масштаб везде одинаковый.

import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

function tileNoise(cells, rng) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    const xf = x * cells;
    const yf = y * cells;
    const x0 = Math.floor(xf);
    const y0 = Math.floor(yf);
    const tx = xf - x0;
    const ty = yf - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const ix0 = ((x0 % cells) + cells) % cells;
    const iy0 = ((y0 % cells) + cells) % cells;
    const ix1 = (ix0 + 1) % cells;
    const iy1 = (iy0 + 1) % cells;
    const a = g[iy0 * cells + ix0];
    const b = g[iy0 * cells + ix1];
    const c = g[iy1 * cells + ix0];
    const d = g[iy1 * cells + ix1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbmFactory(seed) {
  const rng = mulberry32(seed);
  const layers = [4, 8, 16, 32, 64].map((c) => tileNoise(c, rng));
  return (x, y, oct = 5) => {
    let v = 0;
    let amp = 0.5;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      v += layers[i](x, y) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return v / norm;
  };
}

function canvasOf(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Попиксельная заливка: fn(u, v) -> [r, g, b] в 0..255
function pixels(size, fn) {
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const mix = (a, b, t) => a + (b - a) * t;
const col = (base, k) => [base[0] * k, base[1] * k, base[2] * k];

function toTexture(canvas, aniso) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function toBump(canvas, aniso) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

export function buildMaterials(quality = 'medium', maxAniso = 4) {
  const S = quality === 'low' ? 256 : quality === 'high' || quality === 'ultra' ? 1024 : 512;
  const aniso = quality === 'low' ? 1 : Math.min(maxAniso, quality === 'high' ? 8 : 4);
  const n = fbmFactory(1337);
  const n2 = fbmFactory(4242);

  // ─ бетон: пятна, подтёки, мелкие поры
  const concrete = (base, dark) =>
    pixels(S, (u, v) => {
      const a = n(u, v);
      const b = n2(u * 1.0, v * 1.0, 3);
      const pores = 1 - Math.max(0, n2(u * 16 % 1, v * 16 % 1, 2) - 0.62) * 0.45;
      const streak = Math.pow(n(u * 0.25 + 0.3, v * 0.05, 3), 3) * 0.6;
      const k = (0.78 + a * 0.35 - streak * dark) * pores * (0.95 + b * 0.1);
      return col(base, k);
    });

  const concreteC = concrete([150, 147, 140], 0.6);
  const concreteDarkC = concrete([98, 98, 96], 0.8);

  // ─ плитка пола: швы, неровный тон каждой плитки
  const tilesC = (() => {
    const c = pixels(S, (u, v) => {
      const tx = Math.floor(u * 4);
      const ty = Math.floor(v * 4);
      const tone = 0.85 + (((tx * 7 + ty * 13) % 5) / 5) * 0.12;
      const k = tone * (0.85 + n(u, v) * 0.25);
      return col([128, 132, 130], k);
    });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(30,30,28,0.85)';
    ctx.lineWidth = Math.max(2, S / 160);
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * S;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, S);
      ctx.moveTo(0, p);
      ctx.lineTo(S, p);
      ctx.stroke();
    }
    return c;
  })();

  // ─ белая кафельная плитка лаборатории
  const whiteTileC = (() => {
    const c = pixels(S, (u, v) => {
      const k = 0.88 + n(u, v) * 0.14 - Math.pow(n2(u, v, 3), 4) * 0.35;
      return col([205, 210, 208], k);
    });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(80,88,86,0.7)';
    ctx.lineWidth = Math.max(1.5, S / 256);
    for (let i = 0; i <= 8; i++) {
      const p = (i / 8) * S;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, S);
      ctx.moveTo(0, p);
      ctx.lineTo(S, p);
      ctx.stroke();
    }
    return c;
  })();

  // ─ линолеум в комнате пробуждения: бледно-зелёный, с потёртостями
  const linoC = pixels(S, (u, v) => {
    const a = n(u, v);
    const wear = Math.pow(n2(u, v, 4), 2);
    const k = 0.8 + a * 0.25 + wear * 0.25;
    return col([104, 120, 108], k);
  });

  // ─ крашеная стена: верх светлый, нижняя панель темнее (классика госучреждений)
  const paintC = (() => {
    const c = pixels(S, (u, v) => {
      const a = n(u, v);
      const peel = 1 + Math.max(0, n2(u * 2 % 1, v * 2 % 1, 4) - 0.68) * 0.6;
      const lower = v > 0.6 ? 0.72 : 1;
      const tint = v > 0.6 ? [96, 116, 108] : [176, 180, 168];
      return col(tint, (0.85 + a * 0.2) * peel * lower + 0.0);
    });
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(40,44,40,0.8)';
    ctx.fillRect(0, S * 0.6 - S / 128, S, S / 64);
    return c;
  })();

  // ─ потолочные панели «Армстронг»
  const ceilingC = (() => {
    const c = pixels(S, (u, v) => {
      const dots = 1 - Math.max(0, n2(u * 4 % 1, v * 4 % 1, 5) - 0.6) * 0.5;
      const stain = 1 - Math.pow(n(u, v, 3), 4) * 0.35;
      return col([170, 170, 164], (0.9 + n(u, v) * 0.1) * dots * stain);
    });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(60,60,58,0.9)';
    ctx.lineWidth = Math.max(2, S / 128);
    for (let i = 0; i <= 2; i++) {
      const p = (i / 2) * S;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, S);
      ctx.moveTo(0, p);
      ctx.lineTo(S, p);
      ctx.stroke();
    }
    return c;
  })();

  // ─ дерево (столы, полки)
  const woodC = pixels(S, (u, v) => {
    const ring = Math.sin((v * 22 + n(u * 0.2, v, 3) * 6) * Math.PI) * 0.5 + 0.5;
    const k = 0.7 + ring * 0.18 + n2(u, v) * 0.15;
    return col([120, 86, 58], k);
  });

  // ─ металл: шлифовка + редкая ржавчина
  const metalC = pixels(S, (u, v) => {
    const brush = n2(u * 0.05, v, 5);
    const rust = Math.pow(n(u, v, 4), 5) * 2.2;
    const k = 0.75 + brush * 0.3;
    return [mix(118 * k, 120, rust), mix(124 * k, 70, rust), mix(128 * k, 40, rust)];
  });

  // ─ ковролин наблюдательной
  const carpetC = pixels(S, (u, v) => {
    const k = 0.75 + n2(u * 16 % 1, v * 16 % 1, 2) * 0.3 + n(u, v, 3) * 0.1;
    return col([62, 58, 72], k);
  });

  // ─ кирпич канализации: кладка, швы, сырость снизу
  const brickC = (() => {
    const c = pixels(S, (u, v) => {
      const row = Math.floor(v * 8);
      const off = row % 2 ? 0.125 : 0;
      const col = Math.floor((u + off) * 4);
      const tone = 0.75 + (((row * 7 + col * 13) % 6) / 6) * 0.25;
      const k = tone * (0.8 + n(u, v) * 0.3) * (0.75 + v * 0.3);
      return [92 * k, 70 * k, 58 * k];
    });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(25,22,18,0.9)';
    ctx.lineWidth = Math.max(2, S / 128);
    for (let r = 0; r <= 8; r++) {
      const y = (r / 8) * S;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(S, y);
      ctx.stroke();
      const off = r % 2 ? 0.125 : 0;
      for (let k = 0; k <= 4; k++) {
        const x = ((k / 4 - off + 1) % 1) * S;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + S / 8);
        ctx.stroke();
      }
    }
    return c;
  })();

  // ─ нормали ряби для воды (бесшовные)
  const waterN = (() => {
    const c = canvasOf(256);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(256, 256);
    const h = (u, v) => n(u * 2 % 1, v * 2 % 1, 4);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const u = x / 256;
        const v = y / 256;
        const dx = (h((u + 1 / 256) % 1, v) - h(u, v)) * 12;
        const dy = (h(u, (v + 1 / 256) % 1) - h(u, v)) * 12;
        const i = (y * 256 + x) * 4;
        img.data[i] = 128 + dx * 127;
        img.data[i + 1] = 128 + dy * 127;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 6);
    return t;
  })();

  // ─ стальные панели бункера: крашеный металл, швы, заклёпки, подтёки ржавчины
  const bunkerC = (() => {
    const c = pixels(S, (u, v) => {
      const a = n(u, v);
      const rust = Math.pow(n2(u, v * 0.3, 4), 4) * 1.6 * (0.4 + v);
      const chip = Math.max(0, n2(u * 4 % 1, v * 4 % 1, 3) - 0.7) * 1.4;
      const k = (0.82 + a * 0.22) * (v > 0.72 ? 0.78 : 1);
      return [mix(84 * k, 110, rust) + chip * 40, mix(98 * k, 62, rust) + chip * 40, mix(88 * k, 38, rust) + chip * 36];
    });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(20,24,20,0.85)';
    ctx.lineWidth = Math.max(2, S / 200);
    for (const p of [0, 0.5, 1]) {
      ctx.beginPath();
      ctx.moveTo(p * S, 0);
      ctx.lineTo(p * S, S);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, S * 0.72);
    ctx.lineTo(S, S * 0.72);
    ctx.stroke();
    for (const x of [0.02, 0.48, 0.52, 0.98]) {
      for (let i = 0; i < 8; i++) {
        const y = (i + 0.5) / 8;
        const gx = x * S;
        const gy = y * S;
        const gr = ctx.createRadialGradient(gx - S / 400, gy - S / 400, 0, gx, gy, S / 110);
        gr.addColorStop(0, 'rgba(190,200,190,0.8)');
        gr.addColorStop(1, 'rgba(30,34,30,0.9)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(gx, gy, S / 120, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // подтёки ржавчины от заклёпок
    for (let i = 0; i < 14; i++) {
      const x = (i * 0.137 + 0.05) % 1;
      const gr = ctx.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, 'rgba(110,52,24,0.0)');
      gr.addColorStop(0.2, 'rgba(110,52,24,0.35)');
      gr.addColorStop(1, 'rgba(110,52,24,0.0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x * S, S * ((i * 0.31) % 0.6), S / 90, S * 0.5);
    }
    return c;
  })();

  // ─ клёпаные листы резервуара: тёмная сталь, внизу — след воды и водоросли
  const tankC = (() => {
    const c = pixels(S, (u, v) => {
      const a = n(u, v);
      const algae = v > 0.55 ? Math.min(1, (v - 0.55) * 4) * (0.6 + n2(u, v, 3) * 0.6) : 0;
      const rust = Math.pow(n2(u, v, 4), 3) * 1.2;
      const k = 0.62 + a * 0.3;
      return [mix(mix(86 * k, 112, rust), 40, algae), mix(mix(90 * k, 60, rust), 58, algae), mix(mix(92 * k, 34, rust), 38, algae)];
    });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(14,16,16,0.9)';
    ctx.lineWidth = Math.max(2, S / 150);
    for (const p of [0, 0.5, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, p * S);
      ctx.lineTo(S, p * S);
      ctx.moveTo(p * S, 0);
      ctx.lineTo(p * S, S);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(150,150,140,0.55)';
    for (const y of [0.03, 0.47, 0.53, 0.97]) for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(((i + 0.5) / 12) * S, y * S, S / 150, 0, Math.PI * 2);
      ctx.fill();
    }
    // линия старого уровня воды
    ctx.fillStyle = 'rgba(30,40,24,0.55)';
    ctx.fillRect(0, S * 0.55, S, S / 60);
    return c;
  })();

  // ─ рифлёный стальной лист мостков
  const treadC = (() => {
    const c = pixels(S, (u, v) => {
      const k = 0.62 + n(u, v) * 0.25 + Math.pow(n2(u, v, 3), 4) * 0.4;
      return col([96, 98, 96], k);
    });
    const ctx = c.getContext('2d');
    const step = S / 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const cx = (x + 0.5) * step;
      const cy = (y + 0.5) * step;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((x + y) % 2 ? 0.8 : -0.8);
      ctx.fillStyle = 'rgba(170,175,170,0.5)';
      ctx.fillRect(-step * 0.32, -step * 0.08, step * 0.64, step * 0.16);
      ctx.fillStyle = 'rgba(20,22,20,0.5)';
      ctx.fillRect(-step * 0.32, step * 0.06, step * 0.64, step * 0.05);
      ctx.restore();
    }
    return c;
  })();

  // ─ предупреждающая жёлто-чёрная разметка
  const hazardC = (() => {
    const c = pixels(S, (u, v) => {
      const stripe = ((u + v) * 4) % 1 < 0.5;
      const k = 0.8 + n(u, v) * 0.3;
      return stripe ? [190 * k, 150 * k, 30 * k] : [26 * k, 24 * k, 20 * k];
    });
    return c;
  })();

  const T = (c) => toTexture(c, aniso);
  const B = (c) => toBump(c, aniso);

  const std = (opts, texScale = 2) => {
    const m = new THREE.MeshStandardMaterial(opts);
    m.userData.texScale = texScale;
    return m;
  };

  const concreteT = T(concreteC);
  const mats = {
    concrete: std({ map: concreteT, bumpMap: B(concreteC), bumpScale: 1.2, roughness: 0.92, metalness: 0 }, 2.5),
    concreteDark: std({ map: T(concreteDarkC), bumpMap: B(concreteDarkC), bumpScale: 1.4, roughness: 0.95 }, 2.5),
    tiles: std({ map: T(tilesC), bumpMap: B(tilesC), bumpScale: 1.5, roughness: 0.55 }, 2.4),
    whiteTile: std({ map: T(whiteTileC), bumpMap: B(whiteTileC), bumpScale: 1, roughness: 0.35 }, 2),
    lino: std({ map: T(linoC), roughness: 0.6 }, 2),
    paint: std({ map: T(paintC), bumpMap: B(paintC), bumpScale: 0.6, roughness: 0.85 }, 3),
    ceiling: std({ map: T(ceilingC), bumpMap: B(ceilingC), bumpScale: 0.8, roughness: 0.95 }, 1.2),
    wood: std({ map: T(woodC), roughness: 0.7 }, 1.5),
    metal: std({ map: T(metalC), roughness: 0.45, metalness: 0.6 }, 1.5),
    metalDark: std({ map: T(metalC), color: 0x5a6066, roughness: 0.5, metalness: 0.65 }, 1.5),
    carpet: std({ map: T(carpetC), roughness: 1 }, 1.5),
    door: std({ map: T(metalC), color: 0x8a9a96, roughness: 0.55, metalness: 0.35 }, 1.2),
    doorRed: std({ map: T(metalC), color: 0x9a6458, roughness: 0.55, metalness: 0.35 }, 1.2),
    rubber: std({ color: 0x1c1c1e, roughness: 0.9 }),
    dark: std({ color: 0x141416, roughness: 0.9 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    paper: std({ color: 0xd8d4c4, roughness: 0.95 }),
    plastic: std({ color: 0x3a3e42, roughness: 0.6 }),
    plasticLight: std({ color: 0xb8b4a8, roughness: 0.55 }),
    fabric: std({ color: 0x4e5a62, roughness: 1 }),
    foam: std({ color: 0x2a2a30, roughness: 1 }),
    void: std({ color: 0xd8dad6, roughness: 1 }),
    voidFloor: std({ map: T(whiteTileC), color: 0xe4e6e2, roughness: 0.9 }, 4),
    chalk: new THREE.MeshBasicMaterial({ color: 0xe8e8e0, transparent: true, opacity: 0.8, depthWrite: false }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fb4b8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18, depthWrite: false }),
    curtain: new THREE.MeshStandardMaterial({ color: 0x343c3a, roughness: 0.4, transparent: true, opacity: 0.93, side: THREE.DoubleSide }),
    lampWhite: new THREE.MeshBasicMaterial({ color: 0xe8f0f2 }),
    lampWarm: new THREE.MeshBasicMaterial({ color: 0xffe2b8 }),
    lampOff: std({ color: 0x404446, roughness: 0.4 }),
    lampRed: new THREE.MeshBasicMaterial({ color: 0xff3020 }),
    lampAmber: new THREE.MeshBasicMaterial({ color: 0xffb030 }),
    lampGreen: new THREE.MeshBasicMaterial({ color: 0x40ff80 }),
    screen: new THREE.MeshBasicMaterial({ color: 0x9fe8c0 }),
    observer: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, metalness: 0 }),
    wetConcrete: std({ map: T(concreteDarkC), bumpMap: B(concreteDarkC), bumpScale: 1.6, color: 0x7a807a, roughness: 0.32, metalness: 0.05 }, 2.5),
    brick: std({ map: T(brickC), bumpMap: B(brickC), bumpScale: 2.2, roughness: 0.55 }, 2.2),
    rust: std({ map: T(metalC), color: 0x9a5a38, roughness: 0.75, metalness: 0.45 }, 1.2),
    grate: std({ color: 0x3a3e40, roughness: 0.5, metalness: 0.7 }),
    hospital: std({ map: T(whiteTileC), bumpMap: B(whiteTileC), bumpScale: 1, color: 0xb8c4bc, roughness: 0.45 }, 1.6),
    water: new THREE.MeshStandardMaterial({ color: 0x0b1410, roughness: 0.06, metalness: 0.55, normalMap: waterN, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.93 }),
    sky: new THREE.MeshBasicMaterial({ color: 0x0a0f18, side: THREE.BackSide, fog: false }),
    bunker: std({ map: T(bunkerC), bumpMap: B(bunkerC), bumpScale: 1.2, roughness: 0.6, metalness: 0.1, color: 0xd8dccf }, 2.4),
    tank: std({ map: T(tankC), bumpMap: B(tankC), bumpScale: 1.4, roughness: 0.5, metalness: 0.15, color: 0xe0e0d8 }, 4),
    tread: std({ map: T(treadC), bumpMap: B(treadC), bumpScale: 2, roughness: 0.45, metalness: 0.25, color: 0xe8e8e0 }, 1.2),
    hazard: std({ map: T(hazardC), roughness: 0.6 }, 1),
    pool: new THREE.MeshStandardMaterial({ color: 0x1d4a42, roughness: 0.11, metalness: 0.1, emissive: 0x03140f, normalMap: waterN, normalScale: new THREE.Vector2(0.55, 0.55), transparent: true, opacity: 0.93 }),
    shallow: new THREE.MeshStandardMaterial({ color: 0x2a463a, roughness: 0.1, metalness: 0.15, normalMap: waterN, normalScale: new THREE.Vector2(0.3, 0.3), transparent: true, opacity: 0.72, depthWrite: false }),
    deep: new THREE.MeshBasicMaterial({ color: 0x02100c, fog: true }),
    porthole: new THREE.MeshBasicMaterial({ color: 0x0d3a34, transparent: true, opacity: 0.85 }),
    arc: new THREE.MeshBasicMaterial({ color: 0xa8d8ff }),
    snow: new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.95 }),
    copy: new THREE.MeshStandardMaterial({ color: 0xcfe3ea, emissive: 0x6f8f9a, emissiveIntensity: 0.6, roughness: 0.6, transparent: true, opacity: 0.38, depthWrite: false }),
  };
  return mats;
}

// Текстура-надпись (таблички, номера этажей, экраны терминалов, плакаты).
export function textTexture(lines, { w = 256, h = 128, bg = '#1a1c1c', fg = '#d8d8cc', font = 'bold 48px Consolas, monospace', align = 'center', pad = 12, noise = 0 } = {}) {
  const c = canvasOf(1);
  c.width = w;
  c.height = h;
  drawText(c, lines, { bg, fg, font, align, pad, noise });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.canvas = c;
  t.userData.style = { bg, fg, font, align, pad, noise };
  return t;
}

export function drawText(canvas, lines, { bg, fg, font, align, pad, noise }) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (noise) {
    for (let i = 0; i < w * h * noise * 0.02; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
  }
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  const lh = h / (arr.length + 0.5);
  arr.forEach((line, i) => {
    const x = align === 'center' ? w / 2 : pad;
    ctx.fillText(line, x, lh * (i + 0.75));
  });
}

export function updateTextTexture(tex, lines, overrides = {}) {
  drawText(tex.userData.canvas, lines, { ...tex.userData.style, ...overrides });
  tex.needsUpdate = true;
}
