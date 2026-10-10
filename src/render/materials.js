// ÐŸÑ€Ð¾Ñ†ÐµÐ´ÑƒÑ€Ð½Ñ‹Ðµ Ñ‚ÐµÐºÑÑ‚ÑƒÑ€Ñ‹ (canvas) Ð¸ Ð¼Ð°Ñ‚ÐµÑ€Ð¸Ð°Ð»Ñ‹. Ð‘ÐµÐ· Ð²Ð½ÐµÑˆÐ½Ð¸Ñ… Ñ„Ð°Ð¹Ð»Ð¾Ð² â€” Ð¸Ð³Ñ€Ð° Ð¿Ð¾Ð»Ð½Ð¾ÑÑ‚ÑŒÑŽ Ð°Ð²Ñ‚Ð¾Ð½Ð¾Ð¼Ð½Ð°.
// Ð¢ÐµÐºÑÑ‚ÑƒÑ€Ñ‹ Ð±ÐµÑÑˆÐ¾Ð²Ð½Ñ‹Ðµ; UV Ð²Ñ‹Ñ‡Ð¸ÑÐ»ÑÑŽÑ‚ÑÑ Ð² Ð¼ÐµÑ‚Ñ€Ð°Ñ… (ÑÐ¼. builder.js), Ð¿Ð¾ÑÑ‚Ð¾Ð¼Ñƒ Ð¼Ð°ÑÑˆÑ‚Ð°Ð± Ð²ÐµÐ·Ð´Ðµ Ð¾Ð´Ð¸Ð½Ð°ÐºÐ¾Ð²Ñ‹Ð¹.

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

