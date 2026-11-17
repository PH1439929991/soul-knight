/* =============================================================
 * 元气地牢 · 最小可玩原型 (Soul Knight style prototype)
 * -------------------------------------------------------------
 * 目标：用一份代码同时验证 PC（键鼠/手柄）与手机（触屏双摇杆）的手感。
 * 技术：单文件 Canvas 2D + WebAudio，无任何外部依赖。
 *
 * 结构：
 *   1. 常量与工具
 *   2. 画布与自适应缩放
 *   3. 音频（程序化音效）
 *   4. 输入抽象（键鼠 / 触屏 / 手柄 → 统一向量）
 *   5. 关卡生成（房间图 + 门的连通）
 *   6. 实体（玩家 / 敌人 / 子弹 / 掉落 / 粒子）
 *   7. 渲染（房间缓存 / 精灵 / HUD / 覆盖层）
 *   8. 主循环
 * ============================================================= */
(() => {
'use strict';

// =============================================================
// 1. 常量与工具
// =============================================================
const VW = 512;          // 逻辑分辨率（16:9）
const VH = 288;
const TILE = 16;
const MAP_W = 4;         // 房间图 4x3
const MAP_H = 3;
const STEP = 1 / 60;     // 固定步长逻辑
const PLAY = { x0: TILE, y0: TILE, x1: VW - TILE, y1: VH - TILE };

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';

const COL = {
  paper: '#fdf6e4',
  ink: '#3a3026',
  inkSoft: '#8a7a66',
  text: '#3a3026',
  dim: '#8a7a66',
  gold: '#c98a1e',
  goldLight: '#f5c542',
  red: '#d94f3d',
  green: '#4f9a3a',
  blue: '#4a90d9',
  purple: '#8b5fc0',
  orange: '#e07b2a',
  skin: '#ffd9a0',
  white: '#fffdf8',
};

// 武器表：数据驱动，加新武器只需要加一条配置
const WEAPONS = [
  { id: 'pistol',  name: '手枪',   dmg: 2.4, cd: 0.20,  speed: 300, spread: 2,   count: 1, r: 3,   color: '#f2a33c', pierce: 0, life: 1.1,  kick: 26, sfx: 'pistol' },
  { id: 'smg',     name: '冲锋枪', dmg: 1.2, cd: 0.075, speed: 340, spread: 8,   count: 1, r: 2.5, color: '#3fa7d6', pierce: 0, life: 1.0,  kick: 14, sfx: 'smg' },
  { id: 'shotgun', name: '霰弹枪', dmg: 1.7, cd: 0.62,  speed: 290, spread: 26,  count: 5, r: 3,   color: '#e8842f', pierce: 0, life: 0.55, kick: 60, sfx: 'shotgun' },
  { id: 'laser',   name: '激光枪', dmg: 3.4, cd: 0.30,  speed: 520, spread: 0.4, count: 1, r: 3,   color: '#9b5fd0', pierce: 1, life: 1.0,  kick: 18, sfx: 'laser' },
];

const ENEMY_DEF = {
  slime:   { hp: 6,  r: 8,  speed: 34, contact: 1, color: '#6fcf6f', dark: '#3f8f4f' },
  bat:     { hp: 3,  r: 6,  speed: 82, contact: 1, color: '#d67c7c', dark: '#8f4a4a' },
  shooter: { hp: 5,  r: 7,  speed: 26, contact: 1, color: '#b07cd6', dark: '#6f4a8f' },
  boss:    { hp: 150, r: 22, speed: 30, contact: 2, color: '#e0596b', dark: '#8f3a4a' },
};

const DOOR = {
  n: { x: VW / 2 - 16, y: 0, w: 32, h: TILE },
  s: { x: VW / 2 - 16, y: VH - TILE, w: 32, h: TILE },
  w: { x: 0, y: VH / 2 - 16, w: TILE, h: 32 },
  e: { x: VW - TILE, y: VH / 2 - 16, w: TILE, h: 32 },
};
const DIR_VEC = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 }, e: { x: 1, y: 0 } };
const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };

const DASH_BTN = { x: VW - 32, y: VH - 96, r: 18 };
const PAUSE_BTN = { x: VW - 30, y: 62, r: 10 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => (b === undefined ? Math.random() * (a === undefined ? 1 : a) : a + Math.random() * (b - a));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rrect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function text(str, x, y, size, color, align, bold) {
  ctx.font = (bold ? '600 ' : '') + size + 'px ' + FONT;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(str, x, y);
}

// =============================================================
// 2. 画布与自适应缩放
// =============================================================
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let scale = 1;
let dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fit = Math.min(window.innerWidth / VW, window.innerHeight / VH);
  const cssW = Math.max(1, Math.floor(VW * fit));
  const cssH = Math.max(1, Math.floor(VH * fit));
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const s = Math.max(1, Math.round(fit * dpr));
  if (canvas.width !== VW * s || canvas.height !== VH * s) {
    canvas.width = VW * s;
    canvas.height = VH * s;
  }
  scale = s;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function toLogical(ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - r.left) / Math.max(1, r.width)) * VW,
    y: ((ev.clientY - r.top) / Math.max(1, r.height)) * VH,
  };
}

// =============================================================
// 3. 音频：全部程序化合成，不需要素材
// =============================================================
const sfx = {
  ac: null,
  master: null,
  muted: false,
  noiseBuf: null,

  unlock() {
    try {
      if (!this.ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.24;
        this.master.connect(this.ac.destination);
      }
      if (this.ac.state === 'suspended') this.ac.resume();
    } catch (e) { /* 音频不可用时静默 */ }
  },

  tone(f0, f1, dur, type, vol, delay) {
    const ac = this.ac;
    if (!ac || this.muted) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol == null ? 0.22 : vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  },

  noise(dur, vol, f0, f1) {
    const ac = this.ac;
    if (!ac || this.muted) return;
    if (!this.noiseBuf) {
      const n = Math.floor(ac.sampleRate * 0.4);
      const buf = ac.createBuffer(1, n, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f0 || 800, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(60, f1 || 200), t + dur);
    bp.Q.value = 1.1;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol == null ? 0.18 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },

  shoot(id) {
    if (id === 'pistol') this.tone(780, 240, 0.06, 'square', 0.15);
    else if (id === 'smg') this.tone(620, 320, 0.035, 'square', 0.08);
    else if (id === 'shotgun') { this.noise(0.14, 0.26, 1500, 200); this.tone(210, 60, 0.12, 'sawtooth', 0.10); }
    else this.tone(1500, 420, 0.09, 'sawtooth', 0.11);
  },
  enemyShoot() { this.tone(340, 180, 0.07, 'sawtooth', 0.07); },
  hit() { this.noise(0.05, 0.10, 2400, 900); },
  die() { this.tone(320, 70, 0.18, 'square', 0.12); },
  hurt() { this.tone(220, 90, 0.22, 'sawtooth', 0.16); },
  coin() { this.tone(880, 1320, 0.06, 'sine', 0.10); this.tone(1320, 1600, 0.05, 'sine', 0.07, 0.05); },
  heal() { this.tone(520, 780, 0.12, 'sine', 0.12); },
  dash() { this.noise(0.12, 0.14, 1600, 300); },
  door() { this.tone(420, 760, 0.12, 'triangle', 0.10); },
  swap() { this.tone(660, 990, 0.08, 'triangle', 0.12); },
  boss() { this.tone(110, 55, 0.5, 'sawtooth', 0.16); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.16, 'triangle', 0.14, i * 0.11)); },
  lose() { [330, 262, 196].forEach((f, i) => this.tone(f, f * 0.9, 0.24, 'sawtooth', 0.13, i * 0.13)); },
};

function toggleMute() {
  sfx.muted = !sfx.muted;
  showToast(sfx.muted ? '已静音' : '音效开启', COL.dim, 1.2);
}

// =============================================================
// 4. 输入抽象
//   键鼠 / 触屏双摇杆 / 手柄 都只负责填充同一组向量
// =============================================================
const Input = {
  keys: new Set(),
  mouse: { x: VW / 2, y: VH / 2, down: false, seen: false },
  touch: false,
  sticks: { move: null, aim: null },
  pointers: new Map(),
  dash: false,
  padMove: { x: 0, y: 0 },
  padAim: { x: 0, y: 0 },
  padFire: false,
  padDashHeld: false,
};

