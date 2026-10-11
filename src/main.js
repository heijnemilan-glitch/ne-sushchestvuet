// «НЕ СУЩЕСТВУЕТ» — точка входа. Связывает системы, ведёт игровой цикл, ввод, сохранения.

import * as THREE from 'three';
import { EventBus } from './core/events.js';
import { newSeed } from './core/rng.js';
import { storage } from './core/util.js';
import { WorldMemory } from './systems/memory.js';
import { WorldState } from './systems/worldstate.js';
import { SecretRuleEngine, RULES } from './systems/rules.js';
import { Inventory, ITEMS } from './systems/inventory.js';
import { SaveManager, loadProfile, saveProfile, DEFAULT_SETTINGS } from './systems/save.js';
import { AudioManager } from './systems/audio.js';
import { StoryManager, roomName } from './systems/story.js';
import { PuzzleSystem } from './systems/puzzles.js';
import { Player } from './systems/player.js';
import { InteractionSystem } from './systems/interaction.js';
import { Entities } from './systems/entities.js';
import { makeCode, worldTag } from './systems/codes.js';
import { buildMaterials } from './render/materials.js';
import { LightPool, createFlashlight, Dust } from './render/lights.js';
import { Builder } from './world/builder.js';
import { Level } from './world/level.js';
import { itemModel } from './world/props.js';
import { UI } from './ui/ui.js';
import { PostFX } from './render/post.js';
import { setupEnvironment } from './render/atmos.js';
import { loadModels } from './world/models.js';
import { Monster } from './systems/monster.js';
import { SurvivalSystem } from './systems/survival.js';
import { BoatSystem } from './systems/boat.js';
import { Scares } from './systems/scares.js';
import { LoreSystem } from './systems/lore.js';
import { WeaponSystem } from './systems/weapon.js';
import { WaterBeast } from './systems/waterbeast.js';

const QUALITY = {
  low: { lights: 4, dust: 0, antialias: false, shadows: false, post: false, res: 0.7 },
  medium: { lights: 6, dust: 260, antialias: false, shadows: false, post: true, res: 0.85 },
  high: { lights: 8, dust: 480, antialias: false, shadows: true, post: true, res: 1 },
  ultra: { lights: 10, dust: 800, antialias: false, shadows: true, post: true, res: 1 },
};
const FOG = { color: 0x040505, density: 0.075 };
const AMBIENT = 0.42;
// версия карты: сохранения со старой карты загружаются, но игрок просыпается в изоляторе
const MAP_VERSION = 3;

class Game {
  constructor() {
    this.profile = loadProfile();
    this.settings = this.profile.settings;
    this.saves = new SaveManager();
    this.audio = new AudioManager();
    this.inGame = false;
    this.paused = true;
    this.state = 'menu';
    this.time = 0;
    this.fxDistort = 0;
    this.initRenderer();
    this.ui = new UI(this);
    this.bindInput();
    this.applySettings(false);
    this.ui.showMenu();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.handleBoot();
    // 3D-модели персонажей встроены в файл; после загрузки за меню появляется живой комплекс
    this.models = loadModels()
      .then(() => {
        if (this.state === 'menu' && !this.scene) this.menuWorld();
      })
      .catch((err) => console.error('[models]', err));
  }

  // Фон главного меню: настоящий уровень, камера медленно плывёт по тёмному коридору.
  menuWorld() {
    try {
      this.buildWorld({ memory: WorldMemory.fresh(7), world: WorldState.fresh(), inventory: null, player: { x: 0, y: 0, z: -2, yaw: 0, pitch: 0 } });
      this.menuCam = { t: 0 };
      this.flashlightOn = false;
    } catch (err) {
      console.error('[menu world]', err);
    }
  }

