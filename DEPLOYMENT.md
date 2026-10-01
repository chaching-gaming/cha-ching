# Cha-Ching Mobile App Deployment Guide

## Overview

| Component | Technology |
|-----------|-----------|
| Framework | Expo (React Native) - Managed Workflow |
| Build Service | EAS Build |
| Backend | Supabase |
| Authentication | Google OAuth, Apple OAuth |
| Transactional Email | Resend (free tier: 3,000/month) |
| Error Monitoring | Sentry |
| Push Notifications | Expo Notifications |
| CI/CD | GitHub Actions |

---

# Part 1: Account Setup

Create accounts on all required platforms before proceeding.

## 1.1 Expo Account

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo
eas login

# Link project (from apps/mobile)
cd apps/mobile
eas init
```

Note your **Expo Project ID** from the output.

## 1.2 Apple Developer Account ($99/year)

1. Go to https://developer.apple.com/programs/
2. Enroll in the Apple Developer Program
3. Wait for approval (24-48 hours)

Note your **Team ID** (10 characters) from the membership section.

## 1.3 Google Cloud Console

1. Go to https://console.cloud.google.com
2. Create a new project (e.g., `cha-ching`)
3. Note your **Project ID**

## 1.4 Google Play Developer Account ($25 one-time)

1. Go to https://play.google.com/console/signup
2. Create developer account
3. Complete identity verification (takes a few days)

## 1.5 Supabase Account

1. Go to https://supabase.com/dashboard
2. Create **staging** project: `cha-ching-staging`
3. Create **production** project: `cha-ching`

For each project, note from **Project Settings → API**:
- **Project URL**: `https://xxxx.supabase.co`
- **Anon Key**: `eyJhbGc...`
- **Project Ref**: `xxxxxxxxxxxx` (from Project Settings → General)

## 1.6 Sentry Account

1. Go to https://sentry.io
2. Create account or login
3. Create project: Platform **React Native**, name `cha-ching`
4. Note your **DSN** from Project Settings → Client Keys
5. Note your **Organization slug** from Settings

## 1.7 Resend Account (Email)

1. Go to https://resend.com
2. Create free account (3,000 emails/month)
3. You'll configure SMTP later in Part 2

---

# Part 2: Integrations Setup

## 2.1 Google OAuth

> **Important:** Google Sign-In for mobile apps requires **3 separate OAuth clients**:
> - **Web Application** - Used by Supabase + your app code
> - **Android** - Used by Google Play Services to verify your app
> - **iOS** - Used by Google SDK to verify your app

### Understanding the Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GOOGLE SIGN-IN FLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User taps "Sign in with Google"                                │
│           │                                                         │
│           ▼                                                         │
│  2. Google SDK checks: "Is this app legitimate?"                   │
│     ├── Android: Checks package name + SHA-1 fingerprint           │
│     │            (matches against Android Client)                  │
│     └── iOS: Checks bundle ID                                      │
│              (matches against iOS Client)                          │
│           │                                                         │
│           ▼                                                         │
│  3. Google returns ID Token (signed with Web Client ID)            │
│           │                                                         │
│           ▼                                                         │
│  4. App sends ID Token to Supabase                                 │
│           │                                                         │
│           ▼                                                         │
│  5. Supabase validates token using Web Client ID + Secret          │
│           │                                                         │
│           ▼                                                         │
│  6. User is authenticated!                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Which Client ID Goes Where?

| Client Type | Where It Goes | Purpose |
|-------------|---------------|---------|
| **Web Application** | `.env` file + Supabase Dashboard | Token signing & validation |
| **Android** | Google Cloud Console only (NOT in code) | Google verifies app identity via package name + SHA-1 |
| **iOS** | Google Cloud Console + `app.json` (URL scheme) | Google verifies app identity via bundle ID |

### Step 1: Configure OAuth Consent Screen

1. Go to **Google Cloud Console → APIs & Services → OAuth consent screen**
2. Select **External** → Create
3. Fill in:
   - App name: `Cha-Ching`
   - User support email: Your email
   - Developer contact: Your email
4. Click **Save and Continue**
5. Add scopes: `openid`, `email`, `profile`
6. Click **Save and Continue** through remaining steps
7. Add test users (your email) during development

### Step 2: Create Web Application Client

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Select **Web application**
4. Name: `Cha-Ching Web`
5. Add **Authorized redirect URIs**:
   ```
   https://your-staging-ref.supabase.co/auth/v1/callback
   https://your-prod-ref.supabase.co/auth/v1/callback
   ```