function handleStart() {
  sfx.unlock();
  startRun();
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sfx.unlock();
  const p = toLogical(e);
  if (e.pointerType === 'touch') {
    Input.touch = true;
    Input.mouse.seen = false; // 触屏接管后关掉鼠标瞄准，恢复自动索敌
  } else {
    Input.mouse.seen = true;
  }

  if (state !== 'play') {
    if (state === 'paused') { state = 'play'; return; }
    handleStart();
    return;
  }

  if (Math.hypot(p.x - PAUSE_BTN.x, p.y - PAUSE_BTN.y) < PAUSE_BTN.r + 8) {
    togglePause();
    return;
  }

  if (Input.touch && e.pointerType === 'touch') {
    if (Math.hypot(p.x - DASH_BTN.x, p.y - DASH_BTN.y) < DASH_BTN.r + 8) {
      Input.dash = true;
      return;
    }
    if (p.x < VW / 2) {
      if (!Input.sticks.move) Input.sticks.move = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      Input.pointers.set(e.pointerId, 'move');
    } else {
      if (!Input.sticks.aim) Input.sticks.aim = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      Input.pointers.set(e.pointerId, 'aim');
    }
    return;
  }

  Input.mouse.seen = true;
  Input.mouse.down = true;
  Input.mouse.x = p.x;
  Input.mouse.y = p.y;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});

canvas.addEventListener('pointermove', (e) => {
  const p = toLogical(e);
  if (e.pointerType === 'mouse') {
    Input.mouse.seen = true;
    Input.mouse.x = p.x;
    Input.mouse.y = p.y;
  }
  const role = Input.pointers.get(e.pointerId);
  if (role === 'move' && Input.sticks.move) { Input.sticks.move.x = p.x; Input.sticks.move.y = p.y; }
  else if (role === 'aim' && Input.sticks.aim) { Input.sticks.aim.x = p.x; Input.sticks.aim.y = p.y; }
});

function endPointer(e) {
  const role = Input.pointers.get(e.pointerId);
  if (role === 'move') Input.sticks.move = null;
  if (role === 'aim') Input.sticks.aim = null;
  Input.pointers.delete(e.pointerId);
  if (e.pointerType !== 'touch') Input.mouse.down = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('blur', () => {
  Input.mouse.down = false;
  Input.sticks.move = null;
  Input.sticks.aim = null;
  Input.pointers.clear();
  if (state === 'play') state = 'paused';
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play') state = 'paused';
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  sfx.unlock();
  const fresh = !Input.keys.has(k);
  Input.keys.add(k);
  if (!fresh) return;

  if (k === 'm') { toggleMute(); return; }
  if (state === 'title' || state === 'dead' || state === 'win') { handleStart(); return; }
  if (k === 'p' || k === 'escape') { togglePause(); return; }
  if (k === ' ' && state === 'play') Input.dash = true;
});
window.addEventListener('keyup', (e) => Input.keys.delete(e.key.toLowerCase()));

function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : null;
  let gp = null;
  if (pads) for (let i = 0; i < pads.length; i++) if (pads[i]) { gp = pads[i]; break; }
  if (!gp) {
    Input.padMove.x = 0; Input.padMove.y = 0;
    Input.padAim.x = 0; Input.padAim.y = 0;
    Input.padFire = false; Input.padDashHeld = false;
    return;
  }
  const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
  Input.padMove.x = dz(gp.axes[0] || 0);
  Input.padMove.y = dz(gp.axes[1] || 0);
  Input.padAim.x = dz(gp.axes[2] || 0);
  Input.padAim.y = dz(gp.axes[3] || 0);
  const rt = gp.buttons[7] ? gp.buttons[7].value : 0;
  Input.padFire = rt > 0.25 || !!(gp.buttons[5] && gp.buttons[5].pressed);
  const a = !!(gp.buttons[0] && gp.buttons[0].pressed);
  if (a && !Input.padDashHeld) Input.dash = true;
  Input.padDashHeld = a;
}

function moveVec() {
  let x = 0, y = 0;
  const k = Input.keys;
  if (k.has('a') || k.has('arrowleft')) x -= 1;
  if (k.has('d') || k.has('arrowright')) x += 1;
  if (k.has('w') || k.has('arrowup')) y -= 1;
  if (k.has('s') || k.has('arrowdown')) y += 1;

  const st = Input.sticks.move;
  if (st) {
    const dx = st.x - st.ox, dy = st.y - st.oy;
    const d = Math.hypot(dx, dy);
    if (d > 8) {
      const m = Math.min(1, (d - 8) / 32);
      x += (dx / d) * m;
      y += (dy / d) * m;
    }
  }
  x += Input.padMove.x;
  y += Input.padMove.y;

  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y, len: Math.min(1, len) };
}

function aimVec() {
  const st = Input.sticks.aim;
  if (st) {
    const dx = st.x - st.ox, dy = st.y - st.oy;
    const d = Math.hypot(dx, dy);
    if (d > 9) return { x: dx / d, y: dy / d, active: true, stick: true };
  }
  const ax = Input.padAim.x, ay = Input.padAim.y;
  if (ax || ay) {
    const d = Math.hypot(ax, ay) || 1;
    return { x: ax / d, y: ay / d, active: true, stick: false };
  }
  if (Input.mouse.seen || !Input.touch) {
    const dx = Input.mouse.x - player.x, dy = Input.mouse.y - player.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d, active: true, stick: false };
  }
  return { x: 0, y: 0, active: false, stick: false };
}

function autoTarget() {
  let bestE = null;
  let bd = 280 * 280;
  for (const e of room.enemies) {
    if (e.dead) continue;
    const d = (e.x - player.x) * (e.x - player.x) + (e.y - player.y) * (e.y - player.y);
    if (d < bd) { bd = d; bestE = e; }
  }
  return bestE;
}

// =============================================================
// 5. 关卡生成
// =============================================================
let R = mulberry32(1);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(a + R() * (b - a + 1));
const pickR = (arr) => arr[Math.min(arr.length - 1, Math.floor(R() * arr.length))];

function genFloor() {
  cells = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      row.push({
        gx: x, gy: y, links: [], type: 'combat', depth: 0,
        visited: false, cleared: false,
        enemies: [], pickups: [], obstacles: [], solids: [], art: null,
      });
    }
    cells.push(row);
  }

  const start = cells[1][0];
  start.type = 'start';
  start.cleared = true;

  // 随机 DFS 生成连通迷宫（生成树，保证全图可达）
  const seen = new Set([start]);
  const stack = [start];
  const dirs = [[1, 0, 'e', 'w'], [-1, 0, 'w', 'e'], [0, 1, 's', 'n'], [0, -1, 'n', 's']];
  while (stack.length) {
    const c = stack[stack.length - 1];
    const opts = [];
    for (const [dx, dy, name, opp] of dirs) {
      const nx = c.gx + dx, ny = c.gy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const n = cells[ny][nx];
      if (seen.has(n)) continue;
      opts.push({ n, name, opp });
    }
    if (!opts.length) { stack.pop(); continue; }
    const o = opts[Math.floor(R() * opts.length)];
    c.links.push(o.name);
    o.n.links.push(o.opp);
    seen.add(o.n);
    stack.push(o.n);
  }

  // BFS 求深度，最远房间做 Boss 房
  const q = [start];
  const dist = new Map([[start, 0]]);
  let far = start;
  while (q.length) {
    const c = q.shift();
    for (const dir of c.links) {
      const n = neighborOf(c, dir);
      if (!n || dist.has(n)) continue;
      dist.set(n, c.depth + 1);
      n.depth = c.depth + 1;
      if (n.depth > far.depth) far = n;
      q.push(n);
    }
  }
  far.type = 'boss';

  // 死胡同变宝藏房
  for (const row of cells) {
    for (const c of row) {
      if (c.links.length === 1 && c !== start && c !== far && c.type === 'combat' && R() < 0.75) {
        c.type = 'treasure';
      }
    }
  }

  // 保证每局至少有一个宝藏房，避免地图退化成一条走廊
  let hasTreasure = false;
  for (const row of cells) for (const c of row) if (c.type === 'treasure') hasTreasure = true;
  if (!hasTreasure) {
    const candidates = [];
    for (const row of cells) for (const c of row) if (c.type === 'combat') candidates.push(c);
    if (candidates.length) {
      candidates.sort((a, b) => a.links.length - b.links.length);
      const pick = candidates[Math.floor(R() * Math.min(3, candidates.length))];
      pick.type = 'treasure';
    }
  }
  return start;
}

function neighborOf(c, dir) {
  const v = DIR_VEC[dir];
  const x = c.gx + v.x, y = c.gy + v.y;
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  return cells[y][x];
}

function spawnPos(fromDir) {
  switch (fromDir) {
    case 'w': return { x: PLAY.x1 - 12, y: VH / 2 };
    case 'e': return { x: PLAY.x0 + 12, y: VH / 2 };
    case 'n': return { x: VW / 2, y: PLAY.y1 - 12 };
    case 's': return { x: VW / 2, y: PLAY.y0 + 12 };
    default:  return { x: VW / 2, y: VH / 2 };
  }
}

