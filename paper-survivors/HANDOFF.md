# 交接文档 · HANDOFF

> 给下一个接手的人（或 AI）看的上下文。**先读这份，再读 DESIGN.md，最后看 game.js。**
> 最后更新：2026-11-18

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
  index.html      页面外壳（canvas + 横竖屏自适应 + 全屏入口）
  game.js         全部游戏逻辑（约 1500 行，单文件）
  design/         v1 角色、HUD、地图风格稿与视觉规范
  README.md       玩家向说明 + 功能清单
  DESIGN.md       设计文档（44 关 / 武器 / 附魔 / 地图 / 平衡曲线）
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

**部署（Cloudflare Pages，Git 自动部署）**

提交并推送 `main` 分支后，Cloudflare Pages 会从 `paper-survivors/` 自动重新部署，线上链接保持为 `https://paper-survivors.pages.dev`。

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
levelIdx: 0 起，story 到 43（44 关）
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
剧情 44 关打完 → state='win'；无尽则一直继续
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
- 4 武器槽 + 9 武器 + 5 被动道具 + 5 类互斥主附魔 + 7 类可叠加辅助附魔 + 7 属性卡
- 三档难度（简单/精英/冒险家）
- 剧情 44 关（11 地图 × 4 关，每 4 关 Boss），build 跨关保留
- 故事主线为“救母亲”：`STORY_PROLOGUE` 与 `CHAPTER_STORIES` 组成序章 + 11 张章节卡；每逢 `(levelIdx + 1) % 4 === 0` 的 Boss 关结束进入 `state='story'`，玩家确认后才执行 `nextLevel()`。终章卡确认后进入胜利页
- `BOSS_TITLES` / `BOSS_OBJECTIVES` 为每个 Boss 提供身份称号与当前寻母目标；`bossIntroT` 控制 Boss 登场横幅。调试可用 `&story=-1|0..10`
- 无尽模式（随机地图，每 4 关 Boss）
- 11 张地图各有机制（溜怪）
- 11 个 Boss 有各自招式序列；雪山保留北欧巨狼芬里尔，猩红之地由希腊战神阿瑞斯收尾
- 纸雕角色 v1：铅笔剑士 + 紫黑墨水敌人家族
- HUD v1：头像信息岛、生命/护盾/经验、图标武器槽、计时进度、Boss 条、图标升级卡
- 森林纸雕场景 v1：树冠、树桩、岩石、花朵与动态地形
- 手绘纸雕风全套
- 场景氛围动效（飘叶、尘卷、萤火、气泡、余烬、纸屑）与动态地形
- Web Audio 轻快循环背景音乐，支持主菜单按钮和 M 键开关
- 程序化攻击、受击、拾取、升级、Boss 与胜利提示音效
- 可编辑昵称，默认「艾志恒」，使用 localStorage 保存；Q 版昵称牌跟随角色移动
- 主页角色追随鼠标/触点视线，点击触发纸屑星芒、涟漪和角色弹跳反应
- 首页已恢复最初的纸张底纹、手绘太阳与星星装饰；`MENU_SEASONS_ENABLED = false`，因此四季图片不预加载、不随机展示，人物也不再绘制季节装扮。实验素材及绘制函数暂时保留，便于未来单独设计后再启用
- `menu-scenes.html` 是十一地图首页场景草案总览，十一个 iframe 通过 `?menuScene=<mapId>` 调用 `drawMenuSceneBackdrop()`：雪山增加冰峰/雪松/飘雪/风痕，猩红之地增加血月/枯枝/红雾；`drawMenuMapAccessory()` 只叠加配饰，不改变英雄与史莱姆基础造型；默认首页不会启用这些预览层
- 暂停菜单支持继续游戏与返回主页面；返回后通过 `suspendedRun` 保留完整内存战斗状态，主页可继续原局或重开
- `Music.tick()` 会按 `menu` / `game` 切换音乐场景；首页是 70 BPM 原创千禧年华语 R&B 月夜主题，由 `pluckNote()` 尼龙弦音色、七九和弦、下行低音、38ms 摇摆切分、轻鼓点与反馈延迟组成，不采样或复刻现有歌曲
- `MenuTrack` 会优先加载 `local-audio/menu-theme.mp3`，首页循环、进入战斗时 1.9 秒渐弱后暂停，返回首页时 0.9 秒渐入；加载失败则继续使用原创 Web Audio 主题。当前确认发布的音乐文件随仓库和 Cloudflare Pages 一并部署
- 手机竖屏已采用独立逻辑视口：宽度固定为 360，纵向按设备比例扩展至 560—780；人物尺寸不缩小，只减少横向视野。主菜单、HUD、升级三选一和暂停框均有竖屏排版，横屏继续使用 640×360
- 十一张地图均有差异化主题底纸、立体纸层地形与场景道具
- 后续地图均已补齐主题物件族；雪山复用冰晶/冰柱/积雪岩，猩红之地复用焦木/黑曜碑/血色晶体并改为对应色板
- 普通怪、精英与 Boss 使用 `enemyThemePalette()` / `drawEnemyThemeDetails()` 按当前地图切换色板、材质与附属特征；行为轮廓保持不变
- `drawAmbientScene()` 按地图绘制低透明度、低频率的边缘环境细节；`drawHazards()` 按机制改用日轮、裂隙、火焰、折线雷电、波墙等非通用圆形表现
- 火山与炼狱已拆分为自然熔岩和超自然深渊两套视觉；终局地图使用暗色四象、低频雷闪及常态弱显/雷光增强的巨物头颅与巨爪剪影
- 树木、岩台、石柱等实体障碍接入玩家与怪物碰撞；水洼/泥潭等机制地形保持可进入
- 战斗反馈 v1.1：玩家移动脚步纸屑、敌人受击闪白；玩家/精英/Boss 触发的分级震屏只平移地图环境层。`withInkSeed()` 为人物、怪物、HUD、升级卡、暂停框和外圈纸框固定手绘随机，避免非场景元素因 `RD` 重采样而抖动
- HUD 的 `drawMechanicStatus()` 仅在开局前 10 秒显示地图机制名称、常驻状态或触发倒计时，第 8—10 秒渐隐，随后完全移除
- `damageEnemy()` 会合并小于 1 点的持续伤害反馈，伤害仍逐帧结算，但飘字、音效和粒子约每 0.18 秒集中一次
- 暴击：`critChance` 初始 0.08，`critMult` 初始 1.75；「幸运星」每级 +0.07 暴击率，最多 5 级。远程在生成每枚子弹时独立判定，近战每次挥砍统一判定
- 武器 HUD：每个槽位包含主题色带、名称、等级徽章、冷却环/遮罩和就绪亮点；`drawBullet()` 按 `weaponId` 绘制铅笔、弹丸或通用弹体，`crit` 使用金色星芒
- `WEAPON_FORMS` / `WEAPON_FORM_TRAITS` / `weaponConfig()` 管理 9 把武器的 1—6 级形态链；3 级觉醒、6 级终极，升级卡直接展示下一形态和新增机制。新增长尺、蜡笔、回旋镖、橡皮炸弹、圆规；`ITEM_DEFS` 管理 5 个一次性被动道具
- 武器调试预览：`?map=forest&autostart=1&weapon=boomerang&weaponLevel=6`；升级卡预览可追加 `&levelup=1`
- 状态特效：`drawFrostStatus()` 根据 `e.slowT` 在普通怪/精英/Boss 上绘制冰壳、冰晶和雪花；`combatFx` / `drawCombatEffect()` 管理爆裂炸弹、纸花、冲击波与碎屑。调试分别使用 `&ench=frost` 或 `&ench=boom`
- `setEnchantment()` 统一处理主附魔互斥：`ward` / `poison` / `frost` / `boom` / `lightning` 五选一；升级池在选定后只保留当前主附魔的升级，不再推荐其他主附魔。守御结界使用独立再生值只拦远程攻击；雷罚封印由命中触发纵向落雷，对范围敌人造成雷伤并暂停移动、接触伤害和远程施法，普通怪禁锢时间随等级增长，Boss 使用缩短版控制
- 辅助附魔现含 `deflect` / `pierce` / `ricochet` / `split` / `leech` / `knockback` / `homing`；远程命中循环负责弹射、分裂与击退，子弹更新负责追踪，`damageEnemy()` 负责吸墨回血。可用 `&ench=homing,split,ricochet` 组合预览
- `ELITE_MYTHS` 为十一张地图配置精英名称、技能、射程与冷却；`castEliteSkill()` 负责三首噬弹、牛角重矛、谜阵十字、五首毒雨、触腕环射、双蛇熔痕、孵化援军、独眼天雷、四色轮转、寒风狼嚎和血月军阵。远程与近战精英交替登场但都会释放地图专属技能；调试可用 `&elite=ranged&cluster=1`
- `drawMythMinion()` / `drawMythBoss()` 已替换实机通用敌人轮廓；开发预览可用 `?map=forest&autostart=1&boss=1` 强制显示对应地图 Boss
- 战斗视觉 v1.2：`combat-gallery.html` / `combat-gallery.js` 是武器与怪物层级的动画审阅板；实机美工刀使用多层月牙斩与命中纸屑，远程怪拥有预警虚线/枪口星芒/墨弹，精英拥有金色徽章/血条/冲击环，Boss HUD 显示最近招式并在冲撞前绘制蓄力方向线
- `melee-ui.html` / `melee-ui.js` 是近战「斩」专项视觉提案：包含青刃普通斩、金刃暴击斩、墨裂终结斩三种可切换方案，以及蓄势/切开/命中停顿/纸屑收刀四段循环；当前用于确认设计，尚未把完整节奏同步到实机
- `myth-bestiary.html` / `myth-bestiary.js` 是希腊神话怪物家族设计页：每张地图同时包含对应 Boss、近战眷属、远程眷属和精英守卫，遵循“神话身份 > 地图材质 > 稀有度装饰”的轮廓规则；`game.js` 已通过 `drawMythMinion()` / `drawMythBoss()` 接入九图实机绘制，`?boss=1` 可配合地图预览参数强制刷出 Boss
- `ui-concept-original.html` / `ui-concept-original.js` 是当前原创 UI 世界观提案「折页猎记」：战斗发生在一本缝线手账中，生命=书脊红线、武器=页边书签、Boss 血量=整页封印。可点击右侧书签或按 1—4 切换招式。森林 Boss 使用刻耳柏洛斯三首/蛇尾原型、苔木/叶鬃/藤蔓材质，以及三首扑咬扇区与林门封印预警，作为后续九图 Boss 差异化的范例