6. Click **Create**
7. **Save the Client ID and Client Secret**

### Step 3: Create Android Client

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Select **Android**
4. Name: `Cha-Ching Android`
5. **Package name**: `com.chaching` (must match `app.json`)
6. **SHA-1 certificate fingerprint**: Get from EAS:
   ```bash
   eas credentials --platform android
   ```
   Look for `SHA-1 Fingerprint` in the output (format: `AA:BB:CC:DD:...`)
7. Click **Create**

> **Note:** You may need multiple Android clients for different environments:
> - EAS development build (from `eas credentials`)
> - EAS production build (different keystore)
> - Local debug build (debug.keystore)

### Step 4: Create iOS Client

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Select **iOS**
4. Name: `Cha-Ching iOS`
5. **Bundle ID**: `com.chaching` (must match `app.json`)
6. Click **Create**
7. **Save the iOS Client ID** (needed for URL scheme)

### Step 5: Configure in Supabase

1. Go to **Supabase Dashboard → Authentication → Providers → Google**
2. Toggle **Enable**
3. Enter:
   - **Client ID**: Web Application Client ID (from Step 2)
   - **Client Secret**: Web Application Client Secret (from Step 2)
4. Click **Save**

### Step 6: Configure in Your App

Your `.env` file should have the **Web Client ID** (not Android/iOS):

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx-web.apps.googleusercontent.com
```

The app code uses this in `lib/oauth.ts`:
```typescript
GoogleSignin.configure({
  webClientId: env.googleWebClientId,  // Web Client ID
});
```

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `DEVELOPER_ERROR` (code 10) | SHA-1 mismatch or missing Android client | Add correct SHA-1 to Android client in Google Cloud |
| `SIGN_IN_CANCELLED` | User cancelled | Normal behavior |
| `NETWORK_ERROR` | No internet | Check connection |
| `invalid_grant` | Supabase config wrong | Verify Web Client ID + Secret in Supabase |

### Getting SHA-1 for Different Build Types

```bash
# EAS managed credentials (recommended)
eas credentials --platform android