function enterRoom(c, fromDir) {
  room = c;
  const sp = spawnPos(fromDir);
  player.x = sp.x;
  player.y = sp.y;
  player.kx = 0;
  player.ky = 0;
  player.dashT = 0;
  clearBullets();

  if (!room.visited) {
    room.visited = true;
    populate(room, fromDir);
    room.art = buildArt(room);
    // 没有敌人的房间（起点/宝藏/异常）直接算清空，避免门锁死
    if (room.enemies.length === 0) room.cleared = true;
  }
  refreshSolids(room);
  addShake(2, 0.12);

  if (room.type === 'boss') showToast('Boss 房间', COL.red, 1.8);
  else if (room.type === 'treasure') showToast('宝藏房间', COL.gold, 1.4);
}

function populate(r, fromDir) {
  const sp = spawnPos(fromDir);
  r.obstacles = [];

  if (r.type !== 'start') {
    const want = ri(1, 3);
    for (let i = 0; i < 20 && r.obstacles.length < want; i++) {
      const w = ri(1, 2) * 16, h = ri(1, 2) * 16;
      const x = Math.round(rr(PLAY.x0 + 32, PLAY.x1 - 32 - w));
      const y = Math.round(rr(PLAY.y0 + 32, PLAY.y1 - 32 - h));
      const cx = x + w / 2, cy = y + h / 2;
      if (Math.abs(cx - VW / 2) < 56 || Math.abs(cy - VH / 2) < 46) continue; // 中央留空
      if (Math.hypot(cx - sp.x, cy - sp.y) < 90) continue;                     // 不堵门口
      let bad = false;
      for (const o of r.obstacles) {
        if (Math.abs(o.x + o.w / 2 - cx) < (o.w + w) / 2 + 12 &&
            Math.abs(o.y + o.h / 2 - cy) < (o.h + h) / 2 + 12) { bad = true; break; }
      }
      if (!bad) r.obstacles.push({ x, y, w, h });
    }
  }

  if (r.type === 'start') return;

  if (r.type === 'treasure') {
    r.pickups.push(makePickup('crate', VW / 2 - 40, VH / 2));
    r.pickups.push(makePickup('crate', VW / 2 + 40, VH / 2));
    for (let i = 0; i < 4; i++) r.pickups.push(makePickup('coin', VW / 2 + rr(-28, 28), VH / 2 + rr(-28, 28)));
    return;
  }

  if (r.type === 'boss') {
    const b = makeEnemy('boss', VW * 0.68, VH / 2);
    b.summonCd = 4;
    r.enemies.push(b);
    r.enemies.push(makeEnemy('slime', VW * 0.55, VH * 0.32));
    r.enemies.push(makeEnemy('slime', VW * 0.55, VH * 0.68));
    return;
  }

  const n = Math.min(7, 2 + r.depth);
  const pool = r.depth <= 1 ? ['slime', 'slime', 'bat']
    : r.depth <= 3 ? ['slime', 'bat', 'shooter']
    : ['slime', 'bat', 'shooter', 'shooter', 'bat'];
  for (let i = 0; i < n; i++) {
    const pos = freeSpot(r, sp);
    if (!pos) continue;
    r.enemies.push(makeEnemy(pickR(pool), pos.x, pos.y));
  }
}

function freeSpot(r, sp) {
  for (let i = 0; i < 40; i++) {
    const x = rr(PLAY.x0 + 20, PLAY.x1 - 20);
    const y = rr(PLAY.y0 + 20, PLAY.y1 - 20);
    if (Math.hypot(x - sp.x, y - sp.y) < 80) continue;
    let bad = false;
    for (const o of r.obstacles) {
      if (x > o.x - 14 && x < o.x + o.w + 14 && y > o.y - 14 && y < o.y + o.h + 14) { bad = true; break; }
    }
    if (!bad) return { x, y };
  }
  return null;
}

function refreshSolids(r) {
  const s = [];
  const W = VW, H = VH, T = TILE;
  if (r.links.includes('n')) {
    s.push({ x: 0, y: 0, w: W / 2 - 16, h: T });
    s.push({ x: W / 2 + 16, y: 0, w: W / 2 - 16, h: T });
  } else s.push({ x: 0, y: 0, w: W, h: T });

  if (r.links.includes('s')) {
    s.push({ x: 0, y: H - T, w: W / 2 - 16, h: T });
    s.push({ x: W / 2 + 16, y: H - T, w: W / 2 - 16, h: T });
  } else s.push({ x: 0, y: H - T, w: W, h: T });

  if (r.links.includes('w')) {
    s.push({ x: 0, y: 0, w: T, h: H / 2 - 16 });
    s.push({ x: 0, y: H / 2 + 16, w: T, h: H / 2 - 16 });
  } else s.push({ x: 0, y: 0, w: T, h: H });

  if (r.links.includes('e')) {
    s.push({ x: W - T, y: 0, w: T, h: H / 2 - 16 });
    s.push({ x: W - T, y: H / 2 + 16, w: T, h: H / 2 - 16 });
  } else s.push({ x: W - T, y: 0, w: T, h: H });

  if (!r.cleared) for (const dir of r.links) s.push(DOOR[dir]);
  for (const o of r.obstacles) s.push(o);
  r.solids = s;
}

// =============================================================
// 6. 实体
// =============================================================
let state = 'title';
let cells = [];
let room = null;
let player = null;
let bullets = [];
const bulletPool = [];
let particles = [];
const particlePool = [];
const shake = { t: 0, dur: 0, mag: 0 };
let toastMsg = null;
let stats = { kills: 0, coins: 0, time: 0 };
let winTimer = 0;
let best = 0;
try { best = parseInt(localStorage.getItem('sk_proto_best') || '0', 10) || 0; } catch (e) { best = 0; }

function makePlayer() {
  return {
    x: VW / 2, y: VH / 2, r: 6,
    hp: 6, maxHp: 6, speed: 104,
    aim: 0, fireCd: 0, iframes: 0,
    dashT: 0, dashCd: 0, dashA: 0,
    kx: 0, ky: 0, walk: 0,
    weapon: 0, coins: 0,
  };
}

function makeEnemy(type, x, y) {
  const d = ENEMY_DEF[type];
  return {
    type, x, y, r: d.r, hp: d.hp, maxHp: d.hp, speed: d.speed, contact: d.contact,
    color: d.color, dark: d.dark, dead: false,
    t: rnd(0, 4), phase: rnd(0, 6.28), flash: 0,
    fireCd: rnd(0.4, 1.4), summonCd: 6, kx: 0, ky: 0,
  };
}

function makePickup(type, x, y) {
  return { type, x, y, vx: rnd(-40, 40), vy: rnd(-70, -20), t: 0 };
}

function spawnBullet(x, y, ang, spd, dmg, spec, friendly) {
  let b = bulletPool.pop();
  if (!b) b = {};
  b.x = x; b.y = y; b.px = x; b.py = y;
  b.vx = Math.cos(ang) * spd;
  b.vy = Math.sin(ang) * spd;
  b.dmg = dmg;
  b.r = spec.r;
  b.color = spec.color;
  b.friendly = friendly;
  b.life = spec.life;
  b.pierce = spec.pierce || 0;
  b.hits = null;
  bullets.push(b);
}

function removeBullet(i) {
  const b = bullets[i];
  bullets.splice(i, 1);
  if (bulletPool.length < 400) bulletPool.push(b);
}

function clearBullets() {
  for (const b of bullets) if (bulletPool.length < 400) bulletPool.push(b);
  bullets.length = 0;
}

function puff(x, y, color, n, spd, life) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 520) return;
    const a = rnd(0, Math.PI * 2);
    const s = rnd(0.25, 1) * (spd || 60);
    const p = particlePool.pop() || {};
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.life = p.max = (life || 0.35) * rnd(0.6, 1.25);
    p.size = rnd(1, 2.4);
    p.color = color;
    particles.push(p);
  }
}

function addShake(mag, dur) {
  shake.mag = Math.max(shake.mag, mag);
  shake.dur = Math.max(shake.dur, dur);
  shake.t = Math.max(shake.t, dur);
}

function showToast(msg, color, dur) {
  toastMsg = { msg, color: color || COL.text, t: dur || 1.5 };
}

function score() {
  return stats.kills * 10 + stats.coins * 5 + Math.floor(stats.time);
}

function saveBest() {
  const s = score();
  if (s > best) {
    best = s;
    try { localStorage.setItem('sk_proto_best', String(best)); } catch (e) { /* ignore */ }
  }
}

