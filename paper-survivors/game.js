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
const VW = 640;
const VH = 360;
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
let scale = 1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fit = Math.min(window.innerWidth / VW, window.innerHeight / VH);
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

function measure(str, size, bold) {
  ctx.font = (bold ? '700 ' : '400 ') + size + 'px ' + FONT;
  return ctx.measureText(str).width;
}

// ---- 纸张 ----
let paperTile = null;
function getPaperTile() {
  if (paperTile) return paperTile;
  const c = document.createElement('canvas');
  c.width = TILE_P;
  c.height = TILE_P;
  const g = c.getContext('2d');
  g.fillStyle = COL.paper;
  g.fillRect(0, 0, TILE_P, TILE_P);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = 'rgba(122,96,62,' + (0.015 + Math.random() * 0.05).toFixed(3) + ')';
    g.fillRect(Math.random() * TILE_P, Math.random() * TILE_P, 1, Math.random() < 0.85 ? 1 : 2);
  }
  g.fillStyle = 'rgba(90,120,150,0.05)';
  for (let y = 24; y < TILE_P; y += 32) g.fillRect(0, y, TILE_P, 1);
  const saved = RD;
  RD = makeRng(20261117);
  for (let i = 0; i < 5; i++) {
    const x = 20 + RD() * (TILE_P - 40);
    const y = 20 + RD() * (TILE_P - 40);
    const k = i % 3;
    if (k === 0) doodleStar(g, x, y, 3 + RD() * 2, 'rgba(58,48,38,0.10)', 1);
    else if (k === 1) doodleHeart(g, x, y, 3, null, 'rgba(58,48,38,0.10)', 1);
    else {
      g.beginPath();
      g.arc(x, y, 2.5 + RD() * 2, 0.2, 4.7);
      g.strokeStyle = 'rgba(58,48,38,0.10)';
      g.lineWidth = 1;
      g.stroke();
    }
  }
  RD = saved;
  paperTile = c;
  return c;
}

