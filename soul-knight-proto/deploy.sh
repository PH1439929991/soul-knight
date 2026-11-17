#!/usr/bin/env bash
# 重新打包并部署到 Cloudflare Pages
#
# 用法：
#   CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=yyy ./deploy.sh
#
# Token 权限只需要一条：Account → Cloudflare Pages → Edit
# 每次更新前现建一个（7 天有效期），用完删掉即可。
set -e
cd "$(dirname "$0")"

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ 缺少 CLOUDFLARE_API_TOKEN"
  echo ""
  echo "Cloudflare → My Profile → API Tokens → Create Token"
  echo "  权限：Account → Cloudflare Pages → Edit"
  echo "  过期：7 days"
  echo ""
  echo "然后："
  echo "  CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=yyy ./deploy.sh"
  exit 1
fi

./pack.sh

export CI=1
npx --yes wrangler@4 pages deploy dist \
  --project-name=soul-knight \
  --branch=main \
  --commit-dirty=true

echo ""
echo "✅ 部署完成，链接不变：https://soul-knight.pages.dev"