// ---------------- 玩家 ----------------
function updatePlayer(dt) {
  const p = player;
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.iframes = Math.max(0, p.iframes - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);

  const mv = moveVec();
  const aim = aimVec();

  let auto = null;
  if (Input.touch && !aim.active) auto = autoTarget();

  if (auto) p.aim = Math.atan2(auto.y - p.y, auto.x - p.x);
  else if (aim.active) p.aim = Math.atan2(aim.y, aim.x);
  else if (mv.len > 0.1) p.aim = Math.atan2(mv.y, mv.x);

  // 冲刺（带无敌帧）
  if (Input.dash && p.dashCd <= 0) {
    const a = mv.len > 0.15 ? Math.atan2(mv.y, mv.x) : p.aim;
    p.dashT = 0.14;
    p.dashCd = 0.55;
    p.dashA = a;
    p.iframes = Math.max(p.iframes, 0.26);
    sfx.dash();
    puff(p.x, p.y, '#6fb7e8', 8, 70, 0.3);
  }
  Input.dash = false;

  let vx, vy;
  if (p.dashT > 0) {
    p.dashT -= dt;
    vx = Math.cos(p.dashA) * 330;
    vy = Math.sin(p.dashA) * 330;
  } else {
    vx = mv.x * p.speed;
    vy = mv.y * p.speed;
    p.walk += Math.hypot(vx, vy) * dt;
    if (mv.len > 0.1 && Math.random() < 0.1) puff(p.x, p.y + 6, '#3a4258', 1, 22, 0.25);
  }

  p.x += (vx + p.kx) * dt;
  p.y += (vy + p.ky) * dt;
  p.kx *= Math.pow(0.0006, dt);
  p.ky *= Math.pow(0.0006, dt);

  collideStatic(p, room.solids);
  p.x = clamp(p.x, p.r, VW - p.r);
  p.y = clamp(p.y, p.r, VH - p.r);

  // 射击：PC 左键 / 手柄 RT / 触屏右摇杆或自动索敌
  let firing = Input.mouse.down || Input.padFire || Input.keys.has('j');
  if (Input.touch) firing = !!(aim.stick || auto);
  if (firing) tryShoot();
}

function tryShoot() {
  const p = player;
  if (p.fireCd > 0) return;
  const w = WEAPONS[p.weapon];
  p.fireCd = w.cd;
  const base = p.aim;
  const spreadRad = (w.spread * Math.PI) / 180;

  for (let i = 0; i < w.count; i++) {
    let a = base;
    if (w.count > 1) a += (i - (w.count - 1) / 2) * spreadRad;
    a += rnd(-1, 1) * spreadRad * (w.count > 1 ? 0.25 : 0.5);
    spawnBullet(p.x + Math.cos(base) * 10, p.y + Math.sin(base) * 10, a, w.speed, w.dmg, w, true);
  }

  p.kx -= Math.cos(base) * w.kick;
  p.ky -= Math.sin(base) * w.kick;
  sfx.shoot(w.id);
  addShake(w.id === 'shotgun' ? 3 : 0.8, 0.05);
  for (let i = 0; i < 3; i++) {
    puff(p.x + Math.cos(base) * 12, p.y + Math.sin(base) * 12, w.color, 1, 55, 0.14);
  }
}

function damagePlayer(n) {
  if (state !== 'play' || player.iframes > 0) return;
  player.hp -= n;
  player.iframes = 1.1;
  addShake(6, 0.22);
  sfx.hurt();
  for (let i = 0; i < 10; i++) puff(player.x, player.y, COL.red, 1, 90, 0.35);
  if (player.hp <= 0) {
    player.hp = 0;
    die();
  }
}

function die() {
  state = 'dead';
  addShake(10, 0.5);
  for (let i = 0; i < 34; i++) puff(player.x, player.y, i % 2 ? '#6fb7e8' : '#ffd9a0', 1, 150, 0.7);
  sfx.lose();
  saveBest();
}

function win() {
  state = 'win';
  sfx.win();
  saveBest();
}

// ---------------- 敌人 ----------------
function updateEnemies(dt) {
  const list = room.enemies;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.dead) { list.splice(i, 1); continue; }

    e.t += dt;
    e.flash = Math.max(0, e.flash - dt * 5);
    e.fireCd -= dt;
    e.summonCd -= dt;

    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    let mx = 0, my = 0;

    if (e.type === 'slime') {
      const hop = 0.55 + 0.45 * Math.sin(e.t * 7 + e.phase);
      mx = nx * hop; my = ny * hop;
    } else if (e.type === 'bat') {
      const s = Math.sin(e.t * 4 + e.phase) * 0.9;
      mx = nx - ny * s; my = ny + nx * s;
    } else if (e.type === 'shooter') {
      if (d > 118) { mx = nx; my = ny; }
      else if (d < 76) { mx = -nx; my = -ny; }
      else { mx = -ny * 0.7; my = nx * 0.7; }
      if (e.fireCd <= 0 && d < 210) {
        e.fireCd = 1.7;
        enemyShoot(e, Math.atan2(dy, dx));
      }
    } else if (e.type === 'boss') {
      if (d > 46) { mx = nx * 0.9; my = ny * 0.9; }
      if (e.fireCd <= 0) {
        e.fireCd = 2.3;
        bossSpit(e);
      }
      if (e.summonCd <= 0) {
        e.summonCd = 8;
        summon(e);
      }
    }

    // 互相分离，避免叠成一坨
    for (let j = 0; j < list.length; j++) {
      if (j === i) continue;
      const o = list[j];
      if (o.dead) continue;
      const ox = e.x - o.x, oy = e.y - o.y;
      const od = Math.hypot(ox, oy);
      const minD = e.r + o.r;
      if (od > 0.01 && od < minD) {
        const push = ((minD - od) / minD) * 1.4;
        mx += (ox / od) * push;
        my += (oy / od) * push;
      }
    }

    const sp = e.speed * (e.type === 'boss' && e.hp < e.maxHp * 0.4 ? 1.35 : 1);
    e.x += (mx * sp + e.kx) * dt;
    e.y += (my * sp + e.ky) * dt;
    e.kx *= Math.pow(0.001, dt);
    e.ky *= Math.pow(0.001, dt);

    collideStatic(e, room.solids);
    e.x = clamp(e.x, e.r, VW - e.r);
    e.y = clamp(e.y, e.r, VH - e.r);

    if (d < e.r + player.r + 2) damagePlayer(e.contact);
  }
}

function enemyShoot(e, ang) {
  spawnBullet(e.x + Math.cos(ang) * 10, e.y + Math.sin(ang) * 10, ang, 128, 1,
    { r: 3.5, color: '#e05a4a', life: 2.0, pierce: 0 }, false);
  sfx.enemyShoot();
}

function bossSpit(e) {
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + e.t;
    spawnBullet(e.x, e.y, a, 92, 1, { r: 4, color: '#e07b2a', life: 2.6, pierce: 0 }, false);
  }
  sfx.enemyShoot();
  addShake(3, 0.12);
}

function summon(e) {
  if (room.enemies.length > 7) return;
  for (let i = 0; i < 2; i++) {
    const a = rnd(0, Math.PI * 2);
    const s = makeEnemy('slime', e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30);
    room.enemies.push(s);
    puff(s.x, s.y, '#6fcf6f', 8, 60, 0.4);
  }
}

function damageEnemy(e, dmg, ang) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = 1;
  e.kx += Math.cos(ang) * 80;
  e.ky += Math.sin(ang) * 80;
  puff(e.x, e.y, e.color, 3, 80, 0.2);
  sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  stats.kills++;
  addShake(e.type === 'boss' ? 12 : 2, e.type === 'boss' ? 0.6 : 0.12);
  const n = e.type === 'boss' ? 46 : 12;
  for (let i = 0; i < n; i++) {
    puff(e.x, e.y, i % 3 ? e.color : '#ffffff', 1, e.type === 'boss' ? 190 : 110, 0.6);
  }
  dropLoot(e);
  sfx.die();
  if (e.type === 'boss') {
    winTimer = 1.6;
    showToast('Boss 被击败！', COL.gold, 2);
  }
  checkClear();
}

function dropLoot(e) {
  if (e.type === 'boss') {
    for (let i = 0; i < 14; i++) room.pickups.push(makePickup('coin', e.x + rnd(-8, 8), e.y + rnd(-8, 8)));
    room.pickups.push(makePickup('heart', e.x, e.y + 12));
    return;
  }
  if (Math.random() < 0.75) room.pickups.push(makePickup('coin', e.x, e.y));
  if (Math.random() < 0.07) room.pickups.push(makePickup('heart', e.x, e.y));
  else if (Math.random() < 0.05) room.pickups.push(makePickup('crate', e.x, e.y));
}