// =============================================================
// 4. 输入
// =============================================================
const Input = {
  keys: new Set(),
  stick: null,
  touch: false,
  pointers: new Map(),
  pointer: { x: VW / 2, y: VH / 2, down: false },
  paused: false,
};

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (!Input.keys.has(k)) {
    Input.keys.add(k);
    if (state === 'menu' || state === 'dead' || state === 'win') startGame();
    else if (state === 'levelup' && ['1', '2', '3'].includes(k)) chooseCard(Number(k) - 1);
    else if (k === 'p' || k === 'escape') togglePause();
  }
});
window.addEventListener('keyup', (e) => Input.keys.delete(e.key.toLowerCase()));

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const p = toLogical(e);
  Input.pointer.x = p.x;
  Input.pointer.y = p.y;
  Input.pointer.down = true;

  if (state === 'menu' || state === 'dead' || state === 'win') {
    if (state === 'menu') {
      for (let i = 0; i < 3; i++) {
        if (inside(p, diffBtn(i))) { difficulty = DIFF_KEYS[i]; return; }
      }
      if (inside(p, startBtn)) startGame();
      return;
    }
    startGame();
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
    if (inside(p, pauseBtn)) { togglePause(); return; }
    if (e.pointerType === 'touch') {
      Input.touch = true;
      if (p.x < VW * 0.55 && !Input.stick) {
        Input.stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
        Input.pointers.set(e.pointerId, 'move');
      }
      return;
    }
  } else if (state === 'paused') {
    togglePause();
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = toLogical(e);
  Input.pointer.x = p.x;
  Input.pointer.y = p.y;
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

// =============================================================
// 5. 游戏状态
// =============================================================
const BOSS_TIME = 120;
const KILL_QUOTA = 90;

let state = 'menu';
let time = 0;
let kills = 0;
let camera = { x: 0, y: 0 };
let spawnTimer = 0;
let eliteIdx = 0;
let bossSpawned = false;
let cards = [];
let cardsShown = false;
let flashT = 0;

const player = {
  x: 0, y: 0, r: 10,
  hp: 100, maxHp: 100,
  speed: 122, inv: 0, magnet: 140,
  level: 1, xp: 0, xpNeed: 10,
  aim: 0,
};

const WEAPON_DEFS = {
  pencil:    { name: '铅笔飞镖', short: '铅笔', kind: 'ranged',  dmg: 14, cd: 0.40, count: 1, spread: 0.16, pierce: 0, speed: 470, range: 300, color: COL.orange },
  slingshot: { name: '弹弓',     short: '弹弓', kind: 'ranged',  dmg: 9,  cd: 0.72, count: 3, spread: 0.26, pierce: 0, speed: 430, range: 210, color: COL.green },
  knife:     { name: '美工刀',   short: '美工刀', kind: 'melee', dmg: 24, cd: 0.55, range: 84, arc: 1.3, color: COL.blue },
  bubble:    { name: '护盾泡泡', short: '护盾', kind: 'support', dmg: 0, cd: 0, shield: 30, regen: 4, color: COL.purple },
};
const MAX_SLOTS = 4;
let weapons = [];
let slashes = [];
const ench = { boom: 0, frost: 0, deflect: 0, pierce: 0 };
let dmgMul = 1;
let atkSpeedMul = 1;
const DIFFS = {
  easy:       { key: 'easy', name: '简单', hp: 0.75, dmg: 0.70, spawn: 0.85, xp: 1.15 },
  elite:      { key: 'elite', name: '精英', hp: 1.00, dmg: 1.00, spawn: 1.00, xp: 1.00 },
  adventurer: { key: 'adventurer', name: '冒险家', hp: 1.35, dmg: 1.30, spawn: 1.20, xp: 0.90 },
};
let difficulty = 'elite';
function diff() { return DIFFS[difficulty]; }
function maxSlots() {
  return Math.min(MAX_SLOTS, 1 + (player.level >= 3 ? 1 : 0) + (player.level >= 6 ? 1 : 0) + (player.level >= 9 ? 1 : 0));
}
function wDmgMul(lv) { return 1 + 0.35 * (lv - 1); }
function wCdMul(lv) { return 1 - 0.06 * (lv - 1); }
function hasWeapon(id) { return weapons.some((w) => w.id === id); }

let enemies = [];
let bullets = [];
let ebullets = [];
let gems = [];
let parts = [];
let texts = [];

const ENCH_DEFS = {
  boom:    { name: '爆裂', desc: '命中产生范围爆炸', max: 3 },
  frost:   { name: '冰缓', desc: '命中减速敌人',     max: 3 },
  deflect: { name: '弹反', desc: '护盾期间弹反子弹', max: 3 },
  pierce:  { name: '穿透', desc: '远程多穿 1 个',    max: 3 },
};
const statLevels = { dmg: 0, rate: 0, speed: 0, hp: 0, magnet: 0, heal: 0 };

const startBtn = { x: VW / 2 - 110, y: 214, w: 220, h: 46 };
function diffBtn(i) {
  const w = 100, h = 26, gap = 12;
  const total = w * 3 + gap * 2;
  return { x: (VW - total) / 2 + i * (w + gap), y: 274, w, h };
}
const DIFF_KEYS = ['easy', 'elite', 'adventurer'];
const pauseBtn = { x: VW - 44, y: 10, w: 34, h: 34 };

function cardRect(i) {
  const w = 168;
  const h = 128;
  const gap = 16;
  const total = w * 3 + gap * 2;
  return { x: (VW - total) / 2 + i * (w + gap), y: 118, w, h };
}

function reset() {
  time = 0;
  kills = 0;
  spawnTimer = 0;
  eliteIdx = 0;
  bossSpawned = false;
  cards = [];
  flashT = 0;

  player.x = WORLD.w / 2;
  player.y = WORLD.h / 2;
  player.hp = 100;
  player.maxHp = 100;
  player.speed = 122;
  player.inv = 0;
  player.magnet = 140;
  player.level = 1;
  player.xp = 0;
  player.xpNeed = 10;
  player.aim = 0;

  weapons = [{ id: 'pencil', level: 1, timer: 0 }];
  slashes = [];
  dmgMul = 1;
  atkSpeedMul = 1;
  for (const k in ench) ench[k] = 0;
  for (const k in statLevels) statLevels[k] = 0;
  player.shield = 0;
  player.shieldMax = 0;
  player.shieldRegen = 0;

  enemies = [];
  bullets = [];
  ebullets = [];
  gems = [];
  parts = [];
  texts = [];

  camera.x = clamp(player.x - VW / 2, 0, WORLD.w - VW);
  camera.y = clamp(player.y - VH / 2, 0, WORLD.h - VH);
}

function startGame() {
  reset();
  state = 'play';
  for (let i = 0; i < 4; i++) spawnEnemy('slime');
}

function togglePause() {
  if (state === 'play') state = 'paused';
  else if (state === 'paused') state = 'play';
}

// ---------------- 敌人 ----------------
function enemyDef(type) {
  if (type === 'slime') return { r: 9, hp: 20, speed: 60, dmg: 6, xp: 1, color: COL.green, dark: '#3f7f2c' };
  if (type === 'bat') return { r: 7, hp: 12, speed: 100, dmg: 5, xp: 1, color: COL.purple, dark: '#5f3f8c' };
  if (type === 'ink') return { r: 13, hp: 62, speed: 40, dmg: 9, xp: 3, color: '#4a4a5a', dark: '#2b2b36' };
  return { r: 9, hp: 20, speed: 44, dmg: 8, xp: 1, color: COL.green, dark: '#3f7f2c' };
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
  return 1 + time / 90;
}

function spawnEnemy(type) {
  const d = enemyDef(type);
  const p = spawnPos();
  const elite = type === 'elite';
  enemies.push({
    type,
    x: p.x, y: p.y,
    r: elite ? 20 : d.r,
    hp: d.hp * hpScale() * (elite ? 7 : 1) * diff().hp,
    maxHp: d.hp * hpScale() * (elite ? 7 : 1) * diff().hp,
    speed: elite ? 46 : d.speed,
    dmg: (elite ? 20 : d.dmg) * diff().dmg,
    xp: Math.max(1, Math.round((elite ? 14 : d.xp) * diff().xp)),
    color: elite ? '#d98c3a' : d.color,
    dark: elite ? '#8f5a1e' : d.dark,
    elite: !!elite,
    boss: false,
    flash: 0,
    slowT: 0,
    slowMul: 1,
    t: rnd(0, 4),
    phase: rnd(0, 6.28),
  });
}

function spawnBoss() {
  bossSpawned = true;
  const p = spawnPos();
  enemies.push({
    type: 'boss',
    x: p.x, y: p.y, r: 34,
    hp: 1500 * diff().hp, maxHp: 1500 * diff().hp,
    speed: 34, dmg: 22, xp: 0,
    color: '#b23a2c', dark: '#7a2418',
    elite: false, boss: true,
    flash: 0, t: 0, phase: 0,
    ringCd: 2.4, chargeCd: 6, summonCd: 10,
    tele: 0, chargeT: 0, chargeA: 0,
  });
  addText(player.x, player.y - 40, 'BOSS 来了！', COL.red, 16);
}

function spawnWave() {
  const t = time;
  const pool = ['slime'];
  if (t > 20) pool.push('bat');
  if (t > 45) pool.push('ink');
  if (t > 90) pool.push('bat', 'ink');
  const n = 1;
  for (let i = 0; i < n; i++) spawnEnemy(pool[Math.floor(Math.random() * pool.length)]);
}

// ---------------- 升级 ----------------
function addWeapon(id) {
  weapons.push({ id, level: 1, timer: 0 });
  if (id === 'bubble') syncShield();
}

function syncShield() {
  const w = weapons.find((x) => x.id === 'bubble');
  if (!w) return;
  const def = WEAPON_DEFS.bubble;
  player.shieldMax = def.shield + 15 * (w.level - 1);
  player.shieldRegen = def.regen + 2 * (w.level - 1);
  player.shield = Math.max(player.shield, player.shieldMax);
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
    if (w.level >= 5) continue;
    const def = WEAPON_DEFS[w.id];
    pool.push({
      key: 'up:' + w.id,
      name: def.name + ' 升级',
      desc: '伤害与攻速提升',
      sub: 'Lv.' + w.level + ' → ' + (w.level + 1),
      apply: () => { w.level++; if (w.id === 'bubble') syncShield(); },
    });
  }

  for (const id in ENCH_DEFS) {
    if (ench[id] >= ENCH_DEFS[id].max) continue;
    pool.push({
      key: 'ench:' + id,
      name: '附魔 · ' + ENCH_DEFS[id].name,
      desc: ENCH_DEFS[id].desc,
      sub: 'Lv.' + ench[id] + ' → ' + (ench[id] + 1),
      apply: () => { ench[id]++; },
    });
  }

  if (statLevels.dmg < 8) pool.push({ key: 's:dmg', name: '削尖铅笔', desc: '全伤害 +30%', sub: '属性', apply: () => { dmgMul *= 1.3; statLevels.dmg++; } });
  if (statLevels.rate < 8) pool.push({ key: 's:rate', name: '手速加快', desc: '攻速 +20%', sub: '属性', apply: () => { atkSpeedMul *= 1.2; statLevels.rate++; } });
  if (statLevels.speed < 6) pool.push({ key: 's:speed', name: '轻快脚步', desc: '移速 +10%', sub: '属性', apply: () => { player.speed *= 1.1; statLevels.speed++; } });
  if (statLevels.hp < 6) pool.push({ key: 's:hp', name: '吃厚一点', desc: '生命上限 +25', sub: '属性', apply: () => { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); statLevels.hp++; } });
  if (statLevels.magnet < 4) pool.push({ key: 's:magnet', name: '大口袋', desc: '拾取范围 +35', sub: '属性', apply: () => { player.magnet += 35; statLevels.magnet++; } });
  pool.push({ key: 's:heal', name: '创可贴', desc: '回复 40 生命', sub: '随时可用', apply: () => { player.hp = Math.min(player.maxHp, player.hp + 40); statLevels.heal++; } });

  const growth = pool.filter((c) => c.key.startsWith('new:') || c.key.startsWith('up:') || c.key.startsWith('ench:'));
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
}

