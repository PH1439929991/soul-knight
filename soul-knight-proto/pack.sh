#!/usr/bin/env bash
# 打包成可直接上传静态托管的目录（只需要两个文件）
set -e
cd "$(dirname "$0")"
rm -rf dist
mkdir -p dist
cp index.html game.js dist/
echo "已生成 dist/ ："
ls -lh dist
echo ""
echo "本地预览："
echo "  cd dist && python3 -m http.server 8080"
echo "  浏览器打开 http://localhost:8080"
