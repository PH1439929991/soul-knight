#!/usr/bin/env bash
# 启动本地静态服务器，方便手机在同一 Wi-Fi 下访问
set -e
cd "$(dirname "$0")"
PORT="${1:-8080}"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<本机IP>')"
echo ""
echo "  本地访问:  http://localhost:$PORT"
echo "  手机访问:  http://$IP:$PORT   (需同一 Wi-Fi，建议横屏)"
echo ""
echo "  按 Ctrl+C 停止"
echo ""
exec python3 -m http.server "$PORT"