function chooseCard(i) {
  const c = cards[i];
  if (!c) return;
  c.apply();
  cards = [];
  state = 'play';
  addText(player.x, player.y - 30, c.name, COL.goldDark, 12);
}

// ---------------- 附魔 ----------------
function explodeAt(x, y, r, dmg) {
  for (let i = 0; i < 8; i++) puff(x, y, COL.gold, 1, 120, 0.3);
  for (const e of enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - x, e.y - y) < r + e.r) damageEnemy(e, dmg);
  }
}

function applyEnchants(e, dmg) {
  if (ench.frost > 0) {
    e.slowT = 1.6;
    e.slowMul = 0.9 - 0.1 * ench.frost;
  }
  if (ench.boom > 0) {
    explodeAt(e.x, e.y, 26 + 6 * ench.boom, dmg * (0.5 + 0.1 * ench.boom));
  }
}

// ---------------- 伤害 ----------------
function damageEnemy(e, dmg) {
  e.hp -= dmg;
  e.flash = 1;
  addText(e.x + rnd(-4, 4), e.y - e.r - 8, String(Math.round(dmg)), COL.ink, 9);
  for (let i = 0; i < 2; i++) puff(e.x, e.y, e.color, 1, 60, 0.2);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  kills++;
  if (e.boss) {
    state = 'win';
    for (let i = 0; i < 60; i++) puff(e.x, e.y, i % 2 ? COL.gold : COL.white, 1, 200, 0.8);
    return;
  }
  for (let i = 0; i < 8; i++) puff(e.x, e.y, i % 3 ? e.color : COL.white, 1, 90, 0.4);
  const n = e.elite ? 8 : 1;
  for (let i = 0; i < n; i++) {
    gems.push({
      x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8),
      vx: rnd(-40, 40), vy: rnd(-40, 40),
      value: e.elite ? 3 : 1, life: 0,
    });
  }
  if (e.elite) {
    player.hp = Math.min(player.maxHp, player.hp + 25);
    addText(e.x, e.y - 24, '精英击破 +25HP', COL.red, 11);
  }
}

