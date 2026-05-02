# Push Notifications Setup

Complete these steps in order to enable push notifications.

---

## 1. Firebase Cloud Messaging (Android)

### 1.1 Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the setup wizard
3. Enter project name (e.g., "cha-ching")

### 1.2 Add Android App to Firebase
1. In Firebase Console, click "Add app" → Android
2. Enter Android package name: `com.chaching.mobile` (check `app.json` for actual package name)
3. Download `google-services.json`
4. Place it at `apps/mobile/google-services.json`

### 1.3 Get FCM Server Key
1. Go to Project Settings → Cloud Messaging
2. Enable Cloud Messaging API (V1) if not already enabled
3. Note the Sender ID for later

### 1.4 Configure Expo with FCM
```bash
cd apps/mobile
eas credentials -p android
```
Select "Push Notifications: Manage your FCM Api Key" and upload or let EAS configure it.

---

## 2. Apple Push Notification service (iOS)

### 2.1 Apple Developer Account
Requires an [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year).

### 2.2 Create APNs Key
1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
2. Click "+" to create a new key
3. Name it (e.g., "Cha-Ching Push Key")
4. Check "Apple Push Notifications service (APNs)"
5. Click "Continue" → "Register"
6. **Download the .p8 file** (you can only download once!)
7. Note the **Key ID** shown on the page
8. Note your **Team ID** (visible in top right of developer portal or Membership page)

### 2.3 Configure Expo with APNs
```bash
cd apps/mobile
eas credentials -p ios
```
Select "Push Notifications: Manage your Apple Push Notifications Key" and provide:
- The .p8 file you downloaded
- Key ID
- Team ID

Alternatively, upload via Expo dashboard: https://expo.dev → Project → Credentials

---

## 3. Create Notification Icon

Create a 96x96px PNG image at:
```
apps/mobile/assets/images/notification-icon.png
```

This icon appears in the notification tray on Android.

---

## 4. Get Expo Project ID

```bash
cd apps/mobile
eas project:info
```

Or get it from the [Expo dashboard](https://expo.dev).

---

## 5. Add Environment Variables

Add to `apps/mobile/.env.local`:
```
EXPO_PUBLIC_PROJECT_ID=<your-expo-project-id>
```

---

## 6. Apply Database Migrations

```bash
supabase db push
```

Or if using hosted Supabase:
```bash
supabase migration up --linked
```

---

## 7. Configure Database Settings

Run this SQL in your Supabase dashboard (SQL Editor):
```sql
ALTER DATABASE postgres SET app.settings.edge_function_url = 'https://<project-ref>.supabase.co/functions/v1';
ALTER DATABASE postgres SET app.settings.service_role_key = '<your-service-role-key>';
```

Replace:
- `<project-ref>` with your Supabase project reference
- `<your-service-role-key>` with your service role key (from Project Settings → API)

---

## 8. Deploy Edge Function

```bash
supabase functions deploy send-notification
```

---

## 9. Update app.json (if needed)

Ensure your `app.json` has the correct bundle identifiers:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.chaching.mobile"
    },
    "android": {
      "package": "com.chaching.mobile",
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

---

## 10. Rebuild the App

Since `expo-notifications` requires native modules:

### Development Build
```bash
cd apps/mobile
npx expo prebuild --clean
npx expo run:ios   # or run:android
```

### Production Build (via EAS)
```bash
eas build --profile production --platform all
```

---

## 11. Test on Physical Device

Push notifications require a physical device (not simulator).

1. Install the app on a physical device
2. Sign in to the app
3. Accept notification permissions when prompted
4. Check `user_devices` table in Supabase to verify token was registered
5. Create a bet and have another user join it
6. Verify push notification is received

---

## Verification Checklist

### Credentials
- [ ] Firebase project created
- [ ] `google-services.json` downloaded and placed in `apps/mobile/`
- [ ] FCM configured in EAS (`eas credentials -p android`)
- [ ] APNs .p8 key created and downloaded
- [ ] APNs configured in EAS (`eas credentials -p ios`)

### App Setup
- [ ] Notification icon exists at `assets/images/notification-icon.png`
- [ ] `EXPO_PUBLIC_PROJECT_ID` is set in `.env.local`
- [ ] `app.json` has correct bundle identifiers

### Backend
- [ ] Migrations applied (`user_devices`, `notifications` tables exist)
- [ ] Database settings configured (`edge_function_url`, `service_role_key`)
- [ ] Edge function deployed (`supabase functions list` shows `send-notification`)

### Testing
- [ ] App rebuilt with native modules
- [ ] Device token appears in `user_devices` table after sign-in
- [ ] Push notification received on physical device

---

## Troubleshooting

### No push token registered
- Ensure running on physical device, not simulator
- Check notification permissions are granted in device settings
- Verify `EXPO_PUBLIC_PROJECT_ID` is set correctly

### Notifications not received (Android)
- Verify `google-services.json` is in the correct location
- Ensure FCM credentials are configured in EAS
- Check Firebase Console for delivery errors

### Notifications not received (iOS)
- Verify APNs key is configured in EAS
- Ensure bundle identifier matches Apple Developer portal
- Check if app has notification permissions in Settings

### Edge function errors
- Check Supabase logs: `supabase functions logs send-notification`
- Verify database settings are configured correctly
- Ensure service role key has proper permissions
