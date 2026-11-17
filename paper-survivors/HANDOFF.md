# 交接文档 · HANDOFF

> 给下一个接手的人（或 AI）看的上下文。**先读这份，再读 DESIGN.md，最后看 game.js。**
> 最后更新：2026-11-17

---

## 1. 这是什么

「纸片幸存者 · Paper Survivors」——类吸血鬼幸存者的手绘风 2D 生存游戏。
**纯 Canvas 2D，零引擎、零图片素材**，所有画面（纸纹、蜡笔线条、角色、UI）都是代码画的。

- 线上：https://paper-survivors.pages.dev
- 仓库：https://github.com/PH1439929991/soul-knight （H5 版在 `paper-survivors/`）
- 本地跑：`cd paper-survivors && python3 -m http.server 8080` → http://localhost:8080

---

## 2. 目录结构

```
paper-survivors/
  index.html      页面外壳（canvas + 竖屏提示）
  game.js         全部游戏逻辑（约 1500 行，单文件）
  README.md       玩家向说明 + 功能清单
  DESIGN.md       设计文档（36 关 / 武器 / 附魔 / 地图 / 平衡曲线）
  HANDOFF.md      ← 本文件
  shots/          截图
soul-knight-proto/     另一个项目（元气地牢，地牢 roguelike）
soul-knight-minigame/  上面那个的微信小游戏版
```

`paper-survivors` 与另外两个项目**互不依赖**，可以单独拷走开发。

---

## 3. 怎么跑 / 怎么部署

**本地**
```bash
cd paper-survivors
python3 -m http.server 8080   # 或直接双击 index.html
```

**部署（Cloudflare Pages，直接上传）**
```bash
cd paper-survivors
npx wrangler pages deploy . --project-name=paper-survivors --branch=main --commit-dirty=true
```
需要 Cloudflare API Token（权限：Account → Cloudflare Pages → Edit）。
项目 `paper-survivors` 已存在，重复部署链接不变。

> 注意：本仓库 `paper-survivors` 在 Cloudflare 上是「直接上传」类型，不是 Git 自动部署。

---

## 4. 代码结构（game.js 单文件，按段阅读）

| 行段 | 内容 |
|---|---|
| 1. 常量/工具 | `VW=640 VH=360`、`WORLD=3000x2000`、`COL` 色板、`clamp/rnd/dist/makeRng` |
| 2. 画布 | `resize()` 自适应 + `toLogical()` 坐标换算 |
| 3. 手绘基元 | `roughCircle/roughBox/roughEllipse/roughLine/doodleStar/doodleHeart/text`、`tint()`、`getPaperTile(map)` 每张地图一张纸纹（缓存） |
| 4. 输入 | 键盘 `keys`、触屏摇杆 `Input.stick` |
| 5. 游戏状态 | 见下 |
| 6. 渲染 | `render()` → `drawGround` `drawHazards` 实体 `drawMapFrame` `drawHUD` `drawOverlays` |
| 7. 主循环 | 固定步长 1/60，`update(STEP)` + `render()` |

### 关键状态（第 5 段顶部）

```js
state: 'menu'|'play'|'levelup'|'paused'|'dead'|'win'
runMode: 'story'|'endless'
levelIdx: 0 起，story 到 35（36 关）
currentMap: MAPS[i]（每关按 levelIdx 选，无尽随机）
player: {hp,maxHp,speed,inv,magnet,level,xp,xpNeed,shield,shieldMax,shieldRegen,aim}
weapons: [{id,level,timer}] 最多 4 把
ench: {boom,frost,deflect,pierce} 附魔等级
statLevels/dmgMul/atkSpeedMul 属性加成
hazards: 活跃危险物（zone/bolt/tumble）
fields: 静态地形（bush/mire）
```

### 关卡流程

```
startGame(mode) → newRun() → startLevel()
startLevel(): 重置本关敌人/计时，保留 build；按 levelIdx 选 currentMap；initFields()
update(): 时间到 120s 或 90 杀（≥60s）→ 若 (levelIdx+1)%4===0 刷 Boss，否则 completeLevel()
击杀 Boss → levelClear → nextLevel() → levelIdx++ → startLevel()
剧情 36 关打完 → state='win'；无尽则一直继续
```

### 武器（WEAPON_DEFS）

`pencil` 铅笔 / `slingshot` 弹弓(散射) / `knife` 美工刀(近战扇形) / `bubble` 护盾泡泡(护盾+弹反)
远程 `kind:'ranged'`、近战 `'melee'`、增益 `'support'`。升级卡走 `buildCards()`。

### 地图机制（MAPS[].mech）

