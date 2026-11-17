#!/usr/bin/env bash
# 把 Web 版的 game.js 同步到小游戏（保持两边逻辑完全一致）
set -e
cd "$(dirname "$0")"
cp ../soul-knight-proto/game.js src/game.js
echo "synced: src/game.js <- ../soul-knight-proto/game.js ($(wc -l < src/game.js) 行)"