function checkClear() {
  if (room.cleared) return;
  for (const e of room.enemies) if (!e.dead) return;
  room.cleared = true;
  refreshSolids(room);
  sfx.door();
  showToast('房间已清空', COL.green, 1.1);
  for (const dir of room.links) {
    const d = DOOR[dir];
    for (let i = 0; i < 6; i++) puff(d.x + d.w / 2, d.y + d.h / 2, COL.gold, 1, 55, 0.5);
  }
}

// ---------------- 子弹 / 粒子 / 掉落 ----------------
function hitStatic(x, y, r) {
  for (const s of room.solids) {
    const cx = clamp(x, s.x, s.x + s.w);
    const cy = clamp(y, s.y, s.y + s.h);
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    if (b.life <= 0) { removeBullet(i); continue; }

    b.px = b.x;
    b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (hitStatic(b.x, b.y, b.r)) {
      puff(b.x, b.y, b.color, 3, 60, 0.18);
      removeBullet(i);
      continue;
    }

    if (b.friendly) {
      let hit = false;
      for (const e of room.enemies) {
        if (e.dead) continue;
        if (b.hits && b.hits.indexOf(e) >= 0) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          damageEnemy(e, b.dmg, Math.atan2(b.vy, b.vx));
          if (b.pierce > 0) {
            b.pierce--;
            if (!b.hits) b.hits = [];
            b.hits.push(e);
          } else {
            hit = true;
          }
          break;
        }
      }
      if (hit) { removeBullet(i); continue; }
    } else if (player.iframes <= 0 && Math.hypot(player.x - b.x, player.y - b.y) < player.r + b.r) {
      puff(b.x, b.y, b.color, 4, 70, 0.2);
      damagePlayer(b.dmg);
      removeBullet(i);
      continue;
    }

    if (b.x < -24 || b.x > VW + 24 || b.y < -24 || b.y > VH + 24) removeBullet(i);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      if (particlePool.length < 600) particlePool.push(p);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.05, dt);
    p.vy *= Math.pow(0.05, dt);
  }
}

function updatePickups(dt) {
  const list = room.pickups;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.02, dt);
    p.vy *= Math.pow(0.02, dt);

    const dx = player.x - p.x, dy = player.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 46) {
      const pull = 260 * (1 - d / 46);
      p.x += (dx / d) * pull * dt;
      p.y += (dy / d) * pull * dt;
    }
    if (d < 12) {
      collect(p);
      list.splice(i, 1);
    }
  }
}

function collect(p) {
  if (p.type === 'coin') {
    player.coins++;
    stats.coins++;
    sfx.coin();
  } else if (p.type === 'heart') {
    if (player.hp < player.maxHp) player.hp++;
    sfx.heal();
  } else if (p.type === 'crate') {
    let idx = Math.floor(Math.random() * WEAPONS.length);
    let guard = 0;
    while (idx === player.weapon && WEAPONS.length > 1 && guard++ < 10) {
      idx = Math.floor(Math.random() * WEAPONS.length);
    }
    player.weapon = idx;
    showToast('获得 ' + WEAPONS[idx].name, COL.ink, 1.4);
    sfx.swap();
  }
  puff(p.x, p.y, p.type === 'coin' ? COL.gold : COL.inkSoft, 6, 55, 0.3);
}

// ---------------- 碰撞 ----------------
function collideStatic(e, solids) {
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    const cx = clamp(e.x, s.x, s.x + s.w);
    const cy = clamp(e.y, s.y, s.y + s.h);
    const dx = e.x - cx, dy = e.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= e.r * e.r) continue;

    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const pen = e.r - d;
      e.x += (dx / d) * pen;
      e.y += (dy / d) * pen;
    } else {
      const l = e.x - s.x, r2 = s.x + s.w - e.x, t = e.y - s.y, b = s.y + s.h - e.y;
      const m = Math.min(l, r2, t, b);
      if (m === l) e.x = s.x - e.r;
      else if (m === r2) e.x = s.x + s.w + e.r;
      else if (m === t) e.y = s.y - e.r;
      else e.y = s.y + s.h + e.r;
    }
  }
}

// ---------------- 房间切换 ----------------
function tryDoors() {
  if (!room.cleared) return;
  for (const dir of room.links) {
    const d = DOOR[dir];
    if (player.x > d.x - 2 && player.x < d.x + d.w + 2 &&
        player.y > d.y - 2 && player.y < d.y + d.h + 2) {
      goDir(dir);
      return;
    }
  }
}

function goDir(dir) {
  const n = neighborOf(room, dir);
  if (!n) return;
  enterRoom(n, dir);
  addShake(3, 0.15);
  sfx.door();
}

// =============================================================
// 7. 渲染：蜡笔 / 手绘风
//    所有形状都用抖动过的折线重画，填色故意画出边界，
//    背景是一张有纤维纹理和横格的纸。
// =============================================================
const HAND_FONT = '"Chalkboard SE","Comic Sans MS","Marker Felt","Bradley Hand","HanziPen SC","Yuanti SC","PingFang SC","Microsoft YaHei",sans-serif';

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

// 手绘随机源：每 1/8 秒换一次种子，线条会轻轻“呼吸”，像逐帧手绘
let RD = makeRng(1);
function wob(amt) { return (RD() - 0.5) * 2 * amt; }

function polyPath(g, pts, close) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0] + wob(1.2);
    const y = pts[i][1] + wob(1.2);
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

// 方块：四角故意描出去一点，像小孩画到框外面
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

function roughCircle(g, cx, cy, r, fill, stroke, lw, segs) {
  const n = segs || Math.max(10, Math.min(22, Math.round(r * 1.6)));
  const pts = [];
  const a0 = wob(0.5);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 * 1.04;
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
    const a = a0 + (i / n) * Math.PI * 2 * 1.03;
    pts.push([
      cx + Math.cos(a) * rx * (1 + wob(0.05)),
      cy + Math.sin(a) * ry * (1 + wob(0.05)),
    ]);
  }
  fillPoly(g, pts, fill);
  strokePoly(g, pts, stroke, lw);
}

function roughLine(g, x1, y1, x2, y2, color, lw) {
  const pts = [[x1, y1], [(x1 + x2) / 2 + wob(1.6), (y1 + y2) / 2 + wob(1.6)], [x2, y2]];
  polyPath(g, pts, false);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.stroke();
}

function roughPoly(g, pts, fill, stroke, lw) {
  fillPoly(g, pts, fill);
  strokePoly(g, pts, stroke, lw);
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

function doodleHeart(g, x, y, s, fill, stroke, lw) {
  g.beginPath();
  g.moveTo(x, y + s * 0.95);
  g.bezierCurveTo(x - s * 1.25, y - s * 0.15, x - s * 0.7, y - s * 1.05, x, y - s * 0.3);
  g.bezierCurveTo(x + s * 0.7, y - s * 1.05, x + s * 1.25, y - s * 0.15, x, y + s * 0.95);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}

function text(str, x, y, size, color, align, bold, rot) {
  ctx.save();
  if (rot) {
    ctx.translate(x, y);
    ctx.rotate(rot);
    x = 0;
    y = 0;
  }
  ctx.font = (bold ? '700 ' : '400 ') + size + 'px ' + HAND_FONT;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(str, x, y);
  ctx.restore();
}

// ---- 纸 ----
let paperTex = null;
function getPaper() {
  if (paperTex) return paperTex;
  const c = document.createElement('canvas');
  c.width = VW;
  c.height = VH;
  const g = c.getContext('2d');
  g.fillStyle = '#fdf6e4';
  g.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 2600; i++) {
    const a = 0.015 + Math.random() * 0.05;
    g.fillStyle = 'rgba(122,96,62,' + a.toFixed(3) + ')';
    g.fillRect(Math.random() * VW, Math.random() * VH, 1, Math.random() < 0.85 ? 1 : 2);
  }
  g.fillStyle = 'rgba(90,120,150,0.055)';
  for (let y = 20; y < VH; y += 32) g.fillRect(0, y, VW, 1);
  paperTex = c;
  return c;
}

// ---- 房间静态层 ----
function buildArt(r) {
  const c = document.createElement('canvas');
  c.width = VW;
  c.height = VH;
  const g = c.getContext('2d');
  const saved = RD;
  RD = makeRng((r.gx * 7919 + r.gy * 104729 + 31) >>> 0);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.drawImage(getPaper(), 0, 0);
  drawFloorDoodles(g);
  drawWalls(g);
  for (let i = 0; i < r.obstacles.length; i++) drawObstacle(g, r.obstacles[i], i);
  RD = saved;
  return c;
}