// ÐŸÐ¾Ð¿Ð¸ÐºÑÐµÐ»ÑŒÐ½Ð°Ñ Ð·Ð°Ð»Ð¸Ð²ÐºÐ°: fn(u, v) -> [r, g, b] Ð² 0..255
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
  const S = quality === 'low' ? 256 : quality === 'high' ? 1024 : 512;
  const aniso = quality === 'low' ? 1 : Math.min(maxAniso, quality === 'high' ? 8 : 4);
  const n = fbmFactory(1337);
  const n2 = fbmFactory(4242);

  // â”€ Ð±ÐµÑ‚Ð¾Ð½: Ð¿ÑÑ‚Ð½Ð°, Ð¿Ð¾Ð´Ñ‚Ñ‘ÐºÐ¸, Ð¼ÐµÐ»ÐºÐ¸Ðµ Ð¿Ð¾Ñ€Ñ‹
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

  // â”€ Ð¿Ð»Ð¸Ñ‚ÐºÐ° Ð¿Ð¾Ð»Ð°: ÑˆÐ²Ñ‹, Ð½ÐµÑ€Ð¾Ð²Ð½Ñ‹Ð¹ Ñ‚Ð¾Ð½ ÐºÐ°Ð¶Ð´Ð¾Ð¹ Ð¿Ð»Ð¸Ñ‚ÐºÐ¸
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

  // â”€ Ð±ÐµÐ»Ð°Ñ ÐºÐ°Ñ„ÐµÐ»ÑŒÐ½Ð°Ñ Ð¿Ð»Ð¸Ñ‚ÐºÐ° Ð»Ð°Ð±Ð¾Ñ€Ð°Ñ‚Ð¾Ñ€Ð¸Ð¸
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

  // â”€ Ð»Ð¸Ð½Ð¾Ð»ÐµÑƒÐ¼ Ð² ÐºÐ¾Ð¼Ð½Ð°Ñ‚Ðµ Ð¿Ñ€Ð¾Ð±ÑƒÐ¶Ð´ÐµÐ½Ð¸Ñ: Ð±Ð»ÐµÐ´Ð½Ð¾-Ð·ÐµÐ»Ñ‘Ð½Ñ‹Ð¹, Ñ Ð¿Ð¾Ñ‚Ñ‘Ñ€Ñ‚Ð¾ÑÑ‚ÑÐ¼Ð¸
  const linoC = pixels(S, (u, v) => {
    const a = n(u, v);
    const wear = Math.pow(n2(u, v, 4), 2);
    const k = 0.8 + a * 0.25 + wear * 0.25;
    return col([104, 120, 108], k);
  });

  // â”€ ÐºÑ€Ð°ÑˆÐµÐ½Ð°Ñ ÑÑ‚ÐµÐ½Ð°: Ð²ÐµÑ€Ñ… ÑÐ²ÐµÑ‚Ð»Ñ‹Ð¹, Ð½Ð¸Ð¶Ð½ÑÑ Ð¿Ð°Ð½ÐµÐ»ÑŒ Ñ‚ÐµÐ¼Ð½ÐµÐµ (ÐºÐ»Ð°ÑÑÐ¸ÐºÐ° Ð³Ð¾ÑÑƒÑ‡Ñ€ÐµÐ¶Ð´ÐµÐ½Ð¸Ð¹)
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

  // â”€ Ð¿Ð¾Ñ‚Ð¾Ð»Ð¾Ñ‡Ð½Ñ‹Ðµ Ð¿Ð°Ð½ÐµÐ»Ð¸ Â«ÐÑ€Ð¼ÑÑ‚Ñ€Ð¾Ð½Ð³Â»
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

  // â”€ Ð´ÐµÑ€ÐµÐ²Ð¾ (ÑÑ‚Ð¾Ð»Ñ‹, Ð¿Ð¾Ð»ÐºÐ¸)
  const woodC = pixels(S, (u, v) => {
    const ring = Math.sin((v * 22 + n(u * 0.2, v, 3) * 6) * Math.PI) * 0.5 + 0.5;
    const k = 0.7 + ring * 0.18 + n2(u, v) * 0.15;
    return col([120, 86, 58], k);
  });

  // â”€ Ð¼ÐµÑ‚Ð°Ð»Ð»: ÑˆÐ»Ð¸Ñ„Ð¾Ð²ÐºÐ° + Ñ€ÐµÐ´ÐºÐ°Ñ Ñ€Ð¶Ð°Ð²Ñ‡Ð¸Ð½Ð°
  const metalC = pixels(S, (u, v) => {
    const brush = n2(u * 0.05, v, 5);
    const rust = Math.pow(n(u, v, 4), 5) * 2.2;
    const k = 0.75 + brush * 0.3;
    return [mix(118 * k, 120, rust), mix(124 * k, 70, rust), mix(128 * k, 40, rust)];
  });

  // â”€ ÐºÐ¾Ð²Ñ€Ð¾Ð»Ð¸Ð½ Ð½Ð°Ð±Ð»ÑŽÐ´Ð°Ñ‚ÐµÐ»ÑŒÐ½Ð¾Ð¹
  const carpetC = pixels(S, (u, v) => {
    const k = 0.75 + n2(u * 16 % 1, v * 16 % 1, 2) * 0.3 + n(u, v, 3) * 0.1;
    return col([62, 58, 72], k);
  });

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
    copy: new THREE.MeshStandardMaterial({ color: 0xcfe3ea, emissive: 0x6f8f9a, emissiveIntensity: 0.6, roughness: 0.6, transparent: true, opacity: 0.38, depthWrite: false }),
  };
  return mats;
}

// Ð¢ÐµÐºÑÑ‚ÑƒÑ€Ð°-Ð½Ð°Ð´Ð¿Ð¸ÑÑŒ (Ñ‚Ð°Ð±Ð»Ð¸Ñ‡ÐºÐ¸, Ð½Ð¾Ð¼ÐµÑ€Ð° ÑÑ‚Ð°Ð¶ÐµÐ¹, ÑÐºÑ€Ð°Ð½Ñ‹ Ñ‚ÐµÑ€Ð¼Ð¸Ð½Ð°Ð»Ð¾Ð², Ð¿Ð»Ð°ÐºÐ°Ñ‚Ñ‹).
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
