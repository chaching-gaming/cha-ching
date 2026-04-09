#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  echo "❌ Docker is not installed. Install Docker Desktop first."
  exit 1
fi

if ! docker info &>/dev/null; then
  echo "❌ Docker is not running. Start Docker Desktop first."
  exit 1
fi

if ! command -v supabase &>/dev/null; then
  echo "❌ Supabase CLI is not installed. Run: brew install supabase/tap/supabase"
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  echo "❌ pnpm is not installed. Run: corepack enable && corepack prepare pnpm@10 --activate"
  exit 1
fi

echo "==> Installing dependencies..."
pnpm install

echo "==> Starting Supabase..."
supabase start

echo "==> Extracting Supabase keys..."
SUPABASE_URL=$(supabase status --output json | grep -o '"API_URL":"[^"]*"' | cut -d'"' -f4)
SUPABASE_ANON_KEY=$(supabase status --output json | grep -o '"ANON_KEY":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "⚠️  Could not extract keys automatically. Run 'supabase status' and fill .env.local manually."
else
  ENV_FILE="$ROOT_DIR/apps/mobile/.env.local"
  cat > "$ENV_FILE" <<EOF
EXPO_PUBLIC_SUPABASE_URL=$SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
EXPO_PUBLIC_ENV=development
EOF
  echo "==> Created apps/mobile/.env.local"
fi

echo "==> Applying migrations..."
supabase db reset

echo "==> Generating TypeScript types..."
pnpm db:gen-types

echo ""
echo "✅ Setup complete! Run 'pnpm --filter mobile start' to launch the app."
