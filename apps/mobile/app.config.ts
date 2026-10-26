import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Cha-Ching',
  slug: 'mobile',
  version: '1.0.1',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'chaching',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  jsEngine: 'hermes',
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#F3F4F6',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.visualglobe.chaching',
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['remote-notification'],
      NSUserNotificationsUsageDescription:
        'Cha-Ching sends notifications to alert you when bets are matched, settled, or disputed, and when friends request chips in your rooms.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#F3F4F6',
    },
    edgeToEdgeEnabled: true,
    package: 'com.chaching.golf',
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
    './plugins/withModularHeaders',
    'expo-router',
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#4D8A8A',
        defaultChannel: 'default',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Cha-Ching to access your photos to set a profile picture.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'Allow Cha-Ching to use your camera to scan QR codes for quickly joining betting rooms.',
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        organization: 'cha-ching-gaming-llc',
        project: 'cha-ching',
      },
    ],
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme:
          process.env.GOOGLE_IOS_URL_SCHEME ||
          'com.googleusercontent.apps.692754456856-5g4te7hf8do0k0an5c502evi2qshv8fh',
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
  owner: 'cha-ching-gaming-llc',
});