function drawFloorDoodles(g) {
  const pencil = 'rgba(58,48,38,0.10)';
  for (let i = 0; i < 18; i++) {
    const x = 34 + RD() * (VW - 68);
    const y = 34 + RD() * (VH - 68);
    const k = i % 5;
    if (k === 0) doodleStar(g, x, y, 4 + RD() * 3, pencil, 1);
    else if (k === 1) doodleHeart(g, x, y, 4, null, pencil, 1);
    else if (k === 2) {
      g.beginPath();
      g.arc(x, y, 3 + RD() * 3, 0.2, 4.6);
      g.strokeStyle = pencil;
      g.lineWidth = 1;
      g.stroke();
    } else if (k === 3) {
      roughLine(g, x - 4, y - 4, x + 4, y + 4, pencil, 1);
      roughLine(g, x + 4, y - 4, x - 4, y + 4, pencil, 1);
    } else {
      g.beginPath();
      g.arc(x, y, 1.2, 0, 6.3);
      g.fillStyle = pencil;
      g.fill();
    }
  }
}

function drawWalls(g) {
  const tan = '#ecd8b4';
  const hatch = 'rgba(58,48,38,0.16)';
  roughBox(g, -2, -2, VW + 4, TILE + 4, tan, COL.ink, 2);
  roughBox(g, -2, VH - TILE - 2, VW + 4, TILE + 4, tan, COL.ink, 2);
  roughBox(g, -2, -2, TILE + 4, VH + 4, tan, COL.ink, 2);
  roughBox(g, VW - TILE - 2, -2, TILE + 4, VH + 4, tan, COL.ink, 2);
  for (let x = 10; x < VW - 8; x += 16) {
    roughLine(g, x, 3, x + 7, TILE - 3, hatch, 1.4);
    roughLine(g, x, VH - TILE + 3, x + 7, VH - 3, hatch, 1.4);
  }
  for (let y = 10; y < VH - 8; y += 16) {
    roughLine(g, 3, y, TILE - 3, y + 7, hatch, 1.4);
    roughLine(g, VW - TILE + 3, y, VW - 3, y + 7, hatch, 1.4);
  }
}

function drawObstacle(g, o, i) {
  if (i % 2 === 0) {
    roughBox(g, o.x, o.y, o.w, o.h, '#d9a86c', COL.ink, 2);
    roughLine(g, o.x + 3, o.y + 3, o.x + o.w - 3, o.y + o.h - 3, 'rgba(58,48,38,0.30)', 1.4);
    roughLine(g, o.x + o.w - 3, o.y + 3, o.x + 3, o.y + o.h - 3, 'rgba(58,48,38,0.30)', 1.4);
  } else {
    roughBox(g, o.x, o.y, o.w, o.h, '#cfd9e6', COL.ink, 2);
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(o.x + 4 + RD() * (o.w - 8), o.y + 4 + RD() * (o.h - 8), 1.2, 0, 6.3);
      g.fillStyle = 'rgba(58,48,38,0.25)';
      g.fill();
    }
  }
}

// ---- 门 ----
function drawDoors() {
  const open = room.cleared;
  for (const dir of ['n', 's', 'w', 'e']) {
    if (room.links.indexOf(dir) < 0) continue;
    const d = DOOR[dir];
    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;

    if (!open) {
      roughBox(ctx, d.x + 1, d.y + 1, d.w - 2, d.h - 2, '#bf8f5e', COL.ink, 2);
      for (let i = 0; i < 2; i++) {
        if (dir === 'n' || dir === 's') roughLine(ctx, d.x + 9 + i * 12, d.y + 3, d.x + 9 + i * 12, d.y + d.h - 3, COL.ink, 1.6);
        else roughLine(ctx, d.x + 3, d.y + 9 + i * 12, d.x + d.w - 3, d.y + 9 + i * 12, COL.ink, 1.6);
      }
    } else {
      roughBox(ctx, d.x + 1, d.y + 1, d.w - 2, d.h - 2, '#f5c542', COL.ink, 2);
      doodleStar(ctx, cx, cy, 5, COL.ink, 1.3);
    }
  }
}

// ---- 掉落 ----
function drawPickups() {
  for (const p of room.pickups) {
    const bob = Math.sin(p.t * 4) * 1.5;
    const y = p.y + bob;
    if (p.type === 'coin') {
      roughCircle(ctx, p.x, y, 4.5, COL.goldLight, COL.ink, 1.4, 9);
      roughCircle(ctx, p.x, y, 1.4, 'rgba(58,48,38,0.35)', null, 0, 6);
    } else if (p.type === 'heart') {
      doodleHeart(ctx, p.x, y, 5, COL.red, COL.ink, 1.4);
    } else {
      roughBox(ctx, p.x - 9, y - 8, 18, 16, '#d9a86c', COL.ink, 2);
      text('?', p.x, y - 6, 11, COL.ink, 'center', true);
    }
  }
}

// ---- 敌人 ----
function drawEnemies() {
  for (const e of room.enemies) {
    if (e.dead) continue;
    roughEllipse(ctx, e.x, e.y + e.r * 0.85, e.r * 0.85, e.r * 0.3, 'rgba(58,48,38,0.10)', null, 0, 8);
    drawEnemyBody(e);
    if (e.flash > 0) {
      roughCircle(ctx, e.x, e.y, e.r * 0.95, 'rgba(255,255,255,' + (e.flash * 0.55).toFixed(2) + ')', null, 0, 9);
    }
    if (e.type !== 'boss' && e.hp < e.maxHp) {
      const w = e.r * 2;
      roughLine(ctx, e.x - w / 2, e.y - e.r - 7, e.x - w / 2 + w * (e.hp / e.maxHp), e.y - e.r - 7, COL.ink, 2);
    }
  }
}

