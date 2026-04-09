# Cha-Ching

A social prop betting app where friends create private rooms, place friendly bets, and track results together.

## Tech Stack

- **Mobile:** React Native (Expo Router) with NativeWind (Tailwind CSS)
- **Backend:** Supabase (Auth, Postgres, Edge Functions, Storage)
- **State:** TanStack React Query + TanStack Form
- **Icons:** Phosphor React Native
- **Monorepo:** pnpm workspaces

## Structure

```
apps/mobile/     — Expo mobile app
packages/types/  — Shared TypeScript types
packages/utils/  — Shared utilities
supabase/        — Migrations, edge functions, config
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v24+
- [pnpm](https://pnpm.io/) v10+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- [Expo Go](https://expo.dev/go) on your phone (or iOS/Android simulator)

### Quick Start

```bash
./scripts/setup.sh
pnpm --filter mobile dev
```

### Manual Setup

```bash
pnpm install
supabase start
cp apps/mobile/.env.example apps/mobile/.env.local
# Fill in keys from `supabase status` output
supabase db reset
pnpm --filter mobile dev
```

## Scripts

| Command | Description |
|---|---|
| `pnpm --filter mobile dev` | Start Expo dev server |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm format` | Format all files with Prettier |
| `pnpm db:gen-types` | Regenerate TypeScript types from local DB |
| `supabase start` | Start local Supabase stack |
| `supabase db reset` | Reset local DB and apply migrations |