**没做 / 待办（按优先级）**
1. **存档**：现在退出就丢进度（DESIGN.md 有方案）
2. **平衡**：机制伤害、Boss 血量、升级速度都没跑过模拟器
3. **视觉**：新怪（喷墨者/分裂墨/跳跳纸）和部分机制是程序化简笔，可再打磨
4. **内容**：武器/附魔池还可以扩（DESIGN.md 里有 16 武器 + 8 融合的规划）
5. **音频打磨**：背景音乐与战斗音效已程序化实现，后续可补混音、更多层次与独立素材
6. **真机 QA**：横竖屏布局和触控摇杆已在窄屏浏览器验证，仍建议补一轮 iPhone/Android 实机触控与安全区测试

---

## 8. 已知坑

- 所有绘制都是程序化路径，**没有图片资源**；改画风只需要改第 3 段基元
- `getPaperTile(map)` 有缓存（`paperTiles[map.id]`），改纸纹后要刷新页面
- 敌人没有寻路，直线追 + 分离力，会被地形/机制卡住（这是有意的）
- `damageEnemy` 可能在遍历敌人时触发分裂（splitter），遍历用倒序或允许跳过
- 主循环固定 1/60 步长，`dt` 上限 0.25，掉帧不会加速
- 推送 `main` 分支后由 Cloudflare Pages 自动部署 `paper-survivors/`

---

## 9. 设计文档

- `DESIGN.md`：完整设计（44 关结构、地图、武器池、附魔、平衡公式、成长曲线）
- `README.md`：玩家向说明

设计原则：**成长曲线要能拉开差距**——好 build 靠协同和融合超线性增长，乱选 8–12 关被敌人血量曲线甩开。