function drawEnemyBody(e) {
  const x = e.x;
  const y = e.y;

  if (e.type === 'slime') {
    const squash = 1 + Math.sin(e.t * 7 + e.phase) * 0.12;
    const w = e.r * 2 * squash;
    const h = (e.r * 2) / squash;
    roughEllipse(ctx, x, y, w / 2, h / 2, e.color, COL.ink, 2);
    roughCircle(ctx, x - 3.4, y - 2, 2.5, COL.white, COL.ink, 1.1, 8);
    roughCircle(ctx, x + 3.4, y - 2, 2.5, COL.white, COL.ink, 1.1, 8);
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x - 3.2, y - 1.6, 1, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.6, y - 1.6, 1, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y + 1.5, 2.6, 0.25, Math.PI - 0.25);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.2; ctx.stroke();
  } else if (e.type === 'bat') {
    const flap = Math.sin(e.t * 16 + e.phase) * 3;
    roughPoly(ctx, [[x - 2, y], [x - 11, y - 5 - flap], [x - 8, y + 4]], e.dark, COL.ink, 1.6);
    roughPoly(ctx, [[x + 2, y], [x + 11, y - 5 - flap], [x + 8, y + 4]], e.dark, COL.ink, 1.6);
    roughCircle(ctx, x, y, 5.5, e.color, COL.ink, 1.8, 9);
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x - 2, y - 1.5, 1, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 2, y - 1.5, 1, 0, 6.3); ctx.fill();
    roughPoly(ctx, [[x - 2.2, y + 1.5], [x - 1, y + 3.6], [x - 0.2, y + 1.6]], COL.white, COL.ink, 0.8);
    roughPoly(ctx, [[x + 2.2, y + 1.5], [x + 1, y + 3.6], [x + 0.2, y + 1.6]], COL.white, COL.ink, 0.8);
  } else if (e.type === 'shooter') {
    const bob = Math.sin(e.t * 2.2 + e.phase) * 1.5;
    const yy = y + bob;
    roughPoly(ctx, [[x, yy - 7], [x + 8, yy + 8], [x - 8, yy + 8]], e.color, COL.ink, 1.8);
    roughPoly(ctx, [[x - 7, yy - 4], [x, yy - 13], [x + 7, yy - 4]], e.dark, COL.ink, 1.8);
    roughCircle(ctx, x - 2.2, yy - 1, 1.5, COL.white, COL.ink, 0.8, 7);
    roughCircle(ctx, x + 2.2, yy - 1, 1.5, COL.white, COL.ink, 0.8, 7);
    roughLine(ctx, x + 7, yy + 2, x + 11, yy - 8, '#8a6b4a', 1.8);
    doodleStar(ctx, x + 11.5, yy - 10, 2.4, COL.ink, 1);
  } else if (e.type === 'boss') {
    const bob = Math.sin(e.t * 3) * 2;
    const yy = y + bob;
    roughEllipse(ctx, x, yy, e.r, e.r * 0.92, e.color, COL.ink, 2.4, 14);
    for (let i = 0; i < 4; i++) {
      roughLine(ctx, x - 12 + i * 7, yy - 8, x - 7 + i * 7, yy + 9, 'rgba(255,255,255,0.20)', 2.4);
    }
    roughPoly(ctx, [
      [x - 14, yy - e.r * 0.72], [x - 14, yy - e.r * 1.28], [x - 6, yy - e.r * 0.94],
      [x, yy - e.r * 1.4], [x + 6, yy - e.r * 0.94], [x + 14, yy - e.r * 1.28],
      [x + 14, yy - e.r * 0.72],
    ], COL.goldLight, COL.ink, 2);
    roughCircle(ctx, x - 8, yy - 3, 5.2, COL.white, COL.ink, 1.4, 8);
    roughCircle(ctx, x + 8, yy - 3, 5.2, COL.white, COL.ink, 1.4, 8);
    ctx.fillStyle = '#7a2f24';
    ctx.beginPath(); ctx.arc(x - 7, yy - 2, 2.2, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 7, yy - 2, 2.2, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(x, yy + 8, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = '#7a2f24'; ctx.lineWidth = 2; ctx.stroke();
  }
}

// ---- 玩家 ----
function drawHero(x, y, aim, alpha) {
  ctx.globalAlpha = alpha;

  roughEllipse(ctx, x, y + 8, 7, 3, 'rgba(58,48,38,0.10)', null, 0, 8);

  const ax = Math.cos(aim);
  const ay = Math.sin(aim);
  const nx = -ay * 2.4;
  const ny = ax * 2.4;
  const bx = x + ax * 3;
  const by = y + ay * 3;
  const ex = x + ax * 14;
  const ey = y + ay * 14;
  roughPoly(ctx, [
    [bx + nx, by + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [bx - nx, by - ny],
  ], '#9a9a9a', COL.ink, 1.6);

  roughCircle(ctx, x, y + 2.5, 5.2, COL.blue, COL.ink, 2, 9);
  roughCircle(ctx, x, y - 4.5, 5.4, COL.skin, COL.ink, 2, 9);

  ctx.fillStyle = COL.ink;
  ctx.beginPath(); ctx.arc(x - 2 + ax * 1.2, y - 5 + ay * 1.2, 0.9, 0, 6.3); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 2 + ax * 1.2, y - 5 + ay * 1.2, 0.9, 0, 6.3); ctx.fill();

  ctx.beginPath(); ctx.arc(x, y - 3.4, 2, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.stroke();

  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const p = player;
  const blink = p.iframes > 0 && Math.floor(p.iframes * 16) % 2 === 0;
  drawHero(p.x, p.y, p.aim, blink ? 0.4 : 1);

  if (p.dashT > 0) {
    roughCircle(ctx, p.x - Math.cos(p.dashA) * 10, p.y - Math.sin(p.dashA) * 10, 6, null, 'rgba(74,144,217,0.45)', 2, 8);
  }
}

// ---- 子弹 / 粒子 ----
function drawBullets() {
  for (const b of bullets) {
    roughLine(ctx, b.x - b.vx * 0.022, b.y - b.vy * 0.022, b.x, b.y, b.color, b.r * 1.5);
    roughCircle(ctx, b.x, b.y, b.r, b.color, COL.ink, 1, 8);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// ---- HUD ----
function drawMinimap() {
  const cw = 10;
  const ch = 8;
  const ox = VW - 50;
  const oy = 22;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const c = cells[y][x];
      if (!c.visited) continue;
      let col = '#efe3c8';
      if (c.type === 'start') col = '#c8e6b0';
      else if (c.type === 'treasure') col = '#f7e08a';
      else if (c.type === 'boss') col = '#f2b3a4';
      else if (c.cleared) col = '#e6dcc6';
      roughBox(ctx, ox + x * cw, oy + y * ch, cw - 3, ch - 3, col, COL.ink, 1);
      if (c === room) {
        roughCircle(ctx, ox + x * cw + (cw - 3) / 2, oy + y * ch + (ch - 3) / 2, 6.5, null, COL.red, 1.6, 9);
      }
    }
  }
}

function drawPauseButton() {
  roughCircle(ctx, PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.r, '#fffdf8', COL.ink, 1.6, 9);
  roughLine(ctx, PAUSE_BTN.x - 3.5, PAUSE_BTN.y - 4, PAUSE_BTN.x - 3.5, PAUSE_BTN.y + 4, COL.ink, 2.2);
  roughLine(ctx, PAUSE_BTN.x + 3.5, PAUSE_BTN.y - 4, PAUSE_BTN.x + 3.5, PAUSE_BTN.y + 4, COL.ink, 2.2);
}

function drawStick(st, maxR, homeX, homeY, color) {
  const margin = maxR + 2;
  const x = Math.max(margin, Math.min(VW - margin, st ? st.ox : homeX));
  const y = Math.max(margin, Math.min(VH - margin, st ? st.oy : homeY));
  roughCircle(ctx, x, y, maxR, 'rgba(255,253,248,0.35)', st ? color : 'rgba(58,48,38,0.25)', 2, 12);
  if (st) {
    let dx = st.x - st.ox;
    let dy = st.y - st.oy;
    const d = Math.hypot(dx, dy);
    const k = d > maxR ? maxR / d : 1;
    roughCircle(ctx, x + dx * k, y + dy * k, 12, color, COL.ink, 1.6, 10);
  }
}

function drawTouchUI() {
  if (!Input.touch) return;
  drawStick(Input.sticks.move, 46, 72, VH - 60, COL.blue);
  drawStick(Input.sticks.aim, 40, VW - 96, VH - 60, COL.red);

  const ready = player.dashCd <= 0;
  roughCircle(ctx, DASH_BTN.x, DASH_BTN.y, DASH_BTN.r, ready ? '#f5c542' : '#efe3c8', COL.ink, 2, 10);
  text('冲刺', DASH_BTN.x, DASH_BTN.y - 5, 9, COL.ink, 'center', true);
}

function drawHUD() {
  for (let i = 0; i < player.maxHp; i++) {
    doodleHeart(ctx, 14 + i * 13, 25, 5, i < player.hp ? COL.red : '#e6dcc6', COL.ink, 1.2);
  }

  const w = WEAPONS[player.weapon];
  text(w.name, 22, 33, 11, COL.ink);
  roughLine(ctx, 22, 47, 22 + w.name.length * 11, 47, w.color, 2);

  roughCircle(ctx, 13, 57, 4.5, COL.goldLight, COL.ink, 1.2, 8);
  text('× ' + player.coins, 21, 50, 11, COL.ink);

  drawMinimap();

  if (room && room.type === 'boss') {
    let boss = null;
    for (const e of room.enemies) if (e.type === 'boss' && !e.dead) { boss = e; break; }
    if (boss) {
      const bw = 200;
      const bx = (VW - bw) / 2;
      roughBox(ctx, bx - 3, 5, bw + 6, 14, '#fffdf8', COL.ink, 1.6);
      if (boss.hp > 0) {
        const fw = (bw - 4) * clamp(boss.hp / boss.maxHp, 0, 1);
        roughBox(ctx, bx - 1, 7, fw, 10, COL.red, null, 0);
      }
      text('史莱姆王', VW / 2, 8, 9, COL.ink, 'center', true);
    }
  }

  if (state === 'play') {
    drawPauseButton();
    drawTouchUI();
  }

  if (toastMsg) {
    ctx.globalAlpha = Math.min(1, toastMsg.t * 2);
    const tw = toastMsg.msg.length * 12 + 22;
    roughBox(ctx, VW / 2 - tw / 2, 244, tw, 22, '#fffdf8', COL.ink, 1.6);
    text(toastMsg.msg, VW / 2, 249, 12, COL.ink, 'center', true);
    ctx.globalAlpha = 1;
  }
}

// ---- 覆盖层 ----
function panel(bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VW, VH);
}

function drawOverlays() {
  if (state === 'paused') {
    panel('rgba(253,246,228,0.90)');
    text('暂 停', VW / 2, 112, 26, COL.ink, 'center', true, -0.02);
    text('点击屏幕 / 按 P 继续', VW / 2, 152, 11, COL.inkSoft, 'center');
  } else if (state === 'dead') {
    panel('rgba(253,246,228,0.92)');
    text('你 倒 下 了', VW / 2, 84, 28, COL.red, 'center', true, 0.015);
    text('击杀 ' + stats.kills + '   ·   金币 ' + stats.coins + '   ·   得分 ' + score(), VW / 2, 132, 11, COL.ink, 'center');
    text('用时 ' + stats.time.toFixed(1) + ' 秒', VW / 2, 152, 10, COL.inkSoft, 'center');
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      text('点击 / 按任意键 重新开始', VW / 2, 194, 12, COL.ink, 'center', true);
    }
  } else if (state === 'win') {
    panel('rgba(253,246,228,0.92)');
    text('通 关 ！', VW / 2, 80, 30, COL.orange, 'center', true, -0.015);
    doodleStar(ctx, VW / 2 - 92, 96, 9, COL.gold, 2);
    doodleStar(ctx, VW / 2 + 92, 96, 9, COL.gold, 2);
    text('你击败了史莱姆王', VW / 2, 126, 12, COL.ink, 'center');
    text('击杀 ' + stats.kills + '   ·   金币 ' + stats.coins + '   ·   得分 ' + score(), VW / 2, 150, 11, COL.ink, 'center');
    text('用时 ' + stats.time.toFixed(1) + ' 秒', VW / 2, 168, 10, COL.inkSoft, 'center');
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      text('点击 / 按任意键 再来一局', VW / 2, 204, 12, COL.ink, 'center', true);
    }
  }
}

