/**
 * 微信小游戏适配层
 * ------------------------------------------------------------
 * Web 版 game.js 用的是浏览器 API（document / canvas / pointer / localStorage /
 * AudioContext / requestAnimationFrame）。小游戏里没有 DOM，这一层负责把它们
 * 映射到 wx.* 上，让 game.js 一行都不用改。
 *
 * 关键点：
 *   1. 主画布固定为「屏幕物理像素」，游戏画面按 512x288 等比缩放并居中（黑边）。
 *   2. 拦截 ctx.setTransform，把游戏自己算的缩放换成适配层算好的缩放 + 偏移。
 *   3. 触摸事件转成 pointer 事件（pointerType: 'touch'），坐标用 clientX/clientY。
 */
(function () {
  'use strict';

  var G = typeof globalThis !== 'undefined' ? globalThis : this;
  var wx = G.wx;
  if (!wx) return;

  var info = wx.getSystemInfoSync();
  var DPR = info.pixelRatio || 1;
  var CSS_W = info.windowWidth || info.screenWidth || 375;
  var CSS_H = info.windowHeight || info.screenHeight || 667;
  var PX_W = Math.round(CSS_W * DPR);
  var PX_H = Math.round(CSS_H * DPR);

  // 游戏的逻辑分辨率
  var LW = 512;
  var LH = 288;

  var screenCanvas = wx.createCanvas();
  screenCanvas.width = PX_W;
  screenCanvas.height = PX_H;

  var ctx = screenCanvas.getContext('2d');

  var scale = Math.min(PX_W / LW, PX_H / LH);
  var offX = (PX_W - LW * scale) / 2;
  var offY = (PX_H - LH * scale) / 2;

  // 拦截 setTransform：游戏每次渲染都会调用它，这里换成适配层的变换
  var rawSetTransform = ctx.setTransform ? ctx.setTransform.bind(ctx) : null;
  if (rawSetTransform) {
    ctx.setTransform = function () {
      rawSetTransform(1, 0, 0, 1, 0, 0);
      var prev = ctx.fillStyle;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, PX_W, PX_H);
      ctx.fillStyle = prev;
      rawSetTransform(scale, 0, 0, scale, offX, offY);
    };
  }

  var listeners = {};
  var mainCanvas = {
    get width() { return PX_W; },
    set width(v) { /* 保持全屏画布，忽略游戏的设置 */ },
    get height() { return PX_H; },
    set height(v) { /* 同上 */ },
    style: { width: CSS_W + 'px', height: CSS_H + 'px' },
    getContext: function () { return ctx; },
    addEventListener: function (type, fn) { listeners[type] = fn; },
    removeEventListener: function (type, fn) { if (listeners[type] === fn) delete listeners[type]; },
    setPointerCapture: function () {},
    getBoundingClientRect: function () {
      return {
        left: offX / DPR,
        top: offY / DPR,
        width: (LW * scale) / DPR,
        height: (LH * scale) / DPR,
        right: (offX + LW * scale) / DPR,
        bottom: (offY + LH * scale) / DPR,
      };
    },
  };

  var rectCache = null;
  function gameRect() {
    if (!rectCache) {
      rectCache = {
        left: offX / DPR,
        top: offY / DPR,
        width: (LW * scale) / DPR,
        height: (LH * scale) / DPR,
      };
    }
    return rectCache;
  }

  function fire(type, touch) {
    var fn = listeners[type];
    if (!fn) return;
    // 手指落在黑边上时夹回游戏区域，保证摇杆始终可见
    var r = gameRect();
    var cx = Math.min(Math.max(touch.clientX, r.left + 1), r.left + r.width - 1);
    var cy = Math.min(Math.max(touch.clientY, r.top + 1), r.top + r.height - 1);
    fn({
      pointerId: touch.identifier,
      pointerType: 'touch',
      clientX: cx,
      clientY: cy,
      button: 0,
      preventDefault: function () {},
      stopPropagation: function () {},
    });
  }

  if (wx.onTouchStart) {
    wx.onTouchStart(function (e) { for (var i = 0; i < e.changedTouches.length; i++) fire('pointerdown', e.changedTouches[i]); });
  }
  if (wx.onTouchMove) {
    wx.onTouchMove(function (e) { for (var i = 0; i < e.changedTouches.length; i++) fire('pointermove', e.changedTouches[i]); });
  }
  if (wx.onTouchEnd) {
    wx.onTouchEnd(function (e) { for (var i = 0; i < e.changedTouches.length; i++) fire('pointerup', e.changedTouches[i]); });
  }
  if (wx.onTouchCancel) {
    wx.onTouchCancel(function (e) { for (var i = 0; i < e.changedTouches.length; i++) fire('pointercancel', e.changedTouches[i]); });
  }

  // ---------------- document ----------------
  var doc = G.document;
  if (!doc) {
    doc = {};
    G.document = doc;
  }
  doc.getElementById = function (id) { return id === 'game' ? mainCanvas : null; };
  var rawCreateElement = doc.createElement ? doc.createElement.bind(doc) : null;
  doc.createElement = function (tag) {
    if (tag === 'canvas') return wx.createCanvas();
    return rawCreateElement ? rawCreateElement(tag) : {};
  };
  doc.addEventListener = function () {};
  doc.removeEventListener = function () {};

  // ---------------- window ----------------
  if (!G.window) G.window = G;
  var win = G.window;

  var winListeners = {};
  win.addEventListener = function (type, fn) {
    (winListeners[type] = winListeners[type] || []).push(fn);
  };
  win.removeEventListener = function (type, fn) {
    var arr = winListeners[type];
    if (!arr) return;
    var i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  };
  function fireWindow(type) {
    var arr = winListeners[type];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) arr[i]({ type: type });
  }

  try { win.innerWidth = CSS_W; } catch (e) { /* ignore */ }
  try { win.innerHeight = CSS_H; } catch (e) { /* ignore */ }
  try { win.devicePixelRatio = DPR; } catch (e) { /* ignore */ }

  if (wx.onHide) wx.onHide(function () { fireWindow('blur'); });
  if (wx.onShow) wx.onShow(function () { fireWindow('focus'); });

  // ---------------- 其它浏览器 API ----------------
  if (!G.localStorage) {
    G.localStorage = {
      getItem: function (k) {
        try { var v = wx.getStorageSync(k); return v === '' || v === undefined ? null : v; } catch (e) { return null; }
      },
      setItem: function (k, v) {
        try { wx.setStorageSync(k, String(v)); } catch (e) { /* ignore */ }
      },
    };
  }

  if (!G.performance || !G.performance.now) {
    G.performance = { now: function () { return Date.now(); } };
  }

  if (!G.location) G.location = { search: '' };
  if (!G.navigator) G.navigator = {};

  if (typeof G.URLSearchParams !== 'function') {
    G.URLSearchParams = function (search) {
      this.map = {};
      var s = String(search || '').replace(/^\?/, '');
      if (!s) return;
      var parts = s.split('&');
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split('=');
        this.map[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      }
    };
    G.URLSearchParams.prototype.has = function (k) { return Object.prototype.hasOwnProperty.call(this.map, k); };
    G.URLSearchParams.prototype.get = function (k) { return this.has(k) ? this.map[k] : null; };
  }

  // 微信基础库较新版本才有 WebAudio；没有就走静音
  if (!G.AudioContext && wx.createWebAudioContext) {
    G.AudioContext = function () { return wx.createWebAudioContext(); };
    G.webkitAudioContext = G.AudioContext;
  }

  if (!G.requestAnimationFrame) {
    G.requestAnimationFrame = function (cb) {
      return setTimeout(function () { cb(G.performance.now()); }, 16);
    };
    G.cancelAnimationFrame = function (id) { clearTimeout(id); };
  }

  // 方便调试：__sk 由 game.js 挂到 window 上
  G.__skLayout = function () {
    return { width: PX_W, height: PX_H, scale: scale, offsetX: offX, offsetY: offY, dpr: DPR };
  };
})();
