// AudioManager — полностью процедурный звук на WebAudio (без внешних файлов, работает офлайн).
// • фоновое окружение по зонам (вентиляция, гул, писк электроники, низкий дрон)
// • пространственные источники (PannerNode HRTF): генератор, терминалы, лампы,
//   и «частота скрытой комнаты» — биение двух близких тонов рядом с нераскрытыми секретами
// • синтезированные эффекты: шаги по разным поверхностям, двери, механизмы, лифт, телефон

const ZONE_AMBIENCE = {
  default: { vent: 0.5, hum: 0.12, whine: 0.0, drone: 0.0, cutoff: 260 },
  start: { vent: 0.35, hum: 0.05, whine: 0.0, drone: 0.0, cutoff: 200 },
  corridor: { vent: 0.6, hum: 0.15, whine: 0.0, drone: 0.0, cutoff: 300 },
  archive: { vent: 0.18, hum: 0.05, whine: 0.0, drone: 0.05, cutoff: 160 },
  generator: { vent: 0.4, hum: 0.55, whine: 0.04, drone: 0.0, cutoff: 360 },
  hall: { vent: 0.55, hum: 0.12, whine: 0.0, drone: 0.05, cutoff: 280 },
  observation: { vent: 0.25, hum: 0.1, whine: 0.06, drone: 0.05, cutoff: 220 },
  glass: { vent: 0.0, hum: 0.0, whine: 0.02, drone: 0.25, cutoff: 120 },
  stairs: { vent: 0.7, hum: 0.05, whine: 0.0, drone: 0.12, cutoff: 180 },
  room07: { vent: 0.05, hum: 0.0, whine: 0.0, drone: 0.3, cutoff: 120 },
  reflection: { vent: 0.35, hum: 0.05, whine: 0.0, drone: 0.15, cutoff: 200 },
  lab: { vent: 0.45, hum: 0.2, whine: 0.08, drone: 0.05, cutoff: 420 },
  echo: { vent: 0.05, hum: 0.02, whine: 0.0, drone: 0.0, cutoff: 120 },
  gate: { vent: 0.5, hum: 0.25, whine: 0.0, drone: 0.15, cutoff: 260 },
  core: { vent: 0.15, hum: 0.2, whine: 0.0, drone: 0.6, cutoff: 200 },
  void: { vent: 0.0, hum: 0.0, whine: 0.1, drone: 0.08, cutoff: 900 },
  elevator: { vent: 0.2, hum: 0.25, whine: 0.0, drone: 0.0, cutoff: 200 },
  vent: { vent: 1.0, hum: 0.08, whine: 0.0, drone: 0.1, cutoff: 520 },
  sewer: { vent: 0.55, hum: 0.0, whine: 0.0, drone: 0.25, cutoff: 650 },
  canal: { vent: 0.7, hum: 0.0, whine: 0.0, drone: 0.3, cutoff: 700 },
  flooded: { vent: 0.8, hum: 0.0, whine: 0.04, drone: 0.4, cutoff: 600 },
  pump: { vent: 0.4, hum: 0.3, whine: 0.0, drone: 0.2, cutoff: 400 },
  outflow: { vent: 1.0, hum: 0.0, whine: 0.0, drone: 0.1, cutoff: 1800 },
  outside: { vent: 1.2, hum: 0.0, whine: 0.0, drone: 0.05, cutoff: 3500 },
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.emitters = new Map();
    this.loops = new Map();
    this.volumes = { master: 0.8, ambient: 0.7, sfx: 0.8 };
    this.zone = 'default';
  }

  // Браузер разрешает звук только после действия пользователя — вызывается по клику «Новая игра»/«Продолжить».
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (err) {
      console.warn('[audio] WebAudio недоступен', err);
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.ambientBus = c.createGain();
    this.sfxBus = c.createGain();
    this.ambientBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.white = this.makeNoise('white');
    this.brown = this.makeNoise('brown');
    this.buildAmbience();
    this.applyVolumes();
  }

  makeNoise(kind) {
    const c = this.ctx;
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  noiseSource(buf, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    return s;
  }

  buildAmbience() {
    const c = this.ctx;
    const amb = {};
    // вентиляция: коричневый шум через фильтр + медленная модуляция «дыхания»
    const vent = this.noiseSource(this.brown);
    amb.ventFilter = c.createBiquadFilter();
    amb.ventFilter.type = 'lowpass';
    amb.ventFilter.frequency.value = 260;
    amb.vent = c.createGain();
    amb.vent.gain.value = 0;
    vent.connect(amb.ventFilter).connect(amb.vent).connect(this.ambientBus);
    vent.start();
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(amb.ventFilter.frequency);
    lfo.start();
    // электрический гул 50 Гц
    amb.hum = c.createGain();
    amb.hum.gain.value = 0;
    const humF = c.createBiquadFilter();
    humF.type = 'lowpass';
    humF.frequency.value = 400;
    [50, 100, 150].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = [0.05, 0.03, 0.015][i];
      o.connect(g).connect(humF);
      o.start();
    });
    humF.connect(amb.hum).connect(this.ambientBus);
    // тонкий писк электроники
    amb.whine = c.createGain();
    amb.whine.gain.value = 0;
    const wo = c.createOscillator();
    wo.frequency.value = 3170;
    const wg = c.createGain();
    wg.gain.value = 0.004;
    wo.connect(wg).connect(amb.whine).connect(this.ambientBus);
    wo.start();
    // низкий дрон для «невозможных» мест
    amb.drone = c.createGain();
    amb.drone.gain.value = 0;
    [41, 41.7, 61.5].forEach((f) => {
      const o = c.createOscillator();
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0.06;
      o.connect(g).connect(amb.drone);
      o.start();
    });
    amb.drone.connect(this.ambientBus);
    // музыка погони: диссонантный кластер с пульсацией — громкость задаёт setChase()
    amb.chase = c.createGain();
    amb.chase.gain.value = 0;
    const chaseF = c.createBiquadFilter();
    chaseF.type = 'lowpass';
    chaseF.frequency.value = 900;
    const pulse = c.createGain();
    pulse.gain.value = 0.5;
    const plfo = c.createOscillator();
    plfo.type = 'square';
    plfo.frequency.value = 2.2;
    const plfoG = c.createGain();
    plfoG.gain.value = 0.5;
    plfo.connect(plfoG).connect(pulse.gain);
    plfo.start();
    [55, 58.3, 82.4, 110.9, 164.8].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = i < 2 ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = i < 2 ? 0.05 : 0.03;
      o.connect(g).connect(chaseF);
      o.start();
    });
    chaseF.connect(pulse).connect(amb.chase).connect(this.ambientBus);
    this.amb = amb;
    this.setZone(this.zone, true);
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.ambientBus.gain.setTargetAtTime(this.volumes.ambient, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  setZone(zone, instant = false) {
    this.zone = zone;
    if (!this.ctx || !this.amb) return;
    const p = ZONE_AMBIENCE[zone] || ZONE_AMBIENCE.default;
    const t = this.ctx.currentTime;
    const tc = instant ? 0.01 : 1.2;
    this.amb.vent.gain.setTargetAtTime(p.vent * 0.5, t, tc);
    this.amb.hum.gain.setTargetAtTime(p.hum, t, tc);
    this.amb.whine.gain.setTargetAtTime(p.whine * 10, t, tc);
    this.amb.drone.gain.setTargetAtTime(p.drone, t, tc);
    this.amb.ventFilter.frequency.setTargetAtTime(p.cutoff, t, tc);
  }

  // Временное приглушение окружения (например, при появлении Наблюдателя).
  duck(amount, seconds) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambientBus.gain.cancelScheduledValues(t);
    this.ambientBus.gain.setTargetAtTime(this.volumes.ambient * amount, t, 0.3);
    this.ambientBus.gain.setTargetAtTime(this.volumes.ambient, t + seconds, 1.5);
  }

  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = camera.position;
    const f = camera.getWorldDirection(this._dir || (this._dir = camera.position.clone()));
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t);
      l.forwardY.setValueAtTime(f.y, t);
      l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
    // дальние источники выключаются — экономим ресурсы
    for (const e of this.emitters.values()) {
      const d = Math.hypot(e.pos.x - p.x, e.pos.y - p.y, e.pos.z - p.z);
      const audible = e.on && d < e.range;
      if (audible !== e.audible) {
        e.audible = audible;
        e.gain.gain.setTargetAtTime(audible ? e.level : 0, t, 0.4);
      }
    }
  }

  panner(pos, ref = 1.5, max = 30) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = max;
    p.rolloffFactor = 1.4;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  }

  // Постоянный пространственный источник.
  addEmitter(id, type, pos, level = 1, range = 24) {
    if (!this.ctx || this.emitters.has(id)) return;
    const c = this.ctx;
    const gain = c.createGain();
    gain.gain.value = 0;
    const pan = this.panner(pos, type === 'secret' ? 1.0 : 1.5, range);
    gain.connect(pan).connect(this.ambientBus);
    const srcs = [];
    const osc = (f, type2 = 'sine', g = 0.05) => {
      const o = c.createOscillator();
      o.type = type2;
      o.frequency.value = f;
      const gg = c.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(gain);
      o.start();
      srcs.push(o);
    };
    if (type === 'machine') {
      osc(55, 'sawtooth', 0.05);
      osc(110, 'square', 0.012);
      const n = this.noiseSource(this.brown);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 180;
      const g = c.createGain();
      g.gain.value = 0.4;
      n.connect(f).connect(g).connect(gain);
      n.start();
      srcs.push(n);
    } else if (type === 'buzz') {
      osc(100, 'sawtooth', 0.02);
      osc(7020, 'sine', 0.002);
    } else if (type === 'lamp') {
      osc(120, 'sawtooth', 0.012);
    } else if (type === 'secret') {
      // «частота скрытой комнаты»: 196 и 199.4 Гц дают медленное биение ~3.4 Гц
      osc(196, 'sine', 0.05);
      osc(199.4, 'sine', 0.05);
      osc(588, 'sine', 0.006);
    } else if (type === 'monster') {
      // хриплое дыхание: шум через полосовой фильтр, модулированный медленным «вдохом»
      const n = this.noiseSource(this.brown);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 320;
      bp.Q.value = 2.5;
      const breath = c.createGain();
      breath.gain.value = 0.2;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.45;
      const lg = c.createGain();
      lg.gain.value = 0.55;
      lfo.connect(lg).connect(breath.gain);
      n.connect(bp).connect(breath).connect(gain);
      n.start();
      lfo.start();
      srcs.push(n, lfo);
      osc(38, 'sine', 0.09);
      osc(57.5, 'sawtooth', 0.012);
    } else if (type === 'core') {
      osc(36, 'sine', 0.12);
      osc(72.3, 'triangle', 0.03);
      osc(219, 'sine', 0.01);
    }
    this.emitters.set(id, { id, type, pos, gain, pan, srcs, level, range, on: true, audible: false });
  }

  setChase(level) {
    if (!this.ctx || !this.amb) return;
    this.amb.chase.gain.setTargetAtTime(level * 0.9, this.ctx.currentTime, level > 0.1 ? 0.3 : 1.5);
  }

  setEmitterPos(id, x, y, z) {
    const e = this.emitters.get(id);
    if (!e) return;
    e.pos.set(x, y, z);
    const p = e.pan;
    const t = this.ctx.currentTime;
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, t, 0.05);
      p.positionY.setTargetAtTime(y, t, 0.05);
      p.positionZ.setTargetAtTime(z, t, 0.05);
    } else p.setPosition(x, y, z);
  }

  setEmitter(id, on, level) {
    const e = this.emitters.get(id);
    if (!e) return;
    e.on = on;
    if (level !== undefined) e.level = level;
    e.audible = null; // пересчитать на следующем кадре
  }

  removeEmitter(id) {
    const e = this.emitters.get(id);
    if (!e) return;
    e.srcs.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* уже остановлен */
      }
    });
    e.gain.disconnect();
    this.emitters.delete(id);
  }

  // ── синтезированные эффекты ────────────────────────────────────────────────
  out(pos) {
    if (!pos) return this.sfxBus;
    const p = this.panner(pos);
    p.connect(this.sfxBus);
    return p;
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  noise({ dur = 0.2, type = 'lowpass', freq = 1000, q = 1, gain = 0.3, pos, delay = 0, attack = 0.005, freqEnd, brown = false }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = this.noiseSource(brown ? this.brown : this.white, false);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    s.connect(f).connect(g).connect(this.out(pos));
    s.start(t, Math.random() * 2);
    s.stop(t + dur + attack + 0.05);
  }

  tone({ freq = 440, dur = 0.2, type = 'sine', gain = 0.2, pos, delay = 0, attack = 0.005, freqEnd }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    o.connect(g).connect(this.out(pos));
    o.start(t);
    o.stop(t + dur + attack + 0.05);
  }

  footstep(surface, pos, sprint, quiet = false) {
    if (!this.ctx) return;
    const k = (sprint ? 1.25 : 1) * (quiet ? 0.4 : 1);
    if (surface === 'wet' || surface === 'mud') {
      const v = 0.9 + Math.random() * 0.2;
      this.noise({ dur: 0.16, type: 'bandpass', freq: 900 * v, q: 1.2, gain: 0.12 * k, pos, attack: 0.01 });
      this.noise({ dur: 0.08, type: 'highpass', freq: 3000, gain: 0.05 * k, pos, delay: 0.04 });
      this.tone({ freq: 600 * v, freqEnd: 300, dur: 0.08, gain: 0.02 * k, pos, delay: 0.05 });
      return;
    }
    const v = 0.9 + Math.random() * 0.2;
    switch (surface) {
      case 'metal':
        this.noise({ dur: 0.08, type: 'bandpass', freq: 2200 * v, q: 3, gain: 0.12 * k, pos });
        this.tone({ freq: 340 * v, dur: 0.18, type: 'triangle', gain: 0.03 * k, pos });
        break;
      case 'tile':
        this.noise({ dur: 0.05, type: 'highpass', freq: 1800 * v, q: 0.7, gain: 0.1 * k, pos });
        this.noise({ dur: 0.09, type: 'lowpass', freq: 500, gain: 0.08 * k, pos, brown: true });
        break;
      case 'carpet':
        this.noise({ dur: 0.12, type: 'lowpass', freq: 380 * v, gain: 0.08 * k, pos, attack: 0.02 });
        break;
      case 'void':
        this.tone({ freq: 880 * v, dur: 0.4, gain: 0.012, pos, attack: 0.03 });
        break;
      default:
        this.noise({ dur: 0.09, type: 'lowpass', freq: 900 * v, gain: 0.14 * k, pos });
        this.noise({ dur: 0.05, type: 'bandpass', freq: 3000 * v, q: 1.5, gain: 0.025 * k, pos });
    }
  }

  play(name, pos) {
    if (!this.ctx) return;
    try {
      this[`sfx_${name}`] ? this[`sfx_${name}`](pos) : console.warn('[audio] нет звука', name);
    } catch (err) {
      console.warn('[audio] ошибка звука', name, err);
    }
  }

  sfx_door_open(pos) {
    // скрип: пилообразный тон с «дрожанием» частоты через полосовой фильтр
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(190 + Math.random() * 40, t);
    o.frequency.linearRampToValueAtTime(260, t + 0.35);
    o.frequency.linearRampToValueAtTime(170, t + 0.75);
    const wob = c.createOscillator();
    wob.frequency.value = 23;
    const wg = c.createGain();
    wg.gain.value = 18;
    wob.connect(wg).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1300;
    f.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(f).connect(g).connect(this.out(pos));
    o.start(t);
    wob.start(t);
    o.stop(t + 0.9);
    wob.stop(t + 0.9);
    this.noise({ dur: 0.1, freq: 600, gain: 0.12, pos });
  }
  sfx_door_close(pos) {
    this.noise({ dur: 0.25, freq: 220, gain: 0.35, pos, brown: true });
    this.tone({ freq: 70, dur: 0.25, gain: 0.15, pos });
    this.noise({ dur: 0.04, type: 'bandpass', freq: 2500, q: 2, gain: 0.08, pos, delay: 0.02 });
  }
  sfx_door_locked(pos) {
    this.noise({ dur: 0.05, type: 'bandpass', freq: 1800, q: 4, gain: 0.15, pos });
    this.noise({ dur: 0.05, type: 'bandpass', freq: 1600, q: 4, gain: 0.12, pos, delay: 0.12 });
    this.tone({ freq: 140, dur: 0.12, gain: 0.05, pos, delay: 0.02 });
  }
  sfx_lever(pos) {
    this.noise({ dur: 0.18, type: 'bandpass', freq: 900, q: 2, gain: 0.2, pos });
    this.tone({ freq: 95, dur: 0.3, type: 'square', gain: 0.05, pos, delay: 0.12 });
  }
  sfx_fuse(pos) {
    this.noise({ dur: 0.03, type: 'highpass', freq: 3000, gain: 0.2, pos });
    this.tone({ freq: 1200, dur: 0.05, type: 'square', gain: 0.03, pos, delay: 0.04 });
  }
  sfx_beep() {
    this.tone({ freq: 1320, dur: 0.06, type: 'square', gain: 0.03 });
  }
  sfx_beep_ok() {
    this.tone({ freq: 880, dur: 0.1, type: 'square', gain: 0.03 });
    this.tone({ freq: 1320, dur: 0.15, type: 'square', gain: 0.03, delay: 0.11 });
  }
  sfx_beep_err() {
    this.tone({ freq: 220, dur: 0.3, type: 'square', gain: 0.04 });
  }
  sfx_pickup() {
    this.noise({ dur: 0.06, type: 'bandpass', freq: 1500, q: 1, gain: 0.08 });
    this.tone({ freq: 660, dur: 0.12, gain: 0.03, delay: 0.03 });
  }
  sfx_paper() {
    this.noise({ dur: 0.25, type: 'highpass', freq: 2500, gain: 0.07, attack: 0.04 });
  }
  sfx_click() {
    this.noise({ dur: 0.02, type: 'highpass', freq: 4000, gain: 0.1 });
  }
  sfx_ui() {
    this.tone({ freq: 520, dur: 0.04, gain: 0.02 });
  }
  sfx_drop(pos) {
    this.tone({ freq: 2100, dur: 0.9, gain: 0.04, pos });
    this.tone({ freq: 2101.8, dur: 1.4, gain: 0.03, pos });
    this.noise({ dur: 0.05, freq: 900, gain: 0.08, pos });
  }
  sfx_elevator_move() {
    this.noise({ dur: 3.2, freq: 140, gain: 0.25, attack: 0.6, brown: true });
    this.tone({ freq: 48, dur: 3.2, gain: 0.08, attack: 0.6 });
  }
  sfx_ding(pos) {
    this.tone({ freq: 1046, dur: 1.2, gain: 0.06, pos });
    this.tone({ freq: 784, dur: 1.4, gain: 0.05, pos, delay: 0.25 });
  }
  sfx_chime_far() {
    // далёкий лифт: тот же сигнал, но приглушённый и со сдвигом — один из «уникальных» сигналов правил
    this.tone({ freq: 1046 * 0.94, dur: 2, gain: 0.02, attack: 0.05 });
    this.tone({ freq: 784 * 0.94, dur: 2.4, gain: 0.018, delay: 0.3, attack: 0.05 });
    this.tone({ freq: 523 * 0.94, dur: 3, gain: 0.015, delay: 0.6, attack: 0.05 });
  }
  sfx_phone_ring(pos) {
    for (let i = 0; i < 2; i++) {
      const d = i * 0.45;
      this.tone({ freq: 440, dur: 0.35, gain: 0.05, pos, delay: d, type: 'square' });
      this.tone({ freq: 480, dur: 0.35, gain: 0.05, pos, delay: d, type: 'square' });
    }
  }
  sfx_crack(pos) {
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.06 + Math.random() * 0.1, type: 'bandpass', freq: 600 + Math.random() * 2000, q: 2, gain: 0.25, pos, delay: i * 0.07 + Math.random() * 0.05 });
    this.noise({ dur: 1.2, freq: 300, gain: 0.3, pos, brown: true, delay: 0.3, attack: 0.1 });
  }
  sfx_settle() {
    // «оседание» здания — низкий скрип и далёкий удар
    this.tone({ freq: 60, freqEnd: 42, dur: 1.6, gain: 0.08, attack: 0.3 });
    this.noise({ dur: 0.8, freq: 160, gain: 0.12, brown: true, delay: 0.6, attack: 0.05 });
  }
  sfx_terminal_wake() {
    this.tone({ freq: 15700, dur: 0.6, gain: 0.01 });
    this.tone({ freq: 220, dur: 0.15, type: 'square', gain: 0.02, delay: 0.3 });
  }
  sfx_type() {
    this.noise({ dur: 0.015, type: 'bandpass', freq: 3500 + Math.random() * 1500, q: 3, gain: 0.04 });
  }
  sfx_observer(pos) {
    // нарастающий диссонанс — тихий, без резкой громкости
    [43, 45.5, 64, 91].forEach((f, i) => this.tone({ freq: f, dur: 4, gain: 0.05, attack: 1.5, pos, delay: i * 0.1 }));
    this.noise({ dur: 3, type: 'bandpass', freq: 500, q: 8, gain: 0.03, attack: 1.5, pos });
  }
  sfx_observer_vanish(pos) {
    this.tone({ freq: 300, freqEnd: 40, dur: 1.2, gain: 0.05, pos });
    this.noise({ dur: 0.8, type: 'bandpass', freq: 2000, freqEnd: 200, q: 4, gain: 0.04, pos });
  }
  sfx_copy(pos) {
    this.noise({ dur: 1.2, type: 'bandpass', freq: 1200, freqEnd: 3000, q: 5, gain: 0.05, attack: 0.6, pos });
  }
  sfx_rule() {
    // тихий сигнал «открытия» — четыре ноты вверх, но последняя чуть ниже, чем ожидаешь
    [523, 659, 784, 740].forEach((f, i) => this.tone({ freq: f, dur: 1.4, gain: 0.025, delay: i * 0.18, attack: 0.02 }));
  }
  sfx_gate(pos) {
    this.noise({ dur: 2.5, freq: 120, gain: 0.4, brown: true, pos, attack: 0.3 });
    this.tone({ freq: 38, dur: 2.5, gain: 0.15, pos, attack: 0.3 });
  }
  sfx_power_on() {
    this.tone({ freq: 40, freqEnd: 50, dur: 2.5, type: 'sawtooth', gain: 0.08, attack: 0.5 });
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.05, type: 'highpass', freq: 3000, gain: 0.08, delay: 0.5 + i * 0.25 });
  }
  sfx_plate(pos) {
    this.noise({ dur: 0.1, type: 'bandpass', freq: 400, q: 2, gain: 0.2, pos });
    this.tone({ freq: 660, dur: 0.1, gain: 0.03, pos, delay: 0.08 });
  }
  sfx_scrape(pos) {
    this.noise({ dur: 0.25, type: 'bandpass', freq: 700 + Math.random() * 300, q: 2, gain: 0.12, pos, attack: 0.03 });
  }
  sfx_machine_down() {
    this.tone({ freq: 120, freqEnd: 20, dur: 5, type: 'sawtooth', gain: 0.1, attack: 0.1 });
    this.noise({ dur: 4, freq: 400, freqEnd: 60, gain: 0.2, brown: true });
  }
  sfx_flashlight() {
    this.noise({ dur: 0.015, type: 'highpass', freq: 5000, gain: 0.08 });
  }
  // ── хоррор ──
  sfx_heartbeat() {
    this.tone({ freq: 55, freqEnd: 38, dur: 0.14, gain: 0.35, attack: 0.005 });
    this.tone({ freq: 50, freqEnd: 34, dur: 0.16, gain: 0.25, attack: 0.005, delay: 0.24 });
  }
  sfx_monster_step(pos) {
    this.noise({ dur: 0.18, freq: 160, gain: 0.55, pos, brown: true });
    this.tone({ freq: 48, freqEnd: 30, dur: 0.2, gain: 0.22, pos });
    this.noise({ dur: 0.05, type: 'bandpass', freq: 1400, q: 2, gain: 0.05, pos, delay: 0.02 });
  }
  sfx_roar(pos) {
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 1.4);
    const wob = c.createOscillator();
    wob.frequency.value = 31;
    const wg = c.createGain();
    wg.gain.value = 40;
    wob.connect(wg).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 600;
    f.Q.value = 1.5;
    const g = c.createGain();
    this.env(g, t, 0.05, 0.35, 1.5);
    o.connect(f).connect(g).connect(this.out(pos));
    o.start(t);
    wob.start(t);
    o.stop(t + 1.7);
    wob.stop(t + 1.7);
    this.noise({ dur: 1.4, type: 'bandpass', freq: 900, q: 1, gain: 0.25, pos, attack: 0.05 });
  }
  sfx_stinger() {
    // резкий, но не оглушающий аккорд-удар
    [92.5, 98, 138.6, 196, 207.7].forEach((f) => this.tone({ freq: f, dur: 1.8, type: 'sawtooth', gain: 0.045, attack: 0.01 }));
    this.noise({ dur: 1.2, type: 'highpass', freq: 3000, freqEnd: 800, gain: 0.08, attack: 0.01 });
  }
  sfx_scream_far() {
    this.tone({ freq: 620, freqEnd: 380, dur: 2.2, type: 'sawtooth', gain: 0.015, attack: 0.3 });
    this.tone({ freq: 655, freqEnd: 360, dur: 2.4, type: 'triangle', gain: 0.012, attack: 0.3 });
    this.noise({ dur: 2, type: 'bandpass', freq: 1800, freqEnd: 900, q: 6, gain: 0.03, attack: 0.3 });
  }
  sfx_catch() {
    const c = this.ctx;
    const t = c.currentTime;
    [180, 190, 266, 377].forEach((f) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.4, t + 1.6);
      const g = c.createGain();
      this.env(g, t, 0.02, 0.09, 1.6);
      o.connect(g).connect(this.sfxBus);
      o.start(t);
      o.stop(t + 1.7);
    });
    this.noise({ dur: 1.5, type: 'bandpass', freq: 1200, q: 0.8, gain: 0.35, attack: 0.01 });
  }
  sfx_door_slam(pos) {
    this.noise({ dur: 0.35, freq: 300, gain: 0.7, pos, brown: true });
    this.tone({ freq: 80, freqEnd: 45, dur: 0.35, gain: 0.25, pos });
    this.noise({ dur: 0.08, type: 'bandpass', freq: 2200, q: 2, gain: 0.15, pos });
  }
  sfx_spark(pos) {
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.02 + Math.random() * 0.03, type: 'highpass', freq: 4000, gain: 0.12, pos, delay: i * 0.04 + Math.random() * 0.03 });
    this.tone({ freq: 120, dur: 0.3, type: 'sawtooth', gain: 0.03, pos });
  }
  sfx_whisper(pos) {
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.25 + Math.random() * 0.3, type: 'bandpass', freq: 2500 + Math.random() * 2500, q: 8, gain: 0.025, pos, delay: i * 0.35, attack: 0.08 });
  }
  sfx_locker() {
    this.noise({ dur: 0.2, type: 'bandpass', freq: 700, q: 3, gain: 0.25 });
    this.tone({ freq: 260, freqEnd: 180, dur: 0.25, type: 'triangle', gain: 0.05, delay: 0.05 });
    this.noise({ dur: 0.12, freq: 300, gain: 0.3, brown: true, delay: 0.25 });
  }
  // ── выживание, скримеры, атмосфера ──
  sfx_drip(pos) {
    const f = 1400 + Math.random() * 1400;
    this.tone({ freq: f, freqEnd: f * 2.2, dur: 0.06, gain: 0.07, pos });
    this.tone({ freq: f * 0.5, dur: 0.18, gain: 0.02, pos, delay: 0.02 });
  }
  sfx_drip_blood(pos) {
    this.tone({ freq: 700 + Math.random() * 200, freqEnd: 300, dur: 0.07, gain: 0.05, pos });
    this.noise({ dur: 0.05, type: 'lowpass', freq: 500, gain: 0.05, pos });
  }
  sfx_battery() {
    this.noise({ dur: 0.04, type: 'bandpass', freq: 2500, q: 3, gain: 0.15 });
    this.noise({ dur: 0.05, type: 'bandpass', freq: 1800, q: 3, gain: 0.15, delay: 0.25 });
    this.tone({ freq: 900, dur: 0.05, type: 'square', gain: 0.02, delay: 0.32 });
  }
  sfx_stim() {
    this.noise({ dur: 0.3, type: 'highpass', freq: 5000, gain: 0.06, attack: 0.05 });
    for (let i = 0; i < 6; i++) this.sfx_heartbeat_at(i * 0.42);
  }
  sfx_heartbeat_at(d) {
    this.tone({ freq: 60, freqEnd: 40, dur: 0.12, gain: 0.3, delay: d });
    this.tone({ freq: 55, freqEnd: 36, dur: 0.14, gain: 0.22, delay: d + 0.2 });
  }
  sfx_throw() {
    this.noise({ dur: 0.18, type: 'bandpass', freq: 1200, freqEnd: 400, q: 2, gain: 0.08, attack: 0.02 });
  }
  sfx_glass(pos) {
    for (let i = 0; i < 9; i++) this.tone({ freq: 2500 + Math.random() * 5000, dur: 0.1 + Math.random() * 0.25, gain: 0.04, pos, delay: Math.random() * 0.08 });
    this.noise({ dur: 0.3, type: 'highpass', freq: 3000, gain: 0.35, pos });
  }
  sfx_mask() {
    this.noise({ dur: 0.25, type: 'lowpass', freq: 600, gain: 0.25, attack: 0.03, brown: true });
    this.tone({ freq: 180, freqEnd: 120, dur: 0.2, gain: 0.05, delay: 0.1 });
  }
  sfx_mask_breath() {
    this.noise({ dur: 0.9, type: 'bandpass', freq: 700, q: 1.5, gain: 0.08, attack: 0.35 });
    this.noise({ dur: 0.7, type: 'bandpass', freq: 450, q: 2, gain: 0.06, attack: 0.25, delay: 1.1 });
    this.tone({ freq: 2200, dur: 0.05, gain: 0.01, delay: 1.05 });
  }
  sfx_cough() {
    for (let i = 0; i < 3; i++) {
      this.noise({ dur: 0.14, type: 'bandpass', freq: 500 + i * 60, q: 1.2, gain: 0.35, delay: i * 0.22, attack: 0.005 });
      this.tone({ freq: 140, freqEnd: 90, dur: 0.12, type: 'sawtooth', gain: 0.04, delay: i * 0.22 });
    }
  }
  sfx_pant() {
    for (let i = 0; i < 3; i++) this.noise({ dur: 0.35, type: 'bandpass', freq: 900, q: 1, gain: 0.06, delay: i * 0.5, attack: 0.1 });
  }
  sfx_ladder() {
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.06, type: 'bandpass', freq: 1100 + Math.random() * 400, q: 4, gain: 0.12, delay: i * 0.35 });
  }
  sfx_grate() {
    this.noise({ dur: 0.4, type: 'bandpass', freq: 1500, q: 3, gain: 0.15, attack: 0.05 });
    this.noise({ dur: 0.2, freq: 300, gain: 0.3, brown: true, delay: 0.4 });
  }
  sfx_chain() {
    this.noise({ dur: 0.06, type: 'highpass', freq: 3000, gain: 0.3 });
    for (let i = 0; i < 7; i++) this.tone({ freq: 1800 + Math.random() * 1500, dur: 0.12, type: 'triangle', gain: 0.03, delay: 0.05 + i * 0.06 });
  }
  sfx_power_down() {
    this.tone({ freq: 120, freqEnd: 30, dur: 1.2, type: 'sawtooth', gain: 0.06 });
    this.noise({ dur: 0.1, type: 'highpass', freq: 3000, gain: 0.1 });
  }
  sfx_screech() {
    // резкий визг скримера: диссонанс, высокий шум, низкий удар
    [880, 932, 1245, 1661].forEach((f, i) => this.tone({ freq: f, freqEnd: f * 0.7, dur: 0.9, type: 'sawtooth', gain: 0.05, delay: i * 0.01 }));
    this.noise({ dur: 0.8, type: 'bandpass', freq: 3200, freqEnd: 1500, q: 2, gain: 0.35 });
    this.tone({ freq: 50, freqEnd: 30, dur: 0.6, gain: 0.35 });
  }
  sfx_body_drop(pos) {
    this.noise({ dur: 0.6, type: 'bandpass', freq: 400, q: 6, gain: 0.08, pos, attack: 0.3 });
    this.noise({ dur: 0.25, freq: 200, gain: 0.6, pos, brown: true, delay: 0.5 });
    this.tone({ freq: 70, freqEnd: 40, dur: 0.3, gain: 0.25, pos, delay: 0.5 });
  }
  sfx_groan(pos) {
    this.tone({ freq: 95, freqEnd: 70, dur: 2.2, type: 'sawtooth', gain: 0.03, pos, attack: 0.5 });
    this.noise({ dur: 2, type: 'bandpass', freq: 300, q: 4, gain: 0.08, pos, attack: 0.5 });
  }
  sfx_bang(pos) {
    this.noise({ dur: 0.5, freq: 250, gain: 0.5, pos, brown: true });
    this.tone({ freq: 140, freqEnd: 90, dur: 0.8, type: 'triangle', gain: 0.05, pos });
  }
  sfx_pipe_knock(pos) {
    for (let i = 0; i < 3; i++) this.tone({ freq: 320, dur: 0.4, type: 'triangle', gain: 0.05, pos, delay: i * 0.3 });
  }
  sfx_steps_above(pos) {
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.15, freq: 180, gain: 0.25, pos, brown: true, delay: i * 0.55 });
  }
  sfx_splash(pos) {
    this.noise({ dur: 0.7, type: 'bandpass', freq: 1200, q: 0.8, gain: 0.35, pos, attack: 0.01 });
    this.noise({ dur: 1.2, freq: 400, gain: 0.2, pos, brown: true, delay: 0.1 });
  }
  sfx_boat_start() {
    this.noise({ dur: 1.5, freq: 300, gain: 0.25, brown: true, attack: 0.2 });
    this.sfx_splash();
  }
  sfx_boat_bump() {
    this.noise({ dur: 0.4, freq: 180, gain: 0.7, brown: true });
    this.tone({ freq: 60, freqEnd: 40, dur: 0.5, gain: 0.3 });
  }
  sfx_tape_in() {
    this.noise({ dur: 0.15, type: 'bandpass', freq: 1200, q: 3, gain: 0.2 });
    this.tone({ freq: 60, dur: 1.2, type: 'sawtooth', gain: 0.02, delay: 0.2, attack: 0.3 });
    this.noise({ dur: 1.5, type: 'highpass', freq: 4000, gain: 0.03, delay: 0.3, attack: 0.3 });
  }
  sfx_tape_out() {
    this.noise({ dur: 0.2, type: 'bandpass', freq: 900, q: 3, gain: 0.2 });
  }
  sfx_tape_glitch() {
    this.noise({ dur: 0.25, type: 'highpass', freq: 2500, gain: 0.08 });
    this.tone({ freq: 15000, dur: 0.2, gain: 0.006 });
  }
  sfx_fork_hum() {
    this.tone({ freq: 440, dur: 1.5, gain: 0.02, attack: 0.2 });
    this.tone({ freq: 443, dur: 1.5, gain: 0.02, attack: 0.2 });
  }
}