# Local debug keystore (for expo run:android)
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# Production keystore (if self-managed)
keytool -list -v -keystore your-release-key.keystore -alias your-alias
```

### Summary Checklist

- [ ] OAuth consent screen configured
- [ ] Web Application client created
- [ ] Web Client ID + Secret added to Supabase
- [ ] Android client created with package `com.chaching`
- [ ] Android client has correct SHA-1 from `eas credentials`
- [ ] iOS client created with bundle `com.chaching`
- [ ] `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` set in `.env`

---

## 2.2 Apple OAuth (Native iOS Only)

> **Important:** This app uses the **native iOS flow** with `expo-apple-authentication` and `signInWithIdToken`.
> This is simpler than the web OAuth flow and does NOT require a Services ID, .p8 key, or client secret.
>
> The complex setup (Services ID, signing key, JWT secret) is only needed for:
> - Web apps using OAuth redirect flow
> - Android apps with Apple Sign-In
> - Flutter web apps

### Step 1: Create App ID with Sign in with Apple

1. Go to **Apple Developer → Certificates, Identifiers & Profiles → Identifiers**
2. Click **+** → Select **App IDs** → Continue → Select **App**
3. Fill in:
   - Description: `Cha-Ching`
   - Bundle ID (Explicit): `com.visualglobe.chaching`
4. In Capabilities, check **Sign in with Apple**
5. Click **Continue** → **Register**

### Step 2: Configure in Supabase

1. Go to **Supabase Dashboard → Authentication → Providers → Apple**
2. Toggle **Enable**
3. In **Authorized Client IDs**, add your bundle ID: `com.visualglobe.chaching`
4. Leave **Client ID** and **Client Secret** empty (not needed for native flow)
5. Click **Save**

### Step 3: Verify app.json Configuration

Ensure your `app.json` has Apple Sign-In enabled:

```json
{
  "expo": {
    "ios": {
      "usesAppleSignIn": true
    },
    "plugins": [
      "expo-apple-authentication"
    ]
  }
}
```

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NATIVE iOS APPLE SIGN-IN FLOW                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User taps "Sign in with Apple"                                 │
│           │                                                         │
│           ▼                                                         │
│  2. iOS shows native Apple Sign-In sheet                           │
│     (Face ID / Touch ID / Password)                                │
│           │                                                         │
│           ▼                                                         │
│  3. Apple returns identityToken (signed JWT)                       │
│           │                                                         │
│           ▼                                                         │
│  4. App calls: supabase.auth.signInWithIdToken({                   │
│       provider: 'apple',                                           │
│       token: identityToken                                         │
│     })                                                              │
│           │                                                         │
│           ▼                                                         │
│  5. Supabase validates token against Apple's public keys           │
│     (No client secret needed!)                                     │
│           │                                                         │
│           ▼                                                         │
│  6. User is authenticated!                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Summary Checklist

- [ ] App ID created with bundle ID `com.visualglobe.chaching`
- [ ] Sign in with Apple capability enabled on App ID
- [ ] Apple provider enabled in Supabase
- [ ] Bundle ID added to Supabase Authorized Client IDs
- [ ] `usesAppleSignIn: true` in app.json
- [ ] `expo-apple-authentication` plugin in app.json

### If You Need Web/Android Apple Sign-In Later

If you want to support Apple Sign-In on Android or web, you'll need the full OAuth setup:
1. Create a Services ID
2. Create a Signing Key (.p8 file)
3. Generate a JWT client secret (expires every 6 months!)
4. Configure the Services ID and secret in Supabase

See: https://supabase.com/docs/guides/auth/social-login/auth-apple

---

## 2.3 Transactional Email (Resend)

### Step 1: Add & Verify Domain

1. Go to **Resend Dashboard → Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `chaching.app`)
4. Add DNS records Resend provides:

| Type | Name | Value |
|------|------|-------|
| TXT | `@` | Resend verification code |
| TXT | `resend._domainkey` | DKIM record |
| TXT | `@` | SPF record (if not exists) |

5. Click **Verify** (usually takes a few minutes)

### Step 2: Get API Key

1. Go to **Resend Dashboard → API Keys**
2. Click **Create API Key**
3. Name: `Supabase SMTP`
4. Permission: **Full access**
5. Click **Create** and copy the key (only shown once!)

### Step 3: Configure in Supabase

1. Go to **Supabase Dashboard → Project Settings → Auth**
2. Scroll to **SMTP Settings** → Toggle **Enable Custom SMTP**
3. Enter:
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: Your API key (re_xxxxxxxxx)
   - **Sender email**: `noreply@yourdomain.com`
   - **Sender name**: `Cha-Ching`
4. Click **Save**

### Step 4: Test Email

1. Trigger a password reset in your app
2. Check email arrives correctly
3. Verify sender shows as `noreply@yourdomain.com`

---

## 2.4 Sentry Error Monitoring

### Step 1: Get Credentials

From your Sentry project:
- **DSN**: Project Settings → Client Keys (DSN)
- **Auth Token**: Settings → Developer Settings → Organization Tokens → Create Token

### Step 2: Already Configured in Code

The app is already configured with:
- `lib/sentry.ts` - Initialization
- `app/_layout.tsx` - Calls `initSentry()`
- `providers/auth.tsx` - Sets user context
- `app.json` - Sentry plugin configured

---

# Part 3: Environment Variables & Secrets

## 3.1 Local Development (.env.local)

Create `apps/mobile/.env.local`:

```bash
# Supabase (local or staging)
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key

# Environment
EXPO_PUBLIC_ENV=development

# Expo
EXPO_PUBLIC_PROJECT_ID=your-expo-project-id

# Sentry
EXPO_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Google OAuth
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxx.apps.googleusercontent.com
```

## 3.2 EAS Secrets (for Builds)

EAS looks for environment variables in this order:
1. **EAS Secrets** (highest priority)
2. **`eas.json` env block**
3. **`.env` file** in your project

### Option A: Use `.env` File (Simpler for Development)

If you have a `.env` file with all values, EAS will use it automatically:

```bash
# apps/mobile/.env
EXPO_PUBLIC_SUPABASE_URL=https://your-staging.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_PROJECT_ID=your-expo-project-id
EXPO_PUBLIC_SENTRY_DSN=your-sentry-dsn
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxx.apps.googleusercontent.com
```

> **Note:** For development builds, use your **staging Supabase** (not localhost).
> EAS builds run in the cloud and cannot access your local machine.

### Option B: Use EAS Environment Variables (Recommended for CI/CD)

Run from `apps/mobile`:

```bash
cd apps/mobile

# ===== DEVELOPMENT + PREVIEW (Staging) =====

eas env:create --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://your-staging.supabase.co" \
  --type string --visibility plaintext --environment development preview

eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "your-staging-anon-key" \
  --type string --visibility plaintext --environment development preview

eas env:create --name EXPO_PUBLIC_ENV \
  --value "staging" \
  --type string --visibility plaintext --environment development preview