function damagePlayer(dmg) {
  if (player.inv > 0 || state !== 'play') return;
  player.inv = 1.0;
  flashT = 0.18;
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
  if (player.inv > 0) player.inv -= dt;

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
  player.x = clamp(player.x + mx * player.speed * dt, 20, WORLD.w - 20);
  player.y = clamp(player.y + my * player.speed * dt, 20, WORLD.h - 20);

  // 护盾回复
  if (player.shieldMax > 0) {
    player.shield = Math.min(player.shieldMax, player.shield + player.shieldRegen * dt);
  }

  // 自动攻击：每把武器独立计时
  for (const w of weapons) {
    const def = WEAPON_DEFS[w.id];
    if (def.kind === 'support') continue;
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
        bullets.push({
          x: player.x + Math.cos(a) * 12,
          y: player.y + Math.sin(a) * 12,
          vx: Math.cos(a) * def.speed,
          vy: Math.sin(a) * def.speed,
          r: 4, dmg, pierce, hits: [],
          life: def.range / def.speed + 0.2, color: def.color,
        });
      }
      for (let i = 0; i < 2; i++) {
        puff(player.x + Math.cos(base) * 14, player.y + Math.sin(base) * 14, def.color, 1, 60, 0.12);
      }
    } else if (def.kind === 'melee') {
      slashes.push({ x: player.x, y: player.y, aim: base, arc: def.arc, life: 0.16, max: 0.16, color: def.color, r: def.range });
      for (const e of enemies) {
        if (e.dead) continue;
        const d = dist(player, e);
        if (d > def.range + e.r) continue;
        let da = Math.atan2(e.y - player.y, e.x - player.x) - base;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) > def.arc / 2) continue;
        damageEnemy(e, dmg);
        applyEnchants(e, dmg);
      }
    }
  }

  // 刷怪
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = Math.max(0.36, 0.82 - time * 0.0035) / diff().spawn;
    if (enemies.length < 120) spawnWave();
  }

  // 精英：45 / 90 / 135 秒
  const eliteTimes = [40, 80];
  if (eliteIdx < eliteTimes.length && time >= eliteTimes[eliteIdx]) {
    eliteIdx++;
    spawnEnemy('elite');
    addText(player.x, player.y - 34, '精英出现！', COL.red, 13);
  }

  // Boss
  if (!bossSpawned && (time >= BOSS_TIME || (kills >= KILL_QUOTA && time >= 60))) spawnBoss();

  // 敌人
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt * 6);

    if (e.boss) {
      updateBoss(e, dt);
    } else {
      let vx = player.x - e.x;
      let vy = player.y - e.y;
      const d = Math.hypot(vx, vy) || 1;
      vx /= d;
      vy /= d;
      if (e.type === 'bat') {
        const s = Math.sin(e.t * 5 + e.phase) * 0.7;
        const nx = vx - vy * s;
        const ny = vy + vx * s;
        vx = nx; vy = ny;
      }
      const spd = e.speed * (e.slowT > 0 ? e.slowMul : 1);
      e.x += vx * spd * dt;
      e.y += vy * spd * dt;
      if (e.slowT > 0) e.slowT -= dt;
    }

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

    if (dist(e, player) < e.r + player.r) damagePlayer(e.dmg);
  }

  // 玩家子弹
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) { bullets.splice(i, 1); continue; }
    let hit = false;
    for (const e of enemies) {
      if (e.dead || b.hits.indexOf(e) >= 0) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
        damageEnemy(e, b.dmg);
        applyEnchants(e, b.dmg);
        b.hits.push(e);
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
      if (player.shield > 0 && ench.deflect > 0 && Math.random() < 0.15 * ench.deflect) {
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
      damagePlayer(b.dmg);
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

function updateBoss(e, dt) {
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;

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
    e.x += Math.cos(e.chargeA) * 420 * dt;
    e.y += Math.sin(e.chargeA) * 420 * dt;
    e.x = clamp(e.x, 20, WORLD.w - 20);
    e.y = clamp(e.y, 20, WORLD.h - 20);
    for (let i = 0; i < 2; i++) puff(e.x, e.y, '#8f2f24', 1, 50, 0.2);
    return;
  }

  e.x += (dx / d) * e.speed * dt;
  e.y += (dy / d) * e.speed * dt;

  e.ringCd -= dt;
  e.chargeCd -= dt;
  e.summonCd -= dt;

  if (e.ringCd <= 0) {
    e.ringCd = 2.6;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + e.t;
      ebullets.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * 105, vy: Math.sin(a) * 105,
        r: 5, dmg: 10, life: 5, color: '#b23a2c',
      });
    }
  }
  if (e.chargeCd <= 0) {
    e.chargeCd = 7;
    e.tele = 0.7;
  }
  if (e.summonCd <= 0) {
    e.summonCd = 11;
    for (let i = 0; i < 3; i++) spawnEnemy('slime');
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
    drawMenu();
    return;
  }

  RD = makeRng((Math.floor(performance.now() / 125) * 2654435761) >>> 0);

  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  drawGround();

  const drawables = [];
  for (const e of enemies) if (!e.dead) drawables.push({ y: e.y, kind: 'enemy', e });
  for (const g of gems) drawables.push({ y: g.y, kind: 'gem', g });
  drawables.push({ y: player.y, kind: 'player' });
  drawables.sort((a, b) => a.y - b.y);

  for (const d of drawables) {
    if (d.kind === 'enemy') drawEnemy(d.e);
    else if (d.kind === 'gem') drawGem(d.g);
    else drawPlayer();
  }

  for (const b of bullets) drawBullet(b, COL.gold);
  for (const b of ebullets) drawBullet(b, '#b23a2c');
  for (const sl of slashes) {
    ctx.globalAlpha = sl.life / sl.max;
    ctx.strokeStyle = sl.color;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(sl.x, sl.y, sl.r * 0.82, sl.aim - sl.arc / 2, sl.aim + sl.arc / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
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

  ctx.restore();
  drawHUD();
  drawOverlays();
}

function drawGround() {
  const tile = getPaperTile();
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

function drawPlayer() {
  const p = player;
  const blink = p.inv > 0 && Math.floor(p.inv * 16) % 2 === 0;
  ctx.globalAlpha = blink ? 0.4 : 1;
  if (p.shield > 0) {
    roughCircle(ctx, p.x, p.y, 14, null, 'rgba(139,95,192,0.55)', 2, 12);
  }

  roughEllipse(ctx, p.x, p.y + 10, 9, 3.5, 'rgba(58,48,38,0.10)', null, 0, 8);

  const ax = Math.cos(p.aim);
  const ay = Math.sin(p.aim);
  const nx = -ay * 2.6;
  const ny = ax * 2.6;
  const bx = p.x + ax * 4;
  const by = p.y + ay * 4;
  const ex = p.x + ax * 18;
  const ey = p.y + ay * 18;
  fillPoly(ctx, [[bx + nx, by + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [bx - nx, by - ny]], '#9a9a9a');
  strokePoly(ctx, [[bx + nx, by + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [bx - nx, by - ny]], COL.ink, 1.6);

  roughCircle(ctx, p.x, p.y + 3, 6, COL.blue, COL.ink, 2, 9);
  roughCircle(ctx, p.x, p.y - 6, 6.4, COL.skin, COL.ink, 2, 9);

  ctx.fillStyle = COL.ink;
  ctx.beginPath(); ctx.arc(p.x - 2.2 + ax * 1.2, p.y - 6.5 + ay * 1.2, 1, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x + 2.2 + ax * 1.2, p.y - 6.5 + ay * 1.2, 1, 0, TAU); ctx.fill();

  ctx.beginPath(); ctx.arc(p.x, p.y - 4.6, 2.2, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.stroke();

  ctx.globalAlpha = 1;
}

function drawEnemy(e) {
  const x = e.x;
  const y = e.y;
  roughEllipse(ctx, x, y + e.r * 0.85, e.r * 0.85, e.r * 0.3, 'rgba(58,48,38,0.10)', null, 0, 8);

  if (e.boss) {
    const bob = Math.sin(e.t * 3) * 2;
    const yy = y + bob;
    const tele = e.tele > 0;
    roughEllipse(ctx, x, yy, e.r, e.r * 0.92, tele ? '#f0a0a0' : e.color, COL.ink, 2.6, 14);
    for (let i = 0; i < 4; i++) {
      roughLine(ctx, x - 16 + i * 9, yy - 10, x - 9 + i * 9, yy + 12, 'rgba(255,255,255,0.20)', 2.6);
    }
    fillPoly(ctx, [
      [x - 18, yy - e.r * 0.7], [x - 18, yy - e.r * 1.3], [x - 8, yy - e.r * 0.95],
      [x, yy - e.r * 1.45], [x + 8, yy - e.r * 0.95], [x + 18, yy - e.r * 1.3],
      [x + 18, yy - e.r * 0.7],
    ], COL.gold);
    strokePoly(ctx, [
      [x - 18, yy - e.r * 0.7], [x - 18, yy - e.r * 1.3], [x - 8, yy - e.r * 0.95],
      [x, yy - e.r * 1.45], [x + 8, yy - e.r * 0.95], [x + 18, yy - e.r * 1.3],
      [x + 18, yy - e.r * 0.7],
    ], COL.ink, 2);
    roughCircle(ctx, x - 10, yy - 4, 6, COL.white, COL.ink, 1.4, 8);
    roughCircle(ctx, x + 10, yy - 4, 6, COL.white, COL.ink, 1.4, 8);
    ctx.fillStyle = '#7a2f24';
    ctx.beginPath(); ctx.arc(x - 9, yy - 3, 2.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 9, yy - 3, 2.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x, yy + 10, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = '#7a2f24'; ctx.lineWidth = 2.4; ctx.stroke();
  } else if (e.type === 'slime') {
    const squash = 1 + Math.sin(e.t * 7 + e.phase) * 0.12;
    roughEllipse(ctx, x, y, (e.r * squash), e.r / squash, e.color, COL.ink, 2);
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
    roughCircle(ctx, x - 4, y - 3, 3, COL.white, COL.ink, 1, 7);
    roughCircle(ctx, x + 4, y - 3, 3, COL.white, COL.ink, 1, 7);
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x - 3.4, y - 2.6, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4.4, y - 2.6, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y + 4, 3.2, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = COL.white; ctx.lineWidth = 1.4; ctx.stroke();
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

  if (e.flash > 0) {
    roughCircle(ctx, x, y, e.r * 0.95, 'rgba(255,255,255,' + (e.flash * 0.5).toFixed(2) + ')', null, 0, 9);
  }
  if (!e.boss && e.hp < e.maxHp) {
    const w = e.r * 2;
    roughLine(ctx, x - w / 2, y - e.r - 8, x - w / 2 + w * clamp(e.hp / e.maxHp, 0, 1), y - e.r - 8, COL.ink, 2.4);
  }
}

function drawGem(g) {
  const bob = Math.sin(g.life * 5) * 1.2;
  roughCircle(ctx, g.x, g.y + bob, 4.5, g.value > 1 ? COL.purple : COL.gold, COL.ink, 1.2, 8);
  roughCircle(ctx, g.x - 1, g.y - 1 + bob, 1.2, 'rgba(255,255,255,0.8)', null, 0, 6);
}

function drawBullet(b, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  roughCircle(ctx, b.x, b.y, b.r, color, COL.ink, 1, 7);
}

// ---------------- HUD ----------------
function drawHUD() {
  // 血条
  const hw = 150;
  roughBox(ctx, 12, 12, hw, 16, COL.white, COL.ink, 1.6);
  if (player.hp > 0) {
    roughBox(ctx, 14, 14, (hw - 4) * clamp(player.hp / player.maxHp, 0, 1), 12, COL.red, null, 0);
  }
  text(Math.ceil(player.hp) + ' / ' + player.maxHp, 12 + hw / 2, 14, 10, COL.ink, 'center', true);

  // 经验条
  roughBox(ctx, 12, 33, hw, 8, '#f0e6d2', COL.ink, 1.2);
  roughBox(ctx, 13, 34, (hw - 2) * clamp(player.xp / player.xpNeed, 0, 1), 6, COL.blue, null, 0);
  text('Lv.' + player.level, 12 + hw + 10, 31, 11, COL.ink, 'left', true);

  // 武器槽
  for (let i = 0; i < MAX_SLOTS; i++) {
    const bx = 12 + i * 78;
    const w = weapons[i];
    roughBox(ctx, bx, 46, 72, 22, w ? '#fffdf8' : '#efe6d4', COL.ink, 1.2);
    if (w) {
      text(WEAPON_DEFS[w.id].short, bx + 4, 49, 9, COL.ink);
      text('Lv' + w.level, bx + 68, 50, 8, COL.inkSoft, 'right');
    } else {
      text('空', bx + 36, 51, 8, COL.inkSoft, 'center');
    }
  }
  if (player.shieldMax > 0) {
    text('盾 ' + Math.ceil(player.shield), 12 + hw + 10, 12, 9, COL.purple);
  }

  // 时间
  const mm = Math.floor(time / 60);
  const ss = Math.floor(time % 60);
  text(mm + ':' + String(ss).padStart(2, '0'), VW / 2, 10, 16, COL.ink, 'center', true);
  text('击杀 ' + kills, VW / 2, 30, 10, COL.inkSoft, 'center');

  // 暂停按钮
  roughCircle(ctx, pauseBtn.x + pauseBtn.w / 2, pauseBtn.y + pauseBtn.h / 2, 14, COL.white, COL.ink, 1.6, 10);
  roughLine(ctx, pauseBtn.x + 13, pauseBtn.y + 9, pauseBtn.x + 13, pauseBtn.y + 25, COL.ink, 2.2);
  roughLine(ctx, pauseBtn.x + 20, pauseBtn.y + 9, pauseBtn.x + 20, pauseBtn.y + 25, COL.ink, 2.2);

  // Boss 血条
  const boss = enemies.find((e) => e.boss && !e.dead);
  if (boss) {
    const bw = 320;
    roughBox(ctx, (VW - bw) / 2, VH - 26, bw, 12, COL.white, COL.ink, 1.6);
    roughBox(ctx, (VW - bw) / 2 + 2, VH - 24, (bw - 4) * clamp(boss.hp / boss.maxHp, 0, 1), 8, COL.red, null, 0);
    text('墨迹王', VW / 2, VH - 44, 10, COL.ink, 'center', true);
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

function drawOverlays() {
  if (state === 'levelup') {
    ctx.fillStyle = 'rgba(253,246,228,0.88)';
    ctx.fillRect(0, 0, VW, VH);
    text('升 级 ！', VW / 2, 52, 24, COL.goldDark, 'center', true, -0.02);
    text('选一个强化（点击卡片 / 按 1 2 3）', VW / 2, 84, 10, COL.inkSoft, 'center');
    for (let i = 0; i < cards.length; i++) {
      const r = cardRect(i);
      const c = cards[i];
      roughBox(ctx, r.x, r.y, r.w, r.h, '#fffdf8', COL.ink, 2);
      roughBox(ctx, r.x + 8, r.y + 8, r.w - 16, 26, '#f7ecd6', null, 0);
      text(c.name, r.x + r.w / 2, r.y + 14, 13, COL.ink, 'center', true);
      text(c.desc, r.x + r.w / 2, r.y + 52, 11, COL.inkSoft, 'center');
      text(c.sub, r.x + r.w / 2, r.y + 92, 9, COL.inkSoft, 'center');
      text(String(i + 1), r.x + r.w - 14, r.y + r.h - 22, 10, COL.goldDark, 'center', true);
    }
  } else if (state === 'paused') {
    ctx.fillStyle = 'rgba(253,246,228,0.9)';
    ctx.fillRect(0, 0, VW, VH);
    text('暂停', VW / 2, VH / 2 - 30, 26, COL.ink, 'center', true);
    text('点击继续 / 按 P', VW / 2, VH / 2 + 10, 11, COL.inkSoft, 'center');
  } else if (state === 'dead') {
    ctx.fillStyle = 'rgba(253,246,228,0.92)';
    ctx.fillRect(0, 0, VW, VH);
    text('你 被 涂 掉 了', VW / 2, 100, 26, COL.red, 'center', true, 0.02);
    text('存活 ' + Math.floor(time) + ' 秒 · 击杀 ' + kills + ' · 等级 ' + player.level, VW / 2, 150, 12, COL.ink, 'center');
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      text('点击 / 按任意键 再来一局', VW / 2, 200, 12, COL.ink, 'center', true);
    }
  } else if (state === 'win') {
    ctx.fillStyle = 'rgba(253,246,228,0.92)';
    ctx.fillRect(0, 0, VW, VH);
    text('通 关 ！', VW / 2, 92, 30, COL.goldDark, 'center', true, -0.02);
    doodleStar(ctx, VW / 2 - 90, 108, 10, COL.gold, 2.4);
    doodleStar(ctx, VW / 2 + 90, 108, 10, COL.gold, 2.4);
    text('你击败了墨迹王', VW / 2, 142, 13, COL.ink, 'center');
    text('存活 ' + Math.floor(time) + ' 秒 · 击杀 ' + kills + ' · 等级 ' + player.level, VW / 2, 170, 11, COL.ink, 'center');
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      text('点击 / 按任意键 再来一局', VW / 2, 210, 12, COL.ink, 'center', true);
    }
  }
}

function drawMenu() {
  const now = performance.now() / 1000;
  const tile = getPaperTile();
  for (let x = 0; x < VW; x += TILE_P) {
    for (let y = 0; y < VH; y += TILE_P) ctx.drawImage(tile, x, y);
  }

  // 装饰
  roughCircle(ctx, 72, 60, 20, COL.gold, COL.ink, 2, 10);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    roughLine(ctx, 72 + Math.cos(a) * 27, 60 + Math.sin(a) * 27, 72 + Math.cos(a) * 35, 60 + Math.sin(a) * 35, COL.ink, 1.6);
  }
  doodleStar(ctx, 520, 70, 6, COL.gold, 1.6);
  doodleStar(ctx, 560, 110, 5, COL.red, 1.5);
  doodleStar(ctx, 120, 150, 4, COL.blue, 1.4);

  // 小角色排排站
  const bob = Math.sin(now * 2) * 3;
  drawMenuSlime(250, 176 + bob);
  drawMenuSlime(300, 182 + Math.sin(now * 2 + 1) * 3);
  drawMenuPlayer(400, 176 + Math.sin(now * 2 + 2) * 3);

  text('纸 片 幸 存 者', VW / 2, 62, 40, COL.ink, 'center', true, -0.02);
  roughLine(ctx, VW / 2 - 150, 116, VW / 2 + 150, 114, COL.ink, 2);
  text('PAPER SURVIVORS · 手绘生存原型', VW / 2, 126, 10, COL.inkSoft, 'center');

  roughBox(ctx, startBtn.x, startBtn.y, startBtn.w, startBtn.h, '#f5c542', COL.ink, 2.2);
  text('开始一局', VW / 2, startBtn.y + 12, 18, COL.ink, 'center', true);

  // 难度选择
  text('难度', VW / 2, 261, 9, COL.inkSoft, 'center');
  for (let i = 0; i < 3; i++) {
    const r = diffBtn(i);
    const sel = difficulty === DIFF_KEYS[i];
    roughBox(ctx, r.x, r.y, r.w, r.h, sel ? '#f5c542' : '#fffdf8', COL.ink, sel ? 2.2 : 1.4);
    text(DIFFS[DIFF_KEYS[i]].name, r.x + r.w / 2, r.y + 6, 12, COL.ink, 'center', sel);
  }

  text('WASD / 方向键移动 · 自动攻击 · P 暂停', VW / 2, 316, 10, COL.inkSoft, 'center');
  text('活过 2 分钟或击杀 90 只，Boss 登场', VW / 2, 334, 10, COL.inkSoft, 'center');
  text('prototype P1', VW - 10, VH - 14, 8, COL.inkSoft, 'right');
}

function drawMenuSlime(x, y) {
  roughCircle(ctx, x, y, 14, COL.green, COL.ink, 2, 10);
  roughCircle(ctx, x - 5, y - 3, 4, COL.white, COL.ink, 1.2, 7);
  roughCircle(ctx, x + 5, y - 3, 4, COL.white, COL.ink, 1.2, 7);
  ctx.fillStyle = COL.ink;
  ctx.beginPath(); ctx.arc(x - 4.6, y - 2.6, 1.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 5.4, y - 2.6, 1.6, 0, TAU); ctx.fill();
}

function drawMenuPlayer(x, y) {
  roughCircle(ctx, x, y + 4, 7, COL.blue, COL.ink, 2, 9);
  roughCircle(ctx, x, y - 7, 7.5, COL.skin, COL.ink, 2, 9);
  ctx.fillStyle = COL.ink;
  ctx.beginPath(); ctx.arc(x - 2.5, y - 7.5, 1.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 2.5, y - 7.5, 1.2, 0, TAU); ctx.fill();
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
  setEnch(id, lv) { ench[id] = lv; },
  get weapons() { return weapons; },
  forceWin() { state = 'win'; },
  forceDead() { player.hp = 0; state = 'dead'; },
  get upgrades() { return { weapons, ench, stats: statLevels, dmgMul, atkSpeedMul, difficulty }; },
  get gems() { return gems; },
  get bullets() { return bullets; },
};
})();
