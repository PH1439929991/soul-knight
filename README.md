# 元气地牢 · 蜡笔手绘版

一个 Soul Knight 风格的 2D 地牢射击游戏，纯 Canvas 2D 实现——**没有游戏引擎，也没有一张美术素材**。
所有画面（纸张纹理、抖动的蜡笔线条、角色、UI）都是代码画出来的。

在线试玩：**https://soul-knight.pages.dev**

## 目录

| 目录 | 说明 |
|---|---|
| [`soul-knight-proto/`](soul-knight-proto/) | H5 版，电脑 / 手机浏览器直接玩，键鼠 / 手柄 / 触屏三套操作 |
| [`soul-knight-minigame/`](soul-knight-minigame/) | 微信小游戏版，复用同一份 `game.js`，只加了一层 `wx` 适配层 |
| [`paper-survivors/`](paper-survivors/) | 幸存者类原型（P1），自动攻击 + 升级三选一 + Boss |

## 本地运行

```bash
# 电脑：直接打开
open soul-knight-proto/index.html

# 手机：同一 Wi-Fi 下
cd soul-knight-proto && ./serve.sh
```

## 部署

Cloudflare Pages 连接本仓库，每次 push 自动部署：

- Root directory：`soul-knight-proto`
- Build command：`bash pack.sh`
- Build output directory：`dist`

## 玩法

随机迷宫 → 清怪开门 → 宝藏房 → Boss 房 → 通关。4 把武器、4 种敌人、冲刺无敌帧、小地图。

操作：

- 键鼠：WASD 移动 · 鼠标瞄准 · 左键射击 · 空格冲刺 · P 暂停
- 手柄：左摇杆移动 · 右摇杆瞄准 · RT 射击 · A 冲刺
- 触屏：左半屏移动 · 右半屏瞄准射击 · 右下角冲刺
