/* =============================================================
 * 纸片幸存者 · Paper Survivors（P1 垂直切片）
 * -------------------------------------------------------------
 * 核心循环：自动攻击 → 捡经验 → 升级三选一 → 波次变强
 *           → 45/90/135 秒精英 → 180 秒 Boss → 击杀通关
 *
 * 单文件 Canvas 2D，无引擎、无素材，蜡笔手绘风。
 * 结构：
 *   1. 常量 / 工具
 *   2. 画布与自适应
 *   3. 手绘基元（复用元气地牢那套）
 *   4. 输入（键盘 / 触屏摇杆）
 *   5. 游戏状态与更新
 *   6. 渲染（世界 / HUD / 覆盖层）
 *   7. 主循环
 * ============================================================= */
(() => {
'use strict';

// =============================================================
// 1. 常量 / 工具
// =============================================================
const LANDSCAPE_VW = 640;
const LANDSCAPE_VH = 360;
const PORTRAIT_VW = 360;
let VW = LANDSCAPE_VW;
let VH = LANDSCAPE_VH;
let portraitLayout = false;
const STEP = 1 / 60;
const WORLD = { w: 3000, h: 2000 };
const TILE_P = 256;

const COL = {
  paper: '#fdf6e4',
  ink: '#3a3026',
  inkSoft: '#8a7a66',
  red: '#d94f3d',
  blue: '#4a90d9',
  green: '#5aa83c',
  gold: '#f2b134',
  goldDark: '#c98a1e',
  purple: '#8b5fc0',
  inkPurple: '#3f294f',
  inkPurpleMid: '#664477',
  inkPurpleHi: '#9a6bb2',
  moss: '#718d3a',
  mossLight: '#a9bd62',
  coral: '#d95c48',
  ochre: '#e6aa32',
  orange: '#e07b2a',
  pink: '#e87fa8',
  skin: '#ffd9a0',
  white: '#fffdf8',
  dark: '#2f2a24',
};

const FONT = '"Chalkboard SE","Comic Sans MS","Marker Felt","Bradley Hand","HanziPen SC","Yuanti SC","PingFang SC","Microsoft YaHei",sans-serif';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TAU = Math.PI * 2;

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

// =============================================================
// 2. 画布
// =============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const nameEditor = document.getElementById('name-editor');
const nameForm = document.getElementById('name-card');
const nameInput = document.getElementById('nickname-input');
const nameCancel = document.getElementById('name-cancel');
const rotateAction = document.getElementById('rotate-action');
const fullscreenBtn = document.getElementById('fullscreen-btn');
let scale = 1;

const NICKNAME_KEY = 'paper-survivors.nickname';
const MUSIC_KEY = 'paper-survivors.music-enabled';
const PREVIEW_MAP_ID = new URLSearchParams(window.location.search).get('map');
const AUTO_START = new URLSearchParams(window.location.search).get('autostart') === '1';
const BACKGROUND_PREVIEW = new URLSearchParams(window.location.search).get('background') === '1';
const FORCE_BOSS_PREVIEW = new URLSearchParams(window.location.search).get('boss') === '1';
const FORCE_BOSS_INTRO_PREVIEW = new URLSearchParams(window.location.search).get('bossIntro') === '1';
const FORCE_WEAPON_PREVIEW = new URLSearchParams(window.location.search).get('weapon');
const FORCE_WEAPON_LEVEL = clamp(Number(new URLSearchParams(window.location.search).get('weaponLevel')) || 1, 1, 6);
const FORCE_LEVELUP_PREVIEW = new URLSearchParams(window.location.search).get('levelup') === '1';
const FORCE_ENCHANT_PREVIEW = (new URLSearchParams(window.location.search).get('ench') || '').split(',').filter(Boolean);
const FORCE_ELITE_PREVIEW = new URLSearchParams(window.location.search).get('elite');
const FORCE_CLUSTER_PREVIEW = new URLSearchParams(window.location.search).get('cluster') === '1';
const FORCED_MENU_SEASON = new URLSearchParams(window.location.search).get('season');
const MENU_SCENE_ID = new URLSearchParams(window.location.search).get('menuScene');
let activeMenuSceneId = MENU_SCENE_ID;
const FORCE_STORY_PREVIEW = new URLSearchParams(window.location.search).get('story');

function loadLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function saveLocal(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* 隐私模式下忽略 */ }
}

const menuInteraction = {
  pointerX: LANDSCAPE_VW / 2,
  pointerY: LANDSCAPE_VH / 2,
  focusX: LANDSCAPE_VW / 2,
  focusY: LANDSCAPE_VH / 2,
  lockUntil: 0,
  clicks: [],
};

const MENU_SEASONS = [
  { id: 'spring', image: 'assets/menu-seasons/spring-child.png' },
  { id: 'summer', image: 'assets/menu-seasons/summer-child.png' },
  { id: 'autumn', image: 'assets/menu-seasons/autumn-child.png' },
  { id: 'winter', image: 'assets/menu-seasons/winter-child.png' },
];
const MENU_SEASONS_ENABLED = false;
const menuSeasonImages = {};
for (const season of MENU_SEASONS_ENABLED ? MENU_SEASONS : []) {
  const image = new Image();
  image.src = season.image;
  menuSeasonImages[season.id] = image;
}
let menuSeasonIndex = -1;
let menuSeasonSeed = 1;

function rerollMenuSeason(requested) {
  const forced = requested || FORCED_MENU_SEASON;
  const forcedIndex = MENU_SEASONS.findIndex((season) => season.id === forced);
  let next = forcedIndex;
  if (next < 0) {
    next = Math.floor(Math.random() * MENU_SEASONS.length);
    if (next === menuSeasonIndex) next = (next + 1 + Math.floor(Math.random() * (MENU_SEASONS.length - 1))) % MENU_SEASONS.length;
  }
  menuSeasonIndex = next;
  menuSeasonSeed = (Math.random() * 0xffffffff) >>> 0;
}

function currentMenuSeason() {
  return MENU_SEASONS[Math.max(0, menuSeasonIndex)];
}

rerollMenuSeason();

function updateMenuPointer(p) {
  menuInteraction.pointerX = p.x;
  menuInteraction.pointerY = p.y;
  if (performance.now() >= menuInteraction.lockUntil) {
    menuInteraction.focusX = p.x;
    menuInteraction.focusY = p.y;
  }
}

function reactToMenuClick(p) {
  const now = performance.now();
  menuInteraction.pointerX = p.x;
  menuInteraction.pointerY = p.y;
  menuInteraction.focusX = p.x;
  menuInteraction.focusY = p.y;
  menuInteraction.lockUntil = now + 950;
  menuInteraction.clicks.push({ x: p.x, y: p.y, born: now, seed: Math.random() * 1000 });
  if (menuInteraction.clicks.length > 5) menuInteraction.clicks.shift();
}

let playerName = loadLocal(NICKNAME_KEY, '艾志恒');
let editingName = false;

function cleanNickname(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  return Array.from(name || '艾志恒').slice(0, 12).join('');
}

function openNameEditor() {
  editingName = true;
  nameInput.value = playerName;
  nameEditor.hidden = false;
  requestAnimationFrame(() => { nameInput.focus(); nameInput.select(); });
}

function closeNameEditor() {
  editingName = false;
  nameEditor.hidden = true;
  canvas.focus();
}

nameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  playerName = cleanNickname(nameInput.value);
  saveLocal(NICKNAME_KEY, playerName);
  closeNameEditor();
});
nameCancel.addEventListener('click', closeNameEditor);
nameEditor.addEventListener('pointerdown', (e) => {
  if (e.target === nameEditor) closeNameEditor();
});
nameEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeNameEditor();
  }
});

const GAME_MUSIC_MELODY = [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 81, 79, 74, 77, 79, 76];
const GAME_MUSIC_BASS = [48, 48, 53, 55];

// 原创首页主题：70 BPM 的千禧年华语 R&B 情歌氛围。
// 和弦、旋律均为本项目原创，不对现有歌曲做采样或复刻。
const MENU_MUSIC_CHORDS = [
  [40, 52, 55, 59, 66], // Em9
  [36, 48, 52, 55, 59], // Cmaj7
  [47, 55, 59, 62, 69], // Gadd9/B
  [45, 50, 54, 57, 64], // D6/A
  [45, 57, 60, 64, 67], // Am7
  [47, 54, 59, 64, 66], // B7sus4
  [36, 48, 52, 55, 59], // Cmaj7
  [35, 47, 51, 57, 62], // B7(b9)
];
const MENU_MUSIC_LEAD = [
  null, 71, null, null, 74, null, 71, null,
  null, 67, null, 69, null, null, 71, null,
  null, 74, null, 76, null, 74, null, 71,
  null, null, 69, null, 67, null, null, null,
  null, 71, null, 74, null, null, 76, null,
  null, 74, null, 71, null, 69, null, null,
  null, 67, null, 69, null, 71, null, 67,
  null, null, 66, null, 63, null, 66, null,
];
const MENU_GUITAR_PATTERN = [1, 3, 2, 4, 2, 3, 1, 3];

// 本地预览可放置用户已授权的首页曲目。缺失或加载失败时自动回退到上面的原创合成主题。
const MenuTrack = {
  src: 'local-audio/menu-theme.mp3',
  audio: null,
  available: false,
  enabled: true,
  fadeFrame: 0,
  menuVolume: 0.48,

  init() {
    if (this.audio) return;
    const audio = new Audio(this.src);
    audio.id = 'menu-theme-audio';
    audio.hidden = true;
    audio.loop = true;
    audio.preload = 'metadata';
    audio.volume = 0;
    audio.addEventListener('loadeddata', () => { this.available = true; }, { once: true });
    audio.addEventListener('error', () => { this.available = false; });
    document.body.appendChild(audio);
    this.audio = audio;
  },

  unlock(enabled) {
    this.enabled = !!enabled;
    this.init();
    if (this.enabled && state === 'menu') this.toMenu();
  },

  setEnabled(value) {
    this.enabled = !!value;
    if (!this.enabled) this.fadeTo(0, 180, true);
    else if (state === 'menu') this.toMenu();
  },

  toMenu() {
    if (!this.enabled) return;
    this.init();
    this.fadeTo(this.menuVolume, 900, false);
  },

  toGame() {
    if (!this.audio) return;
    this.fadeTo(0, 1900, true);
  },

  fadeTo(target, duration, pauseAtEnd) {
    if (!this.audio) return;
    if (this.fadeFrame) cancelAnimationFrame(this.fadeFrame);
    const audio = this.audio;
    const from = audio.volume;
    const started = performance.now();
    if (target > 0) {
      const play = audio.play();
      if (play && play.then) {
        play.then(() => { this.available = true; }).catch(() => { this.available = false; });
      }
    }
    const step = (now) => {
      const p = clamp((now - started) / Math.max(1, duration), 0, 1);
      const eased = p * p * (3 - 2 * p);
      audio.volume = clamp(from + (target - from) * eased, 0, 1);
      if (p < 1) this.fadeFrame = requestAnimationFrame(step);
      else {
        this.fadeFrame = 0;
        if (pauseAtEnd && target === 0) audio.pause();
      }
    };
    this.fadeFrame = requestAnimationFrame(step);
  },
};

const Music = {
  ctx: null,
  master: null,
  fxMaster: null,
  menuBus: null,
  menuDelay: null,
  menuFeedback: null,
  menuWet: null,
  lastFx: {},
  timer: null,
  nextTime: 0,
  step: 0,
  scene: '',
  enabled: loadLocal(MUSIC_KEY, '1') !== '0',

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) { this.enabled = false; return; }
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.13;
      this.master.connect(this.ctx.destination);
      this.menuBus = this.ctx.createGain();
      this.menuBus.gain.value = 1;
      this.menuDelay = this.ctx.createDelay(1);
      this.menuDelay.delayTime.value = 0.27;
      this.menuFeedback = this.ctx.createGain();
      this.menuFeedback.gain.value = 0.16;
      this.menuWet = this.ctx.createGain();
      this.menuWet.gain.value = 0.22;
      this.menuBus.connect(this.master);
      this.menuBus.connect(this.menuDelay);
      this.menuDelay.connect(this.menuWet);
      this.menuWet.connect(this.master);
      this.menuDelay.connect(this.menuFeedback);
      this.menuFeedback.connect(this.menuDelay);
      this.fxMaster = this.ctx.createGain();
      this.fxMaster.gain.value = 0.24;
      this.fxMaster.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    MenuTrack.unlock(this.enabled);
    if (this.enabled) this.start();
  },

  start() {
    if (!this.ctx || this.timer || !this.enabled) return;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.tick(), 100);
  },

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
  },

  setEnabled(value) {
    this.enabled = !!value;
    saveLocal(MUSIC_KEY, this.enabled ? '1' : '0');
    MenuTrack.setEnabled(this.enabled);
    if (this.enabled) { this.unlock(); this.start(); }
    else this.stop();
  },

  toggle() { this.setEnabled(!this.enabled); },

  note(midi, when, duration, type, volume) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  },

  softNote(midi, when, duration, volume, brightness) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    filter.type = 'lowpass';
    filter.frequency.value = brightness || 1500;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.035);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.00012, volume * 0.38), when + Math.min(0.32, duration * 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.menuBus || this.master);
    osc.start(when);
    osc.stop(when + duration + 0.04);
  },

  pluckNote(midi, when, duration, volume) {
    if (!this.ctx || !this.master) return;
    const body = this.ctx.createOscillator();
    const air = this.ctx.createOscillator();
    const airGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    body.type = 'triangle';
    body.frequency.value = freq;
    air.type = 'sine';
    air.frequency.value = freq * 2;
    air.detune.value = 3;
    airGain.gain.value = 0.12;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, when);
    filter.frequency.exponentialRampToValueAtTime(720, when + Math.min(0.42, duration * 0.7));
    filter.Q.value = 0.85;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.00012, volume * 0.18), when + Math.min(0.24, duration * 0.45));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    body.connect(filter);
    air.connect(airGain);
    airGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.menuBus || this.master);
    body.start(when);
    air.start(when);
    body.stop(when + duration + 0.03);
    air.stop(when + duration + 0.03);
  },

  menuHit(when, kind) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (kind === 'kick') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(78, when);
      osc.frequency.exponentialRampToValueAtTime(43, when + 0.14);
      gain.gain.setValueAtTime(0.017, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.17);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1180, when);
      osc.frequency.exponentialRampToValueAtTime(720, when + 0.055);
      gain.gain.setValueAtTime(0.0055, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.065);
    }
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + 0.19);
  },

  scheduleMenuStep(when, eighth) {
    const step = this.step % 64;
    const chord = MENU_MUSIC_CHORDS[Math.floor(step / 8) % MENU_MUSIC_CHORDS.length];
    if (step % 8 === 0) {
      this.pluckNote(chord[0], when, eighth * 3.4, 0.052);
      for (let i = 1; i < chord.length; i++) {
        this.softNote(chord[i], when + i * 0.022, eighth * 7.4, 0.0095, 900 + i * 115);
      }
      this.menuHit(when, 'kick');
    }

    const swing = step % 2 ? 0.038 : 0;
    const guitarNote = chord[MENU_GUITAR_PATTERN[step % 8]];
    this.pluckNote(guitarNote, when + swing, eighth * 1.55, step % 4 === 0 ? 0.046 : 0.036);
    if (step % 8 === 4) this.menuHit(when + 0.02, 'rim');
    if (step % 8 === 6) this.pluckNote(chord[0] + 12, when + 0.03, eighth * 0.82, 0.022);

    const lead = MENU_MUSIC_LEAD[step];
    if (lead != null) this.softNote(lead, when + 0.025, eighth * 2.35, 0.041, 2050);
    if (step % 16 === 14) this.pluckNote(chord[3] + 12, when + 0.04, eighth * 0.9, 0.015);
  },

  scheduleGameStep(when, eighth) {
    const i = this.step % GAME_MUSIC_MELODY.length;
    if (this.step % 2 === 0) this.note(GAME_MUSIC_MELODY[i], when, eighth * 1.45, 'triangle', 0.13);
    if (this.step % 4 === 0) {
      const root = GAME_MUSIC_BASS[Math.floor(this.step / 4) % GAME_MUSIC_BASS.length];
      this.note(root, when, eighth * 2.8, 'sine', 0.11);
    }
    if (this.step % 8 === 6) this.note(GAME_MUSIC_MELODY[i] + 12, when, eighth * 0.75, 'sine', 0.05);
  },

  fxTone(freq, when, duration, type, volume, endFreq) {
    if (!this.ctx || !this.fxMaster) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, when);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), when + duration);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(this.fxMaster);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  },

  effect(name) {
    if (!this.ctx || !this.fxMaster || document.hidden) return;
    const now = this.ctx.currentTime;
    const cooldown = { shoot: 0.08, melee: 0.12, hit: 0.055, crit: 0.08, boom: 0.12, pickup: 0.055, hurt: 0.25 }[name] || 0.04;
    if (now - (this.lastFx[name] || 0) < cooldown) return;
    this.lastFx[name] = now;
    if (name === 'shoot') this.fxTone(720, now, 0.055, 'triangle', 0.055, 520);
    else if (name === 'melee') this.fxTone(210, now, 0.09, 'sawtooth', 0.045, 110);
    else if (name === 'hit') this.fxTone(135, now, 0.045, 'square', 0.025, 85);
    else if (name === 'crit') {
      this.fxTone(920, now, 0.08, 'triangle', 0.06, 1320);
      this.fxTone(1380, now + 0.035, 0.11, 'sine', 0.04, 1760);
    }
    else if (name === 'boom') {
      this.fxTone(92, now, 0.16, 'square', 0.07, 45);
      this.fxTone(260, now + 0.025, 0.08, 'sawtooth', 0.035, 80);
    }
    else if (name === 'pickup') {
      this.fxTone(760, now, 0.07, 'sine', 0.04, 980);
      this.fxTone(1040, now + 0.045, 0.07, 'sine', 0.026, 1240);
    } else if (name === 'level') {
      this.fxTone(523, now, 0.16, 'triangle', 0.05, 659);
      this.fxTone(659, now + 0.11, 0.16, 'triangle', 0.05, 784);
      this.fxTone(784, now + 0.22, 0.24, 'triangle', 0.055, 1047);
    } else if (name === 'select') this.fxTone(660, now, 0.12, 'triangle', 0.045, 880);
    else if (name === 'hurt') this.fxTone(150, now, 0.16, 'sawtooth', 0.06, 70);
    else if (name === 'boss') {
      this.fxTone(110, now, 0.45, 'square', 0.055, 74);
      this.fxTone(165, now + 0.08, 0.52, 'sawtooth', 0.035, 82);
    } else if (name === 'win') {
      this.fxTone(523, now, 0.2, 'triangle', 0.05, 659);
      this.fxTone(659, now + 0.16, 0.2, 'triangle', 0.05, 784);
      this.fxTone(784, now + 0.32, 0.38, 'triangle', 0.06, 1047);
    }
  },

  tick() {
    if (!this.ctx || !this.enabled) return;
    const quiet = state === 'paused' || editingName || document.hidden;
    const nextScene = state === 'menu' ? 'menu' : 'game';
    if (this.scene !== nextScene) {
      this.scene = nextScene;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.04;
    }
    const externalMenu = nextScene === 'menu' && MenuTrack.available;
    const target = quiet ? 0.035 : (externalMenu ? 0.0001 : (nextScene === 'menu' ? 0.09 : (state === 'dead' ? 0.065 : 0.13)));
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
    const eighth = (60 / (nextScene === 'menu' ? 70 : 116)) / 2;
    while (this.nextTime < this.ctx.currentTime + 0.28) {
      if (nextScene === 'menu' && !externalMenu) this.scheduleMenuStep(this.nextTime, eighth);
      else this.scheduleGameStep(this.nextTime, eighth);
      this.step = (this.step + 1) % 64;
      this.nextTime += eighth;
    }
  },
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = window.visualViewport;
  const bodyStyle = getComputedStyle(document.body);
  const insetX = (parseFloat(bodyStyle.paddingLeft) || 0) + (parseFloat(bodyStyle.paddingRight) || 0);
  const insetY = (parseFloat(bodyStyle.paddingTop) || 0) + (parseFloat(bodyStyle.paddingBottom) || 0);
  const viewW = Math.max(1, (viewport ? viewport.width : window.innerWidth) - insetX);
  const viewH = Math.max(1, (viewport ? viewport.height : window.innerHeight) - insetY);
  const nextPortrait = viewH > viewW * 1.08 && viewW <= 820;
  portraitLayout = nextPortrait;
  VW = nextPortrait ? PORTRAIT_VW : LANDSCAPE_VW;
  VH = nextPortrait ? clamp(Math.round(PORTRAIT_VW * viewH / viewW), 560, 780) : LANDSCAPE_VH;
  updateLayoutRects();
  const fit = Math.min(viewW / VW, viewH / VH);
  const cssW = Math.max(1, Math.floor(VW * fit));
  const cssH = Math.max(1, Math.floor(VH * fit));
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const s = Math.max(1, Math.round(fit * dpr));
  canvas.width = VW * s;
  canvas.height = VH * s;
  scale = s;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

async function requestGameFullscreen() {
  try {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      const request = root.requestFullscreen || root.webkitRequestFullscreen;
      if (request) await request.call(root);
    }
  } catch (_) { /* 某些移动浏览器不支持页面全屏，保持普通竖屏继续游戏 */ }
  setTimeout(resize, 120);
}
if (rotateAction) rotateAction.addEventListener('click', requestGameFullscreen);
if (fullscreenBtn) fullscreenBtn.addEventListener('click', requestGameFullscreen);
document.addEventListener('fullscreenchange', resize);

function toLogical(ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - r.left) / Math.max(1, r.width)) * VW,
    y: ((ev.clientY - r.top) / Math.max(1, r.height)) * VH,
  };
}

// =============================================================
// 3. 手绘基元
// =============================================================
let RD = makeRng(1);
function wob(amt) { return (RD() - 0.5) * 2 * amt; }

function withInkSeed(seed, draw) {
  const previous = RD;
  RD = makeRng(seed >>> 0);
  try { draw(); } finally { RD = previous; }
}

function polyPath(g, pts, close) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0] + wob(1.1);
    const y = pts[i][1] + wob(1.1);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  if (close !== false) g.closePath();
}

function fillPoly(g, pts, color) {
  if (!color) return;
  polyPath(g, pts, true);
  g.fillStyle = color;
  g.fill();
}

function strokePoly(g, pts, color, lw) {
  if (!color) return;
  polyPath(g, pts, true);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.stroke();
}

function roughCircle(g, cx, cy, r, fill, stroke, lw, segs) {
  const n = segs || Math.max(9, Math.min(20, Math.round(r * 1.5)));
  const pts = [];
  const a0 = wob(0.5);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * TAU * 1.04;
    const rr = r * (1 + wob(0.05));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  fillPoly(g, pts, fill);
  strokePoly(g, pts, stroke, lw);
}

function roughEllipse(g, cx, cy, rx, ry, fill, stroke, lw, segs) {
  const n = segs || 12;
  const pts = [];
  const a0 = wob(0.4);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * TAU * 1.03;
    pts.push([cx + Math.cos(a) * rx * (1 + wob(0.05)), cy + Math.sin(a) * ry * (1 + wob(0.05))]);
  }
  fillPoly(g, pts, fill);
  strokePoly(g, pts, stroke, lw);
}

function roughBox(g, x, y, w, h, fill, stroke, lw) {
  const o = 2;
  const pts = [
    [x - o, y - o], [x + w * 0.5, y - 1.2], [x + w + o, y - o],
    [x + w + 1.2, y + h * 0.5],
    [x + w + o, y + h + o], [x + w * 0.5, y + h + 1.2], [x - o, y + h + o],
    [x - 1.2, y + h * 0.5],
  ];
  fillPoly(g, pts, fill);
  strokePoly(g, pts, stroke, lw);
}

function roughLine(g, x1, y1, x2, y2, color, lw) {
  const pts = [[x1, y1], [(x1 + x2) / 2 + wob(1.5), (y1 + y2) / 2 + wob(1.5)], [x2, y2]];
  polyPath(g, pts, false);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.stroke();
}

function doodleHeart(g, x, y, s, fill, stroke, lw) {
  g.beginPath();
  g.moveTo(x, y + s * 0.95);
  g.bezierCurveTo(x - s * 1.25, y - s * 0.15, x - s * 0.7, y - s * 1.05, x, y - s * 0.3);
  g.bezierCurveTo(x + s * 0.7, y - s * 1.05, x + s * 1.25, y - s * 0.15, x, y + s * 0.95);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

function doodleStar(g, x, y, r, color, lw) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  strokePoly(g, pts, color, lw);
}

function text(str, x, y, size, color, align, bold, rot) {
  ctx.save();
  if (rot) { ctx.translate(x, y); ctx.rotate(rot); x = 0; y = 0; }
  ctx.font = (bold ? '700 ' : '400 ') + size + 'px ' + FONT;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(str, x, y);
  ctx.restore();
}

function tint(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  const r = Math.round(((n >> 16) & 255) * (1 - t) + mix * t);
  const g = Math.round(((n >> 8) & 255) * (1 - t) + mix * t);
  const b = Math.round((n & 255) * (1 - t) + mix * t);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function measure(str, size, bold) {
  ctx.font = (bold ? '700 ' : '400 ') + size + 'px ' + FONT;
  return ctx.measureText(str).width;
}

// ---- 纸张 ----
const paperTiles = {};
function getPaperTile(map) {
  map = map || MAPS[0];
  if (paperTiles[map.id]) return paperTiles[map.id];
  const c = document.createElement('canvas');
  c.width = TILE_P;
  c.height = TILE_P;
  const g = c.getContext('2d');
  g.fillStyle = map.ground;
  g.fillRect(0, 0, TILE_P, TILE_P);
  const R = makeRng(mapSeed(map.id) ^ 0x7f4a7c15);
  for (let i = 0; i < 1200; i++) {
    const alpha = 0.025 + R() * 0.055;
    const fiber = map.id === 'snow' ? '116,157,176' : (map.id === 'volcano' || map.id === 'inferno' || map.id === 'crimson' ? '210,168,136' : '122,96,62');
    g.fillStyle = 'rgba(' + fiber + ',' + alpha.toFixed(3) + ')';
    g.fillRect(R() * TILE_P, R() * TILE_P, 1 + R() * 1.5, R() < 0.82 ? 1 : 2.5);
  }
  for (let i = 0; i < 95; i++) {
    const x = R() * TILE_P;
    const y = R() * TILE_P;
    const len = 8 + R() * 34;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len * 0.45, y + (R() - 0.5) * 5, x + len, y + (R() - 0.5) * 4);
    g.strokeStyle = tint(map.grain, 0.045 + R() * 0.09);
    g.lineWidth = 1 + R() * 3.5;
    g.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const x = 10 + R() * (TILE_P - 20);
    const y = 10 + R() * (TILE_P - 20);
    g.strokeStyle = tint(map.doodle, 0.18 + R() * 0.1);
    g.lineWidth = 1 + R();
    g.beginPath();
    if (map.id === 'volcano' || map.id === 'inferno' || map.id === 'crimson') {
      g.moveTo(x - 5, y - 2); g.lineTo(x, y + 2); g.lineTo(x + 5, y - 4);
    } else if (map.id === 'snow') {
      g.moveTo(x - 5, y); g.lineTo(x + 5, y);
      g.moveTo(x, y - 5); g.lineTo(x, y + 5);
      g.moveTo(x - 3.5, y - 3.5); g.lineTo(x + 3.5, y + 3.5);
      g.moveTo(x + 3.5, y - 3.5); g.lineTo(x - 3.5, y + 3.5);
    } else if (map.id === 'ocean') {
      g.arc(x, y, 4 + R() * 6, 0.2, Math.PI * 0.95);
    } else if (map.id === 'waste' || map.id === 'desert') {
      g.moveTo(x - 7, y); g.quadraticCurveTo(x, y - 3, x + 7, y);
    } else {
      g.moveTo(x, y + 5); g.lineTo(x - 2, y - 3);
      g.moveTo(x, y + 4); g.lineTo(x + 4, y - 2);
    }
    g.stroke();
  }
  if (map.id === 'volcano' || map.id === 'inferno' || map.id === 'crimson') {
    for (let i = 0; i < 9; i++) {
      const x = R() * TILE_P;
      const y = R() * TILE_P;
      const pts = [[x - 10, y - 5], [x - 3, y + 1], [x + 2, y - 3], [x + 11, y + 6]];
      polyPath(g, pts, false);
      g.strokeStyle = 'rgba(35,24,26,0.7)';
      g.lineWidth = 4;
      g.stroke();
      polyPath(g, pts, false);
      g.strokeStyle = map.id === 'crimson' ? 'rgba(228,70,94,0.55)' : (map.id === 'inferno' ? 'rgba(235,71,62,0.45)' : 'rgba(240,112,43,0.5)');
      g.lineWidth = 1.6;
      g.stroke();
    }
  }
  if (map.id === 'heaven') {
    for (let i = 0; i < 9; i++) {
      const x = R() * TILE_P;
      const y = R() * TILE_P;
      g.beginPath();
      g.ellipse(x, y, 24 + R() * 34, 7 + R() * 10, -0.12 + R() * 0.24, 0, TAU);
      g.fillStyle = 'rgba(244,250,252,' + (0.12 + R() * 0.16).toFixed(2) + ')';
      g.fill();
    }
    for (let i = 0; i < 7; i++) {
      const x = R() * TILE_P;
      const y = R() * TILE_P;
      g.beginPath();
      g.moveTo(x - 13, y);
      g.quadraticCurveTo(x, y - 8, x + 13, y);
      g.strokeStyle = 'rgba(200,157,55,' + (0.1 + R() * 0.1).toFixed(2) + ')';
      g.lineWidth = 1.2;
      g.stroke();
      fillPoly(g, [[x, y - 3], [x + 3, y], [x, y + 3], [x - 3, y]], 'rgba(218,174,62,0.14)');
    }
  } else if (map.id === 'inferno') {
    for (let i = 0; i < 10; i++) {
      const x = R() * TILE_P;
      const y = R() * TILE_P;
      const sigil = [[x - 7, y + 5], [x - 2, y - 6], [x + 2, y + 1], [x + 7, y - 7]];
      polyPath(g, sigil, false);
      g.strokeStyle = i % 2 ? 'rgba(198,59,91,0.22)' : 'rgba(106,34,69,0.25)';
      g.lineWidth = 1.2;
      g.stroke();
    }
  } else if (map.id === 'four') {
    for (let i = 0; i < 8; i++) {
      const x = R() * TILE_P;
      const y = R() * TILE_P;
      const pts = [[x - 14, y - 4], [x - 5, y + 1], [x, y - 5], [x + 6, y + 3], [x + 15, y - 2]];
      polyPath(g, pts, false);
      g.strokeStyle = i % 2 ? 'rgba(171,74,92,0.22)' : 'rgba(112,130,164,0.2)';
      g.lineWidth = 1.5 + R();
      g.stroke();
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = 20 + R() * (TILE_P - 40);
    const y = 20 + R() * (TILE_P - 40);
    const k = i % 3;
    const dc = tint(map.doodle, 0.14);
    if (k === 0) doodleStar(g, x, y, 3 + R() * 2, dc, 1);
    else if (k === 1) doodleHeart(g, x, y, 3, null, dc, 1);
    else {
      g.beginPath();
      g.arc(x, y, 2.5 + R() * 2, 0.2, 4.7);
      g.strokeStyle = dc;
      g.lineWidth = 1;
      g.stroke();
    }
  }
  paperTiles[map.id] = c;
  return c;
}

// =============================================================
// 4. 输入
// =============================================================
const Input = {
  keys: new Set(),
  stick: null,
  touch: navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches,
  pointers: new Map(),
  pointer: { x: VW / 2, y: VH / 2, down: false },
  paused: false,
};

window.addEventListener('keydown', (e) => {
  Music.unlock();
  if (editingName) return;
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (!Input.keys.has(k)) {
    Input.keys.add(k);
    if (k === 'm') Music.toggle();
    else if (state === 'menu') {
      if (suspendedRun) resumeSuspendedRun();
      else startGame(runMode);
    }
    else if (state === 'story') continueStory();
    else if (state === 'dead' || state === 'win') startGame(runMode);
    else if (state === 'levelup' && ['1', '2', '3'].includes(k)) chooseCard(Number(k) - 1);
    else if (k === 'p' || k === 'escape') togglePause();
  }
});
window.addEventListener('keyup', (e) => Input.keys.delete(e.key.toLowerCase()));

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  Music.unlock();
  const p = toLogical(e);
  Input.pointer.x = p.x;
  Input.pointer.y = p.y;
  Input.pointer.down = true;

  if (state === 'story') {
    continueStory();
    return;
  }

  if (state === 'menu' || state === 'dead' || state === 'win') {
    if (state === 'menu') {
      reactToMenuClick(p);
      if (inside(p, nameBtn)) { openNameEditor(); return; }
      if (inside(p, musicBtn)) { Music.toggle(); return; }
      for (let i = 0; i < 2; i++) {
        if (inside(p, modeBtn(i))) { runMode = MODE_KEYS[i]; return; }
      }
      for (let i = 0; i < 3; i++) {
        if (inside(p, diffBtn(i))) { difficulty = DIFF_KEYS[i]; return; }
      }
      if (inside(p, startBtn)) {
        if (suspendedRun) resumeSuspendedRun();
        else startGame(runMode);
        return;
      }
      if (suspendedRun && inside(p, restartBtn)) { startGame(runMode); return; }
      return;
    }
    startGame(runMode);
    return;
  }
  if (state === 'levelup') {
    for (let i = 0; i < cards.length; i++) {
      const r = cardRect(i);
      if (inside(p, r)) { chooseCard(i); return; }
    }
    return;
  }
  if (state === 'play') {
    if (insidePad(p, pauseBtn, e.pointerType === 'touch' ? 12 : 0)) { togglePause(); return; }
    if (e.pointerType === 'touch') {
      Input.touch = true;
      if (p.x < VW * 0.55 && !Input.stick) {
        Input.stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
        Input.pointers.set(e.pointerId, 'move');
      }
      return;
    }
  } else if (state === 'paused') {
    if (inside(p, pauseContinueBtn)) { togglePause(); return; }
    if (inside(p, pauseHomeBtn)) { returnToMenu(); return; }
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = toLogical(e);
  Input.pointer.x = p.x;
  Input.pointer.y = p.y;
  if (state === 'menu') updateMenuPointer(p);
  if (Input.pointers.get(e.pointerId) === 'move' && Input.stick) {
    Input.stick.x = p.x;
    Input.stick.y = p.y;
  }
});

function endPointer(e) {
  if (Input.pointers.get(e.pointerId) === 'move') {
    Input.stick = null;
    Input.pointers.delete(e.pointerId);
  }
  Input.pointer.down = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => { if (state === 'play') state = 'paused'; });

function inside(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function insidePad(p, r, pad) {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

// =============================================================
// 5. 游戏状态
// =============================================================
const BOSS_TIME = 120;
const KILL_QUOTA = 90;
const MAPS = [
  { id: 'forest',  name: '森林',     ground: '#f3dfb7', grain: '#cda96d', doodle: '#6f8d3b', boss: '刻耳柏洛斯',   mech: 'bush',    interval: 0,  mechDesc: '灌木丛减速怪物' },
  { id: 'waste',   name: '荒漠',     ground: '#edc986', grain: '#c9874e', doodle: '#a9673e', boss: '弥诺陶洛斯',   mech: 'tumble',  interval: 5,  mechDesc: '风滚草滚过战场' },
  { id: 'desert',  name: '沙漠',     ground: '#f4d79a', grain: '#d99845', doodle: '#bd722f', boss: '斯芬克斯',     mech: 'zone',    interval: 7,  mechDesc: '烈日灼烧圈' },
  { id: 'swamp',   name: '沼泽',     ground: '#c7c695', grain: '#7f8d5b', doodle: '#526d3b', boss: '海德拉',       mech: 'mire',    interval: 0,  mechDesc: '泥潭减速怪物' },
  { id: 'ocean',   name: '海洋',     ground: '#cae0dc', grain: '#74aeb2', doodle: '#4e8fa2', boss: '斯库拉',       mech: 'tide',    interval: 6,  mechDesc: '浪潮横扫' },
  { id: 'volcano', name: '火山',     ground: '#4d4447', grain: '#2d292f', doodle: '#e26432', boss: '提丰',         mech: 'zone',    interval: 5,  mechDesc: '熔岩喷发' },
  { id: 'inferno', name: '炼狱',     ground: '#2b202d', grain: '#140f19', doodle: '#c63b5b', boss: '厄喀德那',     mech: 'rain',    interval: 5,  mechDesc: '火雨' },
  { id: 'heaven',  name: '天宫',     ground: '#b7d4e3', grain: '#739eb8', doodle: '#c89d37', boss: '库克罗普斯',   mech: 'bolt',    interval: 6,  mechDesc: '天雷劈怪' },
  { id: 'four',    name: '风林火山', ground: '#4a454f', grain: '#2d2d38', doodle: '#b44352', boss: '卡俄斯',       mech: 'four',    interval: 10, mechDesc: '四象轮转' },
  { id: 'snow',    name: '雪山',     ground: '#dce9ec', grain: '#9fbac5', doodle: '#628ea5', boss: '芬里尔',       mech: 'blizzard', interval: 7, mechDesc: '暴风雪横扫' },
  { id: 'crimson', name: '猩红之地', ground: '#3b2029', grain: '#21151c', doodle: '#d34b5f', boss: '阿瑞斯',       mech: 'bloodmoon', interval: 6, mechDesc: '猩红月蚀落印' },
];

function rerollMenuScene() {
  if (MENU_SCENE_ID && MAPS.some((map) => map.id === MENU_SCENE_ID)) {
    activeMenuSceneId = MENU_SCENE_ID;
    return;
  }
  const choices = MAPS.filter((map) => map.id !== activeMenuSceneId);
  activeMenuSceneId = (choices[Math.floor(Math.random() * choices.length)] || MAPS[0]).id;
}

function currentMenuScene() {
  return MAPS.find((map) => map.id === activeMenuSceneId) || MAPS[0];
}

rerollMenuScene();

const BOSS_TITLES = {
  forest: '冥门三首守卫',
  waste: '迷宫牛首',
  desert: '沙海谜狮',
  swamp: '不死九首蛇',
  ocean: '深潮六首女妖',
  volcano: '万蛇风暴之父',
  inferno: '怪物之母',
  heaven: '独眼神匠',
  four: '原初混沌',
  snow: '神链末日巨狼',
  crimson: '猩红战神',
};

const BOSS_OBJECTIVES = {
  forest: '夺回母亲留下的第一枚页印',
  waste: '沿着红线穿过无尽迷宫',
  desert: '解开母亲藏在日轮中的谜语',
  swamp: '从毒雾中找回守页人的药笺',
  ocean: '取回漂流瓶里的求救信',
  volcano: '找到母亲折断的装订针',
  inferno: '确认母亲仍被囚禁在战书中',
  heaven: '夺取打开混沌门的星铁钥匙',
  four: '让十一枚纸印重新指向母亲',
  snow: '取得能够割断神链的狼牙',
  crimson: '击败阿瑞斯，救出母亲',
};

const STORY_PROLOGUE = {
  chapter: '序章',
  title: '母亲留下的第一支铅笔',
  lines: [
    '母亲是纸境最后的守页人。猩红战书撕开夜空时，',
    '她为了护住你，被阿瑞斯的战使带进了破碎书页。',
    '她只留下十一枚折纸星。你握紧铅笔，踏上寻母之路。',
  ],
  clue: '目标：沿着折纸星，找回母亲',
};

const CHAPTER_STORIES = [
  { chapter: '第一章 · 森林篇', title: '荆棘门后的纸鹤', lines: ['刻耳柏洛斯倒下后，一只纸鹤从荆棘门里飞出。', '母亲写道：“别追我的脚印，追被撕走的书页。”', '纸鹤的翅根，藏着第一枚通往荒漠的页印。'], clue: '获得：第一枚页印 · 母亲的纸鹤' },
  { chapter: '第二章 · 荒漠篇', title: '迷宫里的红线', lines: ['弥诺陶洛斯守着一团不会断裂的红线。', '那是母亲装订故事时用过的线，她故意把它留在岔路口。', '红线指向沙漠，也证明她一直在为你留下回家的路。'], clue: '获得：守页红线 · 第二枚页印' },
  { chapter: '第三章 · 沙漠篇', title: '斯芬克斯的最后一道谜', lines: ['斯芬克斯问：“一个孩子为什么不肯回头？”', '你回答：“因为母亲还在前方等他。”日轮随之裂开。', '第三枚页印落下，背面刻着母亲熟悉的字迹。'], clue: '获得：日轮谜印 · 母亲的字迹' },
  { chapter: '第四章 · 沼泽篇', title: '毒雾中的药笺', lines: ['海德拉的毒雾散去，水面浮起一张防水药笺。', '小时候每次受伤，母亲都照着这张方子替你包扎。', '药笺末尾写着：“别怕疼，我还活着。”'], clue: '获得：守页药笺 · 母亲仍然活着' },
  { chapter: '第五章 · 海洋篇', title: '漂流瓶里的求救信', lines: ['斯库拉沉入深潮，一只漂流瓶被浪推到你的脚边。', '母亲说，阿瑞斯逼她修补一部会让战争永续的战书。', '她正在暗中撕掉书页，但留给你们的时间已经不多。'], clue: '真相：母亲被迫修复猩红战书' },
  { chapter: '第六章 · 火山篇', title: '折断的装订针', lines: ['提丰的熔岩巢中，插着母亲折断的银色装订针。', '她曾用这根针刺穿战书的书脊，让阿瑞斯的力量泄漏。', '针尖仍指向炼狱——那是战书关押灵魂的夹层。'], clue: '获得：断针 · 战书出现裂口' },
  { chapter: '第七章 · 炼狱篇', title: '书页夹层里的回声', lines: ['厄喀德那被击退后，焦黑书页里传来母亲的声音。', '“我能听见你的脚步。不要停，也不要被愤怒吞掉。”', '她把第七枚页印推过裂缝，自己却被拖向天宫。'], clue: '获得：回声页印 · 听见母亲的声音' },
  { chapter: '第八章 · 天宫篇', title: '独眼神匠的星铁钥匙', lines: ['库克罗普斯承认，他曾为阿瑞斯锻造囚禁母亲的锁。', '击败他后，你得到一把星铁钥匙和一张混沌门图纸。', '钥匙能开门，却斩不断最后那条由命运编成的神链。'], clue: '获得：星铁钥匙 · 混沌门图纸' },
  { chapter: '第九章 · 风林火山篇', title: '四象重新指向北方', lines: ['卡俄斯的四象崩解，九枚页印在空中拼成一张地图。', '所有路线最终都指向北方雪山，那里封印着末日巨狼。', '母亲的披肩碎片从门中落下，还残留着她的温度。'], clue: '获得：北境地图 · 母亲的披肩碎片' },
  { chapter: '第十章 · 雪山篇', title: '芬里尔的狼牙', lines: ['芬里尔挣断冰层，却没有追击，而是咬碎自己的神链。', '你从断链中取下一颗狼牙——它能割断命运的束缚。', '雪幕后，猩红之门终于开启；母亲就在战书最深处。'], clue: '获得：破链狼牙 · 通往猩红之地' },
  { chapter: '终章 · 猩红之地', title: '把母亲从故事里牵回来', lines: ['阿瑞斯倒下，猩红战书仍试图把母亲吞进最后一页。', '你用狼牙割断神链，再用那根红线缝合她破碎的名字。', '母亲握住你的手：“这次，我们一起把结局写完。”'], clue: '救援完成：母亲平安归来' },
];

let state = 'menu';
let runMode = 'story';
let suspendedRun = null;
let levelIdx = 0;
let currentMap = MAPS[0];
let levelClear = false;
let clearT = 0;
let bossIntroT = 0;
let storyChapter = null;
let hazards = [];
let fields = [];
let props = [];
let terrainBlocks = [];
let mechT = 0;
let fourPhase = 0;
let fourT = 0;
let time = 0;
let kills = 0;
let camera = { x: 0, y: 0 };
let spawnTimer = 0;
let eliteIdx = 0;
let bossSpawned = false;
let cards = [];
let cardsShown = false;
let flashT = 0;
let shakeT = 0;
let shakePower = 0;

const player = {
  x: 0, y: 0, r: 10,
  hp: 100, maxHp: 100,
  speed: 122, inv: 0, magnet: 140,
  ward: 0, wardMax: 0, wardRegen: 0,
  level: 1, xp: 0, xpNeed: 10,
  aim: 0,
  stepDust: 0,
};

const WEAPON_DEFS = {
  pencil:    { name: '铅笔飞镖', short: '铅笔', kind: 'ranged',  dmg: 14, cd: 0.40, count: 1, spread: 0.16, pierce: 0, speed: 470, range: 300, color: COL.orange },
  slingshot: { name: '弹弓',     short: '弹弓', kind: 'ranged',  dmg: 9,  cd: 0.72, count: 3, spread: 0.26, pierce: 0, speed: 430, range: 210, color: COL.green },
  knife:     { name: '美工刀',   short: '美工刀', kind: 'melee', dmg: 24, cd: 0.55, range: 84, arc: 1.3, color: COL.blue },
  bubble:    { name: '护盾泡泡', short: '护盾', kind: 'support', dmg: 0, cd: 0, shield: 30, regen: 4, color: COL.purple },
  ruler:     { name: '长尺穿刺', short: '直尺', kind: 'ranged', dmg: 20, cd: 0.90, count: 1, spread: 0, pierce: 3, speed: 560, range: 380, color: '#5b9fa9' },
  crayon:    { name: '蜡笔连射', short: '蜡笔', kind: 'ranged', dmg: 8, cd: 0.19, count: 1, spread: 0.08, pierce: 0, speed: 390, range: 245, color: '#d96672' },
  boomerang: { name: '折纸回旋镖', short: '回旋镖', kind: 'ranged', dmg: 18, cd: 1.00, count: 1, spread: 0, pierce: 3, speed: 285, range: 300, color: '#8068a6' },
  eraser:    { name: '橡皮炸弹', short: '橡皮', kind: 'ranged', dmg: 30, cd: 1.35, count: 1, spread: 0.05, pierce: 0, speed: 250, range: 250, color: '#e7839b' },
  compass:   { name: '圆规回旋刃', short: '圆规', kind: 'melee', dmg: 17, cd: 0.82, range: 62, arc: TAU, color: '#8966a8' },
};
const WEAPON_FORMS = {
  pencil: ['削尖铅芯', '硬芯贯纸', '双线速写', '钢芯长锋', '三线连描', '金尖穿页'],
  slingshot: ['单皮弹弓', '四石散射', '五角弹幕', '硬石贯穿', '七星散射', '九星天幕'],
  knife: ['裁纸短刃', '长锋半月', '青月觉醒', '双层刀气', '回身双斩', '满月裁界'],
  bubble: ['单层泡膜', '厚泡护甲', '反震泡环', '双层覆膜', '连锁泡泡', '不破纸界'],
  ruler: ['木尺直刺', '刻度贯穿', '双尺校准', '长距测绘', '三线刻度', '无限标尺'],
  crayon: ['单色蜡笔', '双色涂线', '三色速涂', '硬蜡穿纸', '五彩连描', '虹彩暴绘'],
  boomerang: ['单叶折镖', '硬折双刃', '双叶回环', '急返折线', '三叶巡游', '四象回旋阵'],
  eraser: ['方块橡皮', '粉屑爆破', '双块投掷', '大号擦除', '黏屑连爆', '三重清场'],
  compass: ['单针圆规', '加长针脚', '三针回环', '紫墨刻圆', '双层圆轨', '六针星轨'],
};
const WEAPON_FORM_TRAITS = {
  pencil: ['基础直射', '穿透 +1', '双发', '射程与速度提升', '三发', '额外穿透与暴击'],
  slingshot: ['三石扇射', '四发', '五发觉醒', '获得穿透', '七发', '九发宽扇面'],
  knife: ['基础半月', '范围扩大', '青色半月觉醒', '刀气增厚', '双斩', '三重满月斩'],
  bubble: ['再生护盾', '护盾增厚', '周期反震', '反震扩大', '连锁脉冲', '终极护盾与双脉冲'],
  ruler: ['长距穿透', '穿透 +2', '双尺齐射', '射程提升', '三尺齐射', '高速无限标尺'],
  crayon: ['快速单发', '双色双发', '三色扇射', '获得穿透', '五色连射', '虹彩六发'],
  boomerang: ['投出后回返', '穿透提升', '双叶回旋', '回返加速', '三叶巡游', '四叶回旋阵'],
  eraser: ['命中爆炸', '爆炸扩大', '双块投掷', '伤害提升', '黏屑连爆', '三重清场爆破'],
  compass: ['环形近战', '半径扩大', '三针回环', '伤害提升', '双层圆轨', '六针星轨'],
};

function weaponConfig(w) {
  const c = { ...WEAPON_DEFS[w.id] };
  const lv = w.level;
  c.form = lv;
  if (w.id === 'pencil') { if (lv >= 2) c.pierce += 1; if (lv >= 3) c.count = 2; if (lv >= 4) { c.speed *= 1.18; c.range += 70; } if (lv >= 5) c.count = 3; if (lv >= 6) { c.pierce += 2; c.critAdd = 0.12; } }
  else if (w.id === 'slingshot') { c.count = lv >= 6 ? 9 : lv >= 5 ? 7 : lv >= 3 ? 5 : lv >= 2 ? 4 : 3; if (lv >= 4) c.pierce += 1; if (lv >= 6) c.spread = 0.18; }
  else if (w.id === 'knife') { if (lv >= 2) c.range += 12; if (lv >= 3) c.arc = 1.65; if (lv >= 4) c.dmg *= 1.18; c.swings = lv >= 6 ? 3 : lv >= 5 ? 2 : 1; }
  else if (w.id === 'bubble') { c.pulse = lv >= 6 ? 2 : lv >= 3 ? 1 : 0; c.pulseRange = lv >= 6 ? 112 : lv >= 4 ? 88 : 72; }
  else if (w.id === 'ruler') { if (lv >= 2) c.pierce += 2; c.count = lv >= 5 ? 3 : lv >= 3 ? 2 : 1; if (lv >= 4) { c.range += 90; c.speed *= 1.12; } if (lv >= 6) c.cd *= 0.72; }
  else if (w.id === 'crayon') { c.count = lv >= 6 ? 6 : lv >= 5 ? 5 : lv >= 3 ? 3 : lv >= 2 ? 2 : 1; if (lv >= 4) c.pierce += 1; c.spread = lv >= 3 ? 0.12 : 0.08; }
  else if (w.id === 'boomerang') { if (lv >= 2) c.pierce += 2; c.count = lv >= 6 ? 4 : lv >= 5 ? 3 : lv >= 3 ? 2 : 1; c.returnSpeed = lv >= 4 ? 430 : 340; }
  else if (w.id === 'eraser') { c.blastR = lv >= 6 ? 66 : lv >= 4 ? 56 : lv >= 2 ? 48 : 42; c.count = lv >= 6 ? 3 : lv >= 3 ? 2 : 1; if (lv >= 4) c.dmg *= 1.2; }
  else if (w.id === 'compass') { if (lv >= 2) c.range += 10; c.blades = lv >= 6 ? 6 : lv >= 3 ? 3 : 1; if (lv >= 4) c.dmg *= 1.2; c.swings = lv >= 5 ? 2 : 1; }
  return c;
}
const MAX_SLOTS = 4;
let weapons = [];
let slashes = [];
const ench = { ward: 0, poison: 0, frost: 0, boom: 0, lightning: 0, deflect: 0, pierce: 0, ricochet: 0, split: 0, leech: 0, knockback: 0, homing: 0 };
let dmgMul = 1;
let atkSpeedMul = 1;
let critChance = 0.08;
let critMult = 1.75;
const DIFFS = {
  easy:       { key: 'easy', name: '简单', hp: 0.75, dmg: 0.70, spawn: 0.85, xp: 1.15 },
  elite:      { key: 'elite', name: '精英', hp: 1.00, dmg: 1.00, spawn: 1.00, xp: 1.00 },
  adventurer: { key: 'adventurer', name: '冒险家', hp: 1.35, dmg: 1.30, spawn: 1.20, xp: 0.90 },
};
let difficulty = 'elite';
function diff() { return DIFFS[difficulty]; }
function levelCfg() { return { boss: (levelIdx + 1) % 4 === 0 }; }
function levelMult() { return Math.pow(1.10, levelIdx); }
function bossMult() { return Math.pow(1.30, Math.floor(levelIdx / 4)); }
function maxSlots() {
  return Math.min(MAX_SLOTS, 1 + (player.level >= 3 ? 1 : 0) + (player.level >= 6 ? 1 : 0) + (player.level >= 9 ? 1 : 0));
}
function wDmgMul(lv) { return 1 + 0.35 * (lv - 1); }
function wCdMul(lv) { return 1 - 0.06 * (lv - 1); }
function hasWeapon(id) { return weapons.some((w) => w.id === id); }
function rollCrit() { return Math.random() < critChance; }

let enemies = [];
let bullets = [];
let ebullets = [];
let gems = [];
let parts = [];
let texts = [];
let combatFx = [];

const ENCH_DEFS = {
  ward:    { name: '守御结界', desc: '主附魔 · 再生结界抵挡远程攻击', max: 3, group: 'primary' },
  poison:  { name: '蛇毒墨迹', desc: '主附魔 · 命中施加持续毒伤', max: 3, group: 'primary' },
  frost:   { name: '寒霜刻印', desc: '主附魔 · 冰封减速并留下冰壳', max: 3, group: 'primary' },
  boom:    { name: '爆裂火种', desc: '主附魔 · 命中产生范围爆炸', max: 3, group: 'primary' },
  lightning:{ name: '雷罚封印', desc: '主附魔 · 命中落雷，范围敌人短暂禁锢', max: 3, group: 'primary' },
  deflect: { name: '弹反', desc: '辅助附魔 · 护盾期间概率弹反子弹', max: 3 },
  pierce:  { name: '穿透', desc: '辅助附魔 · 远程多穿 1 个', max: 3 },
  ricochet:{ name: '折射', desc: '辅助附魔 · 子弹命中后弹向其他敌人', max: 2 },
  split:   { name: '分叉', desc: '辅助附魔 · 首次命中分裂子弹', max: 2 },
  leech:   { name: '吸墨', desc: '辅助附魔 · 命中概率回复生命', max: 3 },
  knockback:{ name: '推页', desc: '辅助附魔 · 命中击退敌人', max: 3 },
  homing:  { name: '寻迹', desc: '辅助附魔 · 子弹轻微追踪敌人', max: 3 },
};
const PRIMARY_ENCHANTS = ['ward', 'poison', 'frost', 'boom', 'lightning'];
const ownedItems = {};
const ITEM_DEFS = {
  clip: { name: '回形针磁环', desc: '拾取范围 +70，移速 +5%', apply: () => { player.magnet += 70; player.speed *= 1.05; } },
  tape: { name: '透明胶带', desc: '获得 15 点再生护盾', apply: () => { syncShield(); player.shield = player.shieldMax; } },
  protractor: { name: '量角器', desc: '暴击率 +8%，暴伤 +0.15', apply: () => { critChance = Math.min(0.65, critChance + 0.08); critMult += 0.15; } },
  pinwheel: { name: '纸风车', desc: '攻速 +15%，移速 +8%', apply: () => { atkSpeedMul *= 1.15; player.speed *= 1.08; } },
  inkpot: { name: '墨水瓶', desc: '全伤害 +18%，穿透 +1', apply: () => { dmgMul *= 1.18; ench.pierce = Math.min(3, ench.pierce + 1); } },
};

function setEnchantment(id, level) {
  const def = ENCH_DEFS[id];
  if (!def) return;
  const wasWard = ench.ward;
  if (def.group === 'primary') {
    for (const key of PRIMARY_ENCHANTS) if (key !== id) ench[key] = 0;
  }
  ench[id] = clamp(level, 0, def.max);
  syncWard();
  if (id === 'ward' && wasWard === 0 && ench.ward > 0) player.ward = player.wardMax;
}
const statLevels = { dmg: 0, rate: 0, crit: 0, speed: 0, hp: 0, magnet: 0, heal: 0 };

const startBtn = { x: 0, y: 0, w: 220, h: 46 };
const restartBtn = { x: 0, y: 0, w: 0, h: 46 };
const nameBtn = { x: 0, y: 0, w: 160, h: 18 };
const musicBtn = { x: 10, y: 0, w: 82, h: 16 };
function diffBtn(i) {
  const w = portraitLayout ? 100 : 100, h = 26, gap = portraitLayout ? 8 : 12;
  const total = w * 3 + gap * 2;
  return { x: (VW - total) / 2 + i * (w + gap), y: portraitLayout ? 352 : 274, w, h };
}
const DIFF_KEYS = ['easy', 'elite', 'adventurer'];
const MODE_KEYS = ['story', 'endless'];
const MODE_NAMES = { story: '剧情模式', endless: '无尽模式' };
function modeBtn(i) {
  const w = portraitLayout ? 156 : 150, h = 24, gap = portraitLayout ? 10 : 12;
  const total = w * 2 + gap;
  return { x: (VW - total) / 2 + i * (w + gap), y: portraitLayout ? 392 : 306, w, h };
}
const pauseBtn = { x: 0, y: 10, w: 34, h: 34 };
const pauseContinueBtn = { x: 0, y: 166, w: 184, h: 38 };
const pauseHomeBtn = { x: 0, y: 218, w: 184, h: 38 };

function updateLayoutRects() {
  const startW = suspendedRun ? (portraitLayout ? 164 : 166) : (portraitLayout ? 240 : 220);
  const restartW = portraitLayout ? 86 : 88;
  const startGap = 10;
  const buttonGroupW = suspendedRun ? startW + startGap + restartW : startW;
  startBtn.x = VW / 2 - buttonGroupW / 2;
  startBtn.y = portraitLayout ? 286 : 214;
  startBtn.w = startW;
  startBtn.h = portraitLayout ? 50 : 46;
  restartBtn.x = startBtn.x + startBtn.w + startGap;
  restartBtn.y = startBtn.y;
  restartBtn.w = suspendedRun ? restartW : 0;
  restartBtn.h = startBtn.h;
  nameBtn.x = VW / 2 - (portraitLayout ? 100 : 80);
  nameBtn.y = portraitLayout ? 250 : 190;
  nameBtn.w = portraitLayout ? 200 : 160;
  nameBtn.h = portraitLayout ? 22 : 18;
  musicBtn.y = portraitLayout ? VH - 42 : 334;
  pauseBtn.x = VW - 44;
  pauseContinueBtn.x = VW / 2 - 92;
  pauseContinueBtn.y = portraitLayout ? VH / 2 - 45 : 166;
  pauseHomeBtn.x = VW / 2 - 92;
  pauseHomeBtn.y = portraitLayout ? VH / 2 + 7 : 218;
}

function cardRect(i) {
  if (portraitLayout) return { x: 30, y: 84 + i * 160, w: VW - 60, h: 146 };
  const w = 168, h = 154, gap = 16;
  const total = w * 3 + gap * 2;
  return { x: (VW - total) / 2 + i * (w + gap), y: 104, w, h };
}

function newRun() {
  levelIdx = 0;
  weapons = [{ id: 'pencil', level: 1, timer: 0 }];
  slashes = [];
  dmgMul = 1;
  atkSpeedMul = 1;
  critChance = 0.08;
  critMult = 1.75;
  for (const k in ench) ench[k] = 0;
  for (const k in ownedItems) delete ownedItems[k];
  for (const k in statLevels) statLevels[k] = 0;
  player.hp = 100;
  player.maxHp = 100;
  player.speed = 122;
  player.magnet = 140;
  player.level = 1;
  player.xp = 0;
  player.xpNeed = 10;
  player.aim = 0;
  player.shield = 0;
  player.shieldMax = 0;
  player.shieldRegen = 0;
  player.ward = 0;
  player.wardMax = 0;
  player.wardRegen = 0;
  startLevel();
}

function startLevel() {
  time = 0;
  kills = 0;
  spawnTimer = 0;
  eliteIdx = 0;
  bossSpawned = false;
  cards = [];
  flashT = 0;
  shakeT = 0;
  shakePower = 0;
  levelClear = false;
  clearT = 0;
  bossIntroT = 0;

  player.x = WORLD.w / 2;
  player.y = WORLD.h / 2;
  player.inv = 0;
  player.stepDust = 0;

  enemies = [];
  bullets = [];
  ebullets = [];
  gems = [];
  parts = [];
  texts = [];
  combatFx = [];

  const previewMap = MAPS.find((map) => map.id === PREVIEW_MAP_ID);
  if (previewMap) {
    currentMap = previewMap;
  } else if (runMode === 'endless') {
    currentMap = MAPS[Math.floor(Math.random() * MAPS.length)];
  } else {
    currentMap = MAPS[Math.min(MAPS.length - 1, Math.floor(levelIdx / 4))];
  }

  camera.x = clamp(player.x - VW / 2, 0, WORLD.w - VW);
  camera.y = clamp(player.y - VH / 2, 0, WORLD.h - VH);

  hazards = [];
  fields = [];
  props = [];
  terrainBlocks = [];
  mechT = 2.0;
  fourPhase = 0;
  fourT = 0;
  initTerrain();
  initFields();
  initProps();

  state = 'play';
  if (!BACKGROUND_PREVIEW) {
    for (let i = 0; i < 4; i++) spawnEnemy('slime');
  }
}

// ---------------- 地图机制 ----------------
function initFields() {
  if (currentMap.mech === 'bush') {
    for (let i = 0; i < 11; i++) {
      const a = rnd(0, TAU);
      const d = rnd(130, 400);
      fields.push({ kind: 'bush', x: clamp(player.x + Math.cos(a) * d, 50, WORLD.w - 50), y: clamp(player.y + Math.sin(a) * d, 50, WORLD.h - 50), r: 26, slow: 0.4, color: currentMap.doodle });
    }
  } else if (currentMap.mech === 'mire') {
    for (let i = 0; i < 7; i++) {
      const a = rnd(0, TAU);
      const d = rnd(130, 400);
      fields.push({ kind: 'mire', x: clamp(player.x + Math.cos(a) * d, 50, WORLD.w - 50), y: clamp(player.y + Math.sin(a) * d, 50, WORLD.h - 50), r: 38, slow: 0.45, color: currentMap.doodle });
    }
  }
}

function initProps() {
  const seed = (0x6d2b79f5 ^ (levelIdx + 1) * 2654435761 ^ currentMap.id.length * 9973) >>> 0;
  const R = makeRng(seed);
  const add = (kind, dMin, dMax, sizeMin, sizeMax) => {
    const a = R() * TAU;
    const d = dMin + Math.sqrt(R()) * (dMax - dMin);
    props.push({
      kind,
      x: clamp(player.x + Math.cos(a) * d, 32, WORLD.w - 32),
      y: clamp(player.y + Math.sin(a) * d, 32, WORLD.h - 32),
      r: sizeMin + R() * (sizeMax - sizeMin),
      phase: R() * TAU,
      tone: R(),
    });
  };
  const scatter = (kind, sizeMin, sizeMax) => {
    props.push({
      kind,
      x: 40 + R() * (WORLD.w - 80),
      y: 40 + R() * (WORLD.h - 80),
      r: sizeMin + R() * (sizeMax - sizeMin),
      phase: R() * TAU,
      tone: R(),
    });
  };

  if (currentMap.id === 'forest') {
    for (let i = 0; i < 36; i++) add('canopy', 210, 650, 24, 40);
    for (let i = 0; i < 24; i++) add(i % 3 === 0 ? 'stump' : i % 3 === 1 ? 'rock' : 'flower', 80, 700, 8, 19);
  } else if (currentMap.id === 'waste') {
    const kinds = ['deadTree', 'tumbleweed', 'arch', 'rock', 'shaving'];
    for (let i = 0; i < 46; i++) add(kinds[i % kinds.length], 80, 740, 9, 25);
  } else if (currentMap.id === 'desert') {
    const kinds = ['cactus', 'agave', 'arch', 'sandstone', 'shaving'];
    for (let i = 0; i < 46; i++) add(kinds[i % kinds.length], 80, 740, 9, 26);
  } else if (currentMap.id === 'volcano') {
    const kinds = ['lavaVent', 'basalt', 'crystal', 'rock', 'pillar'];
    for (let i = 0; i < 48; i++) add(kinds[i % kinds.length], 80, 740, 10, 27);
  } else if (currentMap.id === 'inferno') {
    const kinds = ['charTree', 'emberPile', 'obelisk', 'crystal', 'rock'];
    for (let i = 0; i < 48; i++) add(kinds[i % kinds.length], 80, 740, 10, 27);
  } else if (currentMap.id === 'swamp') {
    const kinds = ['mangrove', 'mushroom', 'reed', 'lotus', 'rock'];
    for (let i = 0; i < 46; i++) add(kinds[i % kinds.length], 80, 740, 8, 24);
  } else if (currentMap.id === 'ocean') {
    const kinds = ['coral', 'seaweed', 'shell', 'anemone', 'rock'];
    for (let i = 0; i < 46; i++) add(kinds[i % kinds.length], 80, 740, 8, 24);
  } else if (currentMap.id === 'heaven') {
    const kinds = ['cloud', 'skyPillar', 'shrine', 'heavenGate', 'goldLantern'];
    for (let i = 0; i < 50; i++) add(kinds[i % kinds.length], 90, 740, 10, 29);
  } else if (currentMap.id === 'four') {
    const fourKinds = ['charTree', 'obelisk', 'crystal', 'basalt', 'rock'];
    for (let i = 0; i < 50; i++) add(fourKinds[i % fourKinds.length], 80, 760, 10, 29);
  } else if (currentMap.id === 'snow') {
    const snowKinds = ['cloud', 'skyPillar', 'crystal', 'rock', 'pillar'];
    for (let i = 0; i < 52; i++) add(snowKinds[i % snowKinds.length], 80, 760, 9, 28);
  } else if (currentMap.id === 'crimson') {
    const crimsonKinds = ['charTree', 'obelisk', 'crystal', 'emberPile', 'rock'];
    for (let i = 0; i < 52; i++) add(crimsonKinds[i % crimsonKinds.length], 80, 760, 10, 29);
  } else {
    for (let i = 0; i < 30; i++) add(i % 5 === 0 ? 'flower' : 'rock', 100, 700, 5, 14);
  }

  const worldKinds = {
    forest: ['canopy', 'canopy', 'stump', 'rock', 'flower'],
    waste: ['deadTree', 'tumbleweed', 'arch', 'rock', 'shaving'],
    desert: ['arch', 'cactus', 'sandstone', 'agave', 'shaving'],
    swamp: ['mangrove', 'mushroom', 'reed', 'lotus', 'rock'],
    ocean: ['coral', 'seaweed', 'shell', 'anemone', 'rock'],
    volcano: ['lavaVent', 'basalt', 'crystal', 'rock', 'pillar'],
    inferno: ['charTree', 'emberPile', 'obelisk', 'crystal', 'rock'],
    heaven: ['cloud', 'skyPillar', 'shrine', 'heavenGate', 'goldLantern'],
    four: ['charTree', 'obelisk', 'crystal', 'basalt', 'rock'],
    snow: ['cloud', 'skyPillar', 'crystal', 'rock', 'pillar'],
    crimson: ['charTree', 'obelisk', 'crystal', 'emberPile', 'rock'],
  }[currentMap.id] || ['rock', 'flower'];
  for (let i = 0; i < 180; i++) {
    const kind = worldKinds[i % worldKinds.length];
    const big = kind === 'canopy' || kind === 'arch' || kind === 'cloud' || kind === 'skyPillar' || kind === 'mangrove' || kind === 'shrine' || kind === 'heavenGate' || kind === 'deadTree' || kind === 'charTree';
    scatter(kind, big ? 18 : 7, big ? 36 : 20);
  }
}

function spawnMechanic() {
  const m = currentMap;
  const near = () => {
    const a = rnd(0, TAU);
    const d = rnd(50, 140);
    return {
      x: clamp(player.x + Math.cos(a) * d, 40, WORLD.w - 40),
      y: clamp(player.y + Math.sin(a) * d, 40, WORLD.h - 40),
    };
  };
  if (m.mech === 'zone') {
    for (let i = 0; i < 2; i++) {
      const pt = near();
      hazards.push({ kind: 'zone', x: pt.x, y: pt.y, r: 46, t: 0, delay: 1.2, dmgE: 45, dmgP: 15, color: m.doodle });
    }
  } else if (m.mech === 'rain') {
    for (let i = 0; i < 4; i++) {
      const pt = near();
      hazards.push({ kind: 'zone', x: pt.x, y: pt.y, r: 30, t: 0, delay: 0.9, dmgE: 35, dmgP: 8, color: m.doodle });
    }
  } else if (m.mech === 'bolt') {
    const targets = enemies.filter((e) => !e.dead && !e.boss).sort((a, b) => dist(player, a) - dist(player, b)).slice(0, 3);
    if (targets.length) {
      for (const e of targets) hazards.push({ kind: 'bolt', x: e.x, y: e.y, r: 24, t: 0, delay: 0.45, dmgE: 90, dmgP: 10, color: m.doodle });
    } else {
      hazards.push({ kind: 'bolt', x: player.x, y: player.y, r: 24, t: 0, delay: 0.45, dmgE: 90, dmgP: 10, color: m.doodle });
    }
  } else if (m.mech === 'tumble' || m.mech === 'tide') {
    const fromLeft = Math.random() < 0.5;
    const wide = m.mech === 'tide';
    hazards.push({
      kind: 'tumble',
      x: fromLeft ? camera.x - 50 : camera.x + VW + 50,
      y: camera.y + rnd(30, VH - 30),
      vx: (fromLeft ? 1 : -1) * (wide ? 130 : 170),
      vy: 0,
      r: wide ? 34 : 24,
      t: 0,
      life: 10,
      hitCd: 0,
      dmgE: wide ? 35 : 28,
      dmgP: wide ? 14 : 10,
      color: m.doodle,
      wide,
    });
  } else if (m.mech === 'blizzard') {
    const fromLeft = Math.random() < 0.5;
    hazards.push({
      kind: 'tumble',
      x: fromLeft ? camera.x - 70 : camera.x + VW + 70,
      y: camera.y + rnd(55, VH - 55),
      vx: (fromLeft ? 1 : -1) * 145,
      vy: 0,
      r: 42,
      t: 0,
      life: 10,
      hitCd: 0,
      dmgE: 38,
      dmgP: 13,
      color: m.doodle,
      wide: true,
      snow: true,
    });
  } else if (m.mech === 'bloodmoon') {
    for (let i = 0; i < 4; i++) {
      const pt = near();
      hazards.push({ kind: 'zone', x: pt.x, y: pt.y, r: 34, t: 0, delay: 1.05, dmgE: 42, dmgP: 11, color: m.doodle, crimson: true });
    }
  } else if (m.mech === 'four') {
    onFourPhase();
  }
}

function onFourPhase() {
  const names = ['风：脚步变快', '林：生命回复', '火：灼烧领域', '山：怪物迟缓'];
  addText(player.x, player.y - 44, names[fourPhase], COL.goldDark, 13);
  if (fourPhase === 2) {
    for (let i = 0; i < 2; i++) {
      const a = rnd(0, TAU);
      const d = rnd(60, 150);
      hazards.push({ kind: 'zone', x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d, r: 40, t: 0, delay: 1.0, dmgE: 45, dmgP: 12, color: currentMap.doodle });
    }
  }
}

function updateHazards(dt) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.t += dt;
    if (h.kind === 'zone') {
      if (h.t >= h.delay) {
        for (const e of enemies) {
          if (!e.dead && Math.hypot(e.x - h.x, e.y - h.y) < h.r + e.r) damageEnemy(e, h.dmgE);
        }
        if (Math.hypot(player.x - h.x, player.y - h.y) < h.r + player.r) damagePlayer(h.dmgP);
        for (let k = 0; k < 12; k++) {
          puff(h.x + rnd(-h.r, h.r) * 0.7, h.y + rnd(-h.r, h.r) * 0.7, h.color, 1, 90, 0.45);
        }
        hazards.splice(i, 1);
      }
    } else if (h.kind === 'bolt') {
      if (h.t >= h.delay) {
        for (const e of enemies) {
          if (!e.dead && Math.hypot(e.x - h.x, e.y - h.y) < h.r + e.r) damageEnemy(e, h.dmgE);
        }
        if (Math.hypot(player.x - h.x, player.y - h.y) < h.r + player.r) damagePlayer(h.dmgP);
        for (let k = 0; k < 14; k++) puff(h.x, h.y, COL.gold, 1, 150, 0.4);
        hazards.splice(i, 1);
      }
    } else if (h.kind === 'tumble') {
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.hitCd -= dt;
      if (h.hitCd <= 0) {
        h.hitCd = 0.35;
        for (const e of enemies) {
          if (!e.dead && Math.hypot(e.x - h.x, e.y - h.y) < h.r + e.r) damageEnemy(e, h.dmgE);
        }
        if (Math.hypot(player.x - h.x, player.y - h.y) < h.r + player.r) damagePlayer(h.dmgP);
      }
      if (h.x < camera.x - 250 || h.x > camera.x + VW + 250) hazards.splice(i, 1);
    }
  }
}

function completeLevel() {
  if (state !== 'play') return;
  levelClear = true;
  clearT = 1.8;
}

function showStoryChapter(index) {
  storyChapter = index;
  state = 'story';
  Input.keys.clear();
  Input.pointer.down = false;
}

function continueStory() {
  const finishedChapter = storyChapter;
  storyChapter = null;
  Input.keys.clear();
  Input.pointer.down = false;
  if (finishedChapter === -1) {
    state = 'play';
    return;
  }
  state = 'play';
  nextLevel();
}

function nextLevel() {
  levelIdx++;
  if (runMode === 'story' && levelIdx >= MAPS.length * 4) {
    state = 'win';
    Music.effect('win');
    return;
  }
  startLevel();
}

function startGame(mode) {
  MenuTrack.toGame();
  runMode = mode || 'story';
  suspendedRun = null;
  updateLayoutRects();
  newRun();
  if (runMode === 'story' && !AUTO_START) showStoryChapter(-1);
}

function resumeSuspendedRun() {
  if (!suspendedRun) return;
  MenuTrack.toGame();
  runMode = suspendedRun.runMode;
  difficulty = suspendedRun.difficulty;
  suspendedRun = null;
  updateLayoutRects();
  state = 'play';
  Input.keys.clear();
  Input.pointer.down = false;
}

function togglePause() {
  if (state === 'play') state = 'paused';
  else if (state === 'paused') state = 'play';
}

function returnToMenu() {
  suspendedRun = {
    runMode,
    difficulty,
    level: levelIdx + 1,
    mapName: currentMap.name,
    seconds: Math.floor(time),
  };
  rerollMenuSeason();
  rerollMenuScene();
  state = 'menu';
  MenuTrack.toMenu();
  updateLayoutRects();
  Input.keys.clear();
  Input.stick = null;
  Input.pointers.clear();
  Input.pointer.down = false;
}

// ---------------- 敌人 ----------------
function enemyDef(type) {
  if (type === 'slime')    return { r: 9,  hp: 20, speed: 60,  dmg: 5,  xp: 1, color: '#4b315c', dark: '#2f1e3c' };
  if (type === 'bat')      return { r: 7,  hp: 12, speed: 100, dmg: 4,  xp: 1, color: '#76518d', dark: '#3b294c' };
  if (type === 'ink')      return { r: 13, hp: 62, speed: 40,  dmg: 7,  xp: 3, color: '#352640', dark: '#211827' };
  if (type === 'shooter')  return { r: 8,  hp: 16, speed: 46,  dmg: 5,  xp: 2, color: '#6d456f', dark: '#3a253f' };
  if (type === 'eliteShooter') return { r: 19, hp: 145, speed: 39, dmg: 12, xp: 15, color: '#594064', dark: '#2d2335' };
  if (type === 'splitter') return { r: 10, hp: 22, speed: 52,  dmg: 6,  xp: 2, color: '#574069', dark: '#2e2239' };
  if (type === 'jumper')   return { r: 9,  hp: 18, speed: 60,  dmg: 6,  xp: 2, color: '#8b5f95', dark: '#50365c' };
  return { r: 9, hp: 20, speed: 44, dmg: 5, xp: 1, color: '#4b315c', dark: '#2f1e3c' };
}

function enemyThemePalette() {
  const id = currentMap.id;
  if (id === 'forest') return { body: '#789447', dark: '#405b31', hi: '#aec56c', accent: '#e3aa42' };
  if (id === 'waste') return { body: '#a96f45', dark: '#5f4231', hi: '#d2a166', accent: '#e8c27d' };
  if (id === 'desert') return { body: '#c8843d', dark: '#77452f', hi: '#e7b666', accent: '#5f8748' };
  if (id === 'swamp') return { body: '#607b4d', dark: '#354b37', hi: '#91aa63', accent: '#d27b9a' };
  if (id === 'ocean') return { body: '#4d8fa1', dark: '#2f5968', hi: '#8bc6c9', accent: '#e0788b' };
  if (id === 'volcano') return { body: '#55484b', dark: '#29252b', hi: '#80656a', accent: '#f17934' };
  if (id === 'inferno') return { body: '#44333d', dark: '#211d24', hi: '#744554', accent: '#ed4d42' };
  if (id === 'heaven') return { body: '#9bb9ce', dark: '#536c82', hi: '#eef5f5', accent: '#d7aa3e' };
  if (id === 'snow') return { body: '#789cad', dark: '#405c6b', hi: '#d8f0f4', accent: '#79c8df' };
  if (id === 'crimson') return { body: '#6d2839', dark: '#2a141c', hi: '#a9485d', accent: '#ed5969' };
  const phaseColors = [
    { body: '#514554', dark: '#28232d', hi: '#93aa69', accent: '#8db05a' },
    { body: '#514554', dark: '#28232d', hi: '#d6b165', accent: '#d9ad43' },
    { body: '#514554', dark: '#28232d', hi: '#d7705c', accent: '#ef5b43' },
    { body: '#514554', dark: '#28232d', hi: '#9aabc0', accent: '#82a5c4' },
  ];
  return phaseColors[fourPhase] || phaseColors[0];
}

// 每张地图的精英身份与主动技能。视觉沿用当前怪物家族，行为不再只是统一三向齐射。
const ELITE_MYTHS = {
  forest:  { name: '三首犬卫', skill: '三首噬弹', cd: 1.55, far: 220, near: 140 },
  waste:   { name: '迷宫牛卫', skill: '牛角重矛', cd: 2.15, far: 235, near: 150 },
  desert:  { name: '谜狮祭司', skill: '谜阵十字', cd: 2.0,  far: 225, near: 145 },
  swamp:   { name: '九首毒卫', skill: '五首毒雨', cd: 2.25, far: 220, near: 140 },
  ocean:   { name: '斯库拉侍从', skill: '触腕环射', cd: 2.35, far: 215, near: 135 },
  volcano: { name: '提丰火裔', skill: '双蛇熔痕', cd: 2.25, far: 225, near: 145 },
  inferno: { name: '蛇母眷属', skill: '孵化援军', cd: 3.6,  far: 210, near: 135 },
  heaven:  { name: '独眼锻匠', skill: '独眼天雷', cd: 2.8,  far: 235, near: 155 },
  four:    { name: '混沌四象', skill: '四色轮转', cd: 2.45, far: 220, near: 140 },
  snow:    { name: '神链狼卫', skill: '寒风狼嚎', cd: 3.0,  far: 225, near: 145 },
  crimson: { name: '恐惧战使', skill: '血月军阵', cd: 2.7,  far: 230, near: 150 },
};

function eliteMyth(id) {
  return ELITE_MYTHS[id] || ELITE_MYTHS.forest;
}

function eliteShot(e, a, speed, r, dmg, color) {
  ebullets.push({
    x: e.x + Math.cos(a) * e.r,
    y: e.y + Math.sin(a) * e.r,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    r,
    dmg: dmg * diff().dmg,
    life: 4.5,
    color: color || e.accent,
    weaponId: 'enemyElite',
    themeId: e.themeId || currentMap.id,
  });
}

function castEliteSkill(e, aim, melee) {
  const id = e.themeId || currentMap.id;
  const skill = eliteMyth(id);
  e.attackFx = 0.42;
  e.attackA = aim;
  addText(e.x, e.y - e.r - 18, skill.skill, e.accent, 9);

  if (id === 'forest') {
    // 刻耳柏洛斯的三颗头分别吐出一枚噬弹。
    for (let i = -1; i <= 1; i++) eliteShot(e, aim + i * 0.24, melee ? 155 : 190, 5, 9);
  } else if (id === 'waste') {
    // 弥诺陶洛斯系精英：远程投出一枚重矛，近战则沿迷宫直线冲撞。
    if (melee) e.dashT = 1.05;
    else eliteShot(e, aim, 245, 8, 16, '#c58b52');
  } else if (id === 'desert') {
    // 斯芬克斯谜阵：四枚弹体组成旋转十字。
    for (let i = 0; i < 4; i++) eliteShot(e, aim + i * Math.PI / 2, 150, 4.5, 8, i % 2 ? '#e7b666' : e.accent);
  } else if (id === 'swamp') {
    // 海德拉多首齐吐，并恢复少量生命。
    for (let i = -2; i <= 2; i++) eliteShot(e, aim + i * 0.2, 155, 4.2, 7, i % 2 ? '#91aa63' : e.accent);
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.045);
  } else if (id === 'ocean') {
    // 斯库拉触腕向八个方向横扫。
    for (let i = 0; i < 8; i++) eliteShot(e, i * TAU / 8 + e.t * 0.35, 125, 4.2, 7, i % 2 ? '#8bc6c9' : e.accent);
  } else if (id === 'volcano') {
    // 提丰双蛇留下两道交叉熔痕。
    eliteShot(e, aim - 0.32, 205, 6, 11, '#f17934');
    eliteShot(e, aim + 0.32, 205, 6, 11, '#ffc34a');
    hazards.push({ kind: 'zone', x: player.x, y: player.y, r: 28, t: 0, delay: 1.0, dmgE: 28, dmgP: 9, color: '#e26432' });
  } else if (id === 'inferno') {
    // 厄喀德那作为怪物之母，孵化两只眷属而不是重复射击。
    spawnEnemy('slime');
    spawnEnemy('bat');
    eliteShot(e, aim, 135, 7, 10, '#c63b5b');
  } else if (id === 'heaven') {
    // 独眼锻匠锁定玩家落下一道天雷。
    hazards.push({ kind: 'bolt', x: player.x, y: player.y, r: 27, t: 0, delay: 0.62, dmgE: 70, dmgP: 12, color: '#c89d37' });
  } else if (id === 'four') {
    // 卡俄斯眷属轮流释放风林火山四象弹。
    const cols = ['#789447', '#d5a13a', '#d75a45', '#7189a6'];
    for (let i = 0; i < 4; i++) eliteShot(e, aim + i * Math.PI / 2, 165 + i * 8, 5, 9, cols[i]);
  } else if (id === 'snow') {
    // 芬里尔狼嚎卷起横向暴风雪。
    const fromLeft = e.x < player.x;
    hazards.push({ kind: 'tumble', x: fromLeft ? camera.x - 60 : camera.x + VW + 60, y: player.y, vx: (fromLeft ? 1 : -1) * 155, vy: 0, r: 38, t: 0, life: 9, hitCd: 0, dmgE: 28, dmgP: 11, color: '#79c8df', wide: true, snow: true });
  } else if (id === 'crimson') {
    // 阿瑞斯的战使借福波斯与得摩斯之名布下恐惧血印。
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + e.t * 0.2;
      hazards.push({ kind: 'zone', x: clamp(player.x + Math.cos(a) * 46, 40, WORLD.w - 40), y: clamp(player.y + Math.sin(a) * 46, 40, WORLD.h - 40), r: 27, t: 0, delay: 0.95, dmgE: 34, dmgP: 10, color: '#d34b5f', crimson: true });
    }
  }
}

function enemyVisual(type, elite, boss) {
  const pal = enemyThemePalette();
  const tone = { slime: 0, bat: -0.08, ink: -0.18, shooter: 0.05, eliteShooter: -0.1, splitter: -0.04, jumper: 0.12, elite: -0.08, boss: -0.16 }[type] || 0;
  return {
    color: shade(pal.body, elite ? -0.1 : boss ? -0.16 : tone),
    dark: shade(pal.dark, boss ? -0.14 : tone * 0.55),
    hi: pal.hi,
    accent: pal.accent,
  };
}

function spawnPos() {
  const a = rnd(0, TAU);
  const d = rnd(250, 350);
  return {
    x: clamp(player.x + Math.cos(a) * d, 40, WORLD.w - 40),
    y: clamp(player.y + Math.sin(a) * d, 40, WORLD.h - 40),
  };
}

function hpScale() {
  return 1 + time / 110;
}

function spawnEnemy(type) {
  const d = enemyDef(type);
  const p = spawnPos();
  const elite = type === 'elite' || type === 'eliteShooter';
  const rangedElite = type === 'eliteShooter';
  const myth = eliteMyth(currentMap.id);
  const visual = enemyVisual(type, elite, false);
  enemies.push({
    type,
    x: p.x, y: p.y,
    r: elite ? (rangedElite ? 19 : 20) : d.r,
    hp: d.hp * hpScale() * (type === 'elite' ? 7 : 1) * diff().hp * levelMult(),
    maxHp: d.hp * hpScale() * (type === 'elite' ? 7 : 1) * diff().hp * levelMult(),
    speed: type === 'elite' ? 46 : d.speed,
    dmg: (type === 'elite' ? 20 : d.dmg) * diff().dmg,
    xp: Math.max(1, Math.round((type === 'elite' ? 14 : d.xp) * diff().xp)),
    color: visual.color,
    dark: visual.dark,
    hi: visual.hi,
    accent: visual.accent,
    elite: !!elite,
    rangedElite,
    themeId: currentMap.id,
    eliteName: elite ? myth.name : '',
    eliteSkill: elite ? myth.skill : '',
    mythCd: elite ? (rangedElite ? myth.cd : 4.2 + rnd(0, 1.4)) : 0,
    dashT: 0,
    boss: false,
    flash: 0,
    slowT: 0,
    slowMul: 1,
    fireCd: rangedElite ? 0.72 : rnd(1, 2),
    t: rnd(0, 4),
    phase: rnd(0, 6.28),
  });
}

function spawnBoss() {
  bossSpawned = true;
  const p = spawnPos();
  const visual = enemyVisual('boss', false, true);
  enemies.push({
    type: 'boss',
    x: p.x, y: p.y, r: 34,
    hp: 1500 * diff().hp * bossMult(), maxHp: 1500 * diff().hp * bossMult(),
    speed: 34, dmg: 22, xp: 0,
    color: visual.color, dark: visual.dark, hi: visual.hi, accent: visual.accent,
    elite: false, boss: true,
    flash: 0, t: 0, phase: 0,
    atkCd: 2.0, atkIdx: 0,
    tele: 0, chargeT: 0, chargeA: 0,
  });
  bossIntroT = FORCE_BOSS_INTRO_PREVIEW ? 3.0 : 3.6;
  Music.effect('boss');
  addText(player.x, player.y - 40, currentMap.boss + ' 降临！', COL.red, 16);
}

function spawnWave() {
  const pool = ['slime'];
  if (levelIdx >= 1) pool.push('bat');
  if (levelIdx >= 2) pool.push('ink');
  if (levelIdx >= 3) pool.push('shooter');
  if (levelIdx >= 5) pool.push('splitter');
  if (levelIdx >= 7) pool.push('jumper');
  spawnEnemy(pool[Math.floor(Math.random() * pool.length)]);
}

// ---------------- 升级 ----------------
function addWeapon(id) {
  weapons.push({ id, level: 1, timer: 0 });
  if (id === 'bubble') syncShield();
}

function syncShield() {
  const w = weapons.find((x) => x.id === 'bubble');
  const tapeBonus = ownedItems.tape ? 15 : 0;
  if (!w && !tapeBonus) return;
  const def = WEAPON_DEFS.bubble;
  player.shieldMax = tapeBonus + (w ? def.shield + 15 * (w.level - 1) : 0);
  player.shieldRegen = (ownedItems.tape ? 1.5 : 0) + (w ? def.regen + 2 * (w.level - 1) : 0);
  player.shield = Math.max(player.shield, player.shieldMax);
}

function syncWard() {
  const lv = ench.ward || 0;
  player.wardMax = lv > 0 ? 12 + lv * 10 : 0;
  player.wardRegen = lv > 0 ? 1.2 + lv * 0.9 : 0;
  player.ward = Math.min(player.ward || 0, player.wardMax);
}

function addItem(id) {
  if (ownedItems[id]) return;
  ownedItems[id] = 1;
  ITEM_DEFS[id].apply();
}

function buildCards() {
  const pool = [];

  if (weapons.length < maxSlots()) {
    for (const id in WEAPON_DEFS) {
      if (hasWeapon(id)) continue;
      const def = WEAPON_DEFS[id];
      pool.push({
        key: 'new:' + id,
        name: '获得 ' + def.name,
        desc: def.kind === 'support' ? '护盾 + 弹反' : def.kind === 'melee' ? '近战 · 高伤' : '远程武器',
        sub: '新武器',
        apply: () => addWeapon(id),
      });
    }
  }

  for (const w of weapons) {
    if (w.level >= 6) continue;
    const def = WEAPON_DEFS[w.id];
    const nextLevel = w.level + 1;
    const nextForm = WEAPON_FORMS[w.id][nextLevel - 1];
    const nextTrait = WEAPON_FORM_TRAITS[w.id][nextLevel - 1];
    pool.push({
      key: 'up:' + w.id,
      name: nextLevel === 3 ? '觉醒 · ' + nextForm : nextLevel === 6 ? '终极 · ' + nextForm : nextForm,
      desc: nextTrait,
      sub: 'Lv.' + w.level + ' → ' + nextLevel + (nextLevel === 3 ? ' · 形态觉醒' : nextLevel === 6 ? ' · 最终形态' : ''),
      apply: () => { w.level++; if (w.id === 'bubble') syncShield(); },
    });
  }

  for (const id in ENCH_DEFS) {
    if (ench[id] >= ENCH_DEFS[id].max) continue;
    if (ENCH_DEFS[id].group === 'primary') {
      const chosenPrimary = PRIMARY_ENCHANTS.find((key) => ench[key] > 0);
      if (chosenPrimary && chosenPrimary !== id) continue;
    }
    pool.push({
      key: 'ench:' + id,
      name: '附魔 · ' + ENCH_DEFS[id].name,
      desc: ENCH_DEFS[id].desc,
      sub: 'Lv.' + ench[id] + ' → ' + (ench[id] + 1),
      apply: () => setEnchantment(id, ench[id] + 1),
    });
  }

  for (const id in ITEM_DEFS) {
    if (ownedItems[id]) continue;
    const item = ITEM_DEFS[id];
    pool.push({
      key: 'item:' + id,
      name: '道具 · ' + item.name,
      desc: item.desc,
      sub: '被动道具',
      apply: () => addItem(id),
    });
  }

  if (statLevels.dmg < 8) pool.push({ key: 's:dmg', name: '削尖铅笔', desc: '全伤害 +30%', sub: '属性', apply: () => { dmgMul *= 1.3; statLevels.dmg++; } });
  if (statLevels.rate < 8) pool.push({ key: 's:rate', name: '手速加快', desc: '攻速 +20%', sub: '属性', apply: () => { atkSpeedMul *= 1.2; statLevels.rate++; } });
  if (statLevels.crit < 5) pool.push({ key: 's:crit', name: '幸运星', desc: '暴击率 +7%', sub: '暴击 ×' + critMult.toFixed(2), apply: () => { critChance = Math.min(0.6, critChance + 0.07); statLevels.crit++; } });
  if (statLevels.speed < 6) pool.push({ key: 's:speed', name: '轻快脚步', desc: '移速 +10%', sub: '属性', apply: () => { player.speed *= 1.1; statLevels.speed++; } });
  if (statLevels.hp < 6) pool.push({ key: 's:hp', name: '吃厚一点', desc: '生命上限 +25', sub: '属性', apply: () => { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); statLevels.hp++; } });
  if (statLevels.magnet < 4) pool.push({ key: 's:magnet', name: '大口袋', desc: '拾取范围 +35', sub: '属性', apply: () => { player.magnet += 35; statLevels.magnet++; } });
  pool.push({ key: 's:heal', name: '创可贴', desc: '回复 40 生命', sub: '随时可用', apply: () => { player.hp = Math.min(player.maxHp, player.hp + 40); statLevels.heal++; } });

  const growth = pool.filter((c) => c.key.startsWith('new:') || c.key.startsWith('up:') || c.key.startsWith('ench:') || c.key.startsWith('item:'));
  const picked = [];
  if (growth.length && Math.random() < 0.7) {
    picked.push(growth[Math.floor(Math.random() * growth.length)]);
  }
  const copy = pool.filter((c) => picked.indexOf(c) < 0);
  while (picked.length < 3 && copy.length) {
    picked.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return picked;
}

function levelUp() {
  state = 'levelup';
  cards = buildCards();
  cardsShown = true;
  Music.effect('level');
}

function chooseCard(i) {
  const c = cards[i];
  if (!c) return;
  c.apply();
  cards = [];
  state = 'play';
  Music.effect('select');
  addText(player.x, player.y - 30, c.name, COL.goldDark, 12);
}

// ---------------- 附魔 ----------------
function explodeAt(x, y, r, dmg) {
  combatFx.push({ kind: 'bomb', x, y, r, life: 0.48, max: 0.48 });
  Music.effect('boom');
  for (let i = 0; i < 14; i++) puff(x, y, i % 3 === 0 ? '#35302d' : i % 2 ? '#ef6a3e' : COL.gold, 1, 145, 0.42);
  for (const e of enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - x, e.y - y) < r + e.r) damageEnemy(e, dmg);
  }
}

function applyEnchants(e, dmg) {
  if (ench.poison > 0 && !e.dead) {
    e.poisonT = 2.4 + ench.poison * 0.7;
    e.poisonDps = Math.max(e.poisonDps || 0, dmg * (0.13 + ench.poison * 0.055));
    e.poisonTick = Math.min(e.poisonTick == null ? 0.1 : e.poisonTick, 0.1);
    e.poisonLevel = ench.poison;
    for (let i = 0; i < 4; i++) puff(e.x, e.y, i % 2 ? '#8ebd55' : '#c6df68', 1, 55, 0.32);
  }
  if (ench.frost > 0) {
    e.slowT = 1.6;
    e.slowMul = 0.9 - 0.1 * ench.frost;
    e.frostLevel = ench.frost;
    for (let i = 0; i < 4; i++) puff(e.x, e.y, i % 2 ? '#dff8ff' : '#78b9cf', 1, 65, 0.32);
  }
  if (ench.boom > 0) {
    explodeAt(e.x, e.y, 26 + 6 * ench.boom, dmg * (0.5 + 0.1 * ench.boom));
  }
  if (ench.lightning > 0) thunderStrike(e.x, e.y, dmg);
}

function thunderStrike(x, y, dmg) {
  const lv = ench.lightning;
  const radius = 34 + lv * 10;
  combatFx.push({ kind: 'thunderStrike', x, y, r: radius, life: 0.38, max: 0.38, seed: Math.random() * 99 });
  for (const candidate of enemies) {
    if (candidate.dead) continue;
    if (Math.hypot(candidate.x - x, candidate.y - y) > radius + candidate.r) continue;
    candidate.stunT = Math.max(candidate.stunT || 0, (candidate.boss ? 0.16 : 0.36) + lv * (candidate.boss ? 0.05 : 0.12));
    candidate.stunLevel = lv;
    damageEnemy(candidate, dmg * (0.18 + lv * 0.07));
    for (let i = 0; i < 3; i++) puff(candidate.x, candidate.y, i % 2 ? '#fff1a6' : '#d5bd42', 1, 75, 0.28);
  }
}

// ---------------- 伤害 ----------------
function damageEnemy(e, dmg, hit) {
  const critical = !!(hit && hit.crit);
  e.hp -= dmg;
  e.flash = 1;
  if (hit && hit.leech > 0 && player.hp < player.maxHp && Math.random() < 0.07 * hit.leech) {
    const heal = Math.max(1, Math.round(dmg * (0.025 + hit.leech * 0.018)));
    player.hp = Math.min(player.maxHp, player.hp + heal);
    addText(player.x, player.y - 24, '+' + heal + ' 吸墨', '#5f9a60', 8);
    for (let i = 0; i < 4; i++) puff(player.x, player.y, '#80ad6b', 1, 45, 0.28);
  }
  if (critical) {
    Music.effect('crit');
    addText(e.x + rnd(-3, 3), e.y - e.r - 12, '暴击 ' + Math.round(dmg) + '!', COL.goldDark, 12);
    for (let i = 0; i < 7; i++) puff(e.x, e.y, i % 2 ? COL.gold : COL.white, 1, 115, 0.34);
    shakeT = Math.max(shakeT, 0.08);
    shakePower = Math.max(shakePower, 1.8);
  }
  if (e.hp <= 0) {
    killEnemy(e);
    return;
  }

  if (critical) return;

  // 持续伤害合并反馈，避免每帧重复播放音效、粒子和小数飘字。
  let shownDmg = dmg;
  if (dmg < 1) {
    e.chipDamage = (e.chipDamage || 0) + dmg;
    if ((e.hitFxCd || 0) > 0) return;
    shownDmg = e.chipDamage;
    e.chipDamage = 0;
    e.hitFxCd = 0.18;
  } else {
    e.hitFxCd = 0.04;
  }
  Music.effect('hit');
  addText(e.x + rnd(-4, 4), e.y - e.r - 8, String(Math.max(1, Math.round(shownDmg))), COL.ink, 9);
  for (let i = 0; i < 2; i++) puff(e.x, e.y, e.color, 1, 60, 0.2);
}

function killEnemy(e) {
  e.dead = true;
  kills++;
  if (e.boss) {
    shakeT = 0.55;
    shakePower = 8;
    for (let i = 0; i < 60; i++) puff(e.x, e.y, i % 2 ? COL.gold : COL.white, 1, 200, 0.8);
    levelClear = true;
    clearT = 2.0;
    return;
  }
  for (let i = 0; i < 8; i++) puff(e.x, e.y, i % 3 ? e.color : COL.white, 1, 90, 0.4);
  if (e.type === 'splitter') {
    for (let i = 0; i < 2; i++) {
      const a = rnd(0, TAU);
      enemies.push({ type: 'slime', x: e.x + Math.cos(a) * 10, y: e.y + Math.sin(a) * 10, r: 5.5, hp: 8, maxHp: 8, speed: 72, dmg: 3, xp: 1, color: e.color, dark: e.dark, elite: false, boss: false, flash: 0, slowT: 0, slowMul: 1, fireCd: 9, t: 0, phase: rnd(0, 6.28) });
    }
  }
  const n = e.elite ? 8 : 1;
  for (let i = 0; i < n; i++) {
    gems.push({
      x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8),
      vx: rnd(-40, 40), vy: rnd(-40, 40),
      value: e.elite ? 3 : 1, life: 0,
    });
  }
  if (e.elite) {
    shakeT = Math.max(shakeT, 0.18);
    shakePower = Math.max(shakePower, 3.5);
    player.hp = Math.min(player.maxHp, player.hp + 25);
    addText(e.x, e.y - 24, '精英击破 +25HP', COL.red, 11);
  }
}

function damagePlayer(dmg) {
  if (player.inv > 0 || state !== 'play') return;
  player.inv = 1.0;
  flashT = 0.18;
  shakeT = 0.22;
  shakePower = Math.max(shakePower, 4.5);
  Music.effect('hurt');
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, dmg);
    player.shield -= absorbed;
    dmg -= absorbed;
    for (let i = 0; i < 8; i++) puff(player.x, player.y, COL.purple, 1, 110, 0.3);
    if (dmg <= 0) return;
  }
  player.hp -= dmg;
  for (let i = 0; i < 10; i++) puff(player.x, player.y, COL.red, 1, 100, 0.35);
  if (player.hp <= 0) {
    player.hp = 0;
    state = 'dead';
    for (let i = 0; i < 30; i++) puff(player.x, player.y, i % 2 ? COL.blue : COL.skin, 1, 160, 0.7);
  }
}

function damagePlayerRanged(dmg, x, y) {
  if (ench.ward > 0 && player.ward > 0 && player.inv <= 0 && state === 'play') {
    const absorbed = Math.min(player.ward, dmg);
    player.ward -= absorbed;
    dmg -= absorbed;
    player.inv = 0.16;
    combatFx.push({ kind: 'wardBlock', x: x == null ? player.x : x, y: y == null ? player.y : y, life: 0.28, max: 0.28 });
    for (let i = 0; i < 7; i++) puff(player.x, player.y, i % 2 ? '#b9f1ed' : '#75c8d2', 1, 90, 0.28);
    if (dmg <= 0) return;
    player.inv = 0;
  }
  damagePlayer(dmg);
}

// ---------------- 粒子 / 飘字 ----------------
function puff(x, y, color, n, spd, life) {
  for (let i = 0; i < n; i++) {
    if (parts.length > 420) return;
    const a = rnd(0, TAU);
    const s = rnd(0.3, 1) * spd;
    parts.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * rnd(0.6, 1.2), max: life, color, size: rnd(1, 2.6),
    });
  }
}

function addText(x, y, str, color, size) {
  texts.push({ x, y, str, color, size: size || 10, life: 0.8, max: 0.8 });
}

// ---------------- 主更新 ----------------
function update(dt) {
  if (state !== 'play') return;

  time += dt;
  flashT = Math.max(0, flashT - dt);
  if (!FORCE_BOSS_INTRO_PREVIEW) bossIntroT = Math.max(0, bossIntroT - dt);
  shakeT = Math.max(0, shakeT - dt);
  if (shakeT <= 0) shakePower = 0;
  if (player.inv > 0) player.inv -= dt;

  if (levelClear) {
    clearT -= dt;
    if (clearT <= 0) {
      levelClear = false;
      if (runMode === 'story' && (levelIdx + 1) % 4 === 0) showStoryChapter(Math.floor(levelIdx / 4));
      else nextLevel();
    }
    return;
  }

  // 地图机制
  if (currentMap.mech === 'four') {
    fourT += dt;
    if (fourT >= currentMap.interval) { fourT = 0; fourPhase = (fourPhase + 1) % 4; onFourPhase(); }
    if (fourPhase === 1) player.hp = Math.min(player.maxHp, player.hp + 5 * dt);
    if (fourPhase === 2) {
      for (const e of enemies) {
        if (!e.dead && e.boss !== true && dist(player, e) < 95) damageEnemy(e, 14 * dt);
      }
    }
  } else if (currentMap.interval > 0) {
    mechT -= dt;
    if (mechT <= 0) { mechT = currentMap.interval; spawnMechanic(); }
  }
  updateHazards(dt);

  // 移动
  let mx = 0;
  let my = 0;
  const k = Input.keys;
  if (k.has('a') || k.has('arrowleft')) mx -= 1;
  if (k.has('d') || k.has('arrowright')) mx += 1;
  if (k.has('w') || k.has('arrowup')) my -= 1;
  if (k.has('s') || k.has('arrowdown')) my += 1;
  if (Input.stick) {
    const dx = Input.stick.x - Input.stick.ox;
    const dy = Input.stick.y - Input.stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > 8) {
      const m = Math.min(1, (d - 8) / 34);
      mx += (dx / d) * m;
      my += (dy / d) * m;
    }
  }
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const moveAmount = Math.min(1, ml);
  if (moveAmount > 0.08) {
    player.stepDust -= dt;
    if (player.stepDust <= 0) {
      player.stepDust = 0.22;
      puff(player.x - mx * 5 + rnd(-2, 2), player.y - my * 5 + 9, currentMap.grain, 1, 18, 0.24);
    }
  } else {
    player.stepDust = 0;
  }
  const spdMul = (currentMap.mech === 'four' && fourPhase === 0) ? 1.25 : 1;
  player.x = clamp(player.x + mx * player.speed * spdMul * dt, 20, WORLD.w - 20);
  player.y = clamp(player.y + my * player.speed * spdMul * dt, 20, WORLD.h - 20);
  resolveMapCollision(player, player.r);

  // 护盾回复
  if (player.shieldMax > 0) {
    player.shield = Math.min(player.shieldMax, player.shield + player.shieldRegen * dt);
  }
  if (player.wardMax > 0) {
    player.ward = Math.min(player.wardMax, player.ward + player.wardRegen * dt);
  }

  // 自动攻击：每把武器独立计时
  for (const w of weapons) {
    const def = weaponConfig(w);
    if (def.kind === 'support') {
      if (w.id === 'bubble' && def.pulse > 0) {
        w.timer -= dt;
        if (w.timer <= 0) {
          w.timer = (2.3 - w.level * 0.12) / atkSpeedMul;
          for (let pulse = 0; pulse < def.pulse; pulse++) {
            const pulseDmg = (8 + w.level * 4) * dmgMul;
            for (const e of enemies) {
              if (!e.dead && dist(player, e) < def.pulseRange + e.r) damageEnemy(e, pulseDmg);
            }
            slashes.push({ x: player.x, y: player.y, aim: 0, arc: TAU, life: 0.34 + pulse * 0.08, max: 0.34 + pulse * 0.08, color: def.color, r: def.pulseRange + pulse * 10, crit: false, weaponId: 'bubblePulse', blades: 1 });
          }
        }
      }
      continue;
    }
    w.timer -= dt;
    if (w.timer > 0) continue;

    let nearest = null;
    let nd = def.range;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = dist(player, e);
      if (d < nd) { nd = d; nearest = e; }
    }
    if (!nearest) continue;
    player.aim = Math.atan2(nearest.y - player.y, nearest.x - player.x);
    w.timer = (def.cd * wCdMul(w.level)) / atkSpeedMul;
    const base = player.aim;
    const dmg = def.dmg * wDmgMul(w.level) * dmgMul;

    if (def.kind === 'ranged') {
      const pierce = def.pierce + ench.pierce;
      for (let i = 0; i < def.count; i++) {
        const a = base + (def.count > 1 ? (i - (def.count - 1) / 2) * def.spread : 0) + rnd(-0.02, 0.02);
        const critical = Math.random() < Math.min(0.8, critChance + (def.critAdd || 0));
        bullets.push({
          x: player.x + Math.cos(a) * 12,
          y: player.y + Math.sin(a) * 12,
          vx: Math.cos(a) * def.speed,
          vy: Math.sin(a) * def.speed,
          r: critical ? 5 : 4,
          dmg: dmg * (critical ? critMult : 1),
          crit: critical,
          weaponId: w.id,
          form: w.level,
          blastR: def.blastR || 42,
          returnSpeed: def.returnSpeed || 340,
          bounce: ench.ricochet,
          split: ench.split,
          homing: ench.homing,
          returnT: w.id === 'boomerang' ? 0.55 : 0,
          returning: false,
          pierce, hits: [],
          life: def.range / def.speed + 0.2, color: def.color,
        });
      }
      for (let i = 0; i < 2; i++) {
        puff(player.x + Math.cos(base) * 14, player.y + Math.sin(base) * 14, def.color, 1, 60, 0.12);
      }
      Music.effect('shoot');
    } else if (def.kind === 'melee') {
      const critical = Math.random() < Math.min(0.8, critChance + (def.critAdd || 0));
      const dealtDmg = dmg * (critical ? critMult : 1);
      const swings = def.swings || 1;
      for (let s = 0; s < swings; s++) {
        slashes.push({ x: player.x, y: player.y, aim: base + (s - (swings - 1) / 2) * 0.34, arc: def.arc, life: 0.24 + s * 0.05, max: 0.24 + s * 0.05, color: critical ? COL.gold : def.color, r: def.range + s * 5, crit: critical, weaponId: w.id, blades: def.blades || 1, form: w.level });
      }
      Music.effect('melee');
      for (const e of enemies) {
        if (e.dead) continue;
        const d = dist(player, e);
        if (d > def.range + e.r) continue;
        let da = Math.atan2(e.y - player.y, e.x - player.x) - base;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) > def.arc / 2) continue;
        damageEnemy(e, dealtDmg * (1 + 0.42 * (swings - 1)), { crit: critical, leech: ench.leech });
        if (ench.knockback > 0 && !e.boss) {
          e.x += Math.cos(base) * (6 + ench.knockback * 5);
          e.y += Math.sin(base) * (6 + ench.knockback * 5);
        }
        applyEnchants(e, dealtDmg);
        for (let k = 0; k < 4; k++) puff(e.x, e.y, k % 2 ? '#e8f0f4' : def.color, 1, 105, 0.24);
      }
    }
  }

  // 刷怪
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = Math.max(0.36, 0.82 - time * 0.0035) / diff().spawn;
    if (enemies.length < 120) spawnWave();
  }

  // 精英：近战与远程交替登场，但身份和主动技能随地图变化。
  const eliteTimes = [40, 80];
  if (eliteIdx < eliteTimes.length && time >= eliteTimes[eliteIdx]) {
    const eliteType = eliteIdx % 2 === 0 ? 'eliteShooter' : 'elite';
    const myth = eliteMyth(currentMap.id);
    eliteIdx++;
    spawnEnemy(eliteType);
    addText(player.x, player.y - 34, myth.name + ' · ' + myth.skill, COL.red, 13);
  }

  // 关卡推进：Boss 关刷 Boss，普通关直接过关
  if (!bossSpawned && (time >= BOSS_TIME || (kills >= KILL_QUOTA && time >= 60))) {
    if (levelCfg().boss) spawnBoss();
    else completeLevel();
  }

  // 敌人
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt * 6);
    e.attackFx = Math.max(0, (e.attackFx || 0) - dt);
    e.dashT = Math.max(0, (e.dashT || 0) - dt);
    e.hitFxCd = Math.max(0, (e.hitFxCd || 0) - dt);
    if (e.slowT > 0) e.slowT = Math.max(0, e.slowT - dt);
    if (e.poisonT > 0) {
      e.poisonT = Math.max(0, e.poisonT - dt);
      e.poisonTick = (e.poisonTick || 0) - dt;
      if (e.poisonTick <= 0) {
        e.poisonTick = 0.4;
        damageEnemy(e, (e.poisonDps || 1) * 0.4);
        for (let k = 0; k < 2; k++) puff(e.x + rnd(-e.r, e.r), e.y + rnd(-e.r, e.r), k ? '#9bc65a' : '#5f8f46', 1, 30, 0.3);
        if (e.dead) continue;
      }
    }
    const stunned = e.stunT > 0;
    if (stunned) {
      e.stunT = Math.max(0, e.stunT - dt);
      e.attackFx = 0;
    } else if (e.fireCd > 0) {
      e.fireCd -= dt;
    }

    if (stunned) {
      // 雷罚禁锢期间不移动、不冲撞、不施放远程攻击。
    } else if (e.boss) {
      updateBoss(e, dt);
    } else {
      let vx = player.x - e.x;
      let vy = player.y - e.y;
      const d = Math.hypot(vx, vy) || 1;
      vx /= d;
      vy /= d;
      const aim = Math.atan2(vy, vx);
      if (e.elite && !e.rangedElite) {
        e.mythCd = (e.mythCd || 0) - dt;
        if (e.mythCd <= 0 && d < 300) {
          castEliteSkill(e, aim, true);
          e.mythCd = 4.4 + rnd(0, 1.2);
        }
      }
      if (e.type === 'bat') {
        const s = Math.sin(e.t * 5 + e.phase) * 0.7;
        const nx = vx - vy * s;
        const ny = vy + vx * s;
        vx = nx; vy = ny;
      } else if (e.type === 'shooter' || e.type === 'eliteShooter') {
        const rangedElite = e.type === 'eliteShooter';
        const myth = eliteMyth(e.themeId || currentMap.id);
        const far = rangedElite ? myth.far : 140;
        const near = rangedElite ? myth.near : 90;
        if (d > far) { /* 靠近 */ }
        else if (d < near) { vx = -vx; vy = -vy; }
        else { const oldVx = vx; vx = -vy * 0.72; vy = oldVx * 0.72; }
        if (e.fireCd <= 0 && d < 280) {
          e.fireCd = rangedElite ? myth.cd : 1.7;
          e.attackFx = rangedElite ? 0.34 : 0.22;
          const bx = player.x - e.x, by = player.y - e.y;
          const bd = Math.hypot(bx, by) || 1;
          const aim = Math.atan2(by, bx);
          e.attackA = aim;
          if (rangedElite) castEliteSkill(e, aim, false);
          else {
            ebullets.push({
              x: e.x + Math.cos(aim) * e.r, y: e.y + Math.sin(aim) * e.r,
              vx: Math.cos(aim) * 150, vy: Math.sin(aim) * 150,
              r: 4, dmg: 6 * diff().dmg, life: 4,
              color: '#c75a9a', weaponId: 'enemyInk', themeId: currentMap.id,
            });
          }
        }
      } else if (e.type === 'jumper') {
        const hop = (e.t % 1.5) < 0.3 ? 2.5 : 0.55;
        vx *= hop;
        vy *= hop;
      }
      let fieldSlow = 1;
      for (const f of fields) {
        if (Math.hypot(e.x - f.x, e.y - f.y) < f.r + e.r * 0.5) { fieldSlow = Math.min(fieldSlow, f.slow); break; }
      }
      const mountainSlow = (currentMap.mech === 'four' && fourPhase === 3) ? 0.75 : 1;
      const spd = e.speed * (e.slowT > 0 ? e.slowMul : 1) * fieldSlow * mountainSlow * (e.dashT > 0 ? 2.35 : 1);
      e.x += vx * spd * dt;
      e.y += vy * spd * dt;
    }
    resolveMapCollision(e, e.r);

    // 分离，避免叠一起
    for (let j = i - 1; j >= 0; j--) {
      const o = enemies[j];
      if (o.dead) continue;
      const ox = e.x - o.x;
      const oy = e.y - o.y;
      const od = Math.hypot(ox, oy);
      const min = e.r + o.r;
      if (od > 0.01 && od < min) {
        const push = ((min - od) / od) * 0.5;
        e.x += ox * push * dt * 8;
        e.y += oy * push * dt * 8;
        o.x -= ox * push * dt * 8;
        o.y -= oy * push * dt * 8;
      }
    }

    if (!stunned && dist(e, player) < e.r + player.r) {
      if (player.inv <= 0) {
        e.attackFx = e.elite ? 0.34 : 0.22;
        e.attackA = Math.atan2(player.y - e.y, player.x - e.x);
      }
      damagePlayer(e.dmg);
    }
  }

  // 玩家子弹
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    if (b.weaponId === 'boomerang') {
      b.returnT -= dt;
      if (b.returnT <= 0) b.returning = true;
      if (b.returning) {
        const dx = player.x - b.x;
        const dy = player.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        b.vx = dx / d * (b.returnSpeed || 340);
        b.vy = dy / d * (b.returnSpeed || 340);
        if (d < player.r + 10) { bullets.splice(i, 1); continue; }
      }
    }
    if (b.homing > 0 && !b.returning) {
      let target = null;
      let targetDist = 170 + b.homing * 35;
      for (const e of enemies) {
        if (e.dead || b.hits.indexOf(e) >= 0) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d < targetDist) { targetDist = d; target = e; }
      }
      if (target) {
        const speed = Math.hypot(b.vx, b.vy) || 1;
        const desired = Math.atan2(target.y - b.y, target.x - b.x);
        const current = Math.atan2(b.vy, b.vx);
        let turn = desired - current;
        while (turn > Math.PI) turn -= TAU;
        while (turn < -Math.PI) turn += TAU;
        const a = current + clamp(turn, -dt * (1.4 + b.homing * 0.7), dt * (1.4 + b.homing * 0.7));
        b.vx = Math.cos(a) * speed;
        b.vy = Math.sin(a) * speed;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) { bullets.splice(i, 1); continue; }
    let hit = false;
    for (const e of enemies) {
      if (e.dead || b.hits.indexOf(e) >= 0) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
        damageEnemy(e, b.dmg, { crit: !!b.crit, leech: ench.leech });
        applyEnchants(e, b.dmg);
        if (ench.knockback > 0 && !e.boss) {
          const bd = Math.hypot(b.vx, b.vy) || 1;
          e.x += b.vx / bd * (5 + ench.knockback * 4);
          e.y += b.vy / bd * (5 + ench.knockback * 4);
        }
        b.hits.push(e);
        if (b.split > 0 && !b.isChild) {
          const baseA = Math.atan2(b.vy, b.vx);
          const speed = Math.hypot(b.vx, b.vy) * 0.82;
          for (let k = -1; k <= 1; k += 2) {
            const a = baseA + k * (0.32 + b.split * 0.08);
            bullets.push({
              x: b.x, y: b.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
              r: Math.max(2.5, b.r * 0.72), dmg: b.dmg * (0.36 + b.split * 0.08), crit: false,
              weaponId: b.weaponId, form: b.form, pierce: 0, bounce: 0, split: 0,
              homing: Math.max(0, (b.homing || 0) - 1), returning: false, returnT: 0,
              hits: [e], life: Math.min(0.7, b.life + 0.25), color: b.color, isChild: true,
            });
          }
          for (let k = 0; k < 4; k++) puff(b.x, b.y, b.color, 1, 70, 0.22);
        }
        if (b.weaponId === 'eraser') {
          explodeAt(b.x, b.y, b.blastR || 42, b.dmg * 0.65);
          for (let k = 0; k < 8; k++) puff(b.x, b.y, k % 2 ? '#f2b5c3' : '#f7e4cf', 1, 115, 0.34);
          hit = true;
          break;
        }
        if (b.bounce > 0) {
          let next = null;
          let nextD = 150 + b.bounce * 40;
          for (const candidate of enemies) {
            if (candidate.dead || b.hits.indexOf(candidate) >= 0) continue;
            const d = Math.hypot(candidate.x - b.x, candidate.y - b.y);
            if (d < nextD) { nextD = d; next = candidate; }
          }
          if (next) {
            const speed = Math.hypot(b.vx, b.vy) || 1;
            const a = Math.atan2(next.y - b.y, next.x - b.x);
            b.vx = Math.cos(a) * speed;
            b.vy = Math.sin(a) * speed;
            b.bounce--;
            for (let k = 0; k < 3; k++) puff(b.x, b.y, b.color, 1, 55, 0.18);
            break;
          }
        }
        if (b.pierce > 0) b.pierce--;
        else { hit = true; break; }
      }
    }
    if (hit) bullets.splice(i, 1);
  }

  // 敌方子弹
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.w || b.y > WORLD.h) {
      ebullets.splice(i, 1);
      continue;
    }
    if (Math.hypot(player.x - b.x, player.y - b.y) < player.r + b.r) {
      if ((player.shield > 0 || player.ward > 0) && ench.deflect > 0 && Math.random() < 0.15 * ench.deflect) {
        for (let k = 0; k < 6; k++) puff(b.x, b.y, COL.gold, 1, 90, 0.3);
        let t = null;
        let bd = 260;
        for (const e of enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d < bd) { bd = d; t = e; }
        }
        if (t) damageEnemy(t, 26);
        ebullets.splice(i, 1);
        continue;
      }
      damagePlayerRanged(b.dmg, b.x, b.y);
      ebullets.splice(i, 1);
    }
  }

  // 经验宝石
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    g.life += dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.vx *= Math.pow(0.02, dt);
    g.vy *= Math.pow(0.02, dt);
    const d = Math.hypot(player.x - g.x, player.y - g.y);
    if (d < player.magnet) {
      const pull = 260 + 420 * (1 - d / player.magnet);
      g.x += ((player.x - g.x) / (d || 1)) * pull * dt;
      g.y += ((player.y - g.y) / (d || 1)) * pull * dt;
    }
    if (d < player.r + 8) {
      player.xp += g.value;
      Music.effect('pickup');
      gems.splice(i, 1);
      if (player.xp >= player.xpNeed) levelUpCheck();
    }
  }

  // 斩击特效
  for (let i = slashes.length - 1; i >= 0; i--) {
    slashes[i].life -= dt;
    if (slashes[i].life <= 0) slashes.splice(i, 1);
  }

  // 粒子 / 飘字
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.05, dt);
    p.vy *= Math.pow(0.05, dt);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt;
    t.y -= 22 * dt;
    if (t.life <= 0) texts.splice(i, 1);
  }
  for (let i = combatFx.length - 1; i >= 0; i--) {
    combatFx[i].life -= dt;
    if (combatFx[i].life <= 0) combatFx.splice(i, 1);
  }

  // 相机
  const tx = clamp(player.x - VW / 2, 0, WORLD.w - VW);
  const ty = clamp(player.y - VH / 2, 0, WORLD.h - VH);
  camera.x += (tx - camera.x) * Math.min(1, dt * 8);
  camera.y += (ty - camera.y) * Math.min(1, dt * 8);
}

function levelUpCheck() {
  if (player.xp < player.xpNeed) return;
  player.xp -= player.xpNeed;
  player.level++;
  player.xpNeed = Math.floor(5 + player.level * 3 + player.level * player.level * 0.25);
  levelUp();
}

// 每个 Boss 的招式序列（按地图）
const BOSS_ATTACKS = {
  forest:  ['charge', 'summon'],
  waste:   ['charge', 'ring'],
  desert:  ['burst', 'spiral'],
  swamp:   ['ring', 'rain', 'summon'],
  ocean:   ['burst', 'charge'],
  volcano: ['rain', 'ring'],
  inferno: ['summon', 'ring'],
  heaven:  ['bolt', 'charge'],
  four:    ['ring', 'charge', 'rain', 'summon'],
  snow:    ['gale', 'charge', 'ring'],
  crimson: ['warcry', 'rain', 'charge', 'spiral'],
};

const BOSS_ATTACK_LABELS = {
  ring: '环形弹幕',
  burst: '扇面连射',
  spiral: '双重螺旋',
  summon: '召唤援军',
  rain: '落火预警',
  bolt: '天雷锁定',
  charge: '蓄力冲撞',
  gale: '末日狼嚎',
  warcry: '战神军阵',
};

function bossAttackList() {
  return BOSS_ATTACKS[currentMap.id] || ['ring'];
}

function bossBullet(e, a, spd, r, dmg, life) {
  ebullets.push({
    x: e.x + Math.cos(a) * 16,
    y: e.y + Math.sin(a) * 16,
    vx: Math.cos(a) * spd,
    vy: Math.sin(a) * spd,
    r, dmg, life,
    color: currentMap.doodle,
    weaponId: 'bossOrb',
  });
}

function doBossAttack(e, atk, dx, dy) {
  const base = Math.atan2(dy, dx);
  if (atk === 'ring') {
    const n = 14;
    for (let i = 0; i < n; i++) bossBullet(e, (i / n) * TAU + e.t, 105, 5, 10, 5);
  } else if (atk === 'burst') {
    for (let i = 0; i < 5; i++) bossBullet(e, base + (i - 2) * 0.17, 175, 4.5, 9, 4);
  } else if (atk === 'spiral') {
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 10; i++) bossBullet(e, (i / 10) * TAU + e.t * 2 + k * 0.31, 115, 4, 8, 5);
    }
  } else if (atk === 'summon') {
    for (let i = 0; i < 3; i++) spawnEnemy('slime');
  } else if (atk === 'rain') {
    for (let i = 0; i < 3; i++) {
      const a = rnd(0, TAU);
      const dd = rnd(0, 90);
      hazards.push({
        kind: 'zone',
        x: clamp(player.x + Math.cos(a) * dd, 40, WORLD.w - 40),
        y: clamp(player.y + Math.sin(a) * dd, 40, WORLD.h - 40),
        r: 34, t: 0, delay: 1.0, dmgE: 40, dmgP: 12, color: currentMap.doodle,
      });
    }
  } else if (atk === 'bolt') {
    hazards.push({
      kind: 'bolt', x: player.x, y: player.y, r: 26, t: 0, delay: 0.5,
      dmgE: 90, dmgP: 12, color: currentMap.doodle,
    });
  } else if (atk === 'charge') {
    e.tele = 0.6;
  } else if (atk === 'gale') {
    const fromLeft = e.x < player.x;
    hazards.push({ kind: 'tumble', x: fromLeft ? camera.x - 70 : camera.x + VW + 70, y: player.y, vx: (fromLeft ? 1 : -1) * 175, vy: 0, r: 48, t: 0, life: 10, hitCd: 0, dmgE: 40, dmgP: 15, color: '#79c8df', wide: true, snow: true });
  } else if (atk === 'warcry') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + e.t * 0.25;
      bossBullet(e, a, i % 2 ? 145 : 115, i % 2 ? 4.2 : 5.5, i % 2 ? 9 : 12, 5);
    }
    for (let i = 0; i < 2; i++) {
      const a = base + (i ? 0.34 : -0.34);
      bossBullet(e, a, 220, 6, 14, 4);
    }
  }
}

function updateBoss(e, dt) {
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const frostMul = e.slowT > 0 ? e.slowMul : 1;

  if (e.tele > 0) {
    e.tele -= dt;
    if (e.tele <= 0) {
      e.chargeT = 0.45;
      e.chargeA = Math.atan2(dy, dx);
    }
    return;
  }
  if (e.chargeT > 0) {
    e.chargeT -= dt;
    e.x += Math.cos(e.chargeA) * 420 * frostMul * dt;
    e.y += Math.sin(e.chargeA) * 420 * frostMul * dt;
    e.x = clamp(e.x, 20, WORLD.w - 20);
    e.y = clamp(e.y, 20, WORLD.h - 20);
    for (let i = 0; i < 2; i++) puff(e.x, e.y, currentMap.doodle, 1, 50, 0.2);
    return;
  }

  e.x += (dx / d) * e.speed * frostMul * dt;
  e.y += (dy / d) * e.speed * frostMul * dt;

  e.atkCd -= dt;
  if (e.atkCd <= 0) {
    const list = bossAttackList();
    const atk = list[e.atkIdx % list.length];
    e.atkIdx++;
    e.lastAttack = atk;
    e.attackFx = 0.5;
    e.atkCd = atk === 'charge' ? 2.8 : 2.4;
    addText(e.x, e.y - e.r - 12, BOSS_ATTACK_LABELS[atk] || '', currentMap.doodle, 9);
    doBossAttack(e, atk, dx, dy);
  }
}

// =============================================================
// 6. 渲染
// =============================================================
function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = COL.paper;
  ctx.fillRect(0, 0, VW, VH);

  if (state === 'menu') {
    withInkSeed(0x4d454e55, drawMenu);
    return;
  }

  RD = makeRng((Math.floor(performance.now() / 125) * 2654435761) >>> 0);

  ctx.save();
  const shakeFade = shakeT > 0 ? Math.min(1, shakeT / 0.12) : 0;
  const shakeNow = performance.now() * 0.001;
  const shakeX = Math.sin(shakeNow * 83) * shakePower * shakeFade;
  const shakeY = Math.cos(shakeNow * 71) * shakePower * 0.65 * shakeFade;
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawGround();
  drawTerrainRelief();
  drawProps('ground');
  drawAmbientScene();
  drawHazards();
  ctx.restore();

  const drawables = [];
  for (const p of props) {
    if (!isGroundProp(p) && propVisible(p)) drawables.push({ y: p.y + p.r * 0.45, kind: 'prop', p });
  }
  if (!BACKGROUND_PREVIEW) {
    for (const e of enemies) if (!e.dead) drawables.push({ y: e.y, kind: 'enemy', e });
    for (const g of gems) drawables.push({ y: g.y, kind: 'gem', g });
    drawables.push({ y: player.y, kind: 'player' });
  }
  drawables.sort((a, b) => a.y - b.y);

  for (const d of drawables) {
    if (d.kind === 'prop') {
      ctx.save();
      ctx.translate(shakeX, shakeY);
      drawProp(d.p, performance.now() / 1000);
      ctx.restore();
    }
    else if (d.kind === 'enemy') {
      const enemySeed = mapSeed(d.e.type || 'enemy') ^ Math.floor((d.e.phase || 0) * 1000000) ^ (d.e.elite ? 0xe11e : 0) ^ (d.e.boss ? 0xb055 : 0);
      withInkSeed(enemySeed, () => drawEnemy(d.e));
    }
    else if (d.kind === 'gem') drawGem(d.g);
    else withInkSeed(0x504c4159, drawPlayer);
  }

  if (!BACKGROUND_PREVIEW) {
    for (const b of bullets) drawBullet(b, b.color || COL.gold);
    for (const b of ebullets) drawBullet(b, b.color || COL.inkPurpleHi);
    for (const sl of slashes) {
      const p = clamp(1 - sl.life / sl.max, 0, 1);
      const alpha = Math.sin(p * Math.PI);
      if (sl.weaponId === 'compass' || sl.weaponId === 'bubblePulse') {
        ctx.save();
        ctx.globalAlpha = alpha * 0.25;
        ctx.strokeStyle = sl.weaponId === 'bubblePulse' ? '#d9fbff' : '#eadcf3';
        ctx.lineWidth = 14;
        ctx.beginPath(); ctx.arc(sl.x, sl.y, sl.r * (0.62 + p * 0.25), 0, TAU); ctx.stroke();
        ctx.globalAlpha = alpha * 0.9;
        ctx.strokeStyle = sl.crit ? COL.gold : sl.color;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(sl.x, sl.y, sl.r * (0.62 + p * 0.25), 0, TAU); ctx.stroke();
        const blades = sl.weaponId === 'bubblePulse' ? 6 : (sl.blades || 1);
        for (let i = 0; i < blades; i++) {
          const a = sl.aim + p * 2.6 + i * TAU / blades;
          const rr = sl.r * (0.62 + p * 0.25);
          if (sl.weaponId === 'bubblePulse') roughCircle(ctx, sl.x + Math.cos(a) * rr, sl.y + Math.sin(a) * rr, 4, '#e7ffff', sl.color, 1, 7);
          else roughLine(ctx, sl.x + Math.cos(a) * (rr - 10), sl.y + Math.sin(a) * (rr - 10), sl.x + Math.cos(a) * (rr + 8), sl.y + Math.sin(a) * (rr + 8), '#fffdf8', 2);
        }
        ctx.restore();
        continue;
      }
      const lead = sl.aim - sl.arc * 0.58 + sl.arc * p * 0.26;
      const tail = lead + sl.arc * (0.5 + p * 0.5);
      const radius = sl.r * (0.74 + p * 0.12);
      ctx.save();
      ctx.globalAlpha = alpha * 0.28;
      ctx.strokeStyle = sl.crit ? '#fff0a6' : '#dceff2';
      ctx.lineWidth = sl.crit ? 18 : 14;
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, radius, lead, tail);
      ctx.stroke();

      ctx.globalAlpha = alpha * 0.92;
      ctx.strokeStyle = sl.crit ? COL.gold : sl.color;
      ctx.lineWidth = sl.crit ? 9 : 7;
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, radius, lead, tail);
      ctx.stroke();

      ctx.strokeStyle = '#fffdf8';
      ctx.lineWidth = sl.crit ? 3 : 2;
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, radius - 3, lead + 0.04, tail - 0.04);
      ctx.stroke();

      const tipX = sl.x + Math.cos(tail) * radius;
      const tipY = sl.y + Math.sin(tail) * radius;
      for (let i = 0; i < 3; i++) {
        const a = tail - 0.18 + i * 0.16;
        const len = 7 + i * 4;
        ctx.globalAlpha = alpha * (0.62 - i * 0.12);
        roughLine(ctx, tipX - Math.cos(a) * (6 + i * 3), tipY - Math.sin(a) * (6 + i * 3), tipX + Math.cos(a) * len, tipY + Math.sin(a) * len, sl.crit ? '#fff0a6' : sl.color, 1.6);
      }
      ctx.restore();
    }
    for (const fx of combatFx) drawCombatEffect(fx);
    for (const p of parts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    for (const t of texts) {
      ctx.globalAlpha = clamp(t.life / t.max, 0, 1);
      text(t.str, t.x, t.y, t.size, t.color, 'center', true);
      ctx.globalAlpha = 1;
    }

    if (flashT > 0) {
      ctx.fillStyle = 'rgba(217,79,61,' + (flashT * 2.2).toFixed(2) + ')';
      ctx.fillRect(camera.x, camera.y, VW, VH);
    }
  }

  ctx.restore();
  withInkSeed(0x55494c41, () => {
    drawMapFrame();
    if (!BACKGROUND_PREVIEW) {
      drawHUD();
      drawOverlays();
    }
  });
}

function drawGround() {
  const tile = getPaperTile(currentMap);
  const x0 = Math.floor(camera.x / TILE_P) * TILE_P;
  const y0 = Math.floor(camera.y / TILE_P) * TILE_P;
  for (let x = x0; x < camera.x + VW; x += TILE_P) {
    for (let y = y0; y < camera.y + VH; y += TILE_P) {
      ctx.drawImage(tile, x, y);
    }
  }
  // 世界边界
  roughBox(ctx, 0, 0, WORLD.w, WORLD.h, null, 'rgba(58,48,38,0.18)', 3);
}

function mapSeed(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function terrainColors() {
  const id = currentMap.id;
  if (id === 'forest') return { top: '#9db85a', side: '#65783b', accent: '#d6c174', kind: 'bank' };
  if (id === 'waste') return { top: '#e7b566', side: '#b96f46', accent: '#f5d795', kind: 'bank' };
  if (id === 'desert') return { top: '#efc775', side: '#c97745', accent: '#f9e1a8', kind: 'bank' };
  if (id === 'swamp') return { top: '#7f9b55', side: '#4f6539', accent: '#6d8d79', kind: 'pool' };
  if (id === 'ocean') return { top: '#9fcfd6', side: '#5c9bad', accent: '#d9eef0', kind: 'pool' };
  if (id === 'volcano') return { top: '#51464a', side: '#2e292d', accent: '#f27835', kind: 'lava' };
  if (id === 'inferno') return { top: '#322534', side: '#160f1c', accent: '#b92f58', kind: 'abyss' };
  if (id === 'heaven') return { top: '#f6f0dc', side: '#88a4bf', accent: '#d2a63b', kind: 'cloud' };
  if (id === 'snow') return { top: '#d8e8ed', side: '#89a8b7', accent: '#f5fbff', kind: 'ice' };
  if (id === 'crimson') return { top: '#542634', side: '#24131b', accent: '#d74a60', kind: 'blood' };
  const phase = ['#95ad62', '#d7ae59', '#c65a45', '#7f91a2'][fourPhase] || '#b49a65';
  return { top: shade(phase, -0.24), side: shade(phase, -0.56), accent: shade(phase, 0.12), kind: 'bank' };
}

function reliefPoints(cx, cy, rx, ry, R, oy) {
  const pts = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const wobble = 0.82 + R() * 0.28;
    pts.push([cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble + (oy || 0)]);
  }
  return pts;
}

function initTerrain() {
  const cellW = 230;
  const cellH = 165;
  const seed = mapSeed(currentMap.id);
  const kind = terrainColors().kind;
  const gx1 = Math.ceil(WORLD.w / cellW);
  const gy1 = Math.ceil(WORLD.h / cellH);
  for (let gx = -1; gx <= gx1; gx++) {
    for (let gy = -1; gy <= gy1; gy++) {
      const mixed = (seed ^ Math.imul(gx + 2048, 73856093) ^ Math.imul(gy + 4096, 19349663)) >>> 0;
      const R = makeRng(mixed);
      if (R() < 0.36) continue;
      const cx = gx * cellW + 34 + R() * (cellW - 68);
      const cy = gy * cellH + 26 + R() * (cellH - 52);
      const rx = 34 + R() * 48;
      const ry = 13 + R() * 20;
      if (Math.hypot(cx - player.x, cy - player.y) < 105 + rx * 0.35) continue;
      terrainBlocks.push({
        x: cx,
        y: cy,
        rx,
        ry,
        kind,
        solid: kind !== 'pool',
        points: reliefPoints(cx, cy, rx, ry, R, 0),
      });
    }
  }
}

function drawTerrainRelief() {
  const pal = terrainColors();
  for (const block of terrainBlocks) {
      const cx = block.x;
      const cy = block.y;
      const rx = block.rx;
      const ry = block.ry;
      if (cx + rx < camera.x - 30 || cx - rx > camera.x + VW + 30 || cy + ry < camera.y - 30 || cy - ry > camera.y + VH + 40) continue;
      const depth = pal.kind === 'cloud' ? 7 : 9;
      const top = block.points;
      const lower = top.map((pt) => [pt[0] + 4, pt[1] + depth]);
      const shadow = top.map((pt) => [pt[0] + 8, pt[1] + depth + 5]);

      fillPoly(ctx, shadow, 'rgba(58,48,38,0.14)');
      fillPoly(ctx, lower, pal.side);
      strokePoly(ctx, lower, shade(pal.side, -0.22), 1.3);
      fillPoly(ctx, top, pal.top);
      strokePoly(ctx, top, shade(pal.side, -0.3), 1.4);

      if (pal.kind === 'abyss') {
        const inner = top.map((pt) => [cx + (pt[0] - cx) * 0.72, cy + (pt[1] - cy) * 0.58]);
        const core = top.map((pt) => [cx + (pt[0] - cx) * 0.42, cy + (pt[1] - cy) * 0.3]);
        fillPoly(ctx, inner, '#771f43');
        strokePoly(ctx, inner, '#d33e62', 1.4);
        fillPoly(ctx, core, '#160e1b');
        roughLine(ctx, cx - rx * 0.45, cy - ry * 0.12, cx - rx * 0.08, cy + ry * 0.08, '#e14d6d', 1.2);
        roughLine(ctx, cx + rx * 0.06, cy + ry * 0.02, cx + rx * 0.46, cy - ry * 0.2, '#9e2b52', 1.1);
      } else if (pal.kind === 'lava' || pal.kind === 'pool') {
        const inner = top.map((pt) => [cx + (pt[0] - cx) * 0.66, cy + (pt[1] - cy) * 0.54]);
        fillPoly(ctx, inner, pal.accent);
        strokePoly(ctx, inner, pal.kind === 'lava' ? '#ffb23d' : shade(pal.side, -0.05), 1.2);
        if (pal.kind === 'lava') {
          roughLine(ctx, cx - rx * 0.32, cy, cx + rx * 0.2, cy - ry * 0.12, '#ffd15b', 1.4);
          roughLine(ctx, cx + rx * 0.16, cy - ry * 0.1, cx + rx * 0.4, cy + ry * 0.18, '#ffd15b', 1.2);
        }
      } else {
        roughLine(ctx, cx - rx * 0.48, cy - ry * 0.18, cx + rx * 0.36, cy - ry * 0.42, tint(pal.accent, 0.75), 1.3);
      }

      if (currentMap.id === 'forest') {
        for (let i = -1; i <= 1; i++) {
          const x = cx + i * rx * 0.28;
          roughLine(ctx, x, cy + ry * 0.12, x - 3, cy - ry * 0.28, '#536f34', 1);
          roughLine(ctx, x, cy + ry * 0.12, x + 4, cy - ry * 0.2, '#819c46', 1);
        }
        roughCircle(ctx, cx + rx * 0.48, cy - ry * 0.14, 2.2, '#f4df9b', '#8b7042', 0.6, 7);
      } else if (currentMap.id === 'waste') {
        roughLine(ctx, cx - rx * 0.62, cy + ry * 0.05, cx + rx * 0.55, cy + ry * 0.16, '#a85f42', 1.2);
        roughLine(ctx, cx - rx * 0.45, cy + ry * 0.35, cx + rx * 0.32, cy + ry * 0.42, '#f1c47d', 1);
        roughCircle(ctx, cx + rx * 0.48, cy - ry * 0.18, 2.5, '#8f6849', COL.ink, 0.6, 7);
      } else if (currentMap.id === 'desert') {
        ctx.beginPath();
        ctx.moveTo(cx - rx * 0.65, cy + ry * 0.12);
        ctx.quadraticCurveTo(cx, cy - ry * 0.55, cx + rx * 0.65, cy + ry * 0.02);
        ctx.strokeStyle = '#d98e3d'; ctx.lineWidth = 1.4; ctx.stroke();
        roughLine(ctx, cx - rx * 0.2, cy + ry * 0.35, cx + rx * 0.44, cy + ry * 0.26, '#f7d994', 1);
      } else if (currentMap.id === 'swamp') {
        roughEllipse(ctx, cx - rx * 0.22, cy - ry * 0.02, rx * 0.18, ry * 0.14, '#7ba468', '#486d50', 0.7, 8);
        roughCircle(ctx, cx + rx * 0.3, cy - ry * 0.12, 1.8, null, '#c6dc9b', 0.8, 7);
        roughCircle(ctx, cx + rx * 0.4, cy + ry * 0.12, 1.2, null, '#c6dc9b', 0.7, 7);
      } else if (currentMap.id === 'ocean') {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(cx + i * rx * 0.3, cy, rx * 0.2, 0.2, Math.PI * 0.9);
          ctx.strokeStyle = 'rgba(245,252,248,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
        }
      } else if (currentMap.id === 'volcano' || currentMap.id === 'inferno') {
        for (let i = -2; i <= 2; i++) {
          roughCircle(ctx, cx + i * rx * 0.18, cy + ry * 0.42 + Math.abs(i) * 1.4, 2.2, i % 2 ? '#2b272b' : '#645158', COL.ink, 0.5, 7);
        }
        if (currentMap.id === 'inferno') {
          roughCircle(ctx, cx - rx * 0.2, cy - ry * 0.25, 1.8, '#f07aa0', null, 0, 7);
          roughCircle(ctx, cx + rx * 0.26, cy - ry * 0.32, 1.4, '#b83268', null, 0, 7);
        }
      } else if (currentMap.id === 'heaven') {
        roughLine(ctx, cx - rx * 0.52, cy + ry * 0.08, cx + rx * 0.48, cy - ry * 0.08, '#d5ab42', 1.5);
        roughCircle(ctx, cx - rx * 0.38, cy - ry * 0.2, ry * 0.42, '#f9fcff', '#95acbf', 0.7, 8);
        roughCircle(ctx, cx, cy - ry * 0.38, ry * 0.55, '#fffef7', '#95acbf', 0.7, 8);
        roughCircle(ctx, cx + rx * 0.38, cy - ry * 0.16, ry * 0.4, '#f9fcff', '#95acbf', 0.7, 8);
        doodleStar(ctx, cx + rx * 0.16, cy - ry * 0.5, 2.5, '#d3a93b', 0.9);
      } else if (currentMap.id === 'four') {
        const fourCols = ['#6f8d3b', '#d5a13a', '#d75a45', '#7189a6'];
        for (let i = 0; i < 4; i++) {
          fillPoly(ctx, [[cx - 18 + i * 12, cy], [cx - 14 + i * 12, cy - 4], [cx - 10 + i * 12, cy], [cx - 14 + i * 12, cy + 4]], tint(fourCols[i], i === fourPhase ? 0.9 : 0.48));
        }
      }
  }
}

function isGroundProp(p) {
  return p.kind === 'flower' || p.kind === 'shaving' || p.kind === 'shell' || p.kind === 'lotus' || p.kind === 'emberPile';
}

function propVisible(p) {
  return p.x >= camera.x - 80 && p.x <= camera.x + VW + 80 && p.y >= camera.y - 90 && p.y <= camera.y + VH + 90;
}

function propCollisionRadius(p) {
  if (p.kind === 'canopy') return p.r * 0.34;
  if (p.kind === 'stump') return p.r * 0.62;
  if (p.kind === 'rock') return p.r * 0.72;
  if (p.kind === 'cactus') return p.r * 0.34;
  if (p.kind === 'arch') return p.r * 0.75;
  if (p.kind === 'crystal') return p.r * 0.48;
  if (p.kind === 'pillar') return p.r * 0.54;
  if (p.kind === 'coral') return p.r * 0.34;
  if (p.kind === 'cloud') return p.r * 0.68;
  if (p.kind === 'deadTree' || p.kind === 'charTree') return p.r * 0.34;
  if (p.kind === 'sandstone') return p.r * 0.72;
  if (p.kind === 'mangrove') return p.r * 0.42;
  if (p.kind === 'anemone') return p.r * 0.3;
  if (p.kind === 'lavaVent' || p.kind === 'basalt' || p.kind === 'obelisk') return p.r * 0.58;
  if (p.kind === 'skyPillar') return p.r * 0.56;
  if (p.kind === 'shrine') return p.r * 0.72;
  if (p.kind === 'heavenGate') return p.r * 0.78;
  if (p.kind === 'goldLantern') return p.r * 0.28;
  return 0;
}

function pushOutsideEllipse(body, radius, cx, cy, rx, ry) {
  const ex = rx + radius;
  const ey = ry + radius * 0.72;
  const dx = body.x - cx;
  const dy = body.y - cy;
  const nx = dx / ex;
  const ny = dy / ey;
  if (nx * nx + ny * ny >= 1) return;
  const a = Math.atan2(ny || 0.001, nx || 0.001);
  body.x = cx + Math.cos(a) * ex;
  body.y = cy + Math.sin(a) * ey;
}

function resolveMapCollision(body, radius) {
  for (const block of terrainBlocks) {
    if (!block.solid) continue;
    if (Math.abs(body.x - block.x) > block.rx + radius + 4 || Math.abs(body.y - block.y) > block.ry + radius + 4) continue;
    pushOutsideEllipse(body, radius, block.x, block.y, block.rx, block.ry);
  }
  for (const p of props) {
    const pr = propCollisionRadius(p);
    if (!pr) continue;
    const dx = body.x - p.x;
    const dy = body.y - p.y;
    const min = pr + radius;
    const d = Math.hypot(dx, dy);
    if (d >= min) continue;
    const nx = d > 0.001 ? dx / d : 1;
    const ny = d > 0.001 ? dy / d : 0;
    body.x = p.x + nx * min;
    body.y = p.y + ny * min;
  }
  body.x = clamp(body.x, radius, WORLD.w - radius);
  body.y = clamp(body.y, radius, WORLD.h - radius);
}

function drawProps(layer) {
  const t = performance.now() / 1000;
  for (const p of props) {
    if (!propVisible(p)) continue;
    if (layer === 'ground' && !isGroundProp(p)) continue;
    if (layer !== 'ground' && isGroundProp(p)) continue;
    drawProp(p, t);
  }
}

function drawProp(p, t) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const sway = Math.sin(t * 1.2 + p.phase) * 0.035;
    ctx.rotate(sway);
    if (!isGroundProp(p)) {
      roughEllipse(ctx, p.r * 0.28, p.r * 0.72, p.r * 1.05, p.r * 0.34, 'rgba(58,48,38,0.16)', null, 0, 10);
    }
    if (p.kind === 'canopy') {
      const c1 = p.tone > 0.5 ? '#6f8d3b' : '#7d9844';
      const c2 = p.tone > 0.5 ? '#a1b85d' : '#91aa50';
      fillPoly(ctx, [[-p.r * 0.25, p.r * 0.72], [-p.r * 0.2, -p.r * 0.35], [0, -p.r * 0.62], [p.r * 0.22, -p.r * 0.28], [p.r * 0.3, p.r * 0.72]], '#825536');
      strokePoly(ctx, [[-p.r * 0.25, p.r * 0.72], [-p.r * 0.2, -p.r * 0.35], [0, -p.r * 0.62], [p.r * 0.22, -p.r * 0.28], [p.r * 0.3, p.r * 0.72]], COL.ink, 1.3);
      roughLine(ctx, 0, p.r * 0.08, -p.r * 0.52, -p.r * 0.48, '#825536', Math.max(2, p.r * 0.14));
      roughLine(ctx, 0, 0, p.r * 0.5, -p.r * 0.55, '#825536', Math.max(2, p.r * 0.14));
      roughCircle(ctx, -p.r * 0.36 + 2, -p.r * 0.48 + 5, p.r * 0.6, shade(c1, -0.28), COL.ink, 1.2, 10);
      roughCircle(ctx, p.r * 0.35 + 2, -p.r * 0.44 + 5, p.r * 0.57, shade(c2, -0.28), COL.ink, 1.2, 10);
      roughCircle(ctx, 2, -p.r * 0.9 + 5, p.r * 0.64, shade(c1, -0.3), COL.ink, 1.2, 11);
      roughCircle(ctx, -p.r * 0.36, -p.r * 0.53, p.r * 0.58, c1, COL.ink, 1.2, 10);
      roughCircle(ctx, p.r * 0.35, -p.r * 0.46, p.r * 0.55, c2, COL.ink, 1.2, 10);
      roughCircle(ctx, 0, -p.r * 0.87, p.r * 0.62, p.tone > 0.68 ? '#cf8a3c' : '#819d45', COL.ink, 1.3, 11);
      roughEllipse(ctx, -p.r * 0.2, -p.r * 1.12, p.r * 0.28, p.r * 0.1, 'rgba(255,255,220,0.28)', null, 0, 8);
    } else if (p.kind === 'stump') {
      fillPoly(ctx, [[-p.r * 0.68, -p.r * 0.38], [p.r * 0.68, -p.r * 0.38], [p.r * 0.55, p.r * 0.62], [-p.r * 0.58, p.r * 0.62]], '#8f5534');
      strokePoly(ctx, [[-p.r * 0.68, -p.r * 0.38], [p.r * 0.68, -p.r * 0.38], [p.r * 0.55, p.r * 0.62], [-p.r * 0.58, p.r * 0.62]], COL.ink, 1.4);
      fillPoly(ctx, [[0, -p.r * 0.34], [p.r * 0.68, -p.r * 0.38], [p.r * 0.55, p.r * 0.62], [0, p.r * 0.5]], '#744329');
      roughEllipse(ctx, 0, -p.r * 0.42, p.r * 0.74, p.r * 0.36, '#d9a66b', COL.ink, 1.3, 11);
      roughCircle(ctx, 0, -p.r * 0.4, p.r * 0.3, null, '#9a6338', 1, 9);
      roughLine(ctx, -p.r * 0.36, -p.r * 0.48, p.r * 0.08, -p.r * 0.58, '#f2c98d', 1.2);
    } else if (p.kind === 'rock') {
      const rock = currentMap.id === 'snow' ? '#8ca5b8' : (currentMap.id === 'crimson' ? '#4b2530' : (currentMap.id === 'volcano' || currentMap.id === 'inferno' ? '#54474a' : '#9a8f82'));
      const outline = [[-p.r, p.r * 0.52], [-p.r * 0.72, -p.r * 0.35], [-p.r * 0.12, -p.r], [p.r * 0.68, -p.r * 0.42], [p.r, p.r * 0.52]];
      fillPoly(ctx, outline, rock);
      strokePoly(ctx, outline, COL.ink, 1.3);
      fillPoly(ctx, [[-p.r, p.r * 0.52], [-p.r * 0.72, -p.r * 0.35], [-p.r * 0.05, -p.r * 0.1], [-p.r * 0.08, p.r * 0.52]], shade(rock, 0.13));
      fillPoly(ctx, [[-p.r * 0.08, p.r * 0.52], [-p.r * 0.05, -p.r * 0.1], [p.r * 0.68, -p.r * 0.42], [p.r, p.r * 0.52]], shade(rock, -0.17));
      fillPoly(ctx, [[-p.r * 0.72, -p.r * 0.35], [-p.r * 0.12, -p.r], [p.r * 0.68, -p.r * 0.42], [-p.r * 0.05, -p.r * 0.1]], shade(rock, 0.22));
      strokePoly(ctx, outline, COL.ink, 1.3);
      roughLine(ctx, -p.r * 0.48, -p.r * 0.38, -p.r * 0.12, -p.r * 0.76, 'rgba(255,255,255,0.42)', 1.1);
    } else if (p.kind === 'flower') {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        roughCircle(ctx, Math.cos(a) * p.r * 0.45, Math.sin(a) * p.r * 0.45, p.r * 0.35, i % 2 ? '#fff6cf' : '#f2d7b0', COL.ink, 0.7, 7);
      }
      roughCircle(ctx, 0, 0, p.r * 0.3, COL.ochre, COL.ink, 0.8, 7);
    } else if (p.kind === 'cactus') {
      roughLine(ctx, p.r * 0.12, p.r * 1.02, p.r * 0.12, -p.r * 0.98, '#315b39', p.r * 0.66);
      roughLine(ctx, p.r * 0.12, p.r * 0.08, -p.r * 0.58, -p.r * 0.28, '#315b39', p.r * 0.48);
      roughLine(ctx, p.r * 0.12, p.r * 0.32, p.r * 0.72, 0, '#315b39', p.r * 0.48);
      roughLine(ctx, 0, p.r, 0, -p.r, '#4f7d46', p.r * 0.55);
      roughLine(ctx, 0, 0, -p.r * 0.7, -p.r * 0.35, '#4f7d46', p.r * 0.38);
      roughLine(ctx, 0, p.r * 0.25, p.r * 0.62, -p.r * 0.05, '#4f7d46', p.r * 0.38);
      roughLine(ctx, -p.r * 0.12, p.r * 0.72, -p.r * 0.12, -p.r * 0.68, '#82a65c', 1.2);
      roughCircle(ctx, 0, -p.r, p.r * 0.3, '#d95c48', COL.ink, 0.8, 7);
    } else if (p.kind === 'arch') {
      const stone = currentMap.id === 'desert' ? '#c97a50' : '#b56e4d';
      fillPoly(ctx, [[-p.r, p.r * 0.62], [-p.r * 0.78, -p.r * 0.62], [0, -p.r], [p.r * 0.78, -p.r * 0.62], [p.r, p.r * 0.62], [p.r * 0.42, p.r * 0.62], [p.r * 0.3, -p.r * 0.14], [-p.r * 0.3, -p.r * 0.14], [-p.r * 0.42, p.r * 0.62]], shade(stone, -0.16));
      strokePoly(ctx, [[-p.r, p.r * 0.62], [-p.r * 0.78, -p.r * 0.62], [0, -p.r], [p.r * 0.78, -p.r * 0.62], [p.r, p.r * 0.62], [p.r * 0.42, p.r * 0.62], [p.r * 0.3, -p.r * 0.14], [-p.r * 0.3, -p.r * 0.14], [-p.r * 0.42, p.r * 0.62]], COL.ink, 1.4);
      fillPoly(ctx, [[-p.r * 0.78, -p.r * 0.62], [0, -p.r], [p.r * 0.78, -p.r * 0.62], [p.r * 0.62, -p.r * 0.36], [0, -p.r * 0.62], [-p.r * 0.62, -p.r * 0.36]], shade(stone, 0.2));
      roughLine(ctx, -p.r * 0.52, -p.r * 0.43, p.r * 0.48, -p.r * 0.7, 'rgba(255,245,214,0.52)', 1.2);
    } else if (p.kind === 'deadTree' || p.kind === 'charTree') {
      const charred = p.kind === 'charTree';
      const bark = charred ? '#3b3032' : '#8a5b3d';
      const under = charred ? '#1f1b20' : '#5c3b2b';
      const branches = [[0, p.r * 0.72, 0, -p.r], [0, -p.r * 0.32, -p.r * 0.62, -p.r * 0.72], [0, -p.r * 0.48, p.r * 0.68, -p.r * 0.88], [-p.r * 0.34, -p.r * 0.58, -p.r * 0.46, -p.r * 1.08], [p.r * 0.42, -p.r * 0.72, p.r * 0.55, -p.r * 1.18]];
      for (const b of branches) roughLine(ctx, b[0] + 2.5, b[1] + 4, b[2] + 2.5, b[3] + 4, under, Math.max(2, p.r * 0.2));
      for (const b of branches) roughLine(ctx, b[0], b[1], b[2], b[3], bark, Math.max(1.6, p.r * 0.14));
      fillPoly(ctx, [[-p.r * 0.46, p.r * 0.72], [0, p.r * 0.42], [p.r * 0.48, p.r * 0.72], [0, p.r]], shade(bark, -0.18));
      strokePoly(ctx, [[-p.r * 0.46, p.r * 0.72], [0, p.r * 0.42], [p.r * 0.48, p.r * 0.72], [0, p.r]], COL.ink, 1.1);
      if (charred) {
        roughLine(ctx, -p.r * 0.12, -p.r * 0.62, p.r * 0.08, -p.r * 0.28, '#e75c36', 1.2);
        roughCircle(ctx, p.r * 0.52, -p.r * 1.12, p.r * 0.12, '#f08a36', null, 0, 7);
      }
    } else if (p.kind === 'tumbleweed') {
      roughCircle(ctx, 3, 4, p.r * 0.9, null, '#79583d', 2, 12);
      roughCircle(ctx, 0, 0, p.r * 0.9, null, '#ad7b45', 1.7, 12);
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6 + p.phase;
        roughLine(ctx, -Math.cos(a) * p.r * 0.72, -Math.sin(a) * p.r * 0.72, Math.cos(a) * p.r * 0.72, Math.sin(a) * p.r * 0.72, i % 2 ? '#8c6039' : '#c18a4a', 1);
      }
    } else if (p.kind === 'agave') {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * 0.9 + i * Math.PI * 0.3;
        const bx = Math.cos(a) * p.r * 0.18;
        const by = p.r * 0.58 + Math.sin(a) * p.r * 0.12;
        const tx = Math.cos(a) * p.r * 0.92;
        const ty = -p.r * (0.42 + 0.42 * Math.sin(a + Math.PI / 2));
        const leaf = [[bx - 2, by], [tx, ty], [bx + 3, by + 2]];
        fillPoly(ctx, leaf, i % 2 ? '#758f3d' : '#9aac4c');
        strokePoly(ctx, leaf, '#405631', 0.9);
      }
      roughEllipse(ctx, 0, p.r * 0.62, p.r * 0.5, p.r * 0.18, '#82633e', COL.ink, 0.8, 9);
    } else if (p.kind === 'sandstone') {
      const top = '#dc9258';
      fillPoly(ctx, [[-p.r, -p.r * 0.2], [-p.r * 0.55, -p.r * 0.72], [p.r * 0.58, -p.r * 0.64], [p.r, -p.r * 0.12], [p.r * 0.82, p.r * 0.62], [-p.r * 0.86, p.r * 0.62]], shade(top, -0.18));
      fillPoly(ctx, [[-p.r, -p.r * 0.2], [-p.r * 0.55, -p.r * 0.72], [p.r * 0.58, -p.r * 0.64], [p.r, -p.r * 0.12]], shade(top, 0.18));
      strokePoly(ctx, [[-p.r, -p.r * 0.2], [-p.r * 0.55, -p.r * 0.72], [p.r * 0.58, -p.r * 0.64], [p.r, -p.r * 0.12], [p.r * 0.82, p.r * 0.62], [-p.r * 0.86, p.r * 0.62]], COL.ink, 1.3);
      roughLine(ctx, -p.r * 0.72, p.r * 0.12, p.r * 0.7, p.r * 0.18, '#a75f3e', 1.3);
      roughLine(ctx, -p.r * 0.62, p.r * 0.42, p.r * 0.55, p.r * 0.46, '#f0b674', 1);
    } else if (p.kind === 'shaving') {
      ctx.strokeStyle = '#e1a33b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0.2, Math.PI * 1.45); ctx.stroke();
    } else if (p.kind === 'mushroom') {
      const cap = p.tone > 0.5 ? '#8b5f95' : '#c86672';
      fillPoly(ctx, [[-p.r * 0.22, p.r * 0.82], [-p.r * 0.18, -p.r * 0.06], [p.r * 0.2, -p.r * 0.06], [p.r * 0.28, p.r * 0.82]], '#d8bd8c');
      strokePoly(ctx, [[-p.r * 0.22, p.r * 0.82], [-p.r * 0.18, -p.r * 0.06], [p.r * 0.2, -p.r * 0.06], [p.r * 0.28, p.r * 0.82]], COL.ink, 1);
      roughEllipse(ctx, 0, -p.r * 0.08, p.r * 0.82, p.r * 0.38, shade(cap, -0.28), COL.ink, 1.2, 10);
      roughEllipse(ctx, -p.r * 0.06, -p.r * 0.28, p.r * 0.78, p.r * 0.42, cap, COL.ink, 1.2, 10);
      roughCircle(ctx, -p.r * 0.24, -p.r * 0.28, p.r * 0.12, '#fff3cf', null, 0, 7);
      roughCircle(ctx, p.r * 0.26, -p.r * 0.14, p.r * 0.1, '#fff3cf', null, 0, 7);
    } else if (p.kind === 'reed') {
      for (let i = -1; i <= 1; i++) {
        roughLine(ctx, i * p.r * 0.28, p.r, i * p.r * 0.18, -p.r, '#5f8040', 1.7);
        fillPoly(ctx, [[i * p.r * 0.18, -p.r], [i * p.r * 0.18 - 2.2, -p.r * 0.55], [i * p.r * 0.18 + 2.2, -p.r * 0.55]], '#8da85e');
      }
    } else if (p.kind === 'mangrove') {
      const trunk = '#75513b';
      for (let i = -1; i <= 1; i++) {
        roughLine(ctx, 0, p.r * 0.2, i * p.r * 0.52, p.r * 0.9, '#4e382f', Math.max(1.5, p.r * 0.12));
        roughLine(ctx, 0, p.r * 0.14, i * p.r * 0.5, p.r * 0.84, trunk, Math.max(1.2, p.r * 0.08));
      }
      roughLine(ctx, 0, p.r * 0.3, 0, -p.r * 0.62, trunk, Math.max(2.4, p.r * 0.2));
      const leafDark = '#405d3d';
      const leaf = p.tone > 0.5 ? '#68834d' : '#758d52';
      roughCircle(ctx, -p.r * 0.42 + 2, -p.r * 0.58 + 4, p.r * 0.48, leafDark, COL.ink, 1.1, 9);
      roughCircle(ctx, p.r * 0.4 + 2, -p.r * 0.55 + 4, p.r * 0.5, leafDark, COL.ink, 1.1, 9);
      roughCircle(ctx, 2, -p.r * 0.88 + 4, p.r * 0.55, shade(leafDark, -0.1), COL.ink, 1.1, 9);
      roughCircle(ctx, -p.r * 0.42, -p.r * 0.62, p.r * 0.45, leaf, COL.ink, 1, 9);
      roughCircle(ctx, p.r * 0.4, -p.r * 0.59, p.r * 0.47, shade(leaf, 0.08), COL.ink, 1, 9);
      roughCircle(ctx, 0, -p.r * 0.92, p.r * 0.52, shade(leaf, -0.05), COL.ink, 1, 9);
    } else if (p.kind === 'lotus') {
      roughEllipse(ctx, -p.r * 0.3, 0, p.r * 0.68, p.r * 0.38, '#6f9a58', '#45633f', 1, 10);
      roughEllipse(ctx, p.r * 0.34, p.r * 0.08, p.r * 0.64, p.r * 0.34, '#86aa63', '#45633f', 1, 10);
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        fillPoly(ctx, [[0, -p.r * 0.12], [Math.cos(a) * p.r * 0.55, Math.sin(a) * p.r * 0.34 - p.r * 0.2], [Math.cos(a + 0.6) * p.r * 0.24, Math.sin(a + 0.6) * p.r * 0.22 - p.r * 0.18]], i % 2 ? '#ef96b3' : '#ffd1dc');
      }
      roughCircle(ctx, 0, -p.r * 0.2, p.r * 0.13, '#f2c34d', COL.ink, 0.7, 7);
    } else if (p.kind === 'coral') {
      roughLine(ctx, p.r * 0.12, p.r * 1.04, p.r * 0.12, -p.r * 0.66, '#9e3f45', 4.5);
      roughLine(ctx, p.r * 0.12, p.r * 0.08, -p.r * 0.58, -p.r * 0.47, '#9e3f45', 3.6);
      roughLine(ctx, p.r * 0.12, -p.r * 0.08, p.r * 0.74, -p.r * 0.68, '#9e3f45', 3.6);
      roughLine(ctx, 0, p.r, 0, -p.r * 0.7, '#d96958', 3);
      roughLine(ctx, 0, 0, -p.r * 0.7, -p.r * 0.55, '#d96958', 2.4);
      roughLine(ctx, 0, -p.r * 0.15, p.r * 0.65, -p.r * 0.75, '#d96958', 2.4);
      roughLine(ctx, -p.r * 0.5, -p.r * 0.4, -p.r * 0.52, -p.r * 0.85, '#d96958', 2);
    } else if (p.kind === 'seaweed') {
      for (let i = -1; i <= 1; i++) {
        const x = i * p.r * 0.34;
        ctx.beginPath();
        ctx.moveTo(x + 2, p.r + 4);
        ctx.bezierCurveTo(x - p.r * 0.35, p.r * 0.3, x + p.r * 0.38, -p.r * 0.25, x + Math.sin(t * 1.8 + p.phase + i) * 3, -p.r);
        ctx.strokeStyle = '#315f57'; ctx.lineWidth = 4; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, p.r);
        ctx.bezierCurveTo(x - p.r * 0.35, p.r * 0.3, x + p.r * 0.38, -p.r * 0.25, x + Math.sin(t * 1.8 + p.phase + i) * 3 - 2, -p.r);
        ctx.strokeStyle = i % 2 ? '#4f8f73' : '#68a37e'; ctx.lineWidth = 2.5; ctx.stroke();
      }
    } else if (p.kind === 'anemone') {
      roughEllipse(ctx, 0, p.r * 0.55, p.r * 0.72, p.r * 0.3, '#8b665f', COL.ink, 1, 9);
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI + i * Math.PI / 8;
        const x = Math.cos(a) * p.r * 0.5;
        const topY = -p.r * (0.45 + (i % 3) * 0.18);
        roughLine(ctx, x + 2, p.r * 0.5, x * 1.35 + 2, topY + 3, '#8b496c', 3.2);
        roughLine(ctx, x, p.r * 0.46, x * 1.35, topY, i % 2 ? '#e4789d' : '#c76595', 2.1);
        roughCircle(ctx, x * 1.35, topY, p.r * 0.1, '#ffd2c9', null, 0, 7);
      }
    } else if (p.kind === 'shell') {
      ctx.fillStyle = '#efbf96';
      ctx.beginPath(); ctx.arc(0, 0, p.r, Math.PI, TAU); ctx.lineTo(-p.r, 0); ctx.fill();
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.2; ctx.stroke();
      for (let i = -2; i <= 2; i++) roughLine(ctx, 0, 0, i * p.r * 0.35, -p.r * 0.75, '#b97e68', 0.8);
    } else if (p.kind === 'lavaVent') {
      const rim = [[-p.r, p.r * 0.55], [-p.r * 0.72, -p.r * 0.22], [-p.r * 0.2, -p.r * 0.72], [p.r * 0.58, -p.r * 0.48], [p.r, p.r * 0.48]];
      fillPoly(ctx, rim, '#3a3438');
      strokePoly(ctx, rim, '#1f1c20', 1.4);
      roughEllipse(ctx, 0, -p.r * 0.18, p.r * 0.58, p.r * 0.3, '#e75c32', '#281f23', 1.4, 10);
      roughEllipse(ctx, -p.r * 0.06, -p.r * 0.22, p.r * 0.34, p.r * 0.15, '#ffb63f', null, 0, 9);
      roughLine(ctx, -p.r * 0.5, p.r * 0.16, -p.r * 0.18, -p.r * 0.04, '#e75c32', 1.5);
      roughLine(ctx, p.r * 0.34, p.r * 0.1, p.r * 0.08, -p.r * 0.02, '#e75c32', 1.5);
    } else if (p.kind === 'basalt') {
      const basaltSeam = currentMap.id === 'four'
        ? ['#708d53', '#b88d3b', '#a74655', '#667fa9'][fourPhase]
        : '#e86435';
      const heights = [0.72, 1.05, 0.82];
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * p.r * 0.48;
        const h = p.r * heights[i];
        const w = p.r * 0.42;
        fillPoly(ctx, [[x - w, p.r * 0.72], [x - w, -h * 0.52], [x, -h * 0.72], [x + w, -h * 0.52], [x + w, p.r * 0.72], [x, p.r * 0.9]], '#433a40');
        fillPoly(ctx, [[x, -h * 0.72], [x + w, -h * 0.52], [x, -h * 0.3], [x - w, -h * 0.52]], '#66535a');
        fillPoly(ctx, [[x, -h * 0.3], [x + w, -h * 0.52], [x + w, p.r * 0.72], [x, p.r * 0.9]], '#2d292f');
        strokePoly(ctx, [[x - w, p.r * 0.72], [x - w, -h * 0.52], [x, -h * 0.72], [x + w, -h * 0.52], [x + w, p.r * 0.72], [x, p.r * 0.9]], COL.ink, 1);
      }
      roughLine(ctx, 0, -p.r * 0.2, 0, p.r * 0.62, basaltSeam, 1.8);
    } else if (p.kind === 'emberPile') {
      roughEllipse(ctx, 0, p.r * 0.2, p.r, p.r * 0.42, 'rgba(231,75,52,0.18)', null, 0, 11);
      for (let i = 0; i < 7; i++) {
        const a = i * TAU / 7;
        roughCircle(ctx, Math.cos(a) * p.r * 0.55, Math.sin(a) * p.r * 0.24, p.r * 0.22, i % 2 ? '#692f35' : '#443038', COL.ink, 0.7, 7);
      }
      roughCircle(ctx, 0, 0, p.r * 0.28, '#ed5b37', '#4a2528', 0.8, 7);
      roughCircle(ctx, -p.r * 0.08, -p.r * 0.05, p.r * 0.12, '#ffc34a', null, 0, 7);
    } else if (p.kind === 'obelisk') {
      fillPoly(ctx, [[-p.r * 0.55, p.r], [-p.r * 0.45, -p.r * 0.42], [0, -p.r], [p.r * 0.45, -p.r * 0.42], [p.r * 0.55, p.r]], '#352d36');
      fillPoly(ctx, [[0, -p.r], [p.r * 0.45, -p.r * 0.42], [p.r * 0.55, p.r], [0, p.r * 0.72]], '#211f27');
      fillPoly(ctx, [[-p.r * 0.45, -p.r * 0.42], [0, -p.r], [0, p.r * 0.72], [-p.r * 0.55, p.r]], '#50404d');
      strokePoly(ctx, [[-p.r * 0.55, p.r], [-p.r * 0.45, -p.r * 0.42], [0, -p.r], [p.r * 0.45, -p.r * 0.42], [p.r * 0.55, p.r]], '#1d1a20', 1.4);
      roughLine(ctx, 0, -p.r * 0.45, 0, p.r * 0.52, '#e34a45', 2.1);
      roughLine(ctx, -p.r * 0.18, 0, p.r * 0.18, -p.r * 0.2, '#f08a36', 1.2);
    } else if (p.kind === 'cloud') {
      roughEllipse(ctx, 3, p.r * 0.35, p.r * 1.18, p.r * 0.5, '#a9bfd1', COL.ink, 1.1, 12);
      roughEllipse(ctx, 0, p.r * 0.16, p.r * 1.15, p.r * 0.48, '#d9e6ef', COL.ink, 1.1, 12);
      roughCircle(ctx, -p.r * 0.4, -p.r * 0.18, p.r * 0.55, '#f8fbff', COL.ink, 1, 9);
      roughCircle(ctx, p.r * 0.25, -p.r * 0.32, p.r * 0.7, '#f8fbff', COL.ink, 1, 10);
      roughEllipse(ctx, -p.r * 0.18, -p.r * 0.52, p.r * 0.28, p.r * 0.1, 'rgba(255,255,255,0.7)', null, 0, 8);
    } else if (p.kind === 'skyPillar') {
      fillPoly(ctx, [[-p.r * 0.62, p.r], [-p.r * 0.54, -p.r * 0.64], [0, -p.r * 0.92], [p.r * 0.54, -p.r * 0.64], [p.r * 0.62, p.r], [0, p.r * 1.15]], '#a9bfd1');
      fillPoly(ctx, [[-p.r * 0.54, -p.r * 0.64], [0, -p.r * 0.92], [p.r * 0.54, -p.r * 0.64], [0, -p.r * 0.34]], '#f4f2e4');
      fillPoly(ctx, [[0, -p.r * 0.34], [p.r * 0.54, -p.r * 0.64], [p.r * 0.62, p.r], [0, p.r * 1.15]], '#87a4be');
      strokePoly(ctx, [[-p.r * 0.62, p.r], [-p.r * 0.54, -p.r * 0.64], [0, -p.r * 0.92], [p.r * 0.54, -p.r * 0.64], [p.r * 0.62, p.r], [0, p.r * 1.15]], '#4d6074', 1.2);
      roughLine(ctx, -p.r * 0.42, -p.r * 0.15, p.r * 0.42, -p.r * 0.15, '#d6a83e', 2);
      roughLine(ctx, -p.r * 0.4, p.r * 0.42, p.r * 0.42, p.r * 0.42, '#d6a83e', 1.6);
    } else if (p.kind === 'shrine') {
      fillPoly(ctx, [[-p.r, p.r * 0.82], [-p.r * 0.82, -p.r * 0.12], [p.r * 0.82, -p.r * 0.12], [p.r, p.r * 0.82]], '#d7e1e8');
      fillPoly(ctx, [[-p.r * 0.82, -p.r * 0.12], [0, -p.r * 0.58], [p.r * 0.82, -p.r * 0.12], [0, p.r * 0.16]], '#f6f2df');
      strokePoly(ctx, [[-p.r, p.r * 0.82], [-p.r * 0.82, -p.r * 0.12], [0, -p.r * 0.58], [p.r * 0.82, -p.r * 0.12], [p.r, p.r * 0.82]], '#4f6274', 1.4);
      fillPoly(ctx, [[-p.r * 1.1, -p.r * 0.18], [0, -p.r], [p.r * 1.1, -p.r * 0.18], [p.r * 0.72, p.r * 0.02], [0, -p.r * 0.58], [-p.r * 0.72, p.r * 0.02]], '#6b8fba');
      strokePoly(ctx, [[-p.r * 1.1, -p.r * 0.18], [0, -p.r], [p.r * 1.1, -p.r * 0.18], [p.r * 0.72, p.r * 0.02], [0, -p.r * 0.58], [-p.r * 0.72, p.r * 0.02]], COL.ink, 1.2);
      roughBox(ctx, -p.r * 0.24, p.r * 0.18, p.r * 0.48, p.r * 0.64, '#fff8df', '#8b7042', 1);
      doodleStar(ctx, 0, p.r * 0.42, p.r * 0.13, '#d6a83e', 1.2);
      roughLine(ctx, -p.r * 0.68, -p.r * 0.18, 0, -p.r * 0.76, '#e0b84c', 2.2);
      roughLine(ctx, 0, -p.r * 0.76, p.r * 0.68, -p.r * 0.18, '#e0b84c', 2.2);
      roughCircle(ctx, 0, -p.r * 0.78, p.r * 0.09, '#f4d87a', '#8b7042', 0.7, 7);
    } else if (p.kind === 'heavenGate') {
      const roof = '#5d8eb5';
      const gold = '#d7aa3e';
      const ivory = '#f2ecd8';
      const gateTop = -p.r * 0.58;
      roughBox(ctx, -p.r * 0.86, gateTop, p.r * 0.28, p.r * 1.5, ivory, '#53697a', 1.2);
      roughBox(ctx, p.r * 0.58, gateTop, p.r * 0.28, p.r * 1.5, '#d5dde0', '#53697a', 1.2);
      fillPoly(ctx, [[-p.r * 1.16, gateTop], [0, -p.r * 1.2], [p.r * 1.16, gateTop], [p.r * 0.86, -p.r * 0.4], [0, -p.r * 0.76], [-p.r * 0.86, -p.r * 0.4]], roof);
      fillPoly(ctx, [[0, -p.r * 1.2], [p.r * 1.16, gateTop], [p.r * 0.86, -p.r * 0.4], [0, -p.r * 0.76]], shade(roof, -0.18));
      strokePoly(ctx, [[-p.r * 1.16, gateTop], [0, -p.r * 1.2], [p.r * 1.16, gateTop], [p.r * 0.86, -p.r * 0.4], [0, -p.r * 0.76], [-p.r * 0.86, -p.r * 0.4]], '#3f5264', 1.4);
      roughLine(ctx, -p.r * 1.04, gateTop - p.r * 0.02, 0, -p.r * 1.06, gold, 2.4);
      roughLine(ctx, 0, -p.r * 1.06, p.r * 1.04, gateTop - p.r * 0.02, gold, 2.4);
      roughBox(ctx, -p.r * 0.48, -p.r * 0.55, p.r * 0.96, p.r * 0.28, '#f5d66c', '#765e2f', 1.1);
      roughLine(ctx, -p.r * 0.78, -p.r * 0.2, -p.r * 0.66, p.r * 0.88, gold, 2);
      roughLine(ctx, p.r * 0.78, -p.r * 0.2, p.r * 0.66, p.r * 0.88, gold, 2);
      doodleStar(ctx, 0, -p.r * 0.41, p.r * 0.12, '#8b6a26', 1.1);
    } else if (p.kind === 'goldLantern') {
      const sway = Math.sin(performance.now() * 0.0015 + p.x * 0.01) * p.r * 0.08;
      roughLine(ctx, 0, -p.r * 0.9, 0, p.r * 0.82, '#80652f', 2.2);
      roughLine(ctx, -p.r * 0.3, -p.r * 0.86, p.r * 0.3, -p.r * 0.86, '#d7aa3e', 2.5);
      roughCircle(ctx, 0, p.r * 0.82, p.r * 0.1, '#d7aa3e', '#72582b', 0.8, 7);
      ctx.save();
      ctx.translate(sway, -p.r * 0.42);
      roughCircle(ctx, 0, 0, p.r * 0.64, 'rgba(255,218,100,0.1)', null, 0, 10);
      const lantern = [[0, -p.r * 0.34], [p.r * 0.28, -p.r * 0.14], [p.r * 0.25, p.r * 0.2], [0, p.r * 0.38], [-p.r * 0.25, p.r * 0.2], [-p.r * 0.28, -p.r * 0.14]];
      fillPoly(ctx, lantern, '#f0c750');
      fillPoly(ctx, [[0, -p.r * 0.34], [p.r * 0.28, -p.r * 0.14], [p.r * 0.25, p.r * 0.2], [0, p.r * 0.38]], '#d99a38');
      strokePoly(ctx, lantern, '#74562b', 1);
      roughLine(ctx, 0, p.r * 0.38, 0, p.r * 0.72, '#b74336', 1.4);
      roughLine(ctx, -p.r * 0.1, p.r * 0.72, 0, p.r * 0.58, '#b74336', 1);
      roughLine(ctx, p.r * 0.1, p.r * 0.72, 0, p.r * 0.58, '#b74336', 1);
      ctx.restore();
    } else if (p.kind === 'crystal') {
      const crystalColor = currentMap.id === 'inferno'
        ? '#b83268'
        : (currentMap.id === 'snow' ? '#8fd3e8' : (currentMap.id === 'crimson' ? '#d84b66' : (currentMap.id === 'heaven' ? '#79aee0' : (currentMap.id === 'four' ? ['#7fa050', '#d8a33b', '#d75a45', '#7896c8'][fourPhase] : '#e9653f'))));
      const crystalSeam = currentMap.id === 'snow' ? '#eefbff' : (currentMap.id === 'crimson' ? '#ff8798' : (currentMap.id === 'inferno' ? '#f07aa0' : '#ffc34a'));
      const crystalShape = [[-p.r * 0.55, p.r], [-p.r * 0.38, -p.r * 0.3], [0, -p.r], [p.r * 0.35, -p.r * 0.15], [p.r * 0.65, p.r]];
      fillPoly(ctx, crystalShape, crystalColor);
      fillPoly(ctx, [[0, -p.r], [p.r * 0.35, -p.r * 0.15], [p.r * 0.65, p.r], [0, p.r * 0.72]], shade(crystalColor, -0.24));
      fillPoly(ctx, [[-p.r * 0.38, -p.r * 0.3], [0, -p.r], [0, p.r * 0.72], [-p.r * 0.55, p.r]], shade(crystalColor, 0.18));
      strokePoly(ctx, crystalShape, COL.ink, 1.4);
      roughLine(ctx, 0, -p.r * 0.75, 0, p.r * 0.72, crystalSeam, 1.2);
    } else if (p.kind === 'pillar') {
      const pillarColor = currentMap.id === 'snow' ? '#bed2dc' : (currentMap.id === 'crimson' ? '#512834' : (currentMap.id === 'heaven' ? '#c9d9e7' : '#4f4142'));
      const seamColor = currentMap.id === 'snow' ? '#f2fbff' : (currentMap.id === 'crimson' ? '#d94b63' : (currentMap.id === 'heaven' ? '#7fa1c5' : '#e75c36'));
      fillPoly(ctx, [[-p.r * 0.6, -p.r * 0.72], [0, -p.r], [p.r * 0.6, -p.r * 0.72], [p.r * 0.6, p.r * 0.78], [0, p.r], [-p.r * 0.6, p.r * 0.78]], shade(pillarColor, -0.12));
      fillPoly(ctx, [[-p.r * 0.6, -p.r * 0.72], [0, -p.r], [0, p.r], [-p.r * 0.6, p.r * 0.78]], shade(pillarColor, 0.12));
      fillPoly(ctx, [[0, -p.r], [p.r * 0.6, -p.r * 0.72], [p.r * 0.6, p.r * 0.78], [0, p.r]], shade(pillarColor, -0.25));
      strokePoly(ctx, [[-p.r * 0.6, -p.r * 0.72], [0, -p.r], [p.r * 0.6, -p.r * 0.72], [p.r * 0.6, p.r * 0.78], [0, p.r], [-p.r * 0.6, p.r * 0.78]], COL.ink, 1.3);
      fillPoly(ctx, [[-p.r * 0.6, -p.r * 0.72], [0, -p.r], [p.r * 0.6, -p.r * 0.72], [0, -p.r * 0.45]], shade(pillarColor, 0.25));
      roughLine(ctx, 0, -p.r * 0.7, 0, p.r * 0.55, seamColor, 2);
    }
    ctx.restore();
}

function drawAmbientScene() {
  const t = performance.now() / 1000;
  const id = currentMap.id;
  const wx = (sx) => camera.x + sx;
  const wy = (sy) => camera.y + sy;

  if (id === 'forest') {
    for (let i = 0; i < 12; i++) {
      const phase = i * 13.7;
      const sx = ((phase * 29 + t * (7 + i % 3)) % (VW + 50)) - 25;
      const sy = ((phase * 17 + t * (3 + i % 2)) % (VH + 40)) - 20;
      ctx.save();
      ctx.translate(wx(sx), wy(sy + Math.sin(t + phase) * 5));
      if (i % 4 === 0) {
        const flap = 1.5 + Math.abs(Math.sin(t * 7 + phase)) * 2.2;
        ctx.globalAlpha = 0.22;
        roughEllipse(ctx, -flap, 0, flap, 1.5, i % 8 ? '#e6a84a' : '#7fa7cf', '#67533c', 0.6, 7);
        roughEllipse(ctx, flap, 0, flap, 1.5, i % 8 ? '#f2ca69' : '#a8c4dd', '#67533c', 0.6, 7);
      } else {
        ctx.rotate(t * 0.22 + phase);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = i % 3 ? '#f0b7a2' : '#f6e5a6';
        ctx.beginPath(); ctx.ellipse(0, 0, 2.4, 1.15, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  } else if (id === 'waste') {
    for (let i = 0; i < 5; i++) {
      const phase = i * 71.3;
      const sx = ((t * 22 + phase) % (VW + 100)) - 50;
      const sy = 40 + (i % 3) * 38 + Math.sin(t * 0.8 + phase) * 8;
      const flap = Math.sin(t * 5 + phase) * 3;
      ctx.save(); ctx.translate(wx(sx), wy(sy)); ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#4a3b34'; ctx.lineWidth = 1.4; ctx.beginPath();
      ctx.moveTo(-8, flap); ctx.quadraticCurveTo(-4, -4, 0, 0); ctx.quadraticCurveTo(4, -4, 8, flap); ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 5; i++) {
      const y = wy(70 + i * 58);
      const x = wx(((t * 18 + i * 137) % (VW + 120)) - 60);
      ctx.globalAlpha = 0.1;
      roughLine(ctx, x - 20, y, x + 18, y - 3, '#9b6e47', 1.1);
    }
  } else if (id === 'desert') {
    for (let i = 0; i < 7; i++) {
      const phase = i * 83.7;
      const x = wx(((t * 28 + phase) % (VW + 160)) - 80);
      const y = wy(42 + (i % 5) * 66 + Math.sin(t + phase) * 5);
      ctx.save(); ctx.globalAlpha = 0.13; ctx.strokeStyle = i % 2 ? '#c98036' : '#f1c873'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 26, y); ctx.bezierCurveTo(x - 10, y - 6, x + 5, y + 6, x + 26, y - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 10, y + 5); ctx.quadraticCurveTo(x + 2, y + 9, x + 15, y + 3); ctx.stroke();
      ctx.restore();
    }
  } else if (id === 'swamp') {
    for (let i = 0; i < 11; i++) {
      const phase = i * 39.1;
      const sx = (phase * 17) % VW;
      const rise = (t * (8 + i % 4) + phase * 3) % (VH + 30);
      const y = wy(VH + 10 - rise);
      const x = wx(sx + Math.sin(t + phase) * 4);
      ctx.save(); ctx.globalAlpha = i % 3 === 0 ? 0.22 : 0.14;
      if (i % 3 === 0) {
        roughCircle(ctx, x, y, 2 + i % 3, null, '#d8e7b5', 0.8, 8);
        roughCircle(ctx, x - 1, y - 1, 0.6, '#ffffff', null, 0, 6);
      } else {
        ctx.fillStyle = i % 2 ? '#d6d96f' : '#9ed39a';
        ctx.beginPath(); ctx.arc(x, y, 1.1, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  } else if (id === 'ocean') {
    for (let i = 0; i < 9; i++) {
      const phase = i * 47.9;
      const x = wx(((t * (12 + i % 3) + phase * 8) % (VW + 70)) - 35);
      const y = wy(55 + (i % 5) * 58 + Math.sin(t * 1.1 + phase) * 7);
      ctx.save(); ctx.globalAlpha = 0.12;
      if (i % 3 === 0) {
        ctx.translate(x, y);
        ctx.scale(i % 2 ? -1 : 1, 1);
        fillPoly(ctx, [[-5, 0], [0, -2.5], [6, 0], [0, 2.5]], '#3f8290');
        fillPoly(ctx, [[-5, 0], [-9, -3], [-9, 3]], '#3f8290');
      } else {
        roughCircle(ctx, x, y, 1.5 + i % 3, null, '#e9f7f5', 0.7, 8);
      }
      ctx.restore();
    }
  } else if (id === 'volcano' || id === 'inferno') {
    const count = id === 'inferno' ? 14 : 10;
    for (let i = 0; i < count; i++) {
      const phase = i * 31.3;
      const x = wx((phase * 19) % VW + Math.sin(t + phase) * 5);
      const y = wy(VH - ((t * (10 + i % 5) + phase * 4) % (VH + 20)));
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.25 + phase); ctx.globalAlpha = id === 'inferno' ? 0.17 : 0.14;
      ctx.fillStyle = id === 'inferno'
        ? (i % 3 === 0 ? '#f07aa0' : '#cf5360')
        : (i % 3 === 0 ? '#ffc34a' : '#e87832');
      fillPoly(ctx, [[0, -2.5], [1.5, 0], [0, 2], [-1.5, 0]], ctx.fillStyle);
      ctx.restore();
    }
  } else if (id === 'heaven') {
    for (let i = 0; i < 4; i++) {
      const x = wx(80 + i * 160 + Math.sin(t * 0.18 + i) * 18);
      ctx.save(); ctx.globalAlpha = 0.065;
      fillPoly(ctx, [[x - 28, wy(-20)], [x + 18, wy(-20)], [x + 90, wy(VH)], [x + 18, wy(VH)]], '#fff2a8');
      ctx.restore();
    }
    for (let i = 0; i < 6; i++) {
      const phase = i * 91.4;
      const x = wx(((t * 5 + phase) % (VW + 140)) - 70);
      const y = wy(55 + (i % 3) * 115);
      ctx.save(); ctx.globalAlpha = 0.1;
      roughEllipse(ctx, x, y, 22 + (i % 2) * 10, 5 + (i % 3), '#ffffff', null, 0, 10);
      ctx.restore();
    }
  } else if (id === 'snow') {
    for (let i = 0; i < 34; i++) {
      const phase = i * 39.7;
      const x = wx(((phase * 17 + t * (18 + i % 5)) % (VW + 70)) - 35);
      const y = wy(((phase * 7 + t * (11 + i % 4)) % (VH + 50)) - 25);
      const r = 1.1 + (i % 3) * 0.7;
      ctx.save(); ctx.globalAlpha = 0.22 + (i % 4) * 0.035;
      roughLine(ctx, x - r * 2, y, x + r * 2, y, '#f7fcff', 0.8);
      roughLine(ctx, x, y - r * 2, x, y + r * 2, '#f7fcff', 0.8);
      ctx.restore();
    }
    for (let i = 0; i < 5; i++) {
      const x = wx(((t * 34 + i * 157) % (VW + 180)) - 120);
      const y = wy(52 + i * 58 + Math.sin(t + i) * 6);
      ctx.save(); ctx.globalAlpha = 0.14;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 35, y - 10, x + 72, y + 8, x + 112, y - 4);
      ctx.strokeStyle = '#e9f7fb'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    }
  } else if (id === 'crimson') {
    for (let i = 0; i < 22; i++) {
      const phase = i * 29.3;
      const x = wx((phase * 23 + Math.sin(t * 0.5 + phase) * 18) % VW);
      const y = wy(VH - ((t * (7 + i % 4) + phase * 4) % (VH + 24)));
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.25 + phase); ctx.globalAlpha = 0.13 + (i % 3) * 0.03;
      fillPoly(ctx, [[0, -3], [2, 0], [0, 3], [-2, 0]], i % 3 ? '#b83b55' : '#e45a6d');
      ctx.restore();
    }
    for (let i = 0; i < 4; i++) {
      const x = wx(45 + i * 170 + Math.sin(t * 0.2 + i) * 25);
      const y = wy(66 + (i % 2) * 112);
      ctx.save(); ctx.globalAlpha = 0.06;
      roughEllipse(ctx, x, y, 72, 15, '#8a2841', null, 0, 12); ctx.restore();
    }
  } else if (id === 'four') {
    let omenReveal = 0;
    for (let i = 0; i < 3; i++) {
      const pulse = Math.sin(t * 0.55 + i * 2.3);
      omenReveal = Math.max(omenReveal, Math.max(0, (pulse - 0.9) / 0.1));
    }

    // 巨物只在环境暗部与雷光中若隐若现，不抢占战斗可读性。
    const giantX = wx(VW * 0.78 + Math.sin(t * 0.09) * 12);
    const giantY = wy(78 + Math.sin(t * 0.12) * 4);
    ctx.save();
    ctx.translate(giantX, giantY);
    ctx.globalAlpha = 0.18 + omenReveal * 0.1;
    roughEllipse(ctx, 0, 58, 126, 46, '#111017', null, 0, 14);
    fillPoly(ctx, [
      [-102, -10], [-88, -60], [-54, -38], [-34, -74], [-12, -48], [0, -96],
      [12, -48], [34, -74], [54, -38], [88, -60], [102, -10], [72, 18],
      [58, 52], [24, 72], [0, 80], [-24, 72], [-58, 52], [-72, 18]
    ], '#111017');
    ctx.globalAlpha = 0.24 + omenReveal * 0.14;
    fillPoly(ctx, [[-38, 5], [-13, 10], [-23, 18], [-42, 14]], '#7e263d');
    fillPoly(ctx, [[38, 5], [13, 10], [23, 18], [42, 14]], '#7e263d');
    ctx.restore();

    const clawX = wx(22 + Math.sin(t * 0.07) * 5);
    const clawY = wy(VH + 32);
    ctx.save();
    ctx.translate(clawX, clawY);
    ctx.globalAlpha = 0.1 + omenReveal * 0.06;
    fillPoly(ctx, [[-38, 18], [22, -18], [52, -112], [66, -118], [61, -24], [30, 14]], '#141219');
    fillPoly(ctx, [[-20, 22], [42, -4], [92, -90], [107, -92], [83, -6], [38, 22]], '#141219');
    fillPoly(ctx, [[-6, 28], [56, 10], [128, -52], [142, -47], [94, 22], [42, 36]], '#141219');
    ctx.restore();

    for (let i = 0; i < 4; i++) {
      const x = wx(((t * (4 + i) + i * 190) % (VW + 180)) - 90);
      const y = wy(45 + (i % 3) * 110);
      ctx.save(); ctx.globalAlpha = 0.07;
      roughEllipse(ctx, x, y, 58 + i * 8, 13 + i * 2, '#1d1c25', null, 0, 12);
      ctx.restore();
    }
    for (let i = 0; i < 3; i++) {
      const pulse = Math.sin(t * 0.55 + i * 2.3);
      if (pulse < 0.965) continue;
      const x = wx(80 + i * 220);
      const y0 = wy(15);
      const bolt = [[x, y0], [x - 7, y0 + 38], [x + 4, y0 + 62], [x - 5, y0 + 98]];
      ctx.save(); ctx.globalAlpha = 0.22 * ((pulse - 0.965) / 0.035);
      ctx.strokeStyle = i % 2 ? '#e0d7ff' : '#8dbbe5'; ctx.lineWidth = 1.5;
      polyPath(ctx, bolt, false); ctx.stroke(); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function drawHazards() {
  const ambientT = performance.now() / 1000;
  for (const f of fields) {
    if (f.x < camera.x - 80 || f.x > camera.x + VW + 80 || f.y < camera.y - 80 || f.y > camera.y + VH + 80) continue;
    if (f.kind === 'bush') {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(Math.sin(ambientT * 1.7 + f.x * 0.018 + f.y * 0.013) * 0.055);
      const bushPts = [];
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12;
        const rr = f.r * (0.72 + (i % 3) * 0.12);
        bushPts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.66]);
      }
      fillPoly(ctx, bushPts.map((pt) => [pt[0] + 3, pt[1] + 5]), 'rgba(58,48,38,0.12)');
      fillPoly(ctx, bushPts, tint(f.color, 0.28));
      strokePoly(ctx, bushPts, tint(f.color, 0.72), 1.5);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + f.x * 0.01;
        roughEllipse(ctx, Math.cos(a) * f.r * 0.5, Math.sin(a) * f.r * 0.33, f.r * 0.28, f.r * 0.13, tint(f.color, 0.38), null, 0, 7);
      }
      ctx.restore();
    } else {
      const mirePts = [];
      for (let i = 0; i < 14; i++) {
        const a = i * TAU / 14;
        const rr = f.r * (0.82 + Math.sin(i * 2.7 + f.x) * 0.12);
        mirePts.push([f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.68]);
      }
      fillPoly(ctx, mirePts.map((pt) => [pt[0] + 3, pt[1] + 4]), 'rgba(58,48,38,0.1)');
      fillPoly(ctx, mirePts, tint(f.color, 0.24));
      strokePoly(ctx, mirePts, tint(f.color, 0.62), 1.4);
      roughEllipse(ctx, f.x - f.r * 0.28, f.y - f.r * 0.12, f.r * 0.2, f.r * 0.1, tint(f.color, 0.38), null, 0, 8);
      const bubble = 1.5 + Math.max(0, Math.sin(ambientT * 1.7 + f.x * 0.02)) * 2;
      roughCircle(ctx, f.x + f.r * 0.28, f.y - f.r * 0.2, bubble, null, 'rgba(221,236,186,0.5)', 0.7, 7);
    }
  }
  for (const h of hazards) {
    if (h.x < camera.x - 120 || h.x > camera.x + VW + 120 || h.y < camera.y - 120 || h.y > camera.y + VH + 120) continue;
    if (h.kind === 'zone') {
      const k = Math.min(1, h.t / h.delay);
      if (currentMap.id === 'desert') {
        const rays = [];
        for (let i = 0; i < 20; i++) {
          const a = i * TAU / 20;
          const rr = h.r * (i % 2 ? 0.56 + k * 0.12 : 0.88 + k * 0.1);
          rays.push([h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr]);
        }
        fillPoly(ctx, rays, tint('#e9a431', 0.08 + k * 0.12));
        strokePoly(ctx, rays, tint('#c46f2d', 0.45 + k * 0.4), 1.8);
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + 0.25;
          roughLine(ctx, h.x, h.y, h.x + Math.cos(a) * h.r * (0.2 + k * 0.66), h.y + Math.sin(a) * h.r * (0.2 + k * 0.66), tint('#e88a2d', 0.65), 1.1);
        }
      } else if (currentMap.id === 'volcano') {
        const fissure = [[h.x - h.r, h.y - 5], [h.x - h.r * 0.55, h.y + 7], [h.x - h.r * 0.18, h.y - 4], [h.x + h.r * 0.2, h.y + 9], [h.x + h.r * 0.58, h.y - 6], [h.x + h.r, h.y + 3]];
        ctx.save(); ctx.globalAlpha = 0.45 + k * 0.45;
        roughLine(ctx, fissure[0][0], fissure[0][1], fissure[5][0], fissure[5][1], '#2a2226', 7);
        polyPath(ctx, fissure, false); ctx.strokeStyle = '#f06a31'; ctx.lineWidth = 3 + k * 2; ctx.stroke();
        polyPath(ctx, fissure, false); ctx.strokeStyle = '#ffc34a'; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.restore();
      } else if (currentMap.id === 'inferno') {
        const s = h.r * (0.65 + k * 0.3);
        const flame = [[h.x, h.y - s], [h.x + s * 0.28, h.y - s * 0.34], [h.x + s * 0.2, h.y + s * 0.1], [h.x + s * 0.62, h.y - s * 0.12], [h.x + s * 0.48, h.y + s * 0.7], [h.x, h.y + s], [h.x - s * 0.52, h.y + s * 0.66], [h.x - s * 0.46, h.y - s * 0.18], [h.x - s * 0.12, h.y + s * 0.05]];
        fillPoly(ctx, flame, tint('#d43e3f', 0.08 + k * 0.16));
        strokePoly(ctx, flame, tint('#ed5b37', 0.5 + k * 0.4), 1.8);
        roughLine(ctx, h.x, h.y - s * 0.45, h.x - s * 0.12, h.y + s * 0.5, '#ffc34a', 1.2);
      } else if (currentMap.id === 'crimson') {
        const ring = [];
        for (let i = 0; i < 16; i++) {
          const a = i * TAU / 16;
          const rr = h.r * (i % 2 ? 0.72 + k * 0.12 : 0.96 + k * 0.08);
          ring.push([h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr]);
        }
        fillPoly(ctx, ring, tint('#841f39', 0.1 + k * 0.14));
        strokePoly(ctx, ring, tint('#e25268', 0.5 + k * 0.42), 1.9);
        roughCircle(ctx, h.x, h.y, h.r * (0.28 + k * 0.16), null, '#f06a7f', 1.3, 11);
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5 + 0.35;
          roughLine(ctx, h.x + Math.cos(a) * h.r * 0.3, h.y + Math.sin(a) * h.r * 0.3, h.x + Math.cos(a) * h.r * 0.82, h.y + Math.sin(a) * h.r * 0.82, '#b92f4e', 1.1);
        }
      } else if (currentMap.id === 'four') {
        const branches = [
          [[h.x - h.r, h.y], [h.x - h.r * 0.35, h.y - 4], [h.x, h.y + 2], [h.x + h.r, h.y - 5]],
          [[h.x, h.y - h.r], [h.x + 4, h.y - h.r * 0.35], [h.x - 3, h.y], [h.x + 5, h.y + h.r]],
        ];
        ctx.save(); ctx.globalAlpha = 0.35 + k * 0.5;
        for (const branch of branches) { polyPath(ctx, branch, false); ctx.strokeStyle = fourPhase === 2 ? '#ef6244' : '#98b6df'; ctx.lineWidth = 1.5 + k; ctx.stroke(); }
        ctx.restore();
      } else {
        const tear = [];
        for (let i = 0; i < 12; i++) {
          const a = i * TAU / 12;
          const rr = h.r * (0.78 + (i % 3) * 0.1);
          tear.push([h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr]);
        }
        fillPoly(ctx, tear, tint(h.color, 0.1 + k * 0.1));
        strokePoly(ctx, tear, tint(h.color, 0.4 + k * 0.45), 1.8);
      }
    } else if (h.kind === 'bolt') {
      const k = Math.min(1, h.t / h.delay);
      const bolt = [[h.x + 8, h.y - 78], [h.x - 5, h.y - 52], [h.x + 6, h.y - 39], [h.x - 8, h.y - 18], [h.x, h.y]];
      ctx.save(); ctx.globalAlpha = 0.35 + k * 0.6;
      polyPath(ctx, bolt, false); ctx.strokeStyle = '#fff2a8'; ctx.lineWidth = 2.3; ctx.stroke();
      polyPath(ctx, bolt, false); ctx.strokeStyle = '#d8a83e'; ctx.lineWidth = 0.9; ctx.stroke();
      const diamond = [[h.x, h.y - h.r], [h.x + h.r, h.y], [h.x, h.y + h.r * 0.55], [h.x - h.r, h.y]];
      strokePoly(ctx, diamond, tint(h.color, 0.55 + k * 0.35), 1.4);
      ctx.restore();
    } else if (h.kind === 'tumble') {
      if (h.wide && h.snow) {
        ctx.save(); ctx.translate(h.x, h.y); ctx.globalAlpha = 0.68;
        const dir = Math.sign(h.vx) || 1;
        fillPoly(ctx, [[-h.r * 1.2 * dir, -48], [h.r * 0.55 * dir, -36], [h.r * 1.25 * dir, -8], [h.r * 0.55 * dir, 24], [-h.r * 1.2 * dir, 38]], 'rgba(218,238,245,0.48)');
        for (let i = -2; i <= 2; i++) {
          const yy = i * 18;
          ctx.beginPath(); ctx.moveTo(-h.r * dir, yy); ctx.bezierCurveTo(-h.r * 0.3 * dir, yy - 10, h.r * 0.35 * dir, yy + 8, h.r * dir, yy - 4);
          ctx.strokeStyle = i % 2 ? '#f8fdff' : '#9dc8d7'; ctx.lineWidth = 1.8; ctx.stroke();
          roughCircle(ctx, (i * 9 + 4) * dir, yy - 4, 1.8, '#ffffff', '#9dc8d7', 0.5, 6);
        }
        ctx.restore();
      } else if (h.wide) {
        ctx.save(); ctx.translate(h.x, h.y); ctx.globalAlpha = 0.58;
        const dir = Math.sign(h.vx) || 1;
        fillPoly(ctx, [[-h.r * dir, -46], [h.r * 0.25 * dir, -34], [h.r * dir, -20], [h.r * 0.2 * dir, -4], [-h.r * dir, 8]], tint('#4e9fb4', 0.3));
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(-h.r * 0.8 * dir, i * 18);
          ctx.bezierCurveTo(-h.r * 0.2 * dir, i * 18 - 7, h.r * 0.28 * dir, i * 18 + 7, h.r * 0.9 * dir, i * 18 - 3);
          ctx.strokeStyle = i % 2 ? '#d8f1ef' : '#75b7c4'; ctx.lineWidth = 1.8; ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.t * 4); ctx.globalAlpha = 0.75;
        roughCircle(ctx, 0, 0, h.r * 0.72, null, '#8f6037', 1.5, 11);
        for (let i = 0; i < 7; i++) {
          const a = i * TAU / 7;
          roughLine(ctx, -Math.cos(a) * h.r * 0.65, -Math.sin(a) * h.r * 0.65, Math.cos(a) * h.r * 0.65, Math.sin(a) * h.r * 0.65, i % 2 ? '#b88248' : '#70503a', 1);
        }
        ctx.restore();
      }
    }
  }
}

function drawMapFrame() {
  const m = currentMap;
  const col = tint(m.doodle, 0.75);
  const p = 7;
  const frameT = 0;
  ctx.save();
  ctx.fillStyle = 'rgba(245,226,185,0.88)';
  ctx.fillRect(0, 0, VW, 7);
  ctx.fillRect(0, VH - 7, VW, 7);
  ctx.fillRect(0, 0, 7, VH);
  ctx.fillRect(VW - 7, 0, 7, VH);
  ctx.fillStyle = 'rgba(58,48,38,0.13)';
  ctx.fillRect(7, 7, VW - 14, 3);
  ctx.fillRect(7, VH - 10, VW - 14, 3);
  ctx.fillRect(7, 7, 3, VH - 14);
  ctx.fillRect(VW - 10, 7, 3, VH - 14);
  ctx.restore();
  const wavy = (x1, y1, x2, y2, horiz) => {
    ctx.beginPath();
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const off = Math.sin(t * Math.PI * 7 + frameT * 0.8) * 1.6;
      if (i === 0) ctx.moveTo(horiz ? x : x + off, horiz ? y + off : y);
      else ctx.lineTo(horiz ? x : x + off, horiz ? y + off : y);
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  wavy(p, p, VW - p, p, true);
  wavy(p, VH - p, VW - p, VH - p, true);
  wavy(p, p, p, VH - p, false);
  wavy(VW - p, p, VW - p, VH - p, false);
}

function drawPencilHeroArt(x, y, size, aim, alpha) {
  const s = size || 1;
  const ax = Math.cos(aim || 0);
  const ay = Math.sin(aim || 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = alpha == null ? 1 : alpha;

  roughEllipse(ctx, 1, 10, 10, 3.5, 'rgba(58,48,38,0.14)', null, 0, 8);
  roughEllipse(ctx, -5, 8, 3.3, 2.4, '#30271f', COL.ink, 1, 7);
  roughEllipse(ctx, 5, 8, 3.3, 2.4, '#30271f', COL.ink, 1, 7);

  ctx.save();
  ctx.rotate(aim || 0);
  fillPoly(ctx, [[4, -3], [20, -3], [25, 0], [20, 3], [4, 3]], '#f0b437');
  strokePoly(ctx, [[4, -3], [20, -3], [25, 0], [20, 3], [4, 3]], COL.ink, 1.5);
  fillPoly(ctx, [[20, -3], [27, 0], [20, 3]], '#f4d8a6');
  strokePoly(ctx, [[20, -3], [27, 0], [20, 3]], COL.ink, 1.2);
  fillPoly(ctx, [[25, -1], [28, 0], [25, 1]], COL.ink);
  roughCircle(ctx, 4, 0, 3.7, '#f4d8a6', COL.ink, 1.2, 8);
  ctx.restore();

  roughCircle(ctx, 0, 0, 10.5, COL.coral, COL.ink, 2, 11);
  roughCircle(ctx, -4.2, 1.4, 3.2, COL.skin, COL.ink, 0.9, 8);
  roughCircle(ctx, 4.2, 1.4, 3.2, COL.skin, COL.ink, 0.9, 8);

  fillPoly(ctx, [[-7.8, -7], [0, -19], [7.8, -7]], '#f2c35a');
  strokePoly(ctx, [[-7.8, -7], [0, -19], [7.8, -7]], COL.ink, 1.6);
  fillPoly(ctx, [[-2.4, -15.3], [0, -19], [2.4, -15.3]], COL.ink);
  roughBox(ctx, -8.8, -8.4, 17.6, 4.2, COL.blue, COL.ink, 1.2);
  fillPoly(ctx, [[-8.4, -6.5], [-16, -10.5], [-13, -4.5]], '#567fbd');
  strokePoly(ctx, [[-8.4, -6.5], [-16, -10.5], [-13, -4.5]], COL.ink, 1.1);

  ctx.fillStyle = COL.ink;
  ctx.beginPath(); ctx.arc(-3.4 + ax * 1.1, 0.8 + ay * 0.7, 1.15, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(3.4 + ax * 1.1, 0.8 + ay * 0.7, 1.15, 0, TAU); ctx.fill();
  roughLine(ctx, -6, -2.4, -1.6, -1.2, COL.ink, 1.2);
  roughLine(ctx, 1.6, -1.2, 6, -2.4, COL.ink, 1.2);
  ctx.restore();
}

function drawPlayer() {
  const p = player;
  const blink = p.inv > 0 && Math.floor(p.inv * 16) % 2 === 0;
  const idleBob = 0;
  if (p.shield > 0) {
    roughCircle(ctx, p.x, p.y + idleBob, 17, 'rgba(139,95,192,0.08)', 'rgba(139,95,192,0.7)', 2, 14);
  }
  if (p.ward > 0) {
    const ratio = p.wardMax > 0 ? p.ward / p.wardMax : 0;
    ctx.save();
    ctx.globalAlpha = 0.42 + ratio * 0.35;
    ctx.setLineDash([5, 3]);
    roughCircle(ctx, p.x, p.y + idleBob, 20, 'rgba(117,200,210,0.07)', '#75c8d2', 2.4, 12);
    ctx.setLineDash([]);
    for (let i = 0; i < 3; i++) {
      const a = -0.8 + i * 0.8;
      roughLine(ctx, p.x + Math.cos(a) * 18, p.y + idleBob + Math.sin(a) * 18, p.x + Math.cos(a) * 22, p.y + idleBob + Math.sin(a) * 22, '#d9ffff', 1.3);
    }
    ctx.restore();
  }
  drawPencilHeroArt(p.x, p.y + idleBob, 1, p.aim, blink ? 0.4 : 1);
  const nameW = clamp(measure(playerName, 7, true) + 18, 42, 92);
  const nameX = p.x - nameW / 2;
  const nameY = p.y + idleBob - 35;
  ctx.globalAlpha = blink ? 0.5 : 0.94;
  roughBox(ctx, nameX, nameY, nameW, 14, '#fff6dd', COL.ink, 1);
  fillPoly(ctx, [[p.x - 3, nameY + 14], [p.x + 3, nameY + 14], [p.x, nameY + 19]], '#fff6dd');
  strokePoly(ctx, [[p.x - 3, nameY + 14], [p.x + 3, nameY + 14], [p.x, nameY + 19]], COL.ink, 0.8);
  doodleStar(ctx, nameX + 8, nameY + 7, 3, COL.goldDark, 1);
  text(playerName, p.x + 4, nameY + 3, 7, COL.ink, 'center', true);
  ctx.globalAlpha = 1;
}

function drawEnemyThemeDetails(e, x, y) {
  const id = currentMap.id;
  const r = e.r;
  const yy = e.boss ? y + Math.sin(e.t * 3) * 2 : y;
  const accent = e.accent || enemyThemePalette().accent;
  const hi = e.hi || enemyThemePalette().hi;

  if (id === 'forest') {
    fillPoly(ctx, [[x, yy - r * 0.85], [x - r * 0.7, yy - r * 1.35], [x - r * 0.18, yy - r * 1.5]], hi);
    fillPoly(ctx, [[x, yy - r * 0.86], [x + r * 0.68, yy - r * 1.3], [x + r * 0.16, yy - r * 1.5]], shade(hi, -0.1));
    roughLine(ctx, x, yy - r * 0.76, x, yy - r * 1.35, '#496435', 1.1);
    roughCircle(ctx, x + r * 0.46, yy + r * 0.35, Math.max(1.4, r * 0.12), accent, '#72543a', 0.5, 7);
  } else if (id === 'waste') {
    roughLine(ctx, x - r * 0.72, yy + r * 0.2, x + r * 0.72, yy + r * 0.38, accent, Math.max(1.2, r * 0.12));
    roughLine(ctx, x - r * 0.28, yy - r * 0.72, x + r * 0.18, yy - r * 0.48, hi, 1);
    roughCircle(ctx, x + r * 0.62, yy + r * 0.62, Math.max(1, r * 0.1), '#8f6849', null, 0, 7);
  } else if (id === 'desert') {
    for (let i = -1; i <= 1; i += 2) {
      fillPoly(ctx, [[x + i * r * 0.68, yy - r * 0.18], [x + i * r * 1.12, yy - r * 0.48], [x + i * r * 0.8, yy + r * 0.16]], accent);
    }
    roughLine(ctx, x - r * 0.35, yy + r * 0.48, x + r * 0.36, yy + r * 0.26, hi, 1.1);
  } else if (id === 'swamp') {
    roughCircle(ctx, x - r * 0.45, yy + r * 0.26, Math.max(1.4, r * 0.14), hi, '#40583c', 0.5, 7);
    roughCircle(ctx, x + r * 0.42, yy + r * 0.48, Math.max(1.2, r * 0.11), '#8fa65d', null, 0, 7);
    roughEllipse(ctx, x + r * 0.28, yy - r * 0.92, r * 0.34, r * 0.18, accent, '#5d3848', 0.7, 8);
    roughLine(ctx, x + r * 0.28, yy - r * 0.78, x + r * 0.28, yy - r * 0.55, '#ead7aa', 1.1);
  } else if (id === 'ocean') {
    fillPoly(ctx, [[x - r * 0.68, yy], [x - r * 1.18, yy - r * 0.35], [x - r * 1.02, yy + r * 0.42]], hi);
    fillPoly(ctx, [[x + r * 0.68, yy], [x + r * 1.18, yy - r * 0.35], [x + r * 1.02, yy + r * 0.42]], shade(hi, -0.08));
    roughCircle(ctx, x + r * 0.52, yy - r * 0.72, Math.max(1, r * 0.1), null, '#d9eef0', 0.8, 7);
    roughLine(ctx, x - r * 0.42, yy + r * 0.45, x + r * 0.38, yy + r * 0.52, accent, 1.2);
  } else if (id === 'volcano') {
    roughLine(ctx, x - r * 0.56, yy - r * 0.48, x - r * 0.1, yy - r * 0.05, accent, Math.max(1.2, r * 0.11));
    roughLine(ctx, x - r * 0.1, yy - r * 0.05, x + r * 0.25, yy - r * 0.38, '#ffc34a', Math.max(1, r * 0.08));
    roughLine(ctx, x + r * 0.25, yy - r * 0.38, x + r * 0.52, yy + r * 0.36, accent, Math.max(1.2, r * 0.11));
  } else if (id === 'inferno') {
    fillPoly(ctx, [[x - r * 0.52, yy - r * 0.62], [x - r * 0.96, yy - r * 1.35], [x - r * 0.18, yy - r * 0.92]], e.dark);
    fillPoly(ctx, [[x + r * 0.52, yy - r * 0.62], [x + r * 0.96, yy - r * 1.35], [x + r * 0.18, yy - r * 0.92]], e.dark);
    roughLine(ctx, x, yy - r * 0.62, x, yy + r * 0.52, accent, Math.max(1.3, r * 0.12));
    roughCircle(ctx, x, yy - r * 1.16, Math.max(1.4, r * 0.12), '#ffc34a', null, 0, 7);
  } else if (id === 'heaven') {
    roughEllipse(ctx, x, yy - r * 1.3, r * 0.66, r * 0.18, null, accent, Math.max(1, r * 0.09), 10);
    fillPoly(ctx, [[x - r * 0.65, yy + r * 0.1], [x - r * 1.22, yy - r * 0.2], [x - r * 1.06, yy + r * 0.48]], '#eef5f5');
    fillPoly(ctx, [[x + r * 0.65, yy + r * 0.1], [x + r * 1.22, yy - r * 0.2], [x + r * 1.06, yy + r * 0.48]], '#d7e5ee');
    doodleStar(ctx, x, yy + r * 0.4, Math.max(1.6, r * 0.16), accent, 0.8);
  } else if (id === 'snow') {
    fillPoly(ctx, [[x - r * 0.62, yy - r * 0.54], [x - r * 0.2, yy - r * 1.35], [x, yy - r * 0.72]], '#d9f0f5');
    fillPoly(ctx, [[x + r * 0.62, yy - r * 0.54], [x + r * 0.2, yy - r * 1.35], [x, yy - r * 0.72]], '#9fd2df');
    roughBox(ctx, x - r * 0.72, yy + r * 0.34, r * 1.44, Math.max(3, r * 0.28), accent, COL.ink, 0.7);
    fillPoly(ctx, [[x + r * 0.38, yy + r * 0.5], [x + r * 0.88, yy + r * 0.92], [x + r * 0.6, yy + r * 0.3]], shade(accent, -0.08));
  } else if (id === 'crimson') {
    fillPoly(ctx, [[x - r * 0.58, yy - r * 0.62], [x - r * 1.02, yy - r * 1.28], [x - r * 0.18, yy - r * 0.88]], e.dark);
    fillPoly(ctx, [[x + r * 0.58, yy - r * 0.62], [x + r * 1.02, yy - r * 1.28], [x + r * 0.18, yy - r * 0.88]], e.dark);
    roughLine(ctx, x, yy - r * 0.62, x, yy + r * 0.62, accent, Math.max(1.3, r * 0.12));
    roughCircle(ctx, x, yy + r * 0.12, Math.max(1.8, r * 0.18), null, '#f17888', 1, 8);
    roughBox(ctx, x - r * 0.72, yy + r * 0.44, r * 1.44, Math.max(3, r * 0.25), '#7d273c', COL.ink, 0.7);
  } else if (id === 'four') {
    const cols = ['#789447', '#d5a13a', '#d75a45', '#7189a6'];
    for (let i = 0; i < 4; i++) {
      const px = x - r * 0.48 + i * r * 0.32;
      fillPoly(ctx, [[px, yy + r * 0.54], [px + r * 0.12, yy + r * 0.4], [px + r * 0.24, yy + r * 0.54], [px + r * 0.12, yy + r * 0.68]], tint(cols[i], i === fourPhase ? 0.95 : 0.45));
    }
  }
}

function drawMythHead(x, y, r, fill, kind) {
  if (kind === 'bull') {
    roughEllipse(ctx, x, y, r * 0.8, r, fill, COL.ink, 1.5, 9);
    fillPoly(ctx, [[x - r * 0.45, y - r * 0.6], [x - r * 1.25, y - r * 1.15], [x - r * 0.9, y - r * 0.05]], '#ead4a5');
    fillPoly(ctx, [[x + r * 0.45, y - r * 0.6], [x + r * 1.25, y - r * 1.15], [x + r * 0.9, y - r * 0.05]], '#ead4a5');
  } else {
    roughCircle(ctx, x, y, r, fill, COL.ink, 1.5, 9);
    fillPoly(ctx, [[x - r * 0.7, y - r * 0.55], [x - r * 1.0, y - r * 1.35], [x - r * 0.2, y - r * 0.85]], fill);
    fillPoly(ctx, [[x + r * 0.7, y - r * 0.55], [x + r * 1.0, y - r * 1.35], [x + r * 0.2, y - r * 0.85]], fill);
  }
  roughCircle(ctx, x - r * 0.32, y - r * 0.1, Math.max(1.2, r * 0.17), COL.white, COL.ink, 0.7, 6);
  roughCircle(ctx, x + r * 0.32, y - r * 0.1, Math.max(1.2, r * 0.17), COL.white, COL.ink, 0.7, 6);
  roughCircle(ctx, x, y + r * 0.32, Math.max(1.2, r * 0.15), COL.ink, null, 0, 6);
}

function drawMythMinion(e, x, y) {
  const id = currentMap.id;
  if (!['forest', 'waste', 'desert', 'swamp', 'ocean', 'volcano', 'inferno', 'heaven', 'four', 'snow', 'crimson'].includes(id)) return false;
  const r = e.r;
  const ranged = e.type === 'shooter' || e.type === 'eliteShooter';
  const elite = e.elite;
  const fill = e.color;
  const accent = e.accent || currentMap.doodle;

  const telegraphWindow = e.type === 'eliteShooter' ? 0.55 : 0.38;
  if (ranged && e.fireCd > 0 && e.fireCd < telegraphWindow) {
    const aim = Math.atan2(player.y - y, player.x - x);
    ctx.save(); ctx.globalAlpha = e.rangedElite ? 0.48 : 0.24; ctx.setLineDash(e.rangedElite ? [7, 4] : [4, 5]); ctx.strokeStyle = accent; ctx.lineWidth = e.rangedElite ? 2.2 : 1.2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(aim) * (e.rangedElite ? 190 : 95), y + Math.sin(aim) * (e.rangedElite ? 190 : 95)); ctx.stroke();
    if (e.rangedElite) roughCircle(ctx, x + Math.cos(aim) * 28, y + Math.sin(aim) * 28, 5 + (telegraphWindow - e.fireCd) * 8, null, accent, 1.6, 8);
    ctx.restore();
  }

  if (id === 'forest') {
    roughEllipse(ctx, x, y + r * 0.22, r * 1.05, r * 0.72, fill, COL.ink, 1.8, 10);
    const heads = elite ? 2 : 1;
    for (let i = 0; i < heads; i++) drawMythHead(x + (i - (heads - 1) / 2) * r * 0.9, y - r * 0.55, r * (elite ? 0.48 : 0.56), fill, 'hound');
    for (let i = -1; i <= 1; i++) fillPoly(ctx, [[x + i * r * 0.48 - r * 0.2, y - r * 0.82], [x + i * r * 0.48, y - r * 1.35], [x + i * r * 0.48 + r * 0.2, y - r * 0.82]], accent);
    if (ranged) roughLine(ctx, x + r * 0.7, y - r * 0.2, x + r * 1.35, y - r * 0.6, accent, 3);
  } else if (id === 'waste') {
    roughEllipse(ctx, x, y + r * 0.18, r * 0.86, r, fill, COL.ink, 1.8, 10);
    drawMythHead(x, y - r * 0.46, r * (elite ? 0.72 : 0.62), fill, 'bull');
    if (ranged) { roughLine(ctx, x + r * 0.52, y, x + r * 1.25, y - r * 0.52, '#8e6643', 3); roughCircle(ctx, x + r * 1.35, y - r * 0.58, r * 0.2, accent, COL.ink, 0.8, 6); }
  } else if (id === 'desert') {
    roughEllipse(ctx, x, y + r * 0.25, r * 1.15, r * 0.62, fill, COL.ink, 1.8, 10);
    roughCircle(ctx, x - r * 0.62, y - r * 0.25, r * 0.45, '#d8aa75', COL.ink, 1.2, 8);
    fillPoly(ctx, [[x - r * 0.1, y], [x + r * 1.2, y - r * 1.0], [x + r * 0.65, y + r * 0.2]], accent);
    if (elite) fillPoly(ctx, [[x + r * 0.15, y - r * 0.2], [x + r * 1.45, y - r * 1.2], [x + r * 0.85, y + r * 0.2]], tint(accent, 1.15));
    if (ranged) doodleStar(ctx, x + r * 1.12, y - r * 0.5, Math.max(3, r * 0.28), COL.gold, 1);
  } else if (id === 'swamp') {
    roughEllipse(ctx, x, y + r * 0.35, r, r * 0.55, fill, COL.ink, 1.8, 10);
    const heads = elite ? 2 : 1;
    for (let i = 0; i < heads; i++) {
      const hx = x + (i - (heads - 1) / 2) * r * 0.75;
      roughLine(ctx, x, y + r * 0.2, hx, y - r * 0.7, fill, Math.max(5, r * 0.45));
      drawMythHead(hx, y - r * 0.82, r * 0.38, accent, 'hound');
    }
    if (ranged) roughCircle(ctx, x + r * 0.95, y - r * 0.6, r * 0.26, '#a7bd6e', COL.ink, 0.8, 7);
  } else if (id === 'ocean') {
    roughCircle(ctx, x, y, r * 0.78, fill, COL.ink, 1.8, 10);
    const arms = elite ? 4 : 2;
    for (let i = 0; i < arms; i++) {
      const a = -0.4 + i * (Math.PI / Math.max(1, arms - 1));
      roughLine(ctx, x, y + r * 0.25, x + Math.cos(a) * r * 1.25, y + r * 0.35 + Math.sin(a) * r * 0.8, accent, Math.max(3, r * 0.24));
    }
    drawMythHead(x, y - r * 0.55, r * 0.42, fill, 'hound');
    if (ranged) roughCircle(ctx, x + r * 0.95, y - r * 0.2, r * 0.22, '#d8f1ef', accent, 0.9, 7);
  } else if (id === 'volcano') {
    roughEllipse(ctx, x, y, r * 0.82, r, fill, COL.ink, 1.8, 10);
    fillPoly(ctx, [[x - r * 0.45, y - r * 0.3], [x - r * 1.35, y - r * 1.0], [x - r * 0.82, y + r * 0.2]], e.dark);
    fillPoly(ctx, [[x + r * 0.45, y - r * 0.3], [x + r * 1.35, y - r * 1.0], [x + r * 0.82, y + r * 0.2]], e.dark);
    drawMythHead(x, y - r * 0.55, r * 0.42, fill, 'hound');
    for (let i = elite ? -1 : 0; i <= (elite ? 1 : 0); i++) roughLine(ctx, x + i * r * 0.5, y + r * 0.45, x + i * r * 0.7, y + r * 1.25, accent, Math.max(3, r * 0.25));
  } else if (id === 'inferno') {
    roughEllipse(ctx, x, y - r * 0.25, r * 0.72, r * 0.8, fill, COL.ink, 1.8, 10);
    roughLine(ctx, x, y + r * 0.25, x + r * 0.7, y + r * 1.15, fill, Math.max(5, r * 0.48));
    roughCircle(ctx, x, y - r * 0.7, r * 0.35, '#d49b91', COL.ink, 1, 8);
    if (ranged) roughEllipse(ctx, x + r * 0.95, y + r * 0.2, r * 0.28, r * 0.4, accent, COL.ink, 0.8, 7);
    if (elite) { drawMythHead(x - r * 0.55, y - r * 0.25, r * 0.3, '#9b5c4e', 'hound'); drawMythHead(x + r * 0.55, y - r * 0.25, r * 0.3, '#686451', 'hound'); }
  } else if (id === 'heaven') {
    roughEllipse(ctx, x, y, r * 0.9, r, fill, COL.ink, 1.8, 10);
    roughCircle(ctx, x, y - r * 0.18, r * (elite ? 0.34 : 0.28), COL.white, COL.ink, 1.2, 8);
    roughCircle(ctx, x, y - r * 0.18, r * 0.11, accent, null, 0, 7);
    fillPoly(ctx, [[x - r * 0.82, y - r * 0.2], [x - r * 1.3, y + r * 0.3], [x - r * 0.72, y + r * 0.55]], COL.gold);
    fillPoly(ctx, [[x + r * 0.82, y - r * 0.2], [x + r * 1.3, y + r * 0.3], [x + r * 0.72, y + r * 0.55]], COL.gold);
    if (ranged) roughLine(ctx, x + r * 0.8, y, x + r * 1.45, y - r * 0.65, COL.gold, 3);
  } else if (id === 'snow') {
    roughEllipse(ctx, x, y + r * 0.22, r * 1.08, r * 0.74, fill, COL.ink, 1.8, 10);
    drawMythHead(x, y - r * 0.55, r * (elite ? 0.58 : 0.5), fill, 'hound');
    for (let i = -1; i <= 1; i++) fillPoly(ctx, [[x + i * r * 0.52 - r * 0.18, y - r * 0.72], [x + i * r * 0.52, y - r * 1.36], [x + i * r * 0.52 + r * 0.18, y - r * 0.72]], i % 2 ? '#eefbff' : accent);
    roughBox(ctx, x - r * 0.82, y + r * 0.35, r * 1.64, Math.max(4, r * 0.25), '#7dc4d8', COL.ink, 0.8);
    if (ranged) roughLine(ctx, x + r * 0.7, y - r * 0.15, x + r * 1.42, y - r * 0.62, '#dff8ff', 3);
  } else if (id === 'crimson') {
    roughEllipse(ctx, x, y - r * 0.1, r * 0.82, r, fill, COL.ink, 1.8, 10);
    drawMythHead(x, y - r * 0.65, r * 0.45, fill, 'hound');
    fillPoly(ctx, [[x - r * 0.5, y - r * 0.5], [x - r * 1.15, y - r * 1.35], [x - r * 0.72, y + r * 0.02]], e.dark);
    fillPoly(ctx, [[x + r * 0.5, y - r * 0.5], [x + r * 1.15, y - r * 1.35], [x + r * 0.72, y + r * 0.02]], e.dark);
    roughCircle(ctx, x, y + r * 0.16, r * 0.18, null, '#f26d80', 1.1, 8);
    if (ranged) roughLine(ctx, x + r * 0.7, y, x + r * 1.42, y - r * 0.58, accent, 3.2);
  } else {
    const cols = ['#789447', '#d5a13a', '#d75a45', '#7189a6'];
    ctx.save(); ctx.translate(x, y); ctx.rotate(e.t * 0.45);
    fillPoly(ctx, [[0, -r], [r * 0.8, -r * 0.15], [r * 0.5, r], [-r * 0.7, r * 0.3], [-r * 0.55, -r * 0.65]], elite ? COL.goldDark : cols[(Math.floor(e.phase || 0)) % 4]);
    strokePoly(ctx, [[0, -r], [r * 0.8, -r * 0.15], [r * 0.5, r], [-r * 0.7, r * 0.3], [-r * 0.55, -r * 0.65]], COL.ink, 1.8);
    ctx.restore();
    if (ranged) { roughCircle(ctx, x, y, r * 0.34, '#15171a', accent, 1, 7); roughCircle(ctx, x, y, r * 0.12, COL.white, null, 0, 6); }
    if (elite) for (let i = -1; i <= 1; i++) roughLine(ctx, x + i * r * 0.35, y - r * 0.7, x + i * r * 0.55, y - r * 1.35, accent, 4);
  }
  return true;
}

function drawMythBoss(e, x, y) {
  const id = currentMap.id;
  const r = e.r;
  const fill = e.color;
  const accent = e.accent || currentMap.doodle;
  const teleFill = e.tele > 0 ? tint(fill, 1.22) : fill;
  if (id === 'forest') {
    roughEllipse(ctx, x, y + r * 0.35, r * 1.1, r * 0.78, teleFill, COL.ink, 2.5, 12);
    for (let i = -1; i <= 1; i++) drawMythHead(x + i * r * 0.72, y - r * (i === 0 ? 0.75 : 0.5), r * (i === 0 ? 0.48 : 0.4), fill, 'hound');
    for (let i = -2; i <= 2; i++) fillPoly(ctx, [[x + i * r * 0.4 - 6, y - r * 0.55], [x + i * r * 0.4, y - r * 1.0], [x + i * r * 0.4 + 6, y - r * 0.55]], accent);
    roughLine(ctx, x + r * 0.85, y + r * 0.3, x + r * 1.45, y - r * 0.15, accent, 8);
    drawMythHead(x + r * 1.5, y - r * 0.22, r * 0.22, accent, 'hound');
  } else if (id === 'waste') {
    roughEllipse(ctx, x, y + r * 0.28, r * 0.88, r * 1.05, teleFill, COL.ink, 2.5, 12);
    drawMythHead(x, y - r * 0.72, r * 0.62, fill, 'bull');
    roughLine(ctx, x - r * 0.65, y, x - r * 1.2, y + r * 0.8, accent, 10); roughLine(ctx, x + r * 0.65, y, x + r * 1.2, y + r * 0.8, accent, 10);
  } else if (id === 'desert') {
    roughEllipse(ctx, x, y + r * 0.35, r * 1.25, r * 0.64, teleFill, COL.ink, 2.5, 12);
    roughCircle(ctx, x - r * 0.65, y - r * 0.45, r * 0.48, '#d8aa75', COL.ink, 1.8, 9);
    fillPoly(ctx, [[x - r * 0.1, y], [x - r * 1.9, y - r * 1.25], [x - r * 0.75, y + r * 0.15]], accent);
    fillPoly(ctx, [[x + r * 0.1, y], [x + r * 1.9, y - r * 1.25], [x + r * 0.75, y + r * 0.15]], tint(accent, 1.12));
  } else if (id === 'swamp') {
    roughEllipse(ctx, x, y + r * 0.5, r * 1.1, r * 0.5, teleFill, COL.ink, 2.4, 12);
    for (let i = -2; i <= 2; i++) { const hx = x + i * r * 0.52; roughLine(ctx, x + i * r * 0.2, y + r * 0.25, hx, y - r * (0.9 + Math.abs(i) * 0.18), fill, 12); drawMythHead(hx, y - r * (1.0 + Math.abs(i) * 0.18), r * 0.3, accent, 'hound'); }
  } else if (id === 'ocean') {
    roughEllipse(ctx, x, y - r * 0.15, r * 0.68, r * 0.95, teleFill, COL.ink, 2.5, 12);
    roughCircle(ctx, x, y - r * 1.0, r * 0.35, '#d4a382', COL.ink, 1.5, 9);
    for (let i = 0; i < 6; i++) { const a = Math.PI + i * Math.PI / 5; const hx = x + Math.cos(a) * r * 1.25; const hy = y + r * 0.45 + Math.sin(a) * r * 0.75; roughLine(ctx, x, y + r * 0.25, hx, hy, accent, 8); drawMythHead(hx, hy, r * 0.22, fill, 'hound'); }
  } else if (id === 'volcano') {
    roughEllipse(ctx, x, y - r * 0.05, r * 0.82, r * 1.05, teleFill, COL.ink, 2.5, 12);
    fillPoly(ctx, [[x - r * 0.5, y - r * 0.55], [x - r * 1.7, y - r * 1.45], [x - r * 1.0, y + r * 0.05]], e.dark);
    fillPoly(ctx, [[x + r * 0.5, y - r * 0.55], [x + r * 1.7, y - r * 1.45], [x + r * 1.0, y + r * 0.05]], e.dark);
    drawMythHead(x, y - r * 1.0, r * 0.42, fill, 'hound');
    for (let i = -2; i <= 2; i++) { roughLine(ctx, x + i * r * 0.3, y + r * 0.55, x + i * r * 0.5, y + r * 1.4, accent, 8); drawMythHead(x + i * r * 0.5, y + r * 1.45, r * 0.17, accent, 'hound'); }
  } else if (id === 'inferno') {
    roughEllipse(ctx, x, y - r * 0.2, r * 0.72, r * 0.9, teleFill, COL.ink, 2.5, 12);
    roughCircle(ctx, x, y - r * 1.05, r * 0.42, '#d49b91', COL.ink, 1.5, 9);
    for (let i = -2; i <= 2; i++) roughLine(ctx, x + i * 6, y - r * 1.25, x + i * 13, y - r * 1.75 + Math.abs(i) * 5, '#3a2838', 6);
    roughLine(ctx, x, y + r * 0.45, x + r * 1.15, y + r * 1.15, fill, 16);
    roughEllipse(ctx, x - r * 1.0, y + r * 0.7, r * 0.35, r * 0.5, accent, COL.ink, 1.2, 8);
  } else if (id === 'heaven') {
    roughEllipse(ctx, x, y, r, r * 1.12, teleFill, COL.ink, 2.5, 12);
    roughCircle(ctx, x, y - r * 0.4, r * 0.42, COL.white, COL.ink, 1.5, 9); roughCircle(ctx, x, y - r * 0.4, r * 0.16, accent, null, 0, 7);
    fillPoly(ctx, [[x - r * 0.85, y - r * 0.4], [x - r * 1.4, y + r * 0.1], [x - r * 0.85, y + r * 0.65]], COL.gold);
    fillPoly(ctx, [[x + r * 0.85, y - r * 0.4], [x + r * 1.4, y + r * 0.1], [x + r * 0.85, y + r * 0.65]], COL.gold);
    roughLine(ctx, x + r * 0.8, y + r * 0.2, x + r * 1.65, y + r * 1.25, '#957143', 10);
    roughBox(ctx, x + r * 1.35, y + r * 0.75, r * 0.8, r * 0.55, accent, COL.ink, 1.5);
  } else if (id === 'snow') {
    roughEllipse(ctx, x, y + r * 0.25, r * 1.2, r * 0.78, teleFill, COL.ink, 2.5, 12);
    drawMythHead(x, y - r * 0.68, r * 0.58, fill, 'hound');
    for (let i = -2; i <= 2; i++) fillPoly(ctx, [[x + i * r * 0.42 - 6, y - r * 0.52], [x + i * r * 0.42, y - r * (1.18 + Math.abs(i) * 0.08)], [x + i * r * 0.42 + 6, y - r * 0.52]], i % 2 ? '#eefbff' : accent);
    roughBox(ctx, x - r * 0.9, y + r * 0.38, r * 1.8, Math.max(7, r * 0.24), '#75b9ce', COL.ink, 1.1);
    roughLine(ctx, x + r * 0.88, y + r * 0.3, x + r * 1.55, y - r * 0.16, '#dff8ff', 9);
  } else if (id === 'crimson') {
    // 阿瑞斯：重甲、带鬃冠的战盔与长矛，和雪山巨狼形成完全不同的轮廓。
    roughEllipse(ctx, x, y + r * 0.18, r * 0.82, r * 1.05, teleFill, COL.ink, 2.7, 12);
    fillPoly(ctx, [[x - r * 0.72, y - r * 0.35], [x, y - r * 0.72], [x + r * 0.72, y - r * 0.35], [x + r * 0.52, y + r * 0.7], [x, y + r], [x - r * 0.52, y + r * 0.7]], '#772b3e');
    strokePoly(ctx, [[x - r * 0.72, y - r * 0.35], [x, y - r * 0.72], [x + r * 0.72, y - r * 0.35], [x + r * 0.52, y + r * 0.7], [x, y + r], [x - r * 0.52, y + r * 0.7]], COL.ink, 1.7);
    roughCircle(ctx, x, y - r * 0.68, r * 0.42, '#a64a50', COL.ink, 1.5, 9);
    fillPoly(ctx, [[x - r * 0.5, y - r * 0.68], [x - r * 0.34, y - r * 1.22], [x + r * 0.34, y - r * 1.22], [x + r * 0.5, y - r * 0.68], [x + r * 0.23, y - r * 0.45], [x - r * 0.23, y - r * 0.45]], '#3a2029');
    for (let i = -2; i <= 2; i++) fillPoly(ctx, [[x + i * r * 0.16 - 4, y - r * 1.18], [x + i * r * 0.16, y - r * (1.75 - Math.abs(i) * 0.08)], [x + i * r * 0.16 + 4, y - r * 1.18]], i === 0 ? '#ef5b6f' : '#b43750');
    roughCircle(ctx, x - r * 0.16, y - r * 0.7, r * 0.07, '#f5d66a', null, 0, 6);
    roughCircle(ctx, x + r * 0.16, y - r * 0.7, r * 0.07, '#f5d66a', null, 0, 6);
    roughLine(ctx, x + r * 0.7, y - r * 0.55, x + r * 1.42, y + r * 1.22, '#4a2927', 7);
    fillPoly(ctx, [[x + r * 0.68, y - r * 0.62], [x + r * 0.9, y - r * 1.2], [x + r * 1.02, y - r * 0.5]], '#e15a67');
    roughCircle(ctx, x, y + r * 0.2, r * 0.23, null, '#f37486', 1.4, 9);
  } else {
    const cols = ['#789447', '#d5a13a', '#d75a45', '#7189a6'];
    roughEllipse(ctx, x, y, r * 1.08, r * 1.18, '#222328', COL.ink, 2.8, 12);
    roughCircle(ctx, x, y - r * 0.15, r * 0.38, '#0c0d0f', accent, 1.5, 9); roughCircle(ctx, x, y - r * 0.15, r * 0.13, COL.white, null, 0, 6);
    for (let i = 0; i < 4; i++) { const a = e.t * 0.4 + i * TAU / 4; const px = x + Math.cos(a) * r * 1.45; const py = y + Math.sin(a) * r * 1.25; fillPoly(ctx, [[px, py - r * 0.45], [px + r * 0.4, py], [px, py + r * 0.45], [px - r * 0.4, py]], cols[i]); }
  }
}

function drawPoisonStatus(e, x, y) {
  if (!(e.poisonT > 0)) return;
  const strength = clamp(e.poisonT / (2.4 + (e.poisonLevel || 1) * 0.7), 0.2, 1);
  const r = e.r;
  ctx.save();
  ctx.globalAlpha = 0.18 + strength * 0.18;
  roughEllipse(ctx, x, y + r * 0.16, r * 1.08, r * 0.88, '#91bd57', '#567f43', 1.4, 10);
  ctx.globalAlpha = 0.55 + strength * 0.3;
  for (let i = 0; i < 4; i++) {
    const a = e.t * 0.7 + i * 1.7;
    const px = x + Math.cos(a) * r * (0.38 + (i % 2) * 0.3);
    const py = y - r * 0.15 + Math.sin(a * 1.3) * r * 0.55;
    roughCircle(ctx, px, py, Math.max(1.8, r * (0.1 + i * 0.018)), i % 2 ? '#b8d868' : '#6f9f4b', '#456438', 0.7, 7);
    roughCircle(ctx, px - 0.6, py - 0.8, Math.max(0.5, r * 0.035), '#eff7bd', null, 0, 5);
  }
  ctx.restore();
}

function drawFrostStatus(e, x, y) {
  if (!(e.slowT > 0)) return;
  const strength = clamp(e.slowT / 1.6, 0.22, 1);
  const r = e.r;
  ctx.save();
  ctx.globalAlpha = 0.16 + strength * 0.22;
  roughEllipse(ctx, x, y + r * 0.1, r * 1.08, r * 0.95, '#9de2ee', '#dffaff', 2, 11);
  ctx.globalAlpha = 0.55 + strength * 0.28;
  const shards = [
    [[x - r * 0.95, y + r * 0.5], [x - r * 0.72, y - r * 0.2], [x - r * 0.42, y + r * 0.58]],
    [[x + r * 0.42, y + r * 0.62], [x + r * 0.72, y - r * 0.35], [x + r * 1.0, y + r * 0.52]],
    [[x - r * 0.22, y - r * 0.68], [x, y - r * 1.28], [x + r * 0.25, y - r * 0.64]],
  ];
  for (let i = 0; i < shards.length; i++) {
    fillPoly(ctx, shards[i], i % 2 ? '#78bfd4' : '#bfeef4');
    strokePoly(ctx, shards[i], '#4b8da7', 1);
    roughLine(ctx, shards[i][0][0], shards[i][0][1], shards[i][1][0], shards[i][1][1], '#efffff', 1);
  }
  ctx.globalAlpha = 0.9;
  const sy = y - r - (e.boss ? 22 : 13);
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    roughLine(ctx, x, sy, x + Math.cos(a) * 5, sy + Math.sin(a) * 5, '#6cb4cf', 1.3);
  }
  ctx.restore();
}

function drawStunStatus(e, x, y) {
  if (!(e.stunT > 0)) return;
  ctx.save();
  const r = e.r;
  const alpha = 0.55 + Math.sin(e.t * 22) * 0.22;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * r * 0.72;
    const top = y - r - 15 - (i % 2) * 4;
    fillPoly(ctx, [[x + ox + 1, top - 6], [x + ox - 4, top + 1], [x + ox, top], [x + ox - 2, top + 7], [x + ox + 5, top - 1], [x + ox + 1, top]], '#e7c83e');
  }
  ctx.setLineDash([3, 3]);
  roughBox(ctx, x - r - 4, y - r * 0.8, r * 2 + 8, r * 1.65, null, '#d6b83d', 1.3);
  ctx.setLineDash([]);
  ctx.restore();
}

function drawCombatEffect(fx) {
  const p = clamp(1 - fx.life / fx.max, 0, 1);
  if (fx.kind === 'thunderStrike') {
    ctx.save();
    const alpha = Math.sin(p * Math.PI);
    ctx.globalAlpha = alpha * 0.28;
    ctx.strokeStyle = '#fff2a2';
    ctx.lineWidth = 11;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const py = fx.y - 170 + t * 170;
      const jitter = i === 0 || i === 8 ? 0 : Math.sin((i + fx.seed) * 7.7) * (11 - t * 4);
      const px = fx.x + jitter;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#e8c83f';
    ctx.lineWidth = 3;
    ctx.stroke();
    doodleStar(ctx, fx.x, fx.y, 7 + p * 5, '#fff3a7', 1.5);
    for (let i = 0; i < 7; i++) {
      const a = -2.8 + i * 0.92;
      const inner = 8 + (i % 2) * 3;
      const outer = fx.r * (0.55 + p * 0.38);
      roughLine(ctx, fx.x + Math.cos(a) * inner, fx.y + Math.sin(a) * inner * 0.45, fx.x + Math.cos(a) * outer, fx.y + Math.sin(a) * outer * 0.45, i % 2 ? '#fff1a6' : '#d1af2d', 1.5);
    }
    ctx.restore();
    return;
  }
  if (fx.kind === 'wardBlock') {
    ctx.save();
    const alpha = Math.sin(p * Math.PI);
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = '#9fe8e8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 18 + p * 10, -1.25, 1.25);
    ctx.stroke();
    drawShieldIcon(fx.x, fx.y, 6 + p * 4, '#75c8d2');
    ctx.restore();
    return;
  }
  if (fx.kind !== 'bomb') return;
  ctx.save();
  if (p < 0.24) {
    const q = p / 0.24;
    ctx.globalAlpha = 0.95;
    roughCircle(ctx, fx.x, fx.y + 1, 8 + q * 2, '#34302f', COL.ink, 1.5, 9);
    roughEllipse(ctx, fx.x - 2, fx.y - 2, 2.6, 1.4, '#77706c', null, 0, 7);
    roughLine(ctx, fx.x + 5, fx.y - 6, fx.x + 10, fx.y - 13, '#6a4a33', 2);
    doodleStar(ctx, fx.x + 11, fx.y - 15, 4 + q * 3, q > 0.7 ? '#fff0a0' : COL.orange, 1.2);
  } else {
    const q = (p - 0.24) / 0.76;
    const rr = fx.r * (0.28 + q * 0.9);
    ctx.globalAlpha = (1 - q) * 0.34;
    roughCircle(ctx, fx.x, fx.y, rr, '#f7a23d', null, 0, 13);
    ctx.globalAlpha = (1 - q) * 0.9;
    const petals = [];
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      const inner = rr * (i % 2 ? 0.35 : 0.48);
      const outer = rr * (i % 3 ? 0.86 : 1.08);
      petals.push([fx.x + Math.cos(a) * (i % 2 ? inner : outer), fx.y + Math.sin(a) * (i % 2 ? inner : outer)]);
    }
    fillPoly(ctx, petals, q < 0.5 ? '#f28b36' : '#e4553f');
    strokePoly(ctx, petals, COL.ink, 1.4);
    doodleStar(ctx, fx.x, fx.y, Math.max(6, rr * 0.5), '#ffd65a', 1.6);
    ctx.globalAlpha = (1 - q) * 0.7;
    ctx.strokeStyle = '#fff1b0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(fx.x, fx.y, rr * 1.15, 0, TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + 0.2;
      roughCircle(ctx, fx.x + Math.cos(a) * rr * 1.18, fx.y + Math.sin(a) * rr * 1.18, 2 + (i % 2), i % 2 ? '#413a36' : '#f0a03f', null, 0, 6);
    }
  }
  ctx.restore();
}

function drawEnemy(e) {
  const x = e.x;
  const y = e.y;
  const visual = enemyVisual(e.type, e.elite, e.boss);
  e.color = visual.color;
  e.dark = visual.dark;
  e.hi = visual.hi;
  e.accent = visual.accent;
  roughEllipse(ctx, x, y + e.r * 0.85, e.r * 0.85, e.r * 0.3, 'rgba(58,48,38,0.10)', null, 0, 8);

  let mythDrawn = false;
  if (e.boss) {
    drawMythBoss(e, x, y + Math.sin(e.t * 3) * 2);
    mythDrawn = true;
  } else if (drawMythMinion(e, x, y)) {
    mythDrawn = true;
  } else if (e.type === 'slime') {
    const squash = 1 + Math.sin(e.t * 7 + e.phase) * 0.12;
    const rr = e.r * squash;
    fillPoly(ctx, [[x, y - e.r * 1.25], [x + rr * 0.78, y - e.r * 0.35], [x + rr, y + e.r * 0.55], [x + rr * 0.45, y + e.r], [x - rr * 0.45, y + e.r], [x - rr, y + e.r * 0.55], [x - rr * 0.78, y - e.r * 0.35]], e.color);
    strokePoly(ctx, [[x, y - e.r * 1.25], [x + rr * 0.78, y - e.r * 0.35], [x + rr, y + e.r * 0.55], [x + rr * 0.45, y + e.r], [x - rr * 0.45, y + e.r], [x - rr, y + e.r * 0.55], [x - rr * 0.78, y - e.r * 0.35]], COL.ink, 2);
    roughEllipse(ctx, x - 2.5, y - e.r * 0.62, e.r * 0.26, e.r * 0.14, 'rgba(255,255,255,0.2)', null, 0, 8);
    roughCircle(ctx, x - 3.6, y - 2, 2.6, COL.white, COL.ink, 1, 8);
    roughCircle(ctx, x + 3.6, y - 2, 2.6, COL.white, COL.ink, 1, 8);
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x - 3.4, y - 1.6, 1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.8, y - 1.6, 1, 0, TAU); ctx.fill();
  } else if (e.type === 'bat') {
    const flap = Math.sin(e.t * 16 + e.phase) * 3;
    fillPoly(ctx, [[x - 2, y], [x - 12, y - 5 - flap], [x - 9, y + 4]], e.dark);
    strokePoly(ctx, [[x - 2, y], [x - 12, y - 5 - flap], [x - 9, y + 4]], COL.ink, 1.5);
    fillPoly(ctx, [[x + 2, y], [x + 12, y - 5 - flap], [x + 9, y + 4]], e.dark);
    strokePoly(ctx, [[x + 2, y], [x + 12, y - 5 - flap], [x + 9, y + 4]], COL.ink, 1.5);
    roughCircle(ctx, x, y, 6, e.color, COL.ink, 1.8, 8);
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x - 2, y - 1.5, 1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 2, y - 1.5, 1, 0, TAU); ctx.fill();
  } else if (e.type === 'ink') {
    roughCircle(ctx, x, y, e.r, e.color, COL.ink, 2, 12);
    roughEllipse(ctx, x - e.r * 0.28, y - e.r * 0.48, e.r * 0.34, e.r * 0.18, 'rgba(255,255,255,0.16)', null, 0, 8);
    roughCircle(ctx, x - 4, y - 3, 3, COL.white, COL.ink, 1, 7);
    roughCircle(ctx, x + 4, y - 3, 3, COL.white, COL.ink, 1, 7);
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x - 3.4, y - 2.6, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4.4, y - 2.6, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y + 4, 3.2, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = COL.white; ctx.lineWidth = 1.4; ctx.stroke();
  } else if (e.type === 'shooter' || e.type === 'eliteShooter') {
    const telegraphWindow = e.type === 'eliteShooter' ? 0.55 : 0.38;
    if (e.fireCd > 0 && e.fireCd < telegraphWindow) {
      const aim = Math.atan2(player.y - y, player.x - x);
      ctx.save();
      ctx.globalAlpha = 0.16 + (telegraphWindow - e.fireCd) * 0.5;
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = e.accent || '#c75a9a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(aim) * (e.rangedElite ? 190 : 95), y + Math.sin(aim) * (e.rangedElite ? 190 : 95));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    roughCircle(ctx, x, y, e.r, e.color, COL.ink, 2, 9);
    roughEllipse(ctx, x - 2.5, y - 4, 3, 1.4, 'rgba(255,255,255,0.16)', null, 0, 7);
    const a = Math.atan2(player.y - y, player.x - x);
    roughLine(ctx, x, y, x + Math.cos(a) * 15, y + Math.sin(a) * 15, e.dark, 3);
    roughCircle(ctx, x - 3, y - 2, 2, COL.white, COL.ink, 1, 7);
    roughCircle(ctx, x + 3, y - 2, 2, COL.white, COL.ink, 1, 7);
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x - 2.7, y - 1.6, 0.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.3, y - 1.6, 0.9, 0, TAU); ctx.fill();
  } else if (e.type === 'splitter') {
    roughCircle(ctx, x, y, e.r, e.color, COL.ink, 2, 9);
    roughLine(ctx, x, y - e.r, x, y + e.r, '#b084c2', 1.7);
    ctx.fillStyle = COL.white;
    ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3, y - 2, 1.7, 0, TAU); ctx.fill();
  } else if (e.type === 'jumper') {
    const hop = (e.t % 1.5) < 0.3 ? -3 : 0;
    roughEllipse(ctx, x, y + hop, e.r, e.r * 0.9, e.color, COL.ink, 2);
    roughCircle(ctx, x - 3.4, y - 3 + hop, 2.2, COL.white, COL.ink, 1, 7);
    roughCircle(ctx, x + 3.4, y - 3 + hop, 2.2, COL.white, COL.ink, 1, 7);
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x - 3.2, y - 2.6 + hop, 0.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.6, y - 2.6 + hop, 0.9, 0, TAU); ctx.fill();
  } else {
    // 精英：大号史莱姆 + 王冠
    const squash = 1 + Math.sin(e.t * 5) * 0.08;
    roughEllipse(ctx, x, y, e.r * squash, e.r / squash, e.color, COL.ink, 2.4);
    fillPoly(ctx, [
      [x - 12, y - e.r * 0.7], [x - 12, y - e.r * 1.25], [x - 5, y - e.r * 0.95],
      [x, y - e.r * 1.35], [x + 5, y - e.r * 0.95], [x + 12, y - e.r * 1.25],
      [x + 12, y - e.r * 0.7],
    ], COL.gold);
    roughCircle(ctx, x - 6, y - 3, 3.4, COL.white, COL.ink, 1.2, 8);
    roughCircle(ctx, x + 6, y - 3, 3.4, COL.white, COL.ink, 1.2, 8);
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x - 5.6, y - 2.6, 1.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 6.4, y - 2.6, 1.3, 0, TAU); ctx.fill();
  }

  if (!mythDrawn) drawEnemyThemeDetails(e, x, y);

  if (e.boss && (e.attackFx > 0 || e.tele > 0 || e.chargeT > 0)) {
    const chargeP = e.tele > 0 ? 1 - e.tele / 0.6 : (e.chargeT > 0 ? 1 : 1 - e.attackFx / 0.5);
    const aura = 0.5 + Math.sin(e.t * 18) * 0.18;
    ctx.save();
    ctx.globalAlpha = clamp(aura, 0.22, 0.72);
    ctx.strokeStyle = e.tele > 0 ? '#fff0a6' : (e.accent || currentMap.doodle);
    ctx.lineWidth = e.tele > 0 ? 4 : 2.5;
    ctx.setLineDash(e.tele > 0 ? [7, 5] : []);
    ctx.beginPath();
    ctx.arc(x, y, e.r + 12 + clamp(chargeP, 0, 1) * 10, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 8; i++) {
      const a = e.t * 0.8 + i * TAU / 8;
      const r1 = e.r + 17;
      const r2 = r1 + 7 + Math.sin(e.t * 10 + i) * 3;
      roughLine(ctx, x + Math.cos(a) * r1, y + Math.sin(a) * r1, x + Math.cos(a) * r2, y + Math.sin(a) * r2, e.accent || currentMap.doodle, 1.5);
    }
    if (e.tele > 0) {
      const a = Math.atan2(player.y - y, player.x - x);
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = '#d95a45';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * e.r, y + Math.sin(a) * e.r);
      ctx.lineTo(x + Math.cos(a) * 180, y + Math.sin(a) * 180);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  if (e.attackFx > 0 && !e.boss) {
    const p = 1 - e.attackFx / (e.elite ? 0.34 : 0.22);
    const a = e.attackA == null ? Math.atan2(player.y - y, player.x - x) : e.attackA;
    ctx.save();
    ctx.globalAlpha = Math.sin(clamp(p, 0, 1) * Math.PI) * (e.elite ? 0.75 : 0.55);
    if (e.type === 'shooter' || e.type === 'eliteShooter') {
      const mx = x + Math.cos(a) * 16;
      const my = y + Math.sin(a) * 16;
      doodleStar(ctx, mx, my, 7 + p * 5, '#f3a3cf', 2);
      roughCircle(ctx, mx, my, 3 + p * 3, '#fff0c7', null, 0, 7);
    } else {
      ctx.strokeStyle = e.elite ? COL.gold : (e.accent || '#c75a9a');
      ctx.lineWidth = e.elite ? 7 : 4;
      ctx.beginPath();
      ctx.arc(x, y, e.r + (e.elite ? 15 : 8), a - 0.8, a + 0.8);
      ctx.stroke();
      if (e.elite) {
        ctx.strokeStyle = '#fff0a6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, e.r + 20 + p * 9, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawPoisonStatus(e, x, y);
  drawFrostStatus(e, x, y);
  drawStunStatus(e, x, y);

  if (e.flash > 0) {
    roughCircle(ctx, x, y, e.r * 0.95, 'rgba(255,255,255,' + (e.flash * 0.5).toFixed(2) + ')', null, 0, 9);
  }
  if (!e.boss && e.hp < e.maxHp) {
    const w = e.r * 2;
    if (e.elite) {
      const badge = e.eliteName || (e.type === 'eliteShooter' ? '远程精英' : '近战精英');
      const badgeW = Math.max(28, measure(badge, 5.5, true) + 8);
      roughBox(ctx, x - badgeW / 2, y - e.r - 24, badgeW, 10, COL.gold, COL.ink, 0.8);
      text(badge, x, y - e.r - 22.5, 5.5, COL.ink, 'center', true);
      roughLine(ctx, x - w / 2, y - e.r - 10, x + w / 2, y - e.r - 10, '#eadfcf', 5);
      roughLine(ctx, x - w / 2, y - e.r - 10, x - w / 2 + w * clamp(e.hp / e.maxHp, 0, 1), y - e.r - 10, COL.goldDark, 3.2);
    } else {
      roughLine(ctx, x - w / 2, y - e.r - 8, x + w / 2, y - e.r - 8, '#eadfcf', 3.5);
      roughLine(ctx, x - w / 2, y - e.r - 8, x - w / 2 + w * clamp(e.hp / e.maxHp, 0, 1), y - e.r - 8, COL.ink, 2.2);
    }
  }
}

function drawGem(g) {
  const bob = Math.sin(g.life * 5) * 1.2;
  roughCircle(ctx, g.x, g.y + bob, 4.5, g.value > 1 ? COL.purple : COL.gold, COL.ink, 1.2, 8);
  roughCircle(ctx, g.x - 1, g.y - 1 + bob, 1.2, 'rgba(255,255,255,0.8)', null, 0, 6);
}

function drawBullet(b, color) {
  const a = Math.atan2(b.vy, b.vx);
  const trail = b.crit ? 0.034 : 0.022;
  ctx.strokeStyle = b.crit ? '#ffe28a' : color;
  ctx.lineWidth = b.crit ? 5 : 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(b.x - b.vx * trail, b.y - b.vy * trail);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  if (b.weaponId === 'pencil') {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    fillPoly(ctx, [[-6, -2.1], [3, -2.1], [7, 0], [3, 2.1], [-6, 2.1]], b.crit ? '#ffd45c' : '#e6aa32');
    strokePoly(ctx, [[-6, -2.1], [3, -2.1], [7, 0], [3, 2.1], [-6, 2.1]], COL.ink, 0.9);
    fillPoly(ctx, [[3, -2.1], [8, 0], [3, 2.1]], '#f4d8a6');
    fillPoly(ctx, [[6.2, -0.7], [8.8, 0], [6.2, 0.7]], COL.ink);
    ctx.restore();
  } else if (b.weaponId === 'slingshot') {
    roughCircle(ctx, b.x, b.y, b.crit ? 5 : 3.8, b.crit ? '#ffd45c' : '#789b55', COL.ink, 1, 8);
    roughLine(ctx, b.x - Math.cos(a) * 9 - Math.sin(a) * 3, b.y - Math.sin(a) * 9 + Math.cos(a) * 3, b.x - Math.cos(a) * 5, b.y - Math.sin(a) * 5, tint(color, 0.6), 1);
  } else if (b.weaponId === 'ruler') {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
    roughBox(ctx, -15, -3, 30, 6, '#b8dce0', COL.ink, 1);
    for (let i = -10; i <= 10; i += 5) roughLine(ctx, i, -2, i, i % 10 === 0 ? 2 : 0, '#4c7880', 0.7);
    ctx.restore();
  } else if (b.weaponId === 'crayon') {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
    roughBox(ctx, -8, -3, 14, 6, color, COL.ink, 1);
    fillPoly(ctx, [[6, -3], [12, 0], [6, 3]], tint(color, 1.2));
    ctx.restore();
  } else if (b.weaponId === 'boomerang') {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(performance.now() / 75);
    fillPoly(ctx, [[-11, -3], [-2, 0], [2, 10], [7, 7], [5, -3], [11, -8], [6, -11], [0, -5]], b.crit ? COL.gold : color);
    strokePoly(ctx, [[-11, -3], [-2, 0], [2, 10], [7, 7], [5, -3], [11, -8], [6, -11], [0, -5]], COL.ink, 1.1);
    ctx.restore();
  } else if (b.weaponId === 'eraser') {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a + 0.25);
    roughBox(ctx, -7, -5, 14, 10, '#ef9db1', COL.ink, 1.2);
    roughLine(ctx, -2, -5, -2, 5, '#fff0dd', 2);
    ctx.restore();
  } else if (b.weaponId === 'enemyInk') {
    roughCircle(ctx, b.x, b.y, b.r + 2, 'rgba(199,90,154,0.16)', null, 0, 9);
    roughCircle(ctx, b.x, b.y, b.r, color, COL.ink, 1, 8);
    fillPoly(ctx, [[b.x - 1, b.y - 5], [b.x + 2, b.y - 1], [b.x + 5, b.y + 2], [b.x, b.y + 1]], '#f0a4ce');
  } else if (b.weaponId === 'enemyElite') {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
    roughCircle(ctx, 0, 0, b.r + 4, 'rgba(255,238,170,0.12)', null, 0, 9);
    const theme = b.themeId || 'forest';
    if (theme === 'forest' || theme === 'swamp') {
      roughEllipse(ctx, 0, 0, 8, 4, color, COL.ink, 1, 8); roughLine(ctx, -6, 1, 6, -1, '#e5f0a2', 1);
    } else if (theme === 'ocean') {
      fillPoly(ctx, [[-8, 0], [0, -5], [8, 0], [0, 5]], '#8bd4df'); strokePoly(ctx, [[-8, 0], [0, -5], [8, 0], [0, 5]], COL.ink, 1);
    } else if (theme === 'heaven') {
      fillPoly(ctx, [[-9, -3], [3, -3], [9, 0], [3, 3], [-9, 3]], COL.gold); strokePoly(ctx, [[-9, -3], [3, -3], [9, 0], [3, 3], [-9, 3]], COL.ink, 1);
    } else if (theme === 'volcano' || theme === 'inferno' || theme === 'four') {
      doodleStar(ctx, 0, 0, 8, theme === 'four' ? '#dceaff' : '#f0743d', 1.8);
    } else {
      fillPoly(ctx, [[-8, 0], [0, -6], [8, 0], [0, 6]], color); strokePoly(ctx, [[-8, 0], [0, -6], [8, 0], [0, 6]], COL.ink, 1);
    }
    ctx.restore();
  } else if (b.weaponId === 'bossOrb') {
    roughCircle(ctx, b.x, b.y, b.r + 4, tint(color, 0.16), null, 0, 10);
    roughCircle(ctx, b.x, b.y, b.r, color, COL.ink, 1.2, 9);
    doodleStar(ctx, b.x, b.y, b.r + 3, '#fff0b4', 1);
  } else {
    roughCircle(ctx, b.x, b.y, b.r, b.crit ? COL.gold : color, COL.ink, 1, 7);
  }

  if (b.form >= 2 && b.weaponId && !b.weaponId.startsWith('enemy') && b.weaponId !== 'bossOrb') {
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.min(0.35, b.form * 0.05);
    if (b.form >= 6) doodleStar(ctx, b.x, b.y, b.r + 8, b.crit ? '#fff0a6' : color, 1.5);
    else if (b.form >= 4) roughCircle(ctx, b.x, b.y, b.r + 4 + b.form, null, color, 1, 8);
    else roughLine(ctx, b.x - Math.cos(a) * (11 + b.form * 2), b.y - Math.sin(a) * (11 + b.form * 2), b.x - Math.cos(a) * 4, b.y - Math.sin(a) * 4, '#fffdf8', 1.4);
    ctx.restore();
  }

  if (b.crit) {
    doodleStar(ctx, b.x, b.y, b.r + 4, '#fff2a6', 1.3);
  }
}

function drawHeartIcon(x, y, s, color) {
  doodleHeart(ctx, x, y, s, color || COL.red, COL.ink, 1);
}

function drawShieldIcon(x, y, s, color) {
  fillPoly(ctx, [[x, y - s], [x + s * 0.8, y - s * 0.55], [x + s * 0.62, y + s * 0.55], [x, y + s], [x - s * 0.62, y + s * 0.55], [x - s * 0.8, y - s * 0.55]], color || COL.blue);
  strokePoly(ctx, [[x, y - s], [x + s * 0.8, y - s * 0.55], [x + s * 0.62, y + s * 0.55], [x, y + s], [x - s * 0.62, y + s * 0.55], [x - s * 0.8, y - s * 0.55]], COL.ink, 1.2);
}

function drawWeaponIcon(id, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 16, s / 16);
  if (id === 'pencil') {
    ctx.rotate(-0.55);
    fillPoly(ctx, [[-11, -3], [7, -3], [12, 0], [7, 3], [-11, 3]], COL.ochre);
    strokePoly(ctx, [[-11, -3], [7, -3], [12, 0], [7, 3], [-11, 3]], COL.ink, 1.5);
    fillPoly(ctx, [[7, -3], [14, 0], [7, 3]], '#f4d8a6');
    fillPoly(ctx, [[12, -1.2], [15, 0], [12, 1.2]], COL.ink);
  } else if (id === 'slingshot') {
    roughLine(ctx, 0, 10, -1, -2, '#8f5d34', 4);
    roughLine(ctx, -1, -2, -8, -10, '#8f5d34', 4);
    roughLine(ctx, -1, -2, 8, -10, '#8f5d34', 4);
    roughLine(ctx, -8, -10, 8, -10, COL.red, 1.6);
  } else if (id === 'knife') {
    ctx.rotate(-0.55);
    fillPoly(ctx, [[-12, -3], [3, -3], [13, 0], [3, 3], [-12, 3]], '#c8d2d8');
    strokePoly(ctx, [[-12, -3], [3, -3], [13, 0], [3, 3], [-12, 3]], COL.ink, 1.5);
    roughBox(ctx, -13, -4, 7, 8, COL.blue, COL.ink, 1.2);
  } else if (id === 'bubble') {
    roughCircle(ctx, 0, 0, 11, 'rgba(139,95,192,0.16)', COL.purple, 2, 12);
    roughCircle(ctx, -4, -4, 3, 'rgba(255,255,255,0.65)', null, 0, 7);
    drawShieldIcon(2, 2, 6, COL.purple);
  } else if (id === 'ruler') {
    ctx.rotate(-0.35); roughBox(ctx, -13, -4, 26, 8, '#b8dce0', COL.ink, 1.3);
    for (let i = -9; i <= 9; i += 6) roughLine(ctx, i, -3, i, 1, '#4c7880', 0.8);
  } else if (id === 'crayon') {
    ctx.rotate(-0.55); roughBox(ctx, -12, -4, 22, 8, '#d96672', COL.ink, 1.3); fillPoly(ctx, [[10, -4], [15, 0], [10, 4]], '#f3b6a8');
  } else if (id === 'boomerang') {
    fillPoly(ctx, [[-12, -3], [-2, 0], [3, 11], [8, 7], [5, -2], [12, -8], [6, -12], [0, -5]], '#8068a6');
    strokePoly(ctx, [[-12, -3], [-2, 0], [3, 11], [8, 7], [5, -2], [12, -8], [6, -12], [0, -5]], COL.ink, 1.3);
  } else if (id === 'eraser') {
    ctx.rotate(-0.3); roughBox(ctx, -10, -7, 20, 14, '#ef9db1', COL.ink, 1.4); roughLine(ctx, -2, -7, -2, 7, '#fff0dd', 2);
  } else if (id === 'compass') {
    roughLine(ctx, 0, -12, -8, 10, '#8966a8', 3); roughLine(ctx, 0, -12, 8, 10, '#b9c8cf', 3); roughCircle(ctx, 0, -12, 2.6, COL.gold, COL.ink, 0.8, 6);
  } else {
    doodleStar(ctx, 0, 0, 10, COL.goldDark, 2);
  }
  ctx.restore();
}

function drawItemIcon(id, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
  if (id === 'clip') {
    ctx.strokeStyle = '#6d7b82'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 9, -2.2, 2.2); ctx.arc(0, 0, 5, 2.2, -2.2, true); ctx.stroke();
  } else if (id === 'tape') {
    roughCircle(ctx, 0, 0, 10, '#d8eef0', COL.ink, 1.4, 9); roughCircle(ctx, 0, 0, 4, '#fff9e9', COL.ink, 1, 7);
  } else if (id === 'protractor') {
    ctx.fillStyle = '#f0cf6a'; ctx.beginPath(); ctx.arc(0, 4, 11, Math.PI, TAU); ctx.lineTo(-11, 4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.4; ctx.stroke(); roughCircle(ctx, 0, 4, 3, '#fff9e9', COL.ink, 0.8, 6);
  } else if (id === 'pinwheel') {
    for (let i = 0; i < 4; i++) { ctx.save(); ctx.rotate(i * Math.PI / 2); fillPoly(ctx, [[0, 0], [1, -11], [8, -6]], i % 2 ? COL.blue : COL.red); ctx.restore(); } roughCircle(ctx, 0, 0, 2.5, COL.gold, COL.ink, 0.7, 6);
  } else {
    roughBox(ctx, -8, -10, 16, 19, '#554264', COL.ink, 1.4); roughLine(ctx, -5, -12, 5, -12, COL.gold, 2); roughCircle(ctx, 0, 1, 4, '#aa78b8', null, 0, 7);
  }
  ctx.restore();
}

function drawCardIcon(card, x, y, s) {
  const bits = card.key.split(':');
  if (bits[0] === 'new' || bits[0] === 'up') {
    drawWeaponIcon(bits[1], x, y, s);
    return;
  }
  if (bits[0] === 'ench') {
    const id = bits[1];
    if (id === 'ward') {
      drawShieldIcon(x, y, s * 0.68, '#75c8d2');
      roughCircle(ctx, x, y, s * 0.78, null, '#b9f1ed', 1.4, 10);
    } else if (id === 'poison') {
      fillPoly(ctx, [[x, y - s * 0.7], [x + s * 0.48, y + s * 0.15], [x, y + s * 0.62], [x - s * 0.48, y + s * 0.15]], '#79a84e');
      roughCircle(ctx, x + s * 0.35, y - s * 0.26, s * 0.16, '#b9dc68', COL.ink, 0.8, 7);
    } else if (id === 'lightning') {
      fillPoly(ctx, [[x + s * 0.08, y - s * 0.72], [x - s * 0.45, y + s * 0.05], [x - s * 0.06, y + s * 0.03], [x - s * 0.22, y + s * 0.72], [x + s * 0.5, y - s * 0.14], [x + s * 0.12, y - s * 0.1]], '#e8c83f');
      strokePoly(ctx, [[x + s * 0.08, y - s * 0.72], [x - s * 0.45, y + s * 0.05], [x - s * 0.06, y + s * 0.03], [x - s * 0.22, y + s * 0.72], [x + s * 0.5, y - s * 0.14], [x + s * 0.12, y - s * 0.1]], COL.ink, 1.2);
    } else if (id === 'boom') {
      doodleStar(ctx, x, y, s * 0.62, COL.orange, 3);
    } else if (id === 'frost') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        roughLine(ctx, x, y, x + Math.cos(a) * s * 0.62, y + Math.sin(a) * s * 0.62, COL.blue, 2);
      }
    } else if (id === 'deflect') {
      drawShieldIcon(x, y, s * 0.62, COL.purple);
    } else if (id === 'pierce') {
      roughLine(ctx, x - s * 0.65, y, x + s * 0.65, y, COL.inkPurpleHi, 3);
      roughLine(ctx, x + s * 0.2, y - s * 0.28, x + s * 0.65, y, COL.inkPurpleHi, 3);
      roughLine(ctx, x + s * 0.2, y + s * 0.28, x + s * 0.65, y, COL.inkPurpleHi, 3);
    } else if (id === 'ricochet') {
      ctx.save(); ctx.strokeStyle = '#8d69a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x - s * 0.2, y, s * 0.48, -1.2, 1.6); ctx.stroke(); ctx.restore();
      roughLine(ctx, x + s * 0.2, y + s * 0.42, x + s * 0.65, y + s * 0.28, '#8d69a8', 2);
    } else if (id === 'split') {
      roughLine(ctx, x - s * 0.62, y, x, y, COL.pink, 3); roughLine(ctx, x, y, x + s * 0.62, y - s * 0.45, COL.pink, 3); roughLine(ctx, x, y, x + s * 0.62, y + s * 0.45, COL.pink, 3);
    } else if (id === 'leech') {
      doodleHeart(ctx, x, y, s * 0.5, '#79a56c', COL.ink, 1.2);
    } else if (id === 'knockback') {
      for (let k = 0; k < 2; k++) { const ox = (k - 0.5) * s * 0.35; roughLine(ctx, x + ox - s * 0.32, y - s * 0.42, x + ox + s * 0.12, y, COL.orange, 2.5); roughLine(ctx, x + ox + s * 0.12, y, x + ox - s * 0.32, y + s * 0.42, COL.orange, 2.5); }
    } else if (id === 'homing') {
      roughCircle(ctx, x, y, s * 0.55, null, '#5d91a5', 2, 9); roughCircle(ctx, x, y, s * 0.2, '#5d91a5', null, 0, 7); roughLine(ctx, x - s * 0.75, y, x - s * 0.42, y, '#5d91a5', 1.5);
    }
    return;
  }
  if (bits[0] === 'item') {
    drawItemIcon(bits[1], x, y, s);
    return;
  }
  const id = bits[1];
  if (id === 'hp' || id === 'heal') drawHeartIcon(x, y, s * 0.52, id === 'heal' ? COL.pink : COL.red);
  else if (id === 'crit') {
    roughCircle(ctx, x, y, s * 0.62, '#fff3b8', COL.goldDark, 1.4, 10);
    doodleStar(ctx, x, y, s * 0.46, COL.goldDark, 2.2);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      roughLine(ctx, x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, x + Math.cos(a) * s * 0.76, y + Math.sin(a) * s * 0.76, COL.gold, 1.6);
    }
  }
  else if (id === 'speed') {
    roughLine(ctx, x - s * 0.62, y + s * 0.25, x + s * 0.5, y - s * 0.25, COL.blue, 3);
    roughLine(ctx, x - s * 0.75, y - s * 0.05, x - s * 0.2, y - s * 0.05, COL.blue, 2);
  } else if (id === 'magnet') {
    roughBox(ctx, x - s * 0.55, y - s * 0.4, s * 1.1, s * 0.8, '#b98a4c', COL.ink, 1.5);
  } else doodleStar(ctx, x, y, s * 0.62, id === 'rate' ? COL.blue : COL.goldDark, 3);
}

function cardAccent(card) {
  if (card.key.startsWith('new:')) return COL.orange;
  if (card.key.startsWith('up:')) return COL.blue;
  if (card.key.startsWith('ench:')) {
    const id = card.key.split(':')[1];
    return { ward: '#65b9c3', poison: '#729b45', frost: COL.blue, boom: COL.orange, lightning: '#c99a25' }[id] || COL.purple;
  }
  if (card.key.startsWith('item:')) return COL.goldDark;
  if (card.key === 's:crit') return COL.goldDark;
  return COL.moss;
}

// ---------------- HUD ----------------
function drawMechanicStatus() {
  if (time >= 10) return;
  const x = portraitLayout ? (VW - 136) / 2 : VW - 190;
  const y = portraitLayout ? 156 : 9;
  const w = 136;
  const h = 38;
  const isFour = currentMap.mech === 'four';
  const phaseNames = ['风', '林', '火', '山'];
  const remaining = isFour
    ? Math.max(0, currentMap.interval - fourT)
    : (currentMap.interval > 0 ? Math.max(0, mechT) : 0);
  const progress = currentMap.interval > 0
    ? clamp(1 - remaining / currentMap.interval, 0, 1)
    : 1;
  const warning = currentMap.interval > 0 && remaining < 1.25;
  const introFade = time > 8 ? clamp((10 - time) / 2, 0, 1) : 1;
  const pulse = (warning ? 0.5 + Math.sin(performance.now() / 85) * 0.18 : 0.92) * introFade;

  ctx.save();
  ctx.globalAlpha = pulse;
  roughBox(ctx, x, y, w, h, warning ? '#fff0df' : 'rgba(255,249,235,0.94)', warning ? COL.red : COL.ink, warning ? 1.8 : 1.2);
  roughCircle(ctx, x + 17, y + 17, 10, tint(currentMap.doodle, 0.18), currentMap.doodle, 1.2, 9);
  if (isFour) {
    text(phaseNames[fourPhase], x + 17, y + 10, 9, currentMap.doodle, 'center', true);
  } else {
    doodleStar(ctx, x + 17, y + 17, 5, currentMap.doodle, 1.3);
  }
  text(currentMap.mechDesc, x + 32, y + 7, 7, COL.ink, 'left', true);
  text(currentMap.interval > 0 ? Math.ceil(remaining) + ' 秒' : '常驻地形', x + 32, y + 19, 7, warning ? COL.red : COL.inkSoft, 'left', warning);
  roughBox(ctx, x + 8, y + h - 6, w - 16, 3, '#e7ddcb', null, 0);
  roughBox(ctx, x + 8, y + h - 6, (w - 16) * progress, 3, warning ? COL.red : currentMap.doodle, null, 0);
  ctx.restore();
}

function drawHUD() {
  // 角色信息岛
  roughCircle(ctx, 31, 31, 24, '#fff7e7', COL.ink, 2, 13);
  roughCircle(ctx, 31, 31, 20.5, '#f2e3bd', tint(COL.ochre, 0.7), 1, 12);
  drawPencilHeroArt(31, 35, 0.76, 0.2, 1);
  text('铅笔剑士', 59, 3, 9, COL.ink, 'left', true);

  const hpX = 59, hpY = 14, hpW = 145;
  drawHeartIcon(55, hpY + 5, 5.2, COL.red);
  roughBox(ctx, hpX, hpY, hpW, 12, '#f3e6d1', COL.ink, 1.2);
  if (player.hp > 0) roughBox(ctx, hpX + 2, hpY + 2, (hpW - 4) * clamp(player.hp / player.maxHp, 0, 1), 8, COL.red, null, 0);
  text(Math.ceil(player.hp) + '/' + player.maxHp, hpX + hpW / 2, hpY + 2, 7, COL.white, 'center', true);

  drawShieldIcon(55, 34, 5.2, COL.blue);
  roughBox(ctx, hpX, 30, hpW - 18, 7, '#e7dfd2', COL.ink, 1);
  const barrierMax = player.shieldMax + player.wardMax;
  const barrierW = hpW - 20;
  if (barrierMax > 0) {
    const shieldPart = player.shieldMax / barrierMax;
    const wardPart = player.wardMax / barrierMax;
    roughBox(ctx, hpX + 1, 31, barrierW * shieldPart * (player.shieldMax > 0 ? clamp(player.shield / player.shieldMax, 0, 1) : 0), 5, COL.purple, null, 0);
    roughBox(ctx, hpX + 1 + barrierW * shieldPart, 31, barrierW * wardPart * (player.wardMax > 0 ? clamp(player.ward / player.wardMax, 0, 1) : 0), 5, '#75c8d2', null, 0);
  }
  text('Lv.' + player.level, hpX + hpW + 6, 28, 8, COL.ink, 'left', true);

  roughBox(ctx, hpX, 41, hpW, 5, '#eadfcf', COL.ink, 0.8);
  roughBox(ctx, hpX + 1, 42, (hpW - 2) * clamp(player.xp / player.xpNeed, 0, 1), 3, COL.gold, null, 0);

  // 图标武器槽：色带、名称、等级、冷却与就绪状态
  for (let i = 0; i < MAX_SLOTS; i++) {
    const bx = 10 + i * 45;
    const by = 54;
    const w = weapons[i];
    const def = w ? weaponConfig(w) : null;
    roughBox(ctx, bx, by, 39, 38, w ? '#fff9eb' : 'rgba(239,230,212,0.82)', w ? COL.ink : '#a89b89', w ? 1.5 : 1);
    if (w) {
      ctx.fillStyle = def.color;
      ctx.fillRect(bx + 1, by + 1, 37, 3);
      const fullCd = def.kind === 'support' ? 1 : (def.cd * wCdMul(w.level)) / atkSpeedMul;
      const cooldown = def.kind === 'support' ? 1 : clamp(1 - Math.max(0, w.timer) / fullCd, 0, 1);
      drawWeaponIcon(w.id, bx + 19.5, by + 17, 15);
      ctx.beginPath();
      ctx.arc(bx + 19.5, by + 17, 12, -Math.PI / 2, -Math.PI / 2 + TAU * cooldown);
      ctx.strokeStyle = cooldown >= 0.999 ? COL.gold : def.color;
      ctx.lineWidth = cooldown >= 0.999 ? 2 : 1.3;
      ctx.stroke();
      if (cooldown < 0.999) {
        ctx.fillStyle = 'rgba(58,48,38,0.1)';
        ctx.fillRect(bx + 2, by + 29 - 24 * (1 - cooldown), 35, 24 * (1 - cooldown));
      } else {
        roughCircle(ctx, bx + 5, by + 7, 2.2, COL.gold, null, 0, 6);
      }
      roughCircle(ctx, bx + 33, by + 7, 6, def.color, COL.ink, 0.8, 7);
      text(String(w.level), bx + 33, by + 3.4, 6, COL.white, 'center', true);
      text(def.short, bx + 19.5, by + 29, 6, COL.ink, 'center', true);
    } else {
      roughCircle(ctx, bx + 19.5, by + 17, 8, null, '#b7aa98', 1, 8);
      text('待解锁', bx + 19.5, by + 29, 5.5, '#a89b89', 'center');
    }
  }

  const primaryId = PRIMARY_ENCHANTS.find((id) => ench[id] > 0);
  if (primaryId) {
    const def = ENCH_DEFS[primaryId];
    const bx = 196, by = 54, bw = 112, bh = 38;
    const accent = { ward: '#65b9c3', poison: '#729b45', frost: COL.blue, boom: COL.orange, lightning: '#c99a25' }[primaryId];
    roughBox(ctx, bx, by, bw, bh, '#fff9eb', accent, 1.5);
    drawCardIcon({ key: 'ench:' + primaryId }, bx + 18, by + 18, 13);
    text('主附魔', bx + 35, by + 6, 6, COL.inkSoft, 'left', true);
    text(def.name, bx + 35, by + 17, 7.2, COL.ink, 'left', true);
    text('Lv.' + ench[primaryId], bx + bw - 6, by + 6, 6, accent, 'right', true);
  }
  const statY = portraitLayout ? 100 : 96;
  roughBox(ctx, 10, statY, 92, 14, 'rgba(255,249,235,0.92)', COL.ink, 0.9);
  doodleStar(ctx, 20, statY + 7, 4, COL.goldDark, 1.3);
  text('暴击 ' + Math.round(critChance * 100) + '%  ×' + critMult.toFixed(2), 29, statY + 3, 7, COL.ink, 'left', true);
  const itemIds = Object.keys(ownedItems);
  if (itemIds.length) {
    const itemY = portraitLayout ? 120 : 114;
    roughBox(ctx, 10, itemY, Math.max(28, itemIds.length * 20 + 8), 24, 'rgba(255,249,235,0.92)', COL.ink, 0.9);
    for (let i = 0; i < itemIds.length; i++) {
      roughCircle(ctx, 24 + i * 20, itemY + 12, 8, '#f5e5c7', COL.ink, 0.7, 7);
      drawItemIcon(itemIds[i], 24 + i * 20, itemY + 12, 8);
    }
  }

  // 时间与关卡进度
  const mm = Math.floor(time / 60);
  const ss = Math.floor(time % 60);
  const timerY = portraitLayout ? 100 : 7;
  roughBox(ctx, VW / 2 - 61, timerY, 122, 38, 'rgba(255,249,235,0.94)', COL.ink, 1.4);
  roughCircle(ctx, VW / 2 - 42, timerY + 18, 12, '#f4e6c8', COL.ink, 1.2, 10);
  roughLine(ctx, VW / 2 - 42, timerY + 18, VW / 2 - 42, timerY + 10, COL.ink, 1.5);
  roughLine(ctx, VW / 2 - 42, timerY + 18, VW / 2 - 36, timerY + 21, COL.ink, 1.5);
  text(mm + ':' + String(ss).padStart(2, '0'), VW / 2 + 14, timerY + 4, 14, COL.ink, 'center', true);
  const modeTag = runMode === 'endless' ? '无尽' : '剧情';
  text('第 ' + (levelIdx + 1) + ' 关 · ' + currentMap.name + ' · ' + modeTag, VW / 2 + 14, timerY + 22, 7, COL.inkSoft, 'center');
  const progress = Math.max(time / BOSS_TIME, kills / KILL_QUOTA);
  for (let i = 0; i < 5; i++) {
    roughCircle(ctx, VW / 2 - 24 + i * 12, timerY + 43, 3.2, progress * 5 > i ? COL.gold : '#eadfcf', COL.ink, 0.7, 7);
  }
  text('击杀 ' + kills, VW / 2 + 47, timerY + 39, 7, COL.inkSoft, 'left');

  drawMechanicStatus();

  // 暂停按钮
  roughCircle(ctx, pauseBtn.x + pauseBtn.w / 2, pauseBtn.y + pauseBtn.h / 2, 14, COL.white, COL.ink, 1.6, 10);
  roughLine(ctx, pauseBtn.x + 13, pauseBtn.y + 9, pauseBtn.x + 13, pauseBtn.y + 25, COL.ink, 2.2);
  roughLine(ctx, pauseBtn.x + 20, pauseBtn.y + 9, pauseBtn.x + 20, pauseBtn.y + 25, COL.ink, 2.2);

  // Boss 血条
  const boss = enemies.find((e) => e.boss && !e.dead);
  if (boss) {
    const bw = portraitLayout ? VW - 58 : 330;
    roughCircle(ctx, (VW - bw) / 2 - 16, VH - 20, 16, '#f4e6c8', COL.ink, 1.5, 10);
    roughCircle(ctx, (VW - bw) / 2 - 16, VH - 19, 10, boss.color, COL.ink, 1.2, 9);
    fillPoly(ctx, [[(VW - bw) / 2 - 25, VH - 30], [(VW - bw) / 2 - 21, VH - 40], [(VW - bw) / 2 - 16, VH - 34], [(VW - bw) / 2 - 10, VH - 40], [(VW - bw) / 2 - 7, VH - 30]], COL.gold);
    roughBox(ctx, (VW - bw) / 2, VH - 28, bw, 16, '#f4e6d4', COL.ink, 1.8);
    roughBox(ctx, (VW - bw) / 2 + 3, VH - 25, (bw - 6) * clamp(boss.hp / boss.maxHp, 0, 1), 10, COL.red, null, 0);
    const bossNameW = Math.max(72, measure(currentMap.boss, 10, true) + 22);
    roughBox(ctx, VW / 2 - bossNameW / 2, VH - 52, bossNameW, 17, '#fff6df', COL.ink, 1.1);
    text(currentMap.boss, VW / 2, VH - 48.5, 10, COL.ink, 'center', true);
    if (boss.lastAttack) {
      const label = BOSS_ATTACK_LABELS[boss.lastAttack] || boss.lastAttack;
      roughBox(ctx, VW / 2 + bw / 2 - 72, VH - 49, 72, 14, boss.tele > 0 ? '#fff0a6' : '#fff9ec', COL.ink, 0.9);
      text((boss.tele > 0 ? '蓄力 · ' : '') + label, VW / 2 + bw / 2 - 36, VH - 47, 6.3, boss.tele > 0 ? '#a84936' : COL.ink, 'center', true);
    }
  }

  // 触屏摇杆
  if (Input.touch && Input.stick) {
    const s = Input.stick;
    roughCircle(ctx, s.ox, s.oy, 34, 'rgba(255,253,248,0.35)', COL.ink, 1.6, 12);
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy) || 1;
    const k = d > 34 ? 34 / d : 1;
    roughCircle(ctx, s.ox + dx * k, s.oy + dy * k, 12, COL.blue, COL.ink, 1.5, 9);
  }
}

function drawBossIntro() {
  const fadeIn = clamp((3.6 - bossIntroT) / 0.45, 0, 1);
  const fadeOut = clamp(bossIntroT / 0.55, 0, 1);
  const alpha = Math.min(fadeIn, fadeOut);
  const title = BOSS_TITLES[currentMap.id] || '章节守卫';
  const objective = BOSS_OBJECTIVES[currentMap.id] || '击败守卫，继续前进';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(36,27,24,0.62)';
  ctx.fillRect(0, VH * 0.28, VW, portraitLayout ? 170 : 132);
  roughLine(ctx, 34, VH * 0.28 + 8, VW - 34, VH * 0.28 + 5, currentMap.doodle, 2.4);
  roughLine(ctx, 34, VH * 0.28 + (portraitLayout ? 162 : 124), VW - 34, VH * 0.28 + (portraitLayout ? 165 : 127), currentMap.doodle, 2.4);
  text('B O S S  ·  ' + title, VW / 2, VH * 0.28 + 27, portraitLayout ? 13 : 11, '#f8e9ca', 'center', true);
  text(currentMap.boss, VW / 2, VH * 0.28 + 57, portraitLayout ? 31 : 27, '#fff8e8', 'center', true, -0.025);
  text('第 ' + (levelIdx + 1) + ' 关 · ' + objective, VW / 2, VH * 0.28 + 96, portraitLayout ? 10 : 9, '#f1d4bd', 'center');
  ctx.restore();
}

function drawStoryPaperCrane(x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  fillPoly(ctx, [[-s * 1.4, 0], [0, -s * 0.5], [s * 1.4, 0], [0, s * 0.42]], color);
  strokePoly(ctx, [[-s * 1.4, 0], [0, -s * 0.5], [s * 1.4, 0], [0, s * 0.42]], COL.ink, 1.1);
  fillPoly(ctx, [[0, -s * 0.5], [s * 0.35, -s * 1.55], [s * 0.62, -s * 0.18]], tint(color, 0.18));
  strokePoly(ctx, [[0, -s * 0.5], [s * 0.35, -s * 1.55], [s * 0.62, -s * 0.18]], COL.ink, 0.9);
  ctx.restore();
}

function drawStoryOverlay() {
  const data = storyChapter === -1 ? STORY_PROLOGUE : (CHAPTER_STORIES[storyChapter] || CHAPTER_STORIES[CHAPTER_STORIES.length - 1]);
  const panelW = portraitLayout ? VW - 34 : 536;
  const panelH = portraitLayout ? 390 : 294;
  const panelX = (VW - panelW) / 2;
  const panelY = portraitLayout ? Math.max(42, VH / 2 - panelH / 2) : 34;
  const accent = storyChapter === 10 ? '#b63750' : (storyChapter === 9 ? '#6c9cb4' : '#b9893f');

  ctx.fillStyle = 'rgba(30,24,22,0.66)';
  ctx.fillRect(0, 0, VW, VH);
  roughBox(ctx, panelX + 5, panelY + 7, panelW, panelH, 'rgba(52,39,32,0.28)', null, 0);
  roughBox(ctx, panelX, panelY, panelW, panelH, '#fff6df', COL.ink, 2.2);
  roughLine(ctx, panelX + 24, panelY + 52, panelX + panelW - 24, panelY + 50, accent, 2);
  roughLine(ctx, panelX + 30, panelY + panelH - 55, panelX + panelW - 30, panelY + panelH - 58, '#c8aa7a', 1.2);

  // 一根贯穿十一章的守页红线。
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.beginPath();
  ctx.moveTo(panelX + 12, panelY + 16);
  ctx.bezierCurveTo(panelX + 44, panelY + 78, panelX + 8, panelY + 180, panelX + 26, panelY + panelH - 20);
  ctx.strokeStyle = storyChapter === 10 ? '#c6334d' : '#b14b42';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();

  drawStoryPaperCrane(panelX + panelW - 44, panelY + 34, 12, storyChapter === 10 ? '#d85a6b' : '#e8c66d');
  text(data.chapter, panelX + 30, panelY + 18, 9, accent, 'left', true);
  text(data.title, VW / 2, panelY + 62, portraitLayout ? 20 : 21, COL.ink, 'center', true, -0.018);

  const firstY = panelY + (portraitLayout ? 119 : 112);
  const lineGap = portraitLayout ? 46 : 35;
  for (let i = 0; i < data.lines.length; i++) {
    text(data.lines[i], VW / 2, firstY + i * lineGap, portraitLayout ? 10 : 10.5, COL.inkSoft, 'center');
  }

  roughBox(ctx, panelX + 58, panelY + panelH - 86, panelW - 116, 28, tint(accent, 0.12), accent, 1.1);
  text(data.clue, VW / 2, panelY + panelH - 79, portraitLayout ? 9 : 9.5, COL.ink, 'center', true);
  const progress = storyChapter === -1 ? '寻母之旅即将开始' : ('寻母线索 ' + Math.min(11, storyChapter + 1) + ' / 11');
  text(progress, panelX + 28, panelY + panelH - 34, 7.5, COL.inkSoft, 'left');
  text(storyChapter === 10 ? '点击 · 牵住母亲的手' : '点击 / 按任意键 · 继续旅程', panelX + panelW - 28, panelY + panelH - 34, 8, accent, 'right', true);
}

function drawOverlays() {
  if (state === 'story') {
    drawStoryOverlay();
    return;
  }
  if (levelClear) {
    ctx.fillStyle = 'rgba(253,246,228,0.86)';
    ctx.fillRect(0, 0, VW, VH);
    text('关 卡 完 成', VW / 2, 122, 26, COL.goldDark, 'center', true, -0.02);
    text('第 ' + (levelIdx + 1) + ' 关 · ' + currentMap.name, VW / 2, 162, 11, COL.ink, 'center');
    return;
  }
  if (state === 'play' && bossIntroT > 0) {
    drawBossIntro();
    return;
  }
  if (state === 'levelup') {
    ctx.fillStyle = 'rgba(49,39,31,0.42)';
    ctx.fillRect(0, 0, VW, VH);
    roughBox(ctx, VW / 2 - 82, 24, 164, 48, '#fff6df', COL.ink, 1.6);
    text('升 级 ！', VW / 2, 30, 22, COL.goldDark, 'center', true, -0.02);
    text('选择一张纸片强化', VW / 2, 57, 8, COL.inkSoft, 'center');
    for (let i = 0; i < cards.length; i++) {
      const r = cardRect(i);
      const c = cards[i];
      const accent = cardAccent(c);
      roughBox(ctx, r.x, r.y, r.w, r.h, '#fff9ec', COL.ink, 2);
      fillPoly(ctx, [[r.x - 1, r.y + 2], [r.x + r.w * 0.28, r.y], [r.x + r.w * 0.52, r.y + 3], [r.x + r.w * 0.77, r.y], [r.x + r.w + 1, r.y + 2], [r.x + r.w, r.y + 13], [r.x, r.y + 13]], accent);
      roughCircle(ctx, r.x + r.w - 14, r.y + 14, 10, COL.gold, COL.ink, 1.3, 8);
      text(String(i + 1), r.x + r.w - 14, r.y + 8.5, 10, COL.ink, 'center', true);
      roughCircle(ctx, r.x + r.w / 2, r.y + 47, 24, tint(accent, 0.12), tint(accent, 0.5), 1.2, 12);
      drawCardIcon(c, r.x + r.w / 2, r.y + 47, 24);
      roughBox(ctx, r.x + 10, r.y + 75, r.w - 20, 24, tint(accent, 0.12), null, 0);
      text(c.name, r.x + r.w / 2, r.y + 81, 11, COL.ink, 'center', true);
      roughLine(ctx, r.x + 18, r.y + 106, r.x + r.w - 18, r.y + 106, tint(accent, 0.55), 1);
      text(c.desc, r.x + r.w / 2, r.y + 114, 9, COL.inkSoft, 'center');
      text(c.sub, r.x + r.w / 2, r.y + 137, 8, accent, 'center', true);
    }
  } else if (state === 'paused') {
    ctx.fillStyle = 'rgba(43,36,29,0.52)';
    ctx.fillRect(0, 0, VW, VH);
    const panelY = portraitLayout ? VH / 2 - 145 : 78;
    roughBox(ctx, VW / 2 - 125, panelY, 250, portraitLayout ? 290 : 206, '#fff7e5', COL.ink, 2.2);
    roughCircle(ctx, VW / 2, panelY + 34, 20, '#f0dfbb', COL.ink, 1.5, 11);
    roughLine(ctx, VW / 2 - 5, panelY + 24, VW / 2 - 5, panelY + 44, COL.ink, 3);
    roughLine(ctx, VW / 2 + 5, panelY + 24, VW / 2 + 5, panelY + 44, COL.ink, 3);
    text('暂 停', VW / 2, panelY + 57, 19, COL.ink, 'center', true);
    roughBox(ctx, pauseContinueBtn.x, pauseContinueBtn.y, pauseContinueBtn.w, pauseContinueBtn.h, COL.gold, COL.ink, 1.8);
    text('继续游戏', VW / 2, pauseContinueBtn.y + 9, 14, COL.ink, 'center', true);
    roughBox(ctx, pauseHomeBtn.x, pauseHomeBtn.y, pauseHomeBtn.w, pauseHomeBtn.h, '#fffdf8', COL.ink, 1.6);
    text('返回主页面', VW / 2, pauseHomeBtn.y + 9, 14, COL.ink, 'center', true);
    text('P / Esc 继续', VW / 2, pauseHomeBtn.y + 50, 8, COL.inkSoft, 'center');
  } else if (state === 'dead') {
    ctx.fillStyle = 'rgba(253,246,228,0.92)';
    ctx.fillRect(0, 0, VW, VH);
    text('你 被 涂 掉 了', VW / 2, 100, 26, COL.red, 'center', true, 0.02);
    text(playerName + ' · 存活 ' + Math.floor(time) + ' 秒 · 击杀 ' + kills + ' · 等级 ' + player.level, VW / 2, 150, 12, COL.ink, 'center');
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      text('点击 / 按任意键 再来一局', VW / 2, 200, 12, COL.ink, 'center', true);
    }
  } else if (state === 'win') {
    ctx.fillStyle = 'rgba(253,246,228,0.92)';
    ctx.fillRect(0, 0, VW, VH);
    text('母 亲 平 安 归 来', VW / 2, 92, 28, COL.goldDark, 'center', true, -0.02);
    doodleStar(ctx, VW / 2 - 90, 108, 10, COL.gold, 2.4);
    doodleStar(ctx, VW / 2 + 90, 108, 10, COL.gold, 2.4);
    text('寻母故事完成 · 已解锁无尽模式', VW / 2, 142, 13, COL.ink, 'center');
    text(playerName + ' · 存活 ' + Math.floor(time) + ' 秒 · 击杀 ' + kills + ' · 等级 ' + player.level, VW / 2, 170, 11, COL.ink, 'center');
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      text('点击 / 按任意键 再来一局', VW / 2, 210, 12, COL.ink, 'center', true);
    }
  }
}

function drawSeasonBird(x, y, size, flap) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#4f4a43';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.quadraticCurveTo(-size * 0.45, -size * (0.35 + flap * 0.25), 0, 0);
  ctx.quadraticCurveTo(size * 0.45, -size * (0.35 - flap * 0.25), size, 0);
  ctx.stroke();
  ctx.restore();
}

function drawSeasonButterfly(x, y, size, phase, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(phase) * 0.22);
  const wing = 0.55 + Math.abs(Math.sin(phase * 2.4)) * 0.55;
  roughEllipse(ctx, -size * 0.45, 0, size * wing, size * 0.65, color, COL.ink, 0.65, 7);
  roughEllipse(ctx, size * 0.45, 0, size * wing, size * 0.65, tint(color, 0.18), COL.ink, 0.65, 7);
  roughLine(ctx, 0, -size * 0.34, 0, size * 0.42, COL.ink, 0.8);
  ctx.restore();
}

function drawSeasonRabbit(x, y, size, phase) {
  const hop = Math.abs(Math.sin(phase)) * size * 0.38;
  ctx.save();
  ctx.translate(x, y - hop);
  ctx.scale(size, size);
  roughEllipse(ctx, 0, 0, 12, 7, '#f2e8d4', COL.ink, 1, 9);
  roughCircle(ctx, 10, -5, 6, '#f5ead8', COL.ink, 1, 8);
  roughEllipse(ctx, 8, -14, 2.4, 7, '#f0dfc9', COL.ink, 0.8, 7);
  roughEllipse(ctx, 13, -14, 2.4, 7, '#f0dfc9', COL.ink, 0.8, 7);
  roughCircle(ctx, -11, -1, 3.4, '#fffaf0', COL.ink, 0.7, 7);
  roughCircle(ctx, 12, -6, 1, COL.ink, null, 0, 5);
  roughLine(ctx, -5, 6, -11 - Math.sin(phase) * 4, 9, COL.ink, 1.1);
  roughLine(ctx, 6, 5, 12 + Math.sin(phase) * 4, 8, COL.ink, 1.1);
  ctx.restore();
}

function drawSeasonMapleLeaf(x, y, size, rotation, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  fillPoly(ctx, [
    [0, -size], [size * 0.23, -size * 0.45], [size * 0.62, -size * 0.62],
    [size * 0.48, -size * 0.15], [size, 0], [size * 0.38, size * 0.22],
    [size * 0.48, size * 0.72], [0, size * 0.38], [-size * 0.48, size * 0.72],
    [-size * 0.38, size * 0.22], [-size, 0], [-size * 0.48, -size * 0.15],
    [-size * 0.62, -size * 0.62], [-size * 0.23, -size * 0.45],
  ], color);
  roughLine(ctx, 0, size * 0.2, 0, size * 1.15, '#7c4932', 0.8);
  ctx.restore();
}

function drawSeasonSnowman(x, baseY, scaleValue) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(scaleValue, scaleValue);
  roughCircle(ctx, 0, -10, 15, '#fffdf7', '#7592a3', 1.3, 10);
  roughCircle(ctx, 0, -31, 11, '#fffdf7', '#7592a3', 1.2, 9);
  roughCircle(ctx, -4, -33, 1.2, COL.ink, null, 0, 5);
  roughCircle(ctx, 4, -33, 1.2, COL.ink, null, 0, 5);
  fillPoly(ctx, [[0, -29], [8, -27], [0, -25]], '#e58a32');
  ctx.strokeStyle = COL.ink;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, -31, 6, 0.35, Math.PI - 0.35); ctx.stroke();
  roughCircle(ctx, 0, -14, 1.4, COL.ink, null, 0, 5);
  roughCircle(ctx, 0, -7, 1.4, COL.ink, null, 0, 5);
  roughLine(ctx, -13, -17, -23, -25, '#6d513b', 1.4);
  roughLine(ctx, 13, -17, 23, -24, '#6d513b', 1.4);
  roughBox(ctx, -11, -45, 22, 5, '#5c6f7c', COL.ink, 1);
  roughBox(ctx, -7, -55, 14, 11, '#5c6f7c', COL.ink, 1);
  ctx.restore();
}

function drawMenuSeasonBackground(now) {
  const season = currentMenuSeason();
  const image = menuSeasonImages[season.id];
  if (!image || !image.complete || !image.naturalWidth) return false;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = VW / VH;
  let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
  if (sourceRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    const focus = { spring: 0.48, summer: 0.52, autumn: 0.52, winter: 0.56 }[season.id];
    sx = clamp(image.naturalWidth * focus - sw / 2, 0, image.naturalWidth - sw);
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = clamp((image.naturalHeight - sh) * 0.48, 0, image.naturalHeight - sh);
  }
  // 让整幅插画有很轻的“呼吸”和视差，避免底图像一张贴死的海报。
  const driftX = Math.sin(now * 0.11 + menuSeasonIndex) * Math.min(5, VW * 0.008);
  const driftY = Math.cos(now * 0.09 + menuSeasonIndex * 0.7) * Math.min(3, VH * 0.006);
  const breathe = 1.018 + Math.sin(now * 0.075 + menuSeasonIndex) * 0.006;
  const dw = VW * breathe;
  const dh = VH * breathe;
  ctx.drawImage(image, sx, sy, sw, sh, (VW - dw) / 2 + driftX, (VH - dh) / 2 + driftY, dw, dh);

  const wash = ctx.createRadialGradient(VW / 2, VH * 0.48, 10, VW / 2, VH * 0.48, Math.max(VW, VH) * 0.58);
  wash.addColorStop(0, 'rgba(253,246,228,0.58)');
  wash.addColorStop(0.5, 'rgba(253,246,228,0.22)');
  wash.addColorStop(1, 'rgba(253,246,228,0.02)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, VW, VH);
  return true;
}

function drawSwayingMeadow(now, colors, flowers) {
  const rng = makeRng(menuSeasonSeed ^ 0x6a09e667);
  const baseY = VH + 3;
  const count = portraitLayout ? 34 : 54;
  ctx.save();
  ctx.globalAlpha = 0.78;
  for (let i = 0; i < count; i++) {
    const x = rng() * VW;
    const h = 9 + rng() * (portraitLayout ? 22 : 17);
    const speed = 1.1 + rng() * 1.2;
    const sway = Math.sin(now * speed + i * 0.83) * (2.2 + rng() * 2.8);
    const color = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + sway * 0.35, baseY - h * 0.55, x + sway, baseY - h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 + rng() * 1.25;
    ctx.stroke();
    if (flowers && i % 6 === 0) {
      const fx = x + sway;
      const fy = baseY - h;
      const petal = i % 12 === 0 ? '#fff7e8' : '#f2a5ba';
      for (let p = 0; p < 4; p++) {
        const a = now * 0.18 + p * TAU / 4;
        roughCircle(ctx, fx + Math.cos(a) * 2.2, fy + Math.sin(a) * 2.2, 1.7, petal, null, 0, 5);
      }
      roughCircle(ctx, fx, fy, 1.2, '#e7b83d', null, 0, 5);
    }
  }
  ctx.restore();
}

function drawSummerCloud(x, y, scaleValue, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scaleValue, scaleValue);
  roughEllipse(ctx, -12, 2, 15, 6, '#fff9df', null, 0, 10);
  roughCircle(ctx, -5, -3, 7, '#fff9df', null, 0, 8);
  roughCircle(ctx, 4, -5, 9, '#fff9df', null, 0, 9);
  roughCircle(ctx, 13, 0, 6, '#fff9df', null, 0, 8);
  ctx.restore();
}

function drawAutumnWind(now) {
  ctx.save();
  ctx.globalAlpha = 0.34;
  for (let i = 0; i < 4; i++) {
    const travel = (now * (42 + i * 7) + i * 173 + menuSeasonSeed % 91) % (VW + 150) - 110;
    const y = 48 + i * 70 + Math.sin(now * 1.1 + i) * 13;
    ctx.beginPath();
    ctx.moveTo(travel, y);
    ctx.bezierCurveTo(travel + 38, y - 9, travel + 72, y + 11, travel + 112, y - 2);
    ctx.strokeStyle = i % 2 ? '#b85b38' : '#e1a24c';
    ctx.lineWidth = 1.15;
    ctx.setLineDash([7, 7]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawMenuSeason(now) {
  const season = currentMenuSeason();
  const rng = makeRng(menuSeasonSeed);
  withInkSeed(menuSeasonSeed, () => {
    ctx.save();
    if (season.id === 'spring') {
      drawSwayingMeadow(now, ['#4f8a4d', '#6fa35b', '#80ad68'], true);
      for (let i = 0; i < 9; i++) {
        const speed = 8 + rng() * 9;
        const x = ((rng() * VW + now * speed + i * 53) % (VW + 50)) - 25;
        const y = 34 + rng() * Math.min(170, VH * 0.4) + Math.sin(now * 1.5 + i) * 12;
        drawSeasonButterfly(x, y, 3.5 + rng() * 2.4, now + i * 0.8, i % 2 ? '#e78caf' : '#f0c84b');
      }
      for (let i = 0; i < 18; i++) {
        const p = (rng() * 1.4 + now * (0.035 + rng() * 0.025)) % 1.25;
        const x = p * VW - VW * 0.12 + Math.sin(now * 1.2 + i) * 20;
        const y = 18 + rng() * (VH * 0.72) + Math.sin(now * 1.7 + i * 0.8) * 11;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(now * (0.8 + rng()) + i);
        roughEllipse(ctx, 0, 0, 2.6 + rng() * 1.7, 1.3, i % 3 ? '#f2abc0' : '#fff2ef', '#a97277', 0.35, 6);
        ctx.restore();
      }
    } else if (season.id === 'summer') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.12 + Math.sin(now * 0.7) * 0.045;
      const rayShift = Math.sin(now * 0.22) * VW * 0.08;
      fillPoly(ctx, [[VW, -10], [VW * 0.70 + rayShift, 0], [VW * 0.52 + rayShift, VH], [VW * 0.76 + rayShift, VH]], '#fff0a4');
      fillPoly(ctx, [[VW, 0], [VW * 0.86 + rayShift * 0.5, 0], [VW * 0.72 + rayShift * 0.5, VH], [VW, VH]], '#fff9c8');
      ctx.restore();
      drawSwayingMeadow(now, ['#4c873f', '#72a24b', '#a3ad43'], false);
      drawSummerCloud(((now * 7 + menuSeasonSeed % 130) % (VW + 100)) - 50, 34, 0.75, 0.32);
      drawSummerCloud(((now * 5 + 230 + menuSeasonSeed % 90) % (VW + 120)) - 60, 80, 0.52, 0.22);
      for (let i = 0; i < 7; i++) {
        const x = ((rng() * VW + now * (17 + i * 2)) % (VW + 80)) - 40;
        const y = 30 + rng() * 85 + Math.sin(now * 0.8 + i) * 5;
        drawSeasonBird(x, y, 7 + rng() * 4, Math.sin(now * 4.2 + i));
      }
      const rabbitX = ((now * 42 + menuSeasonSeed % 190) % (VW + 90)) - 45;
      drawSeasonRabbit(rabbitX, portraitLayout ? 164 : 146, portraitLayout ? 0.78 : 0.68, now * 6);
    } else if (season.id === 'autumn') {
      drawAutumnWind(now);
      drawSwayingMeadow(now, ['#8b5d34', '#b06a37', '#d18a3d'], false);
      const leafColors = ['#c64f34', '#de7b32', '#e7a73b', '#a94a38'];
      for (let i = 0; i < 32; i++) {
        const speed = 12 + rng() * 19;
        const fall = (rng() * VH + now * speed + i * 29) % (VH + 40) - 20;
        const x = (rng() * VW + Math.sin(now * (0.8 + rng()) + i) * (28 + rng() * 22) + VW) % VW;
        drawSeasonMapleLeaf(x, fall, 3.5 + rng() * 4.2, now * (1 + rng()) + i, leafColors[i % leafColors.length]);
      }
    } else {
      ctx.save();
      ctx.globalAlpha = 0.2;
      for (let i = 0; i < 4; i++) {
        const gustX = (now * (28 + i * 5) + i * 151) % (VW + 170) - 130;
        const gustY = 52 + i * 72 + Math.sin(now * 0.8 + i) * 18;
        ctx.beginPath();
        ctx.moveTo(gustX, gustY);
        ctx.quadraticCurveTo(gustX + 55, gustY - 12, gustX + 118, gustY + 2);
        ctx.strokeStyle = '#eaf7ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 10]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
      for (let i = 0; i < 62; i++) {
        const speed = 8 + rng() * 20;
        const y = (rng() * VH + now * speed + i * 17) % (VH + 20) - 10;
        const depth = 0.45 + rng() * 0.95;
        const x = (rng() * VW + Math.sin(now * (0.45 + rng()) + i) * (18 + depth * 12) + VW) % VW;
        roughCircle(ctx, x, y, 0.9 + rng() * 2.8 * depth, '#ffffff', '#89a8b9', 0.35, 6);
      }
    }
    ctx.restore();
  });
}

function menuLookTarget(nowMs) {
  if (nowMs >= menuInteraction.lockUntil) {
    menuInteraction.focusX = menuInteraction.pointerX;
    menuInteraction.focusY = menuInteraction.pointerY;
  }
  return { x: menuInteraction.focusX, y: menuInteraction.focusY };
}

function menuReactionStrength(nowMs, x, y) {
  let strength = 0;
  for (const click of menuInteraction.clicks) {
    const age = (nowMs - click.born) / 1000;
    if (age < 0 || age > 0.75) continue;
    const proximity = 1 - clamp(Math.hypot(x - click.x, y - click.y) / 330, 0, 0.82);
    const pulse = Math.sin(clamp(age / 0.58, 0, 1) * Math.PI);
    strength = Math.max(strength, pulse * proximity);
  }
  return strength;
}

function drawMenuClickFx(nowMs) {
  menuInteraction.clicks = menuInteraction.clicks.filter((click) => nowMs - click.born < 1050);
  for (const click of menuInteraction.clicks) {
    const age = (nowMs - click.born) / 1000;
    const p = clamp(age / 0.9, 0, 1);
    const alpha = (1 - p) * 0.82;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setLineDash([5, 5]);
    roughCircle(ctx, click.x, click.y, 8 + p * 35, null, p < 0.48 ? COL.goldDark : COL.coral, 1.8, 12);
    ctx.setLineDash([]);
    for (let i = 0; i < 7; i++) {
      const a = click.seed + i * TAU / 7;
      const d = 10 + p * (25 + (i % 3) * 7);
      const sx = click.x + Math.cos(a) * d;
      const sy = click.y + Math.sin(a) * d;
      if (i % 2 === 0) doodleStar(ctx, sx, sy, 2.8 + (1 - p) * 2.2, i % 3 ? COL.gold : COL.blue, 1);
      else roughCircle(ctx, sx, sy, 1.8 + (1 - p), i % 3 ? COL.coral : COL.ochre, null, 0, 6);
    }
    ctx.restore();
  }
}

function drawStartButtons() {
  roughBox(ctx, startBtn.x, startBtn.y, startBtn.w, startBtn.h, '#f5c542', COL.ink, 2.2);
  if (!suspendedRun) {
    text('开始一局', startBtn.x + startBtn.w / 2, startBtn.y + (portraitLayout ? 13 : 12), portraitLayout ? 19 : 18, COL.ink, 'center', true);
    return;
  }

  text('继续第 ' + suspendedRun.level + ' 关', startBtn.x + startBtn.w / 2, startBtn.y + (portraitLayout ? 8 : 7), portraitLayout ? 15 : 14, COL.ink, 'center', true);
  const mm = Math.floor(suspendedRun.seconds / 60);
  const ss = String(suspendedRun.seconds % 60).padStart(2, '0');
  text(suspendedRun.mapName + ' · ' + mm + ':' + ss, startBtn.x + startBtn.w / 2, startBtn.y + (portraitLayout ? 31 : 28), 7, COL.inkSoft, 'center', true);

  roughBox(ctx, restartBtn.x, restartBtn.y, restartBtn.w, restartBtn.h, '#fffdf8', COL.ink, 1.7);
  text('重新开始', restartBtn.x + restartBtn.w / 2, restartBtn.y + (portraitLayout ? 17 : 15), portraitLayout ? 11 : 10.5, COL.ink, 'center', true);
}

function drawMenuSceneGrass(now, colors, count) {
  const R = makeRng(0x51a7c3 ^ mapSeed(activeMenuSceneId || 'forest'));
  ctx.save();
  ctx.globalAlpha = 0.88;
  for (let i = 0; i < count; i++) {
    const x = R() * VW;
    const h = 7 + R() * 16;
    const sway = Math.sin(now * (1.2 + R()) + i * 0.73) * (2 + R() * 3);
    ctx.beginPath();
    ctx.moveTo(x, VH + 2);
    ctx.quadraticCurveTo(x + sway * 0.35, VH - h * 0.55, x + sway, VH - h);
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = 1 + R() * 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawMenuWindTrail(x, y, length, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + length * 0.32, y - 8, x + length * 0.68, y + 9, x + length, y - 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawMenuCactus(x, y, scaleValue) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scaleValue, scaleValue);
  roughBox(ctx, -4, -24, 8, 25, '#6f984c', COL.ink, 1.2);
  roughLine(ctx, -3, -12, -11, -15, '#6f984c', 6);
  roughLine(ctx, -11, -15, -11, -23, '#6f984c', 6);
  roughLine(ctx, 3, -8, 11, -12, '#6f984c', 6);
  roughLine(ctx, 11, -12, 11, -19, '#6f984c', 6);
  ctx.restore();
}

function drawMenuSceneBackdrop(map, now) {
  const id = map.id;
  const R = makeRng(mapSeed(id) ^ 0x4d454e55);
  withInkSeed(mapSeed(id) ^ 0x5343454e, () => {
    ctx.save();
    if (id === 'forest') {
      fillPoly(ctx, [[0, 0], [82, 0], [68, 95], [42, 145], [0, 160]], '#82643d');
      roughLine(ctx, 48, 76, 103, 25, '#82643d', 10);
      for (let i = 0; i < 9; i++) roughCircle(ctx, 30 + (i % 4) * 28, 18 + Math.floor(i / 4) * 25, 23 + (i % 2) * 5, i % 2 ? '#7f9f48' : '#9ab85b', COL.ink, 1.1, 10);
      drawMenuSceneGrass(now, ['#5b7f3d', '#7b9c49', '#9bb75f'], 58);
      for (let i = 0; i < 7; i++) {
        const x = (70 + i * 91 + now * (8 + i)) % (VW + 40) - 20;
        const y = 36 + (i * 27) % 115 + Math.sin(now * 1.8 + i) * 10;
        drawSeasonButterfly(x, y, 4.2, now * 2 + i, i % 2 ? '#e0a346' : '#d8798e');
      }
    } else if (id === 'waste') {
      roughLine(ctx, 38, VH, 48, 105, '#6f4e38', 9);
      roughLine(ctx, 48, 112, 18, 76, '#6f4e38', 5);
      roughLine(ctx, 50, 126, 88, 86, '#6f4e38', 5);
      for (let i = 0; i < 5; i++) {
        const x = ((now * (18 + i * 2) + i * 137) % (VW + 80)) - 40;
        drawSeasonBird(x, 38 + i * 18 + Math.sin(now + i) * 5, 7 + i % 2 * 2, Math.sin(now * 4 + i));
      }
      for (let i = 0; i < 5; i++) drawMenuWindTrail(((now * 38 + i * 143) % (VW + 140)) - 120, 55 + i * 55, 105, '#a76b42', 0.42);
      const tumbleX = (now * 34 + 130) % (VW + 60) - 30;
      roughCircle(ctx, tumbleX, VH - 28 - Math.abs(Math.sin(now * 3)) * 12, 13, null, '#8f6849', 1.4, 11);
      roughLine(ctx, tumbleX - 9, VH - 36, tumbleX + 8, VH - 20, '#8f6849', 1);
      roughLine(ctx, tumbleX + 8, VH - 36, tumbleX - 9, VH - 20, '#8f6849', 1);
    } else if (id === 'desert') {
      roughCircle(ctx, VW - 62, 54, 22, '#e7a93d', '#8b633d', 1.5, 12);
      ctx.beginPath(); ctx.moveTo(0, VH - 82); ctx.quadraticCurveTo(VW * 0.25, VH - 130, VW * 0.52, VH - 72); ctx.quadraticCurveTo(VW * 0.78, VH - 28, VW, VH - 92); ctx.lineTo(VW, VH); ctx.lineTo(0, VH); ctx.fillStyle = '#e7bc68'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, VH - 48); ctx.quadraticCurveTo(VW * 0.38, VH - 102, VW, VH - 38); ctx.lineTo(VW, VH); ctx.lineTo(0, VH); ctx.fillStyle = '#efcf85'; ctx.fill();
      drawMenuCactus(76, VH - 42, 1.15); drawMenuCactus(VW - 92, VH - 28, 0.75);
      for (let i = 0; i < 6; i++) drawMenuWindTrail(((now * 44 + i * 131) % (VW + 150)) - 130, 70 + i * 38, 120, '#bd722f', 0.38);
      for (let i = 0; i < 18; i++) roughCircle(ctx, (R() * VW + now * (20 + i)) % VW, 45 + R() * 225, 0.8 + R(), '#c98a3f', null, 0, 5);
    } else if (id === 'swamp') {
      roughEllipse(ctx, 92, VH - 45, 72, 23, '#78917d', '#425d43', 1.4, 13);
      roughEllipse(ctx, VW - 85, VH - 28, 88, 27, '#6f8f7c', '#425d43', 1.3, 13);
      for (let i = 0; i < 18; i++) {
        const x = (i % 2 ? 22 : VW - 22) + Math.sin(i * 3.1) * 44;
        const h = 20 + (i % 5) * 6;
        roughLine(ctx, x, VH, x + Math.sin(now * 1.3 + i) * 4, VH - h, i % 2 ? '#4f6f3e' : '#6f8a45', 1.6);
      }
      for (let i = 0; i < 11; i++) {
        const y = VH - ((now * (9 + i) + i * 29) % 130);
        const x = 35 + (i * 71) % (VW - 70);
        roughCircle(ctx, x + Math.sin(now + i) * 5, y, 1.4 + i % 3, null, '#b7d39c', 0.8, 7);
      }
      for (let i = 0; i < 4; i++) drawSeasonButterfly(90 + i * 150 + Math.sin(now + i) * 20, 55 + i * 28, 3.5, now * 3 + i, '#8fcab7');
    } else if (id === 'ocean') {
      ctx.fillStyle = 'rgba(113,174,187,0.22)'; ctx.fillRect(0, VH * 0.62, VW, VH * 0.38);
      for (let row = 0; row < 5; row++) {
        for (let i = 0; i < 7; i++) {
          const x = i * 105 - ((now * (12 + row * 2)) % 105);
          ctx.beginPath(); ctx.arc(x, VH * 0.65 + row * 22, 28, 0.2, Math.PI * 0.86); ctx.strokeStyle = row % 2 ? '#e6f4ef' : '#5f9fac'; ctx.lineWidth = 1.2; ctx.stroke();
        }
      }
      for (let i = 0; i < 6; i++) {
        const x = ((now * (17 + i) + i * 119) % (VW + 80)) - 40;
        const y = VH * 0.7 + (i % 3) * 30;
        ctx.save(); ctx.globalAlpha = 0.35; fillPoly(ctx, [[x - 9, y], [x, y - 4], [x + 8, y], [x, y + 4]], '#477f8d'); ctx.restore();
      }
      for (let i = 0; i < 5; i++) { const x = 30 + i * 145; roughLine(ctx, x, VH, x - 7, VH - 32 - i % 2 * 10, i % 2 ? '#d56b67' : '#7b9e74', 3); roughCircle(ctx, x - 7, VH - 36, 4, '#f0b67d', COL.ink, 0.6, 7); }
    } else if (id === 'volcano') {
      fillPoly(ctx, [[0, VH], [95, 185], [165, VH]], '#302a2d');
      fillPoly(ctx, [[VW - 180, VH], [VW - 92, 160], [VW, VH]], '#302a2d');
      for (let i = 0; i < 8; i++) {
        const x = 24 + i * 86;
        roughLine(ctx, x, VH, x + Math.sin(i * 2.3) * 18, VH - 42 - (i % 3) * 16, i % 2 ? '#e26432' : '#ffae3e', 2.2);
      }
      for (let i = 0; i < 28; i++) {
        const y = VH - ((now * (22 + i % 5) + i * 37) % (VH + 30));
        roughCircle(ctx, 20 + (i * 83) % (VW - 40), y, 1 + i % 3, i % 2 ? '#f07838' : '#ffc04b', null, 0, 6);
      }
      for (let i = 0; i < 4; i++) roughCircle(ctx, 110 + i * 135 + Math.sin(now * 0.4 + i) * 15, 42 + i % 2 * 35, 22 + i * 4, 'rgba(45,39,43,0.3)', null, 0, 10);
    } else if (id === 'inferno') {
      for (let i = 0; i < 7; i++) {
        const x = 32 + i * 96;
        roughLine(ctx, x, VH, x + Math.sin(i * 1.7) * 24, VH - 62 - (i % 2) * 30, i % 2 ? '#c63b5b' : '#7d2750', 2.2);
        roughLine(ctx, x + 4, VH - 24, x + 23, VH - 48, '#ed6a82', 1.2);
      }
      for (let i = 0; i < 5; i++) {
        const x = 65 + i * 130 + Math.sin(now * 0.7 + i) * 22;
        const y = 60 + (i % 2) * 65 + Math.sin(now * 1.2 + i) * 12;
        ctx.save(); ctx.globalAlpha = 0.32; roughCircle(ctx, x, y, 12 + i % 3 * 3, null, '#e16c91', 1.3, 10); doodleStar(ctx, x, y, 5, '#e16c91', 1); ctx.restore();
      }
      for (let i = 0; i < 18; i++) roughCircle(ctx, (i * 71 + now * 19) % VW, 35 + (i * 47) % 260, 1 + i % 2, '#bd3a66', null, 0, 5);
    } else if (id === 'heaven') {
      for (let i = 0; i < 8; i++) {
        const x = ((i * 103 + now * (5 + i % 3)) % (VW + 130)) - 65;
        const y = 40 + (i % 4) * 72;
        ctx.save(); ctx.globalAlpha = 0.76; roughCircle(ctx, x - 14, y, 13, '#f9fbf6', '#8da7bc', 0.8, 9); roughCircle(ctx, x, y - 7, 18, '#fffdf5', '#8da7bc', 0.8, 10); roughCircle(ctx, x + 17, y, 12, '#f9fbf6', '#8da7bc', 0.8, 9); ctx.restore();
      }
      for (let i = 0; i < 16; i++) doodleStar(ctx, 24 + (i * 91) % (VW - 48), 28 + (i * 53) % (VH - 56), 2 + i % 3, i % 2 ? '#c89d37' : '#f4e3a4', 0.8);
      const craneX = (now * 24 + 90) % (VW + 70) - 35;
      fillPoly(ctx, [[craneX - 13, 82], [craneX, 76], [craneX + 13, 82], [craneX, 87]], '#fff7dc'); strokePoly(ctx, [[craneX - 13, 82], [craneX, 76], [craneX + 13, 82], [craneX, 87]], '#8b784c', 0.9);
    } else if (id === 'snow') {
      fillPoly(ctx, [[0, VH], [0, 178], [92, 76], [176, 190], [268, 58], [382, 184], [505, 82], [620, 178], [VW, 120], [VW, VH]], '#a9c4d0');
      fillPoly(ctx, [[0, VH], [0, 228], [98, 142], [190, 224], [312, 121], [422, 225], [548, 147], [VW, 216], [VW, VH]], '#dbe9ed');
      fillPoly(ctx, [[61, 151], [92, 76], [126, 152], [95, 128]], '#f8fcfd');
      fillPoly(ctx, [[226, 125], [268, 58], [315, 130], [268, 103]], '#f8fcfd');
      fillPoly(ctx, [[462, 126], [505, 82], [545, 139], [506, 117]], '#f8fcfd');
      for (let i = 0; i < 9; i++) {
        const x = 30 + i * 78;
        const h = 28 + (i % 4) * 8;
        fillPoly(ctx, [[x, VH - 12 - h], [x - 15, VH - 12], [x + 15, VH - 12]], i % 2 ? '#5e7c76' : '#6b8b82');
        fillPoly(ctx, [[x, VH - 4 - h * 0.72], [x - 19, VH - 4], [x + 19, VH - 4]], i % 2 ? '#698c83' : '#78988b');
      }
      for (let i = 0; i < 36; i++) {
        const x = ((i * 83 + now * (14 + i % 5)) % (VW + 50)) - 25;
        const y = ((i * 47 + now * (17 + i % 4)) % (VH + 30)) - 15;
        roughCircle(ctx, x, y, 1.2 + i % 3 * 0.6, '#ffffff', '#8bb2c2', 0.35, 6);
      }
      for (let i = 0; i < 4; i++) drawMenuWindTrail(((now * 34 + i * 178) % (VW + 150)) - 130, 62 + i * 66, 118, '#edf9fc', 0.7);
    } else if (id === 'crimson') {
      roughCircle(ctx, VW - 92, 72, 38, '#ba304d', '#31161f', 2, 13);
      roughCircle(ctx, VW - 78, 61, 35, '#3b2029', null, 0, 12);
      for (let i = 0; i < 7; i++) {
        const x = 24 + i * 104;
        roughLine(ctx, x, VH, x + Math.sin(i * 1.9) * 25, VH - 82 - (i % 3) * 24, '#301820', 5);
        roughLine(ctx, x + 2, VH - 48, x - 24, VH - 76, '#301820', 3);
        roughLine(ctx, x + 5, VH - 62, x + 31, VH - 91, '#301820', 3);
      }
      for (let i = 0; i < 7; i++) {
        const x = ((now * (10 + i) + i * 117) % (VW + 170)) - 85;
        const y = 62 + (i % 4) * 67 + Math.sin(now * 0.8 + i) * 9;
        ctx.save(); ctx.globalAlpha = 0.13; roughEllipse(ctx, x, y, 58 + i * 4, 12, '#8d2841', null, 0, 11); ctx.restore();
      }
      for (let i = 0; i < 24; i++) {
        const x = (i * 73 + Math.sin(now * 0.5 + i) * 18) % VW;
        const y = VH - ((now * (8 + i % 4) + i * 41) % (VH + 20));
        roughCircle(ctx, x, y, 1 + i % 3 * 0.55, i % 2 ? '#d34b5f' : '#f06b7c', null, 0, 5);
      }
    } else {
      const cols = ['#6f8d3b', '#d5a13a', '#d75a45', '#7189a6'];
      ctx.save(); ctx.globalAlpha = 0.18;
      ctx.fillStyle = cols[0]; ctx.fillRect(0, 0, VW / 2, VH / 2);
      ctx.fillStyle = cols[1]; ctx.fillRect(VW / 2, 0, VW / 2, VH / 2);
      ctx.fillStyle = cols[2]; ctx.fillRect(0, VH / 2, VW / 2, VH / 2);
      ctx.fillStyle = cols[3]; ctx.fillRect(VW / 2, VH / 2, VW / 2, VH / 2);
      ctx.restore();
      for (let i = 0; i < 28; i++) {
        const a = now * (0.3 + i % 4 * 0.08) + i * TAU / 28;
        const r = 72 + (i % 6) * 16;
        const x = VW / 2 + Math.cos(a) * r;
        const y = VH / 2 + Math.sin(a) * r * 0.55;
        if (i % 4 === 0) drawSeasonMapleLeaf(x, y, 3.5, a, cols[0]);
        else if (i % 4 === 1) roughCircle(ctx, x, y, 1.8, cols[1], null, 0, 6);
        else if (i % 4 === 2) doodleStar(ctx, x, y, 3, cols[2], 0.9);
        else roughCircle(ctx, x, y, 2.2, '#eef5ff', cols[3], 0.5, 6);
      }
    }

    const wash = ctx.createRadialGradient(VW / 2, VH * 0.49, 18, VW / 2, VH * 0.49, Math.max(VW, VH) * 0.54);
    wash.addColorStop(0, 'rgba(253,246,228,0.82)');
    wash.addColorStop(0.46, 'rgba(253,246,228,0.48)');
    wash.addColorStop(1, 'rgba(253,246,228,0.02)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
  });
}

function drawMenu() {
  const now = performance.now() / 1000;
  const nowMs = now * 1000;
  const look = menuLookTarget(nowMs);
  const previewMap = currentMenuScene();
  const tile = getPaperTile(previewMap);
  for (let x = 0; x < VW; x += TILE_P) {
    for (let y = 0; y < VH; y += TILE_P) ctx.drawImage(tile, x, y);
  }
  drawMenuSceneBackdrop(previewMap, now);
  if (portraitLayout) {
    drawMenuPortrait(now);
    return;
  }

  // 小角色排排站
  const bob = Math.sin(now * 2) * 3;
  drawMenuSlime(250, 176 + bob, look.x, look.y, menuReactionStrength(nowMs, 250, 176));
  drawMenuSlime(300, 182 + Math.sin(now * 2 + 1) * 3, look.x, look.y, menuReactionStrength(nowMs, 300, 182));
  drawMenuPlayer(400, 176 + Math.sin(now * 2 + 2) * 3, look.x, look.y, menuReactionStrength(nowMs, 400, 176));
  drawMenuClickFx(nowMs);

  text('纸 片 幸 存 者', VW / 2, 62, 40, COL.ink, 'center', true, -0.02);
  roughLine(ctx, VW / 2 - 150, 116, VW / 2 + 150, 114, COL.ink, 2);
  text('PAPER SURVIVORS · 手绘生存原型', VW / 2, 126, 10, COL.inkSoft, 'center');

  roughBox(ctx, nameBtn.x, nameBtn.y, nameBtn.w, nameBtn.h, '#fffdf8', COL.ink, 1.2);
  text('昵称 · ' + playerName, VW / 2, nameBtn.y + 3, 9, COL.ink, 'center', true);
  roughLine(ctx, nameBtn.x + nameBtn.w - 16, nameBtn.y + 5, nameBtn.x + nameBtn.w - 10, nameBtn.y + 11, COL.goldDark, 1.5);

  drawStartButtons();

  // 难度选择
  text('难度', VW / 2, 261, 9, COL.inkSoft, 'center');
  for (let i = 0; i < 3; i++) {
    const r = diffBtn(i);
    const sel = difficulty === DIFF_KEYS[i];
    roughBox(ctx, r.x, r.y, r.w, r.h, sel ? '#f5c542' : '#fffdf8', COL.ink, sel ? 2.2 : 1.4);
    text(DIFFS[DIFF_KEYS[i]].name, r.x + r.w / 2, r.y + 6, 12, COL.ink, 'center', sel);
  }

  // 模式选择
  for (let i = 0; i < 2; i++) {
    const r = modeBtn(i);
    const sel = runMode === MODE_KEYS[i];
    roughBox(ctx, r.x, r.y, r.w, r.h, sel ? '#d9c3a0' : '#fffdf8', COL.ink, sel ? 2.2 : 1.4);
    text(MODE_NAMES[MODE_KEYS[i]], r.x + r.w / 2, r.y + 5, 12, COL.ink, 'center', sel);
  }

  roughBox(ctx, musicBtn.x, musicBtn.y, musicBtn.w, musicBtn.h, Music.enabled ? '#f7ecd6' : '#efe6d4', COL.ink, 1);
  text('♪ 音乐 ' + (Music.enabled ? '开' : '关'), musicBtn.x + musicBtn.w / 2, musicBtn.y + 3, 8, COL.ink, 'center', true);
  text('WASD 移动 · 自动攻击 · P 暂停 · M 音乐', VW / 2, 344, 9, COL.inkSoft, 'center');
  text('prototype P2.0', VW - 10, VH - 14, 8, COL.inkSoft, 'right');
}

function drawMenuPortrait(now) {
  const nowMs = now * 1000;
  const look = menuLookTarget(nowMs);
  roughCircle(ctx, 46, 48, 16, COL.gold, COL.ink, 1.8, 10);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + 0.2;
    roughLine(ctx, 46 + Math.cos(a) * 22, 48 + Math.sin(a) * 22, 46 + Math.cos(a) * 28, 48 + Math.sin(a) * 28, COL.ink, 1.3);
  }
  doodleStar(ctx, VW - 40, 76, 5, COL.red, 1.3);
  text('纸 片 幸 存 者', VW / 2, 72, 30, COL.ink, 'center', true, -0.02);
  roughLine(ctx, 48, 112, VW - 48, 112, COL.ink, 2);
  text('PAPER SURVIVORS · 竖屏生存', VW / 2, 122, 9, COL.inkSoft, 'center');

  const bob = Math.sin(now * 2) * 3;
  drawMenuSlime(112, 205 + bob, look.x, look.y, menuReactionStrength(nowMs, 112, 205));
  drawMenuSlime(168, 211 + Math.sin(now * 2 + 1) * 3, look.x, look.y, menuReactionStrength(nowMs, 168, 211));
  drawMenuPlayer(250, 205 + Math.sin(now * 2 + 2) * 3, look.x, look.y, menuReactionStrength(nowMs, 250, 205));
  drawMenuClickFx(nowMs);

  roughBox(ctx, nameBtn.x, nameBtn.y, nameBtn.w, nameBtn.h, '#fffdf8', COL.ink, 1.2);
  text('昵称 · ' + playerName, VW / 2, nameBtn.y + 5, 10, COL.ink, 'center', true);
  roughLine(ctx, nameBtn.x + nameBtn.w - 18, nameBtn.y + 6, nameBtn.x + nameBtn.w - 10, nameBtn.y + 14, COL.goldDark, 1.5);

  drawStartButtons();

  text('难度', VW / 2, 338, 9, COL.inkSoft, 'center');
  for (let i = 0; i < 3; i++) {
    const r = diffBtn(i);
    const sel = difficulty === DIFF_KEYS[i];
    roughBox(ctx, r.x, r.y, r.w, r.h, sel ? '#f5c542' : '#fffdf8', COL.ink, sel ? 2.2 : 1.4);
    text(DIFFS[DIFF_KEYS[i]].name, r.x + r.w / 2, r.y + 6, 11, COL.ink, 'center', sel);
  }
  for (let i = 0; i < 2; i++) {
    const r = modeBtn(i);
    const sel = runMode === MODE_KEYS[i];
    roughBox(ctx, r.x, r.y, r.w, r.h, sel ? '#d9c3a0' : '#fffdf8', COL.ink, sel ? 2.2 : 1.4);
    text(MODE_NAMES[MODE_KEYS[i]], r.x + r.w / 2, r.y + 5, 11, COL.ink, 'center', sel);
  }
  roughBox(ctx, musicBtn.x, musicBtn.y, musicBtn.w, musicBtn.h, Music.enabled ? '#f7ecd6' : '#efe6d4', COL.ink, 1);
  text('♪ 音乐 ' + (Music.enabled ? '开' : '关'), musicBtn.x + musicBtn.w / 2, musicBtn.y + 3, 8, COL.ink, 'center', true);
  text('左侧拖动移动 · 自动攻击 · 右上暂停', VW / 2, VH - 22, 8, COL.inkSoft, 'center');
  text('P2.0 竖屏版', VW - 10, VH - 40, 7, COL.inkSoft, 'right');
}

function drawMenuSeasonAccessory(kind) {
  const season = currentMenuSeason().id;
  const hero = kind === 'hero';
  if (season === 'spring') {
    const y = hero ? -9 : -14;
    roughLine(ctx, -9, y + 2, 9, y + 1, '#588444', 1.5);
    for (let i = -1; i <= 1; i++) {
      const x = i * 7;
      roughCircle(ctx, x, y, 3, i === 0 ? '#f3b3c4' : '#fff5ee', COL.ink, 0.55, 6);
      roughCircle(ctx, x, y, 0.9, COL.gold, null, 0, 5);
      roughEllipse(ctx, x + 3, y + 2, 2.4, 1.2, '#79a759', null, 0, 6);
    }
  } else if (season === 'summer') {
    const y = hero ? -1 : -4;
    roughBox(ctx, -10, y - 3, 8, 6, '#2f3742', COL.ink, 1);
    roughBox(ctx, 2, y - 3, 8, 6, '#2f3742', COL.ink, 1);
    roughLine(ctx, -2, y, 2, y, COL.ink, 1.2);
    roughLine(ctx, -8, y - 1, -4, y - 2, '#86bad2', 0.8);
    roughLine(ctx, 4, y - 1, 8, y - 2, '#86bad2', 0.8);
    if (hero) {
      fillPoly(ctx, [[-9, 7], [0, 11], [9, 7], [7, 13], [0, 10], [-7, 13]], '#4c9fbd');
      roughLine(ctx, -8, 8, 8, 8, COL.ink, 1);
    } else {
      roughBox(ctx, -12, -15, 24, 3.5, '#dfb45c', COL.ink, 0.8);
      roughEllipse(ctx, 0, -18, 8, 4, '#edcc79', COL.ink, 0.8, 8);
    }
  } else if (season === 'autumn') {
    roughBox(ctx, -11, 6, 22, 5, '#a94336', COL.ink, 1);
    fillPoly(ctx, [[5, 9], [10, 19], [4, 17], [1, 10]], '#bd4e3e');
    fillPoly(ctx, [[-7, 8], [-1, 2], [2, 7], [7, 3], [6, 10], [0, 12]], '#e18a34');
    roughLine(ctx, 0, 7, 1, 13, '#7f4b32', 0.7);
    if (!hero) {
      roughEllipse(ctx, 0, -14, 8, 4, '#9b653b', COL.ink, 0.9, 8);
      roughBox(ctx, -2, -19, 4, 5, '#765033', COL.ink, 0.7);
    }
  } else if (season === 'winter') {
    roughBox(ctx, -11, 6, 22, 6, hero ? '#f0e8d8' : '#8a68a0', COL.ink, 1);
    fillPoly(ctx, [[5, 10], [10, 20], [4, 18], [1, 11]], hero ? '#f5efe3' : '#9a78af');
    const capY = hero ? -12 : -15;
    fillPoly(ctx, [[-9, capY], [0, capY - 11], [9, capY], [7, capY + 4], [-7, capY + 4]], hero ? '#c94f42' : '#7d5e93');
    roughBox(ctx, -10, capY, 20, 4, '#fff7e8', COL.ink, 0.9);
    roughCircle(ctx, 0, capY - 11, 3.5, '#fff7e8', COL.ink, 0.7, 7);
    if (!hero) {
      roughCircle(ctx, -12, -3, 3.5, '#fff7e8', COL.ink, 0.7, 7);
      roughCircle(ctx, 12, -3, 3.5, '#fff7e8', COL.ink, 0.7, 7);
    }
  }
}

function drawMenuMapAccessory(kind) {
  const id = activeMenuSceneId;
  if (!id || !MAPS.some((map) => map.id === id)) return;
  const hero = kind === 'hero';
  if (id === 'forest') {
    roughLine(ctx, -10, -13, 10, -14, '#55783c', 1.5);
    for (let i = -1; i <= 1; i++) {
      roughEllipse(ctx, i * 7, -15 - Math.abs(i), 4, 2.2, i % 2 ? '#91ad58' : '#6f9145', COL.ink, 0.55, 7);
    }
    roughCircle(ctx, 0, -17, 2.5, '#f1c95b', COL.ink, 0.55, 6);
  } else if (id === 'waste') {
    roughBox(ctx, -10, -7, 8, 5, '#8e6a4a', COL.ink, 0.9);
    roughBox(ctx, 2, -7, 8, 5, '#8e6a4a', COL.ink, 0.9);
    roughLine(ctx, -2, -5, 2, -5, COL.ink, 1);
    roughBox(ctx, -11, 6, 22, 5, '#b36f45', COL.ink, 0.8);
    fillPoly(ctx, [[5, 9], [11, 17], [4, 16], [1, 10]], '#c78453');
  } else if (id === 'desert') {
    roughBox(ctx, -13, -15, 26, 3, '#d7aa54', COL.ink, 0.8);
    roughEllipse(ctx, 0, -19, 9, 5, '#e8c578', COL.ink, 0.9, 8);
    roughBox(ctx, -11, 6, 22, 5, '#5d91a3', COL.ink, 0.8);
    fillPoly(ctx, [[6, 9], [11, 18], [4, 16], [1, 10]], '#72a7b5');
  } else if (id === 'swamp') {
    roughEllipse(ctx, 0, -15, 12, 5, '#6f9c65', '#3f6241', 1, 9);
    roughLine(ctx, 0, -15, 8, -20, '#496b45', 1.1);
    roughCircle(ctx, 7, -20, 2.7, '#d590ad', COL.ink, 0.55, 6);
    if (hero) roughBox(ctx, -10, 7, 20, 4, '#7ea48d', COL.ink, 0.8);
  } else if (id === 'ocean') {
    fillPoly(ctx, [[-9, -13], [0, -20], [9, -13], [7, -9], [-7, -9]], '#f6f1de');
    roughBox(ctx, -10, -13, 20, 3, '#5e9eae', COL.ink, 0.8);
    roughLine(ctx, -6, 8, 0, 12, '#d96c65', 1.8);
    roughLine(ctx, 0, 12, 6, 8, '#d96c65', 1.8);
    roughCircle(ctx, 0, 12, 1.8, '#f2d39b', COL.ink, 0.5, 6);
  } else if (id === 'volcano') {
    roughBox(ctx, -10, -7, 8, 5, '#d96b39', COL.ink, 0.9);
    roughBox(ctx, 2, -7, 8, 5, '#d96b39', COL.ink, 0.9);
    roughLine(ctx, -2, -5, 2, -5, '#f0a43c', 1);
    roughLine(ctx, -11, -12, 11, -13, '#e26432', 2.2);
    fillPoly(ctx, [[7, -12], [12, -8], [8, -5]], '#f3a33c');
  } else if (id === 'inferno') {
    roughBox(ctx, -11, 6, 22, 5, '#8f3b68', COL.ink, 0.9);
    fillPoly(ctx, [[5, 9], [11, 19], [4, 17], [1, 10]], '#b64b77');
    roughCircle(ctx, 0, 11, 3.1, '#dc6a91', COL.ink, 0.7, 7);
    doodleStar(ctx, 0, 11, 2, '#fff0c4', 0.7);
    roughLine(ctx, -8, -14, -3, -18, '#743052', 2);
    roughLine(ctx, 8, -14, 3, -18, '#743052', 2);
  } else if (id === 'heaven') {
    roughEllipse(ctx, 0, -19, 11, 3.4, null, '#c99d37', 1.5, 10);
    roughCircle(ctx, -6, 9, 4, '#f9fbf6', '#8da7bc', 0.6, 7);
    roughCircle(ctx, 0, 7, 5, '#fffdf5', '#8da7bc', 0.6, 7);
    roughCircle(ctx, 6, 9, 4, '#f9fbf6', '#8da7bc', 0.6, 7);
  } else if (id === 'four') {
    const cols = ['#6f8d3b', '#d5a13a', '#d75a45', '#7189a6'];
    for (let i = 0; i < 4; i++) roughBox(ctx, -10 + i * 5, 7, 5, 5, cols[i], COL.ink, 0.45);
    fillPoly(ctx, [[6, 10], [11, 19], [5, 17], [1, 11]], cols[(Math.floor(performance.now() / 900) + (hero ? 1 : 0)) % 4]);
  } else if (id === 'snow') {
    fillPoly(ctx, [[-10, -14], [0, -25], [10, -14], [8, -9], [-8, -9]], hero ? '#6ba6bd' : '#7b93ad');
    roughBox(ctx, -11, -14, 22, 4, '#f5fbfd', COL.ink, 0.8);
    roughCircle(ctx, 0, -25, 3.5, '#f5fbfd', COL.ink, 0.6, 7);
    roughBox(ctx, -11, 6, 22, 6, '#78b9cd', COL.ink, 0.9);
    fillPoly(ctx, [[5, 10], [11, 20], [4, 18], [1, 11]], '#94d0df');
  } else if (id === 'crimson') {
    roughBox(ctx, -11, 6, 22, 6, '#81283e', COL.ink, 0.9);
    fillPoly(ctx, [[5, 10], [12, 20], [4, 17], [1, 11]], '#b63a52');
    for (let i = -1; i <= 1; i++) fillPoly(ctx, [[i * 7 - 3, -14], [i * 7, -23 - (i === 0 ? 4 : 0)], [i * 7 + 3, -14]], i === 0 ? '#d84c63' : '#7c263c');
    roughCircle(ctx, 0, 10, 3.2, null, '#f06d7e', 0.9, 7);
  }
}

function drawMenuSlime(x, y, lookX, lookY, reaction) {
  const a = Math.atan2(lookY - y, lookX - x);
  const eyeX = Math.cos(a) * 1.65;
  const eyeY = Math.sin(a) * 1.25;
  const bounce = (reaction || 0) * 5;
  ctx.save();
  ctx.translate(x, y - bounce);
  ctx.scale(1 + (reaction || 0) * 0.1, 1 - (reaction || 0) * 0.08);
  fillPoly(ctx, [[0, -17], [11, -5], [14, 8], [6, 14], [-6, 14], [-14, 8], [-11, -5]], COL.inkPurpleMid);
  strokePoly(ctx, [[0, -17], [11, -5], [14, 8], [6, 14], [-6, 14], [-14, 8], [-11, -5]], COL.ink, 2);
  roughEllipse(ctx, -4, -10, 4, 2, 'rgba(255,255,255,0.18)', null, 0, 8);
  roughCircle(ctx, -5, -3, 4, COL.white, COL.ink, 1.2, 7);
  roughCircle(ctx, 5, -3, 4, COL.white, COL.ink, 1.2, 7);
  ctx.fillStyle = COL.ink;
  ctx.beginPath(); ctx.arc(-5 + eyeX, -3 + eyeY, 1.55, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(5 + eyeX, -3 + eyeY, 1.55, 0, TAU); ctx.fill();
  drawMenuMapAccessory('slime');
  ctx.restore();
}

function drawMenuPlayer(x, y, lookX, lookY, reaction) {
  const aim = Math.atan2(lookY - y, lookX - x);
  const yy = y - (reaction || 0) * 6;
  const size = 1.15 + (reaction || 0) * 0.05;
  drawPencilHeroArt(x, yy, size, aim, 1);
  ctx.save();
  ctx.translate(x, yy);
  ctx.scale(size, size);
  drawMenuMapAccessory('hero');
  ctx.restore();
}

// =============================================================
// 7. 主循环
// =============================================================
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    update(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps >= 5) acc = 0;
  render();
}

resize();
if (AUTO_START) {
  startGame('story');
  if (FORCE_WEAPON_PREVIEW && WEAPON_DEFS[FORCE_WEAPON_PREVIEW]) {
    let previewWeapon = weapons.find((w) => w.id === FORCE_WEAPON_PREVIEW);
    if (!previewWeapon) { addWeapon(FORCE_WEAPON_PREVIEW); previewWeapon = weapons.find((w) => w.id === FORCE_WEAPON_PREVIEW); }
    previewWeapon.level = FORCE_WEAPON_LEVEL;
    if (previewWeapon.id === 'bubble') syncShield();
  }
  if (FORCE_LEVELUP_PREVIEW) { player.xp += player.xpNeed; levelUpCheck(); }
  for (const id of FORCE_ENCHANT_PREVIEW) if (Object.prototype.hasOwnProperty.call(ench, id)) setEnchantment(id, 3);
  if (FORCE_ELITE_PREVIEW) spawnEnemy(FORCE_ELITE_PREVIEW === 'ranged' ? 'eliteShooter' : 'elite');
  if (FORCE_CLUSTER_PREVIEW) {
    for (let i = 0; i < enemies.length; i++) {
      enemies[i].x = player.x + 68 + (i % 3) * 24;
      enemies[i].y = player.y - 28 + Math.floor(i / 3) * 34;
    }
  }
  if (FORCE_BOSS_PREVIEW) spawnBoss();
  if (FORCE_STORY_PREVIEW !== null) {
    const storyIndex = clamp(Number(FORCE_STORY_PREVIEW) || 0, -1, CHAPTER_STORIES.length - 1);
    showStoryChapter(storyIndex);
  }
}
requestAnimationFrame(frame);

// 调试接口
window.__ps = {
  get state() { return state; },
  get player() { return player; },
  get enemies() { return enemies; },
  get time() { return time; },
  get kills() { return kills; },
  setTime(t) { time = t; },
  addXp(n) { player.xp += n; levelUpCheck(); },
  spawnBoss,
  start: startGame,
  give(id) { addWeapon(id); },
  setDifficulty(k) { difficulty = k; },
  get difficulty() { return difficulty; },
  get runMode() { return runMode; },
  get level() { return levelIdx + 1; },
  get currentMap() { return currentMap.name; },
  get fields() { return fields; },
  get hazards() { return hazards; },
  get fourPhase() { return fourPhase; },
  jumpLevel(n) { levelIdx = n - 1; startLevel(); },
  next: nextLevel,
  showStory(n) { showStoryChapter(clamp(Number(n) || 0, -1, CHAPTER_STORIES.length - 1)); },
  get storyChapter() { return storyChapter; },
  setEnch(id, lv) { setEnchantment(id, lv); },
  get weapons() { return weapons; },
  forceWin() { state = 'win'; },
  forceDead() { player.hp = 0; state = 'dead'; },
  get upgrades() { return { weapons, items: ownedItems, ench, stats: statLevels, dmgMul, atkSpeedMul, critChance, critMult, difficulty }; },
  get gems() { return gems; },
  get bullets() { return bullets; },
  get nickname() { return playerName; },
  setNickname(value) { playerName = cleanNickname(value); saveLocal(NICKNAME_KEY, playerName); },
  get musicEnabled() { return Music.enabled; },
  toggleMusic() { Music.toggle(); },
  get season() { return currentMenuSeason().id; },
  setSeason(id) { if (MENU_SEASONS.some((season) => season.id === id)) rerollMenuSeason(id); },
};
})();