`bush` 灌木减速怪 / `mire` 泥潭减速怪 / `zone` 预警爆炸圈 / `rain` 火雨 / `bolt` 天雷劈怪 / `tumble` 风滚草 / `tide` 浪潮 / `four` 四象轮转。
新增机制：在 `spawnMechanic()` 加分支，`updateHazards()` 加更新，`drawHazards()` 加渲染。

### Boss 招式（BOSS_ATTACKS）

按地图分配攻击序列，`updateBoss()` 每 2.4 秒轮换一次：
`ring` 弹幕 / `burst` 连射 / `spiral` 螺旋 / `summon` 召唤 / `rain` 落火 / `bolt` 天雷 / `charge` 冲撞。
改招式改 `BOSS_ATTACKS` 和 `doBossAttack()`。

---

## 5. 调参位置（很快就能改）

| 想改 | 位置 |
|---|---|
| 玩家速度/血量/拾取 | `newRun()` 里的 player 初始化 |
| 武器伤害/射速/射程 | `WEAPON_DEFS` |
| 敌人血量/伤害/速度 | `enemyDef()` |
| 难度倍率 | `DIFFS` |
| 敌人随时间变强 | `hpScale()`（当前 1+t/110） |
| 每关敌人变强 | `levelMult()`（1.10^levelIdx） |
| Boss 血量 | `spawnBoss()`（1500 × diff × bossMult） |
| 升级曲线 | `levelUpCheck()` 里的 xpNeed 公式 |
| 关卡时长/配额 | `BOSS_TIME` / `KILL_QUOTA` |
| 地图机制频率 | `MAPS[].interval` |
| 手绘抖动强度 | `wob()` 的幅度、`render()` 里 `RD = makeRng(.../125)` 的频率 |

---

## 6. 调试接口（浏览器控制台）

```js
__ps.state / __ps.player / __ps.enemies / __ps.time
__ps.weapons / __ps.upgrades / __ps.gold?  (无金币)
__ps.currentMap / __ps.level / __ps.runMode
__ps.start()             // 重开一局（当前模式）
__ps.jumpLevel(12)       // 直接跳到第 12 关
__ps.setTime(120)        // 快进
__ps.addXp(50)           // 触发升级
__ps.spawnBoss()
__ps.give('knife')       // 直接给武器
__ps.setEnch('boom', 2)  // 直接给附魔
__ps.setDifficulty('easy')
__ps.forceWin() / __ps.forceDead()
__ps.fields / __ps.hazards / __ps.fourPhase
```

---

## 7. 当前完成度

**已做**
- 核心循环：自动攻击、经验、升级三选一、7 种怪、精英、Boss、死亡/通关结算
- 4 武器槽 + 4 武器 + 4 附魔 + 6 属性卡
- 三档难度（简单/精英/冒险家）
- 剧情 36 关（9 地图 × 4 关，每 4 关 Boss），build 跨关保留
- 无尽模式（随机地图，每 4 关 Boss）
- 9 张地图各有机制（溜怪）
- 9 个 Boss 有各自招式序列，名字用希腊神话
- HUD 紧凑版 + 地图风格边框
- 手绘风全套

**没做 / 待办（按优先级）**
1. **存档**：现在退出就丢进度（DESIGN.md 有方案）
2. **平衡**：机制伤害、Boss 血量、升级速度都没跑过模拟器
3. **视觉**：新怪（喷墨者/分裂墨/跳跳纸）和部分机制是程序化简笔，可再打磨
4. **内容**：武器/附魔池还可以扩（DESIGN.md 里有 16 武器 + 8 融合的规划）
5. **音效**：目前完全没有声音
6. **手机适配**：触屏摇杆已有，但没在真机上验证过

---

## 8. 已知坑

- 所有绘制都是程序化路径，**没有图片资源**；改画风只需要改第 3 段基元
- `getPaperTile(map)` 有缓存（`paperTiles[map.id]`），改纸纹后要刷新页面
- 敌人没有寻路，直线追 + 分离力，会被地形/机制卡住（这是有意的）
- `damageEnemy` 可能在遍历敌人时触发分裂（splitter），遍历用倒序或允许跳过
- 主循环固定 1/60 步长，`dt` 上限 0.25，掉帧不会加速
- 部署用直接上传，不是 Git 自动部署

---

## 9. 设计文档

- `DESIGN.md`：完整设计（36 关结构、地图、武器池、附魔、平衡公式、成长曲线）
- `README.md`：玩家向说明

设计原则：**成长曲线要能拉开差距**——好 build 靠协同和融合超线性增长，乱选 8–12 关被敌人血量曲线甩开。