// ---- 标题 ----
function drawTitle() {
  const now = performance.now() / 1000;
  const g = ctx;

  g.drawImage(getPaper(), 0, 0);

  // 太阳
  roughCircle(g, 62, 52, 17, '#f5c542', COL.ink, 2, 10);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    roughLine(g, 62 + Math.cos(a) * 23, 52 + Math.sin(a) * 23, 62 + Math.cos(a) * 31, 52 + Math.sin(a) * 31, COL.ink, 1.6);
  }
  // 云
  roughCircle(g, 430, 44, 11, '#ffffff', COL.ink, 1.6, 9);
  roughCircle(g, 445, 46, 13, '#ffffff', COL.ink, 1.6, 9);
  roughCircle(g, 460, 45, 9, '#ffffff', COL.ink, 1.6, 9);
  // 星星
  doodleStar(g, 110, 96, 5, COL.gold, 1.4);
  doodleStar(g, 402, 92, 4, COL.gold, 1.3);
  doodleStar(g, 486, 110, 5, COL.red, 1.4);

  // 角色排排站
  const demo = [
    { type: 'player', x: 168, y: 146 },
    { type: 'slime', x: 214, y: 150 },
    { type: 'bat', x: 256, y: 142 },
    { type: 'shooter', x: 296, y: 148 },
    { type: 'boss', x: 352, y: 144 },
  ];
  for (const c of demo) {
    const bob = Math.sin(now * 2 + c.x * 0.05) * 3;
    if (c.type === 'player') {
      drawHero(c.x, c.y + bob, Math.sin(now) * 0.6, 1);
    } else {
      const def = ENEMY_DEF[c.type];
      const dummy = {
        type: c.type, x: c.x, y: c.y + bob, r: def.r,
        hp: 1, maxHp: 1, speed: 0, contact: 0, color: def.color, dark: def.dark,
        dead: false, t: now, phase: c.x * 0.1, flash: 0, fireCd: 0, summonCd: 0, kx: 0, ky: 0,
      };
      roughEllipse(g, dummy.x, dummy.y + dummy.r * 0.85, dummy.r * 0.85, dummy.r * 0.3, 'rgba(58,48,38,0.10)', null, 0, 8);
      drawEnemyBody(dummy);
    }
  }

  // 标题：一个字一个字写，稍微歪一点
  const titleChars = ['元', '气', '地', '牢'];
  const titleColors = [COL.red, COL.blue, COL.green, COL.orange];
  for (let i = 0; i < titleChars.length; i++) {
    text(titleChars[i], VW / 2 - 66 + i * 44, 30 + (i % 2 === 0 ? 2 : -2), 38, titleColors[i], 'center', true, (i % 2 === 0 ? -1 : 1) * 0.05);
  }
  roughLine(g, VW / 2 - 96, 78, VW / 2 + 96, 76, COL.ink, 2);

  text('SOUL KNIGHT 风格 · 手绘蜡笔版', VW / 2, 86, 10, COL.inkSoft, 'center');

  text('键鼠    WASD 移动 · 鼠标瞄准 · 左键射击 · 空格冲刺', VW / 2, 186, 9, COL.inkSoft, 'center');
  text('手柄    左摇杆移动 · 右摇杆瞄准 · RT 射击 · A 冲刺', VW / 2, 201, 9, COL.inkSoft, 'center');
  text('触屏    左半屏移动 · 右半屏瞄准射击 · DASH 冲刺', VW / 2, 216, 9, COL.inkSoft, 'center');

  if (Math.floor(now * 2) % 2 === 0) {
    text('点 击 开 始', VW / 2, 240, 14, COL.red, 'center', true, -0.02);
  }
  text('最高分 ' + best, VW / 2, 266, 9, COL.inkSoft, 'center');
  text('prototype v0.2', VW - 8, VH - 13, 8, COL.inkSoft, 'right');
}

// ---- 每帧 ----
function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#fdf6e4';
  ctx.fillRect(0, 0, VW, VH);

  if (state === 'title') {
    drawTitle();
    return;
  }

  // 8fps 换一次手绘种子，制造轻微的“逐帧抖动”
  RD = makeRng((Math.floor(performance.now() / 125) * 2654435761) >>> 0);

  const k = shake.t > 0 ? shake.t / Math.max(0.001, shake.dur) : 0;
  const sx = k ? rnd(-1, 1) * shake.mag * k : 0;
  const sy = k ? rnd(-1, 1) * shake.mag * k : 0;

  ctx.save();
  ctx.translate(sx, sy);
  if (room.art) ctx.drawImage(room.art, 0, 0);
  drawDoors();
  drawPickups();
  drawEnemies();
  drawPlayer();
  drawBullets();
  drawParticles();
  ctx.restore();

  drawHUD();
  drawOverlays();
}

// =============================================================
// 8. 主循环
// =============================================================
function startRun(seed) {
  const s = seed == null ? (Date.now() ^ 0x9e3779b9) >>> 0 : seed >>> 0;
  R = mulberry32(s);
  const start = genFloor();

  clearBullets();
  bulletPool.length = 0;
  particles.length = 0;
  particlePool.length = 0;
  player = makePlayer();
  stats = { kills: 0, coins: 0, time: 0 };
  winTimer = 0;
  toastMsg = null;
  shake.t = 0;
  shake.dur = 0;
  shake.mag = 0;
  Input.dash = false;
  state = 'play';

  enterRoom(start, 'start');
  showToast('找到 Boss 房间并击败它', COL.text, 2.2);

  if (params.has('arena') || params.has('boss')) debugJump();
}

function debugJump() {
  const flat = [];
  for (const row of cells) for (const c of row) flat.push(c);

  if (params.has('boss')) {
    const b = flat.find((c) => c.type === 'boss');
    if (b) { enterRoom(b, 'start'); return; }
  }
  const cs = flat.filter((c) => c.type === 'combat');
  if (cs.length) enterRoom(cs[Math.floor(cs.length / 2)], 'start');
}

function togglePause() {
  if (state === 'play') state = 'paused';
  else if (state === 'paused') state = 'play';
}

function update(dt) {
  pollPad();

  if (toastMsg) {
    toastMsg.t -= dt;
    if (toastMsg.t <= 0) toastMsg = null;
  }
  if (shake.t > 0) shake.t = Math.max(0, shake.t - dt);

  if (state === 'play') {
    stats.time += dt;
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateParticles(dt);
    tryDoors();
    Input.dash = false;

    if (winTimer > 0) {
      winTimer -= dt;
      if (winTimer <= 0) win();
    }
  } else {
    updateParticles(dt * 0.5);
  }
}

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

// ---------------- 启动 ----------------
resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

requestAnimationFrame(frame);
if (params.has('arena') || params.has('boss')) {
  startRun(20261116);
}

// 调试接口：控制台里 __sk.player / __sk.enemies 可以直接看数值、调参数
window.__sk = {
  get state() { return state; },
  get player() { return player; },
  get room() { return room; },
  get enemies() { return room ? room.enemies : []; },
  get bullets() { return bullets; },
  get cells() { return cells; },
  get stats() { return stats; },
  start(seed) { startRun(seed); },
  jump(type) {
    if (!cells.length) return null;
    const flat = [];
    for (const row of cells) for (const c of row) flat.push(c);
    const hit = flat.find((c) => c.type === type && c !== room);
    if (hit) enterRoom(hit, 'start');
    return hit || null;
  },
};
})();