# ===== PRODUCTION =====

eas env:create --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://your-prod.supabase.co" \
  --type string --visibility plaintext --environment production

eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "your-prod-anon-key" \
  --type string --visibility plaintext --environment production

eas env:create --name EXPO_PUBLIC_ENV \
  --value "production" \
  --type string --visibility plaintext --environment production

# ===== ALL ENVIRONMENTS =====

eas env:create --name EXPO_PUBLIC_SENTRY_DSN \
  --value "your-sentry-dsn" \
  --type string --visibility plaintext --environment development preview production

eas env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID \
  --value "xxx.apps.googleusercontent.com" \
  --type string --visibility plaintext --environment development preview production

eas env:create --name EXPO_PUBLIC_PROJECT_ID \
  --value "your-expo-project-id" \
  --type string --visibility plaintext --environment development preview production

eas env:create --name SENTRY_AUTH_TOKEN \
  --value "your-sentry-auth-token" \
  --type string --visibility sensitive --environment development preview production
```

### Verify EAS Environment Variables

```bash
eas env:list
```

### EAS Environment Variables Summary

| Name | Visibility | Environments | Notes |
|------|------------|--------------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | plaintext | development, preview, production | Use staging URL for dev/preview |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | plaintext | development, preview, production | Anon key is safe to expose (RLS handles security) |
| `EXPO_PUBLIC_ENV` | plaintext | development, preview, production | `staging` for dev/preview, `production` for prod |
| `EXPO_PUBLIC_SENTRY_DSN` | plaintext | development, preview, production | DSN is safe to expose |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | plaintext | development, preview, production | **Web** Client ID (not Android/iOS) |
| `EXPO_PUBLIC_PROJECT_ID` | plaintext | development, preview, production | Expo project ID |
| `SENTRY_AUTH_TOKEN` | sensitive | development, preview, production | For source maps upload (build-time only) |

> **Important:** All `EXPO_PUBLIC_*` variables must use `plaintext` visibility because they are embedded in the compiled app and visible to users. This is by design - use Row Level Security (RLS) for data protection, not key secrecy.
>
> **Visibility types:**
> - `plaintext` - Visible in logs, dashboard, and compiled app
> - `sensitive` - Hidden everywhere, only used during build (for non-EXPO_PUBLIC vars)

### Google OAuth Note

For Google Sign-In to work, you need:

1. **In your `.env` or EAS secrets:**
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` = Web Application Client ID

2. **In Google Cloud Console:**
   - Web Application client (ID goes in app + Supabase)
   - Android client with correct package name + SHA-1
   - iOS client with correct bundle ID

3. **In Supabase Dashboard:**
   - Google provider enabled with Web Client ID + Secret

The Android/iOS client IDs are **not** added to your code or secrets. Google uses them internally to verify your app's identity.

## 3.3 GitHub Repository Secrets

Go to: **GitHub Repo → Settings → Secrets and variables → Actions**

| Secret | Description | Where to Get |
|--------|-------------|--------------|
| `EXPO_TOKEN` | EAS authentication | https://expo.dev/accounts/[account]/settings/access-tokens |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI auth | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF_STAGING` | Staging project ID | Supabase Dashboard → Project Settings → General |
| `SUPABASE_PROJECT_REF_PRODUCTION` | Production project ID | Supabase Dashboard → Project Settings → General |
| `SENTRY_AUTH_TOKEN` | Sentry source maps | Sentry → Developer Settings → Organization Tokens |

---

# Part 4: App Configuration

## 4.1 Update app.json

Update `apps/mobile/app.json` with your identifiers:

```json
{
  "expo": {
    "name": "Cha-Ching",
    "slug": "cha-ching",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.yourcompany.chaching",
      "buildNumber": "1",
      "supportsTablet": true,
      "usesAppleSignIn": true,
      "infoPlist": {
        "NSCameraUsageDescription": "Used to scan QR codes for joining rooms",
        "NSPhotoLibraryUsageDescription": "Used to set your profile picture"
      }
    },
    "android": {
      "package": "com.yourcompany.chaching",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    }
  }
}
```

## 4.2 iOS: App Store Connect Setup

1. Go to https://appstoreconnect.apple.com
2. Click **My Apps → + → New App**
3. Fill in:
   - Platform: iOS
   - Name: Cha-Ching
   - Primary Language: English
   - Bundle ID: Select `com.yourcompany.chaching`
   - SKU: `chaching-ios`

## 4.3 Android: Google Play Console Setup