  initRenderer() {
    const q = QUALITY[this.settings.quality] || QUALITY.medium;
    const canvas = document.createElement('canvas');
    canvas.id = 'game';
    document.body.prepend(canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance' });
    } catch (err) {
      document.body.innerHTML = '<div style="color:#ccc;font:16px sans-serif;padding:40px">Не удалось запустить WebGL. Обновите браузер или включите аппаратное ускорение в настройках браузера.</div>';
      throw err;
    }
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.05, 120);
    this.camera.rotation.order = 'YXZ';
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const q = QUALITY[this.settings.quality] || QUALITY.medium;
    const s = Math.min(this.settings.resScale || 1, q.res);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * s);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.setSize(innerWidth, innerHeight, this.renderer.getPixelRatio());
  }

  // ── мир ───────────────────────────────────────────────────────────────────
  disposeWorld() {
    if (!this.scene) return;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (Object.values(this.mats || {}).includes(m)) return;
          if (m.map && m.map.isCanvasTexture && !Object.values(this.mats).some((mm) => mm.map === m.map)) m.map.dispose();
          m.dispose();
        });
      }
    });
    for (const id of [...this.audio.emitters.keys()]) this.audio.removeEmitter(id);
    this.scene = null;
  }

  buildWorld(payload) {
    this.disposeWorld();
    const bus = new EventBus();
    this.bus = bus;
    this.mem = new WorldMemory(bus, payload.memory);
    this.world = new WorldState(bus, payload.world);
    this.inv = new Inventory(bus, payload.inventory);
    if (!this.mats) this.mats = buildMaterials(this.settings.quality, this.renderer.capabilities.getMaxAnisotropy());
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG.color);
    this.scene.fog = new THREE.FogExp2(FOG.color, FOG.density);
    this.hemi = new THREE.HemisphereLight(0x8a969c, 0x1a1816, AMBIENT);
    this.scene.add(this.hemi);
    setupEnvironment(this.renderer, this.scene, this.settings.quality);
    this.builder = new Builder(this.scene, this.mats);
    this.interaction = new InteractionSystem(this);
    this.player = new Player(this, this.camera);
    this.story = new StoryManager(this);
    this.puzzles = new PuzzleSystem(this);
    this.fx = { distort: (s) => (this.fxDistort = Math.max(this.fxDistort, s)) };
    this.entities = null;
    this.level = new Level(this);
    this.entities = new Entities(this);
    this.rules = new SecretRuleEngine({
      mem: this.mem,
      world: this.world,
      bus,
      seed: this.mem.seed,
      observe: (id, text) => this.mem.observe(id, text),
      sound: (name, pos) => this.audio.play(name, pos),
      cue: (name, data) => bus.emit('cue', { name, ...data }),
    });
    this.rules.registerAll(RULES);
    this.monster = new Monster(this);
    this.beast = new WaterBeast(this);
    this.survival = new SurvivalSystem(this);
    this.boat = new BoatSystem(this);
    this.scares = new Scares(this);
    this.lore = new LoreSystem(this);
    const q = QUALITY[this.settings.quality] || QUALITY.medium;
    this.lightPool = new LightPool(this.scene, this.builder.lights, q.lights);
    if (this.flashlight) {
      this.camera.remove(this.flashlight);
      this.camera.remove(this.flashlight.target);
    }
    this.flashlight = createFlashlight(this.camera, this.scene, this.settings.quality);
    this.weapon = new WeaponSystem(this);
    if (!this.post) {
      this.post = new PostFX(this.renderer, this.scene, this.camera, this.settings.quality);
      this.post.setSize(innerWidth, innerHeight, this.renderer.getPixelRatio());
    } else this.post.setScene(this.scene, this.camera);
    this.player.hiddenIn = null;
    this.ui.showLocker(false);
    this.menuCam = null;
    this.flashlightOn = !!payload.flashlightOn;
    this.dust = q.dust ? new Dust(this.scene, q.dust) : null;
    this.currentZone = null;
    this.zoneTimer = 0;
    this.slowTimer = 0;
    this.trailTimer = 0;
    this.autoTimer = 60;
    this.forkTimer = 0;
    this.cullTimer = 0;
    this.lastAutosave = 0;
    this.player.setPose(payload.player);
    this.level.syncEmitters();
    this.wireEvents();
    this.applySettings(false);
    this.scene.updateMatrixWorld(true);
  }

  wireEvents() {
    const bus = this.bus;
    const mem = this.mem;
    bus.on('room:enter', (e) => {
      // маршрутные события для правил
      if (e.prev === 'corridor') {
        if (e.id === 'west') bus.emit('route', { dir: 'left' });
        if (e.id === 'east') bus.emit('route', { dir: 'right' });
        if (e.id === 'hall') bus.emit('route', { dir: 'north' });
        if (e.id === 'start') bus.emit('route', { dir: 'south' });
      }
      if (e.id === 'room07' && e.visits === 1) this.addCode('room_07');
      if (e.id === 'glass' && e.visits === 1) this.addCode('glass_room');
      if (e.id === 'lab' && e.visits === 1) mem.observe('lab', 'Внизу — лаборатория. Белый кафель. Лампы гудят на другой частоте.');
      if (e.id === 'void' && e.visits === 1) this.fx.distort(1);
      if (e.id === 'pump' && e.visits === 1) this.addCode('boat');
      if (e.id === 'sewer' && e.visits === 1) mem.observe('sewer', 'Под котельной — канализация. Пахнет тухлыми яйцами. Где-то в темноте течёт вода и что-то дышит.');
      if (e.id === 'outside' && this.world.get('grateCut')) {
        setTimeout(() => this.state === 'playing' && this.ending('ending_escape'), 3500);
      }
      if (e.id === 'surface' && this.world.get('blastOpen')) {
        setTimeout(() => this.state === 'playing' && this.ending('ending_hunter'), 4000);
      }
      if (e.id === 'workshop' && e.visits === 1) mem.observe('workshop', 'Мастерская. Верстак, тиски, станки. На стене — схема ружья. Здесь кто-то готовился.');
      if (this.mem.data.playTime - this.lastAutosave > 25) this.autosave();
    });
    bus.on('monster:dead', () => this.addCode('monster_killed'));
    // осколок мнемита: вспышка чужого воспоминания
    bus.on('supply:pickup', (e) => {
      if (e.kind !== 'shard') return;
      const n = Math.min(6, this.inv.count('shard'));
      this.fx.distort(0.9);
      this.audio.play('whisper', this.camera.position.clone());
      this.audio.play('chime_far');
      setTimeout(() => this.inGame && this.story.readNote(`n_shard${n}`), 700);
      if (n >= 6) {
        this.addCode('all_shards');
        this.mem.observe('all_shards', 'Все шесть осколков мнемита у меня. Они звенят в унисон. Где-то внизу МНЕМА как будто вздохнула.');
      }
    });
    bus.on('item:pickup', (e) => {
      if (e.id === 'map') setTimeout(() => this.inGame && this.ui.hint('Карта: [M]. На ней отмечено, как отсюда можно выбраться.', 6), 400);
      if (/^tape\d$/.test(e.id) && ['tape1', 'tape2', 'tape3', 'tape4'].every((t) => this.inv.has(t))) this.addCode('all_tapes');
    });
    bus.on('rule:discovered', (e) => {
      this.audio.play('rule');
      this.ui.toast('Журнал: новая догадка');
      this.addCode(e.id);
      this.fx.distort(0.5);
      this.autosave();
    });
    bus.on('journal:observation', () => this.ui.toast('Журнал: наблюдение'));
    bus.on('journal:note', () => this.ui.toast('Журнал: запись'));
    bus.on('puzzle:solved', (e) => {
      if (e.id === 'landing') this.addCode('stairs_landing');
    });
    bus.on('stairs:loop', () => this.audio.play('settle'));
    bus.on('portal:pass', (e) => {
      if (e.id === 'room07' && !mem.seen('portal_07')) this.fx.distort(0.6);
      mem.seeEvent(`portal_${e.id}`);
    });
  }

  addCode(id) {
    if (this.mem.data.codes.some((c) => c.id === id)) return;
    const code = makeCode(id, this.mem.seed);
    if (code) this.mem.data.codes.push({ id, code });
  }

  worldTag() {
    return this.mem ? worldTag(this.mem.seed) : '—';
  }

  // ── игра: новая / продолжить / загрузить ──────────────────────────────────
  async newGame(slot) {
    this.audio.init();
    const seed = newSeed();
    this.slot = slot || '1';
    this.profile.runs = (this.profile.runs || 0) + 1;
    this.saveProfile();
    await this.models;
    this.buildWorld({
      memory: WorldMemory.fresh(seed),
      world: WorldState.fresh(),
      inventory: null,
      player: { x: 0.9, y: 0, z: 4.4, yaw: 0.35, pitch: -0.05 },
    });
    this.startPlaying(true);
    // вступление
    this.paused = true;
    this.audio.play('scream_far');
    await this.ui.cinematic(['1961 год. Под дном водохранилища нашли камень, который помнит.', 'Его назвали мнемит. Грамм дороже золота.', 'Вокруг построили Сектор 0. В 1987-м его затопило.', 'Ты не помнишь, как здесь оказался.', 'В воде и за стенами что-то ходит.'], { hold: 1.4 });
    if (this.state !== 'playing') return;
    this.paused = !!this.ui.modal;
    this.lockPointer();
    setTimeout(() => this.inGame && this.ui.hint('На столе — терминал, фонарь и сложенная карта.', 5), 1500);
  }

  continueGame() {
    const slot = this.saves.lastSlot();
    if (slot) this.loadSlot(slot);
  }

  async loadSlot(slot) {
    this.audio.init();
    await this.models;
    const r = this.saves.load(slot);
    if (!r.ok) {
      this.ui.toast(r.error);
      this.ui.showMenu();
      return;
    }
    const p = r.payload;
    this.slot = p.meta && p.meta.slot ? p.meta.slot : slot === 'auto' ? '1' : slot;
    const oldMap = !p.meta || p.meta.map !== MAP_VERSION;
    if (oldMap) {
      // сохранение со старой карты: координаты больше не совпадают — просыпаемся в изоляторе
      p.player = { x: 0.9, y: 0, z: 4.4, yaw: 0.35, pitch: -0.05 };
      if (p.memory) p.memory.trail = [];
      if (p.world && p.world.vars) {
        delete p.world.vars.monsterCorpse;
        delete p.world.vars.forkCirclePos;
      }
      if (p.world && p.world.items) for (const it of Object.values(p.world.items)) if (it.where === 'world' && it.room) { delete it.x; delete it.y; delete it.z; }
    }
    try {
      this.buildWorld(p);
    } catch (err) {
      console.error(err);
      this.ui.toast('Сохранение несовместимо или повреждено.');
      this.toMenu();
      return;
    }
    this.entities.copy.prepareResidue(p.memory.trail);
    this.startPlaying(false);
    if (r.restored) this.ui.toast('Основное сохранение было повреждено — загружена резервная копия.');
    if (oldMap) this.ui.hint('Комплекс перестроился, пока тебя не было. Ты снова в изоляторе.', 6);
    this.ui.hint(this.mem.data.currentRoom ? roomName(this.mem.data.currentRoom) : '', 2.5);
  }

  startPlaying(fresh) {
    this.inGame = true;
    this.state = 'playing';
    this.ui.modal = null;
    this.ui.el.modal.classList.add('hidden');
    this.ui.hideMenu();
    this.ui.el.ending.classList.add('hidden');
    this.ui.showHUD(true);
    this.ui.setHelp(fresh || this.mem.data.playTime < 240);
    this.ui.fade(true);
    setTimeout(() => this.ui.fade(false), 80);
    this.paused = false;
    this.lockPointer();
    this.updateZone(true);
  }

  autosave() {
    this.lastAutosave = this.mem.data.playTime;
    this.save('auto');
  }

  save(slot) {
    if (!this.inGame || this.state === 'ending') return false;
    const payload = {
      meta: { map: MAP_VERSION, room: this.mem.data.currentRoom, playTime: this.mem.data.playTime, world: this.worldTag(), slot: this.slot },
      memory: this.mem.data,
      world: this.world.data,
      inventory: this.inv.data,
      player: this.player.pose(),
      flashlightOn: this.flashlightOn,
    };
    if (slot === 'auto') {
      this.saves.save(this.slot, JSON.parse(JSON.stringify(payload)));
      return this.saves.save('auto', payload);
    }
    this.slot = slot;
    payload.meta.slot = slot;
    return this.saves.save(slot, payload);
  }

  toMenu() {
    this.inGame = false;
    this.state = 'menu';
    this.paused = true;
    this.examining = null;
    document.exitPointerLock && document.exitPointerLock();
    this.ui.showLockHint(false);
    this.ui.showLocker(false);
    this.audio.setChase(0);
    this.fear = 0;
    this.ui.showMenu();
    this.models.then(() => this.state === 'menu' && this.menuWorld());
  }

  // Загрузка с флагом из прошлой сессии вкладки (например, после перезапуска).
  handleBoot() {
    const boot = storage.get('ns_boot');
    if (boot) storage.remove('ns_boot');
  }

  // ── финалы ────────────────────────────────────────────────────────────────
  ending(id) {
    if (this.state === 'ending') return;
    this.ui.closeModal();
    this.state = 'ending';
    this.paused = true;
    document.exitPointerLock && document.exitPointerLock();
    if (id === 'ending_shutdown') {
      this.world.set('mnemaOff', true);
      this.level.refreshLights();
      this.audio.play('machine_down');
    }
    this.mem.decide('ending', id);
    this.addCode(id);
    if (!this.profile.endings.includes(id)) this.profile.endings.push(id);
    this.saveProfile();
    this.saves.save(this.slot, {
      meta: { map: MAP_VERSION, room: this.mem.data.currentRoom, playTime: this.mem.data.playTime, world: this.worldTag(), slot: this.slot, ending: id },
      memory: this.mem.data,
      world: this.world.data,
      inventory: this.inv.data,
      player: this.player.pose(),
    });
    const data = this.story.endingText(id);
    const code = this.mem.data.codes.find((c) => c.id === id)?.code;
    const mem = this.mem;
    const stats = [
      `Мир № ${this.worldTag()}`,
      `Время в секторе: ${Math.floor(mem.data.playTime / 60)} мин`,
      `Помещений посещено: ${mem.visitedRooms().filter((r) => r !== 'vestibule').length}`,
      `Догадок о правилах: ${mem.discoveredRules().length} из ${this.rules.total}`,
      `Встреч с Наблюдателем: ${mem.get('observer_seen')}`,
      `Найдено исходов: ${this.profile.endings.length} из 7`,
    ];
    this.ui.fade(true);
    setTimeout(() => {
      this.ui.fade(false);
      this.ui.showEnding(data, stats, code);
    }, id === 'ending_shutdown' ? 3500 : 1800);
  }

  // ── ввод ──────────────────────────────────────────────────────────────────
  bindInput() {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.player && this.player.keys.clear());
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.locked || this.paused || this.state !== 'playing' || this.examining || !this.weapon) return;
      this.weapon.fire();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.paused) return;
      if (this.examining) {
        this.examining.rotation.y += e.movementX * 0.01;
        this.examining.rotation.x += e.movementY * 0.01;
        return;
      }
      if (this.player) this.player.look(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.renderer.domElement;
      if (!this.locked && this.state === 'playing' && !this.ui.modal && !this.examining) {
        // Esc в браузере снимает захват мыши — показываем паузу
        this.ui.showPause();
      }
      this.ui.showLockHint(!this.locked && this.state === 'playing' && !this.ui.modal && !this.examining);
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.state === 'playing' && !this.ui.modal) this.ui.showLockHint(true);
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.ui.modal) this.lockPointer();
    });
  }

  lockPointer() {
    const el = this.renderer.domElement;
    try {
      const p = el.requestPointerLock && el.requestPointerLock();
      if (p && p.catch) p.catch(() => this.ui.showLockHint(true));
    } catch {
      this.ui.showLockHint(true);
    }
    this.ui.showLockHint(false);
  }

  onKey(e, down) {
    const ui = this.ui;
    if (ui.capturing && down) {
      e.preventDefault();
      ui.capturing(e.code);
      return;
    }
    const k = this.settings.keys;
    if (e.code === 'Tab') e.preventDefault();
    if (this.state === 'cinematic') {
      if (down && (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter')) this.lore.skip();
      return;
    }
    if (this.state !== 'playing') return;
    if (!down) {
      this.player.keys.delete(e.code);
      return;
    }
    // модальные окна
    if (ui.modal) {
      if (e.code === 'Escape') ui.closeModal();
      else if (ui.modal === 'inventory' && (e.code === k.inventory || e.code === 'KeyI')) ui.closeModal();
      else if (ui.modal === 'inventory' && e.code === k.drop && ui.invSelected && ui.invSelected !== 'flashlight') this.dropItem(ui.invSelected);
      else if (ui.modal === 'journal' && e.code === k.journal) ui.closeModal();
      else if (ui.modal === 'map' && e.code === k.map) ui.closeModal();
      else if (ui.modal === 'note' && (e.code === k.interact || e.code === 'Enter' || e.code === 'Space')) ui.closeModal();
      else if (ui.modal === 'keypad' && ui.keypadInput) {
        if (/^(Digit|Numpad)\d$/.test(e.code)) ui.keypadInput(e.code.slice(-1));
        else if (e.code === 'Backspace') ui.keypadInput('C');
        else if (e.code === 'Enter' || e.code === 'NumpadEnter') ui.keypadInput('OK');
      } else if (ui.modal === 'terminal' || ui.modal === 'choice') {
        const m = /^(Digit|Numpad)(\d)$/.exec(e.code);
        if (ui.modal === 'terminal' && ui.termTyping && (e.code === 'Space' || e.code === 'Enter' || e.code === k.interact)) ui.termSkip = true;
        else if (m && ui.modal === 'terminal' && ui.termScreen) ui.termChoose(ui.termScreen, +m[2] - 1);
        else if (m && ui.modal === 'choice') {
          const o = ui.choiceOptions[+m[2] - 1];
          ui.closeModal();
          if (o) o.run();
        }
      }
      return;
    }
    if (this.examining) {
      if (e.code === 'Escape' || e.code === k.interact) this.endExamine();
      return;
    }
    if (e.code === 'Escape') {
      ui.showPause();
      return;
    }
    if (e.repeat) return;
    this.player.keys.add(e.code);
    if (this.player.hiddenIn) {
      if (e.code === k.interact) this.toggleHide(this.player.hiddenIn);
      return;
    }
    if (e.code === k.flashlight) return this.toggleFlashlight();
    if (e.code === k.map) return this.inv.has('map') ? ui.showMap() : ui.hint('Карты нет. Кажется, она лежала на столе в изоляторе.');
    if (e.code === k.mask) return this.survival.toggleMask();
    if (e.code === k.reload) return this.survival.swapBattery();
    if (this.survival.busy || this.boat.riding) return;
    if (e.code === k.crouch) this.player.crouchToggle = !this.player.crouchToggle;
    else if (e.code === k.stim) this.survival.useStim();
    else if (e.code === k.throw) this.survival.throwBottle();
    else if (e.code === k.interact) this.interaction.interact();
    else if (e.code === k.inventory || e.code === 'KeyI') ui.showInventory();
    else if (e.code === k.journal) ui.showJournal('notes');
    else if (e.code === k.drop) this.quickDrop();
    else if (e.code === k.screenshot) this.pendingShot = true;
  }

  // Снимок кадра без интерфейса — сразу после отрисовки, пока буфер не очищен.
  takeShot() {
    this.pendingShot = false;
    try {
      this.renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        a.download = `ne-sushchestvuet-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        this.audio.play('click');
        this.ui.toast('Снимок сохранён в «Загрузки». Выложите его на сайте в «Моменты».');
        this.mem.count('screenshots');
      }, 'image/jpeg', 0.9);
    } catch (err) {
      console.warn('[shot]', err);
      this.ui.toast('Не удалось сделать снимок.');
    }
  }

  onModal(open) {
    this.paused = open || this.state !== 'playing';
    if (open) {
      if (this.player) this.player.keys.clear();
      if (document.pointerLockElement) document.exitPointerLock();
      this.ui.showLockHint(false);
      this.ui.setPrompt(null);
    } else if (this.state === 'playing') {
      this.lockPointer();
    }
  }

  toggleFlashlight() {
    if (!this.inv.has('flashlight')) {
      this.ui.hint('Фонаря нет.');
      return;
    }
    this.flashlightOn = !this.flashlightOn;
    this.audio.play('flashlight');
  }

  // ── предметы: осмотр и «положить» ─────────────────────────────────────────
  examine(item) {
    if (item === 'map') return this.ui.showMap();
    this.ui.closeModal();
    const model = itemModel(ITEMS[item].model, this.mats);
    model.scale.setScalar(item === 'fork' || item === 'paper' ? 2.2 : 2.6);
    model.position.set(0, -0.02, -0.5);
    model.rotation.set(0.5, 0.6, 0);
    this.camera.add(model);
    this.examining = model;
    this.examineItem = item;
    this.ui.showExamine(item);
    this.ui.setPrompt(null);
    this.paused = false;
    this.lockPointer();
  }

  endExamine() {
    if (!this.examining) return;
    this.camera.remove(this.examining);
    this.examining = null;
    this.ui.showExamine(null);
    this.ui.showInventory(this.examineItem);
  }

  quickDrop() {
    if (this.inv.has('fork')) this.dropItem('fork');
    else this.ui.hint('Нечего положить. Предмет можно выбрать в инвентаре.');
  }

  dropItem(item) {
    if (!item || item === 'flashlight' || !this.inv.has(item)) return;
    const p = this.player.pos;
    const f = this.player.forward();
    f.y = 0;
    f.normalize();
    let x = p.x + f.x * 0.7;
    let z = p.z + f.z * 0.7;
    // не класть внутрь стены
    for (const c of this.builder.near(x - 0.2, z - 0.2, x + 0.2, z + 0.2)) {
      if (c.enabled && c.tag !== 'prop' && x > c.x0 - 0.15 && x < c.x1 + 0.15 && z > c.z0 - 0.15 && z < c.z1 + 0.15 && c.y0 < p.y + 1 && c.y1 > p.y) {
        x = p.x;
        z = p.z;
      }
    }
    const g = this.builder.groundAt(x, z, p.y + 0.3);
    const y = (g ? g.h : p.y) + 0.005;
    this.inv.remove(item);
    const room = this.mem.data.currentRoom;
    this.world.setItem(item, { where: 'world', x, y, z, ry: this.player.yaw, room });
    this.audio.play(item === 'fork' ? 'drop' : 'click', new THREE.Vector3(x, y, z));
    this.mem.count(`drop_${item}`);
    this.bus.emit('item:drop', { id: item, room });
    if (this.ui.modal === 'inventory') this.ui.closeModal();
    this.ui.hint(`${ITEMS[item].name} оставлен здесь.`, 2.5);
  }

  // ── настройки ─────────────────────────────────────────────────────────────
  applySettings(persist = true) {
    const s = this.settings;
    this.audio.setVolumes({ master: s.master, ambient: s.ambient, sfx: s.sfx });
    this.resize();
    const q = QUALITY[s.quality] || QUALITY.medium;
    if (this.lightPool && this.lightPool.lights.length !== q.lights) this.lightPool.setCount(q.lights);
    if (this.flashlight) {
      this.flashlight.castShadow = q.shadows;
      this.flashlight.shadow.mapSize.set(s.quality === 'ultra' ? 2048 : 1024, s.quality === 'ultra' ? 2048 : 1024);
    }
    this.renderer.shadowMap.enabled = q.shadows;
    if (this.post) {
      this.post.enabled = q.post;
      this.post.setQuality(s.quality);
      this.post.bloom.strength = s.quality === 'ultra' ? 0.85 : s.quality === 'high' ? 0.75 : 0.6;
    }
    if (this.scene) {
      setupEnvironment(this.renderer, this.scene, s.quality);
      if (q.dust && !this.dust) this.dust = new Dust(this.scene, q.dust);
      if (this.dust) this.dust.setVisible(!!q.dust);
    }
    if (this.ui && this.state === 'playing') this.ui.setHelp(this.mem && this.mem.data.playTime < 240);
    if (persist) this.saveProfile();
  }

  resetSettings() {
    Object.assign(this.settings, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
    this.applySettings();
  }

  saveProfile() {
    saveProfile(this.profile);
  }

  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch {
      this.ui.toast('Полноэкранный режим недоступен. Попробуйте F11.');
    }
  }

  // ── кадр ──────────────────────────────────────────────────────────────────
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.scene) {
      this.renderer.setClearColor(0x000000);
      this.renderer.clear();
      return;
    }
    try {
      if (this.state === 'playing' && !this.paused) this.update(dt);
      else if (this.state === 'caught') this.updateCaught(dt);
      else if (this.state === 'cinematic') {
        this.time += dt;
        this.lore.update(dt);
      }
      else if (this.state === 'ending') this.level.update(dt * 0.3, (this.time += dt));
      else if (this.state === 'menu' && this.menuCam) this.updateMenu(dt);
    } catch (err) {
      console.error('[game] ошибка в кадре:', err);
    }
    if (this.post && this.post.enabled) {
      this.post.fear = this.fear || 0;
      this.post.distort = this.fxDistort || 0;
      this.post.draw(this.time);
    } else this.renderer.render(this.scene, this.camera);
    if (this.pendingShot) this.takeShot();
  }

  // Камера в главном меню медленно идёт по коридору; лампы мерцают, впереди — темнота.
  updateMenu(dt) {
    this.time += dt;
    const c = this.menuCam;
    c.t += dt;
    const x = -13 + ((c.t * 0.32) % 26);
    this.player.setPose({ x, y: 0, z: -1.6 + Math.sin(c.t * 0.2) * 0.2, yaw: -0.25 + Math.sin(c.t * 0.11) * 0.35, pitch: -0.12 + Math.sin(c.t * 0.3) * 0.03 });
    this.player.applyCamera(dt);
    this.level.cull(this.player.pos);
    this.lightPool.update(dt, this.player.pos, this.time);
    this.level.horror.update(dt);
    if (this.dust) this.dust.update(dt, this.camera.position, this.time);
    this.fear = 0.15 + Math.max(0, Math.sin(c.t * 0.5)) * 0.1;
  }

  // ── шкафчики ──────────────────────────────────────────────────────────────
  // Залезть/вылезти: дверца открывается на петле, камера плавно заходит внутрь, дверца закрывается.
  toggleHide(locker) {
    const p = this.player;
    if (this.lockerAnim) return;
    this.audio.play('locker');
    // скример: из одного шкафчика вываливается труп
    if (!p.hiddenIn && locker.corpse && !this.world.get('corpseFell')) {
      this.world.set('corpseFell', true);
      this.lockerAnim = { t: 0, dur: 0.5, locker, mode: 'corpse' };
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.2, 6, 10), new THREE.MeshStandardMaterial({ color: 0x2a2c2a, roughness: 0.6 }));
      body.position.copy(locker.inside).add(new THREE.Vector3(0, 0.95, 0));
      body.rotation.y = locker.yaw;
      this.scene.add(body);
      this.lockerAnim.body = body;
      this.audio.play('stinger');
      this.audio.play('body_drop', locker.front.clone());
      this.fx.distort(0.8);
      this.mem.observe('corpse', 'Из шкафчика на меня вывалилось тело. Холодное. На бирке — «Испытуемый». Без номера.');
      return;
    }
    if (p.hiddenIn) {
      const l = p.hiddenIn;
      this.lockerAnim = { t: 0, dur: 0.55, locker: l, mode: 'out', from: p.pos.clone() };
      return;
    }
    if (this.player.crouchToggle) this.player.crouchToggle = false;
    this.lockerAnim = { t: 0, dur: 0.65, locker, mode: 'in', from: p.pos.clone(), fromYaw: p.yaw };
    p.hiddenIn = locker;
    locker.animating = true;
    this.flashlightOn = false;
    this.mem.count('hid');
    if (this.mem.get('hid') === 1) this.mem.observe('hid', 'Я спрятался в шкафчик. Сквозь щели видно коридор. Дыхание кажется слишком громким.');
  }

  updateLockerAnim(dt) {
    const a = this.lockerAnim;
    const p = this.player;
    const l = a.locker;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    const swing = Math.sin(k * Math.PI); // дверца: открылась и закрылась
    if (a.mode === 'corpse') {
      l.hinge.rotation.y = -1.9 * Math.min(1, k * 3);
      const fall = Math.min(1, k * 1.6);
      a.body.position.lerpVectors(l.inside.clone().add(new THREE.Vector3(0, 0.95, 0)), l.front.clone().add(new THREE.Vector3(0, 0.25, 0)), fall);
      a.body.rotation.set(0, l.yaw, 0);
      a.body.rotateX(-fall * Math.PI / 2);
      if (k >= 1) {
        this.lockerAnim = null;
        setTimeout(() => (l.hinge.rotation.y = -1.2), 100);
      }
      return;
    }
    l.hinge.rotation.y = -1.6 * swing;
    if (a.mode === 'in') {
      const e = k * k * (3 - 2 * k);
      p.pos.lerpVectors(a.from, l.inside, e);
      let dy = l.yaw - a.fromYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.yaw = a.fromYaw + dy * e;
      p.pitch *= 0.85;
      p.applyCamera(dt);
      if (k > 0.75) this.ui.showLocker(true);
      if (k >= 1) {
        l.animating = false;
        l.hinge.rotation.y = 0;
        this.lockerAnim = null;
      }
    } else {
      const e = k * k * (3 - 2 * k);
      p.pos.lerpVectors(a.from, l.front, e);
      p.applyCamera(dt);
      if (k > 0.2) this.ui.showLocker(false);
      if (k >= 1) {
        p.hiddenIn = null;
        l.hinge.rotation.y = 0;
        this.lockerAnim = null;
      }
    }
  }

  // ── поимка ────────────────────────────────────────────────────────────────
  onCaught(monster, pulledOut) {
    if (this.state !== 'playing') return;
    this.state = 'caught';
    this.caught = { t: 0, monster, pulledOut, done: false };
    this.player.keys.clear();
    if (this.player.hiddenIn) {
      this.player.hiddenIn.animating = false;
      this.player.hiddenIn.hinge.rotation.y = -1.7; // дверцу распахнули
      this.player.hiddenIn = null;
      this.lockerAnim = null;
      this.ui.showLocker(false);
    }
    if (this.boat.riding) this.boat.abort();
    this.audio.play('catch');
    this.audio.setChase(0);
    this.ui.setPrompt(null);
    this.mem.count('deaths');
  }

  // Удар током: белые вспышки, судороги, падение — и пробуждение в изоляторе.
  shock() {
    if (this.state !== 'playing') return;
    this.state = 'caught';
    this.caught = { t: 0, shock: true, done: false };
    this.player.keys.clear();
    if (this.boat.riding) this.boat.abort();
    this.audio.play('electrocute');
    this.audio.setChase(0);
    this.ui.setPrompt(null);
    this.mem.count('deaths');
    this.mem.count('shocked');
    this.mem.observe('shocked', 'Вода под током. Меня било, пока тело не перестало слушаться. Я помню голубой свет — и запах палёного.');
  }

  // Утопленник утащил под воду: зелёная муть, камеру тянет вниз, всплеск — пробуждение в изоляторе.
  drown(beast) {
    if (this.state !== 'playing') return;
    this.state = 'caught';
    this.caught = { t: 0, drown: true, done: false, beast };
    this.player.keys.clear();
    this.audio.play('splash');
    this.audio.play('screech');
    this.audio.setChase(0);
    this.ui.setPrompt(null);
    this.mem.count('deaths');
    this.mem.count('drowned');
    this.mem.observe('drowned', 'Руки из воды схватили меня через перила. Холод. Темнота. Пузыри поднимались вверх, а я — нет.');
  }

  updateDrown(dt) {
    const c = this.caught;
    const ov = document.getElementById('drown-ov');
    if (ov) ov.style.opacity = c.done ? '0' : String(Math.min(1, c.t / 1.2) * 0.92);
    const b = c.beast;
    if (b) {
      const want = Math.atan2(-(b.pos.x - this.player.pos.x), -(b.pos.z - this.player.pos.z));
      let d = want - this.player.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.player.yaw += d * Math.min(1, dt * 10);
    }
    this.player.pitch += (-0.9 - this.player.pitch) * Math.min(1, dt * 2.5);
    this.player.pos.y += (-1.4 - this.player.pos.y) * Math.min(1, dt * 1.6);
    this.player.roll = Math.sin(c.t * 9) * 0.05;
    this.player.applyCamera(dt);
    this.fear = c.done ? Math.max(0, this.fear - dt) : 1;
    this.lightPool.update(dt, this.player.pos, this.time);
    if (c.t > 1.9 && !c.done) {
      c.done = true;
      this.ui.fade(true);
      setTimeout(async () => {
        if (ov) ov.style.opacity = '0';
        await this.ui.cinematic(['ВОДА.', 'Чьи-то руки держали тебя, пока ты не перестал считать.', 'Не стой у края.'], { hold: 1.0 });
        this.respawn();
      }, 600);
    }
  }

  updateShock(dt) {
    const c = this.caught;
    const ov = document.getElementById('shock-ov');
    const flick = Math.sin(c.t * 47) * Math.sin(c.t * 13.3) > 0.2 ? 1 : 0.15;
    if (ov) ov.style.opacity = c.done ? '0' : String(Math.max(0, 1 - c.t / 1.9) * 0.85 * flick);
    this.player.roll = c.done ? 0 : Math.sin(c.t * 61) * 0.06 * Math.max(0, 1.6 - c.t);
    this.player.pitch += (-1.1 - this.player.pitch) * Math.min(1, dt * 1.5);
    this.player.pos.y += (-0.9 - this.player.pos.y) * Math.min(1, dt * 1.2);
    this.player.applyCamera(dt);
    this.fear = c.done ? Math.max(0, this.fear - dt) : 0.8;
    this.lightPool.update(dt, this.player.pos, this.time);
    if (c.t > 1.8 && !c.done) {
      c.done = true;
      if (ov) ov.style.opacity = '0';
      this.ui.fade(true);
      setTimeout(async () => {
        await this.ui.cinematic(['ТОК.', 'Вода держала тебя, пока ты не перестал дёргаться.'], { hold: 1.0, red: false });
        this.respawn();
      }, 600);
    }
  }

  updateCaught(dt) {
    const c = this.caught;
    if (c.shock || c.drown) {
      c.t += dt;
      this.time += dt;
      return c.drown ? this.updateDrown(dt) : this.updateShock(dt);
    }
    c.t += dt;
    this.time += dt;
    const m = c.monster;
    // камеру резко разворачивает к нему, он — вплотную
    const eye = this.camera.position;
    const head = new THREE.Vector3(m.pos.x, 1.95, m.pos.z);
    const want = Math.atan2(-(head.x - eye.x), -(head.z - eye.z));
    let d = want - this.player.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.player.yaw += d * Math.min(1, dt * 14);
    this.player.pitch += (Math.atan2(head.y - eye.y, Math.hypot(head.x - eye.x, head.z - eye.z)) - this.player.pitch) * Math.min(1, dt * 10);
    const toP = new THREE.Vector3(this.player.pos.x - m.pos.x, 0, this.player.pos.z - m.pos.z);
    if (toP.length() > 0.75) m.pos.addScaledVector(toP.normalize(), dt * 3);
    m.yaw = Math.atan2(this.player.pos.x - m.pos.x, this.player.pos.z - m.pos.z);
    m.play('run', 1.6);
    m.after(dt);
    this.player.roll = Math.sin(c.t * 40) * 0.03 * Math.max(0, 1 - c.t);
    this.player.applyCamera(dt);
    this.fear = c.done ? Math.max(0, this.fear - dt) : 1;
    if (this.post) this.post.hit = c.done ? Math.max(0, this.post.hit - dt * 2) : Math.min(1, c.t * 2);
    this.lightPool.update(dt, this.player.pos, this.time);
    if (c.t > 1.3 && !c.done) {
      c.done = true;
      this.ui.fade(true);
      const deaths = this.mem.get('deaths');
      const lines = deaths === 1 ? ['ОНО ПОМНИТ ТЕБЯ'] : deaths === 2 ? ['ОНО ПОМНИТ ТЕБЯ', 'ВТОРОЙ РАЗ'] : ['ОНО ПОМНИТ ТЕБЯ', `${deaths}-Й РАЗ`, 'Ты тоже начинаешь помнить'];
      setTimeout(async () => {
        if (this.post) this.post.hit = 0;
        await this.ui.cinematic(lines, { hold: 1.2, red: true });
        this.respawn();
      }, 700);
    }
  }

  // Возвращение в комнату пробуждения. Предметы остаются; мир помнит смерть.
  respawn() {
    if (this.state !== 'caught') return;
    this.player.setPose({ x: 0.9, y: 0, z: 4.4, yaw: 0.35, pitch: -0.05 });
    this.player.roll = 0;
    for (const id of ['shock-ov', 'drown-ov']) {
      const ov = document.getElementById(id);
      if (ov) ov.style.opacity = '0';
    }
    this.monster.retreat();
    this.fear = 0;
    if (this.post) this.post.hit = 0;
    this.state = 'playing';
    this.paused = !!this.ui.modal;
    this.ui.fade(false);
    this.updateZone(true);
    const d = this.mem.get('deaths');
    this.mem.observe(`death_${Math.min(d, 3)}`, d === 1 ? 'Я проснулся в той же комнате. Шея болит. Я помню его лицо — и не помню, было ли у него лицо.' : d === 2 ? 'Снова здесь. Комната та же. Нет — кровать сдвинута. Это я её сдвинул?' : 'Сколько раз я уже просыпался здесь? Кажется, комплекс считает лучше меня.');
    this.lockPointer();
    this.autosave();
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    const moving = !this.survival.busy && !this.boat.riding && !this.lockerAnim && !this.weapon.busy;
    const active = !this.examining && moving;
    if (this.lockerAnim) this.updateLockerAnim(dt);
    else if (moving) this.player.update(dt, active);
    this.survival.update(dt);
    this.boat.update(dt);
    this.weapon.update(dt);
    // страховка: если игрок как-то оказался в воде резервуара — вытащить на мостки
    {
      const pp = this.player.pos;
      if (this.state === 'playing' && pp.y < -0.9 && pp.y > -6 && pp.x > -18 && pp.x < 18 && pp.z > -34 && pp.z < 0) {
        this.player.setPose({ x: Math.max(-12, Math.min(12, pp.x)), y: 0, z: -1.8, yaw: Math.PI, pitch: 0 });
        this.audio.play('splash');
        this.ui.hint('Ты выбрался из воды на мостки. Холодно.', 3);
      }
    }
    if (this.state !== 'playing') return;
    this.level.update(dt, t);
    this.updateZone(false);
    this.mem.tick(dt);
    this.entities.update(dt);
    this.monster.update(dt);
    this.beast.update(dt);
    this.scares.update(dt);
    if (this.state !== 'playing') return; // поймали в этом кадре
    this.puzzles.update(dt);
    // страх: сердцебиение, музыка погони, искажения кадра
    this.fear = this.monster.fear;
    this.audio.setChase(this.monster.state === 'chase' ? 1 : 0);
    this.heartTimer = (this.heartTimer || 0) - dt;
    if (this.fear > 0.18 && this.heartTimer <= 0) {
      this.heartTimer = 1.15 - this.fear * 0.7;
      this.audio.play('heartbeat');
    }
    // шёпот в темноте, если долго стоять без света
    this.whisperTimer = (this.whisperTimer ?? 30) - dt;
    if (this.whisperTimer <= 0) {
      this.whisperTimer = 25 + Math.random() * 35;
      if (!this.flashlightOn && this.monster.state !== 'dormant') {
        const a = Math.random() * Math.PI * 2;
        this.audio.play('whisper', new THREE.Vector3(this.player.pos.x + Math.cos(a) * 2, 1.6, this.player.pos.z + Math.sin(a) * 2));
      }
    }
    if (active) this.interaction.update();
    else this.ui.setPrompt(null);
    // фонарь
    const fl = this.flashlightOn && this.inv.has('flashlight');
    let target = fl ? 58 : 0;
    // в узкой шахте стены в полуметре — полный луч засвечивает всё в белое
    if (this.currentZone && this.currentZone.crouch) target *= 0.22;
    // вплотную к стене или столу луч не должен засвечивать всё в белое
    if (this.weapon.wallD < 2.6) target *= 0.3 + (this.weapon.wallD / 2.6) * 0.7;
    // вплотную к существу — тоже приглушить, иначе бледная кожа засвечивается в белое пятно
    {
      const cp = this.camera.position;
      const near = [this.monster.mesh.visible ? this.monster.pos : null, this.beast.mesh.visible && this.beast.y > -1.6 ? this.beast.pos : null];
      for (const c of near) {
        if (!c) continue;
        const d = Math.hypot(cp.x - c.x, cp.z - c.z);
        if (d < 4) target *= 0.15 + (d / 4) * 0.85;
      }
    }
    // севшая батарейка: фонарь тускнеет и мигает
    const bat = this.survival.battery;
    if (fl && bat < 20) target *= 0.35 + (bat / 20) * 0.65 * (Math.sin(t * 17) * Math.sin(t * 5.3) > 0.6 ? 0.15 : 1);
    this.flashlight.intensity += (target - this.flashlight.intensity) * Math.min(1, dt * 18);
    if (this.examining && !fl) this.flashlight.intensity = 6;
    this.lightPool.update(dt, this.player.pos, t);
    if (this.dust) this.dust.update(dt, this.camera.position, t);
    this.audio.updateListener(this.camera);
    // визуальные искажения (редкие, при важных событиях)
    if (this.fxDistort > 0) {
      this.fxDistort = Math.max(0, this.fxDistort - dt * 0.6);
      this.ui.distort(this.fxDistort * 0.8);
      this.player.extraFov = Math.sin(t * 20) * this.fxDistort * 2;
      this.player.roll = Math.sin(t * 7) * this.fxDistort * 0.01;
    } else if (this.player.extraFov) {
      this.player.extraFov = 0;
      this.player.roll = 0;
      this.ui.distort(0);
    }
    // медленные проверки
    this.slowTimer -= dt;
    if (this.slowTimer <= 0) {
      this.slowTimer = 1;
      this.bus.emit('tick:slow', { dt: 1 });
      this.forkCheck();
      if (this.mem.data.playTime > 240) this.ui.setHelp(false);
    }
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.5;
      const p = this.player.pos;
      this.mem.pushTrail({ t: +this.mem.data.playTime.toFixed(1), x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
    }
    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.25;
      this.level.cull(this.player.pos);
    }
    this.autoTimer -= dt;
    if (this.autoTimer <= 0) {
      this.autoTimer = 90;
      this.autosave();
    }
    // плавная смена тумана
    const zf = (this.currentZone && this.currentZone.fog) || FOG;
    const fog = this.scene.fog;
    fog.density += (zf.density - fog.density) * Math.min(1, dt * 1.5);
    this._fogColor = this._fogColor || new THREE.Color();
    this._fogColor.setHex(zf.color);
    fog.color.lerp(this._fogColor, Math.min(1, dt * 1.5));
    this.scene.background.copy(fog.color);
    const cz = this.currentZone;
    // в больших залах — мягкий рассеянный свет (в резервуаре он гаснет вместе с линией 2)
    const amb = cz && cz.id === 'void' ? 1.4 : cz && cz.ambient ? (cz.id === 'corridor' && !this.level.cableLive() ? 0.6 : cz.ambient) : AMBIENT;
    this.hemi.intensity += (amb - this.hemi.intensity) * Math.min(1, dt);
  }

  updateZone(force) {
    const p = this.player.pos;
    const z = this.builder.zoneAt(p.x, p.y + 0.9, p.z);
    if (!z || (z === this.currentZone && !force)) return;
    const prevMem = this.currentZone && this.currentZone.memoryId;
    this.currentZone = z;
    if (this.lightPool) {
      this.lightPool.zoneId = z.id;
      this.lightPool.timer = 0;
    }
    this.audio.setZone(z.ambience, force);
    if (force && this.mem.data.currentRoom === z.memoryId) return;
    if (prevMem !== z.memoryId || force) {
      this.mem.enterRoom(z.memoryId);
      const r = this.mem.room(z.memoryId);
      const transit = ['corridor', 'west', 'east', 'vestibule', 'elevator', 'stairs'].includes(z.memoryId);
      if (!transit || r.visits === 1) this.ui.area(roomName(z.memoryId));
    }
  }

  // Камертон гудит рядом с нераскрытыми пустотами (звуковая подсказка).
  forkCheck() {
    if (!this.inv.has('fork')) return;
    this.forkTimer -= 1;
    const p = this.player.pos;
    for (const e of this.level.emitterDefs) {
      if (e.type !== 'secret' || !e.when()) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < 6 && Math.abs(e.pos.y - p.y - 1) < 3) {
        if (this.forkTimer <= 0) {
          this.forkTimer = 5;
          this.audio.play('fork_hum');
          if (this.mem.observe('fork_hum', 'Рядом с некоторыми стенами камертон в кармане начинает гудеть сам.')) this.ui.hint('Камертон в кармане тихо гудит.');
        }
        return;
      }
    }
  }
}

// Отладочный доступ для автотестов (без влияния на игру).
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.NS = new Game();
  } catch (err) {
    console.error(err);
  }
});
