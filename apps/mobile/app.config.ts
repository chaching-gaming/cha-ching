import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Cha-Ching',
  slug: 'mobile',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'chaching',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  jsEngine: 'hermes',
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#011E22',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.visualglobe.chaching',
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['remote-notification'],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#011E22',
    },
    edgeToEdgeEnabled: true,
    package: 'com.visualglobe.chaching',
    googleServicesFile: './google-services.json',
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  updates: {
    url: 'https://u.expo.dev/dc228f01-efda-4fc0-a714-6d455f6461e6',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  plugins: [
    'expo-router',
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#2EAF7D',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Allow Cha-Ching to access your photos to set a profile picture.',
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        organization: 'cha-ching',
        project: 'cha-ching',
      },
    ],
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme:
          process.env.GOOGLE_IOS_URL_SCHEME ||
          'com.googleusercontent.apps.1070930457721-pnuevds8ka750f5h8m1h7mtsrbr8e2s9',
      },
    ],
    'expo-apple-authentication',
    'expo-web-browser',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: 'dc228f01-efda-4fc0-a714-6d455f6461e6',
    },
  },
  owner: 'navatejatechnologies',
});