1. Go to https://play.google.com/console
2. Click **Create app**
3. Fill in:
   - App name: Cha-Ching
   - Default language: English
   - App or game: App
   - Free or paid: Free

## 4.4 Configure EAS Credentials

```bash
cd apps/mobile

# iOS credentials
eas credentials
# Select iOS → production → Let EAS manage

# Android credentials
eas credentials
# Select Android → production → Let EAS manage
```

---

# Part 5: Backend Deployment

## 5.1 Link & Deploy to Staging

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Login
supabase login

# Link to staging
supabase link --project-ref your-staging-project-ref

# Deploy migrations
supabase db push

# Deploy edge functions
supabase functions deploy
```

## 5.2 Deploy to Production

```bash
# Link to production
supabase link --project-ref your-production-project-ref

# Deploy
supabase db push
supabase functions deploy

# Switch back to staging
supabase link --project-ref your-staging-project-ref
```

---

# Part 6: Build & Submit

## 6.1 Development Build

```bash
cd apps/mobile
eas build --profile development --platform all
```

## 6.2 Staging Build

```bash
eas build --profile staging --platform all
```

## 6.3 Production Build

```bash
eas build --profile production --platform all
```

## 6.4 Submit to Stores

```bash
# iOS
eas submit --platform ios --latest

# Android
eas submit --platform android --latest
```

Monitor builds: https://expo.dev/accounts/[account]/projects/[project]/builds

---

# Part 7: CI/CD Pipelines

## 7.1 Existing Workflows

| Workflow | File | Trigger |
|----------|------|---------|
| CI | `ci.yml` | Push/PR to main |
| Deploy Staging | `deploy-staging.yml` | Push to main |

## 7.2 Create Production Workflow

Create `.github/workflows/deploy-production.yml`:

```yaml
name: Deploy Production

on:
  release:
    types: [published]

jobs:
  deploy-supabase:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF_PRODUCTION }}
          supabase db push
          supabase functions deploy
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

  build-and-submit:
    runs-on: ubuntu-latest
    needs: deploy-supabase
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: |
          cd apps/mobile
          eas build --profile production --platform all --non-interactive
          eas submit --platform all --latest --non-interactive
```

## 7.3 Creating a Release

```bash
# Update version in app.json, then:
git add . && git commit -m "Bump version to 1.1.0" && git push

# Create release (triggers production deploy)
gh release create v1.1.0 --title "v1.1.0" --notes "Release notes"
```

---

# Part 8: Pre-Launch Checklist

## Before Launch

- [ ] All accounts created and verified
- [ ] Google OAuth configured and tested
- [ ] Apple OAuth configured and tested
- [ ] Email delivery working (test password reset)
- [ ] Sentry receiving errors
- [ ] EAS secrets configured for all environments
- [ ] GitHub secrets configured
- [ ] Test on physical iOS device
- [ ] Test on physical Android device
- [ ] Push notifications working
- [ ] Privacy policy URL live
- [ ] Terms of service URL live

## After Launch

- [ ] Set up Sentry alerts
- [ ] Monitor app store reviews
- [ ] Plan update cadence

---

# Quick Reference

## Commands

```bash
# Development
cd apps/mobile && pnpm dev

# Build
eas build -p ios
eas build -p android
eas build -p all

# Submit
eas submit -p ios
eas submit -p android

# Credentials
eas credentials

# Environment Variables
eas env:list
eas env:create --name EXPO_PUBLIC_* --value "VALUE" --type string --visibility plaintext --environment development preview production
eas env:create --name SECRET_VAR --value "VALUE" --type string --visibility sensitive --environment development preview production

# Supabase
supabase link --project-ref REF
supabase db push
supabase functions deploy
```

## Important URLs

| Service | URL |
|---------|-----|
| Expo Dashboard | https://expo.dev |
| Supabase Dashboard | https://supabase.com/dashboard |
| App Store Connect | https://appstoreconnect.apple.com |
| Google Play Console | https://play.google.com/console |
| Sentry | https://sentry.io |
| Google Cloud Console | https://console.cloud.google.com |
| Apple Developer | https://developer.apple.com |

---

## Estimated Timeline

| Day | Tasks |
|-----|-------|
| 1-2 | Create all accounts (Apple, Google, Expo, Sentry, Resend) |
| 3-5 | Wait for account approvals + DNS verification |
| 6 | Configure OAuth, email, secrets |
| 7 | First staging build and testing |
| 8-10 | Fix issues, prepare store assets |
| 11 | Submit to app stores |
| 12-14 | App review (iOS: 1-3 days, Android: hours to 3 days) |
