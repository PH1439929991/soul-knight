// 微信小游戏入口：先装 DOM 适配层，再跑与 Web 版完全相同的游戏逻辑
require('./src/shim.js');
require('./src/game.js');
