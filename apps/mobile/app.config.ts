import type { ExpoConfig } from 'expo/config';

const version = process.env.APP_VERSION ?? '0.1.0';
const buildNumber = process.env.APP_BUILD_NUMBER ?? '1';
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: 'AutoZap',
  slug: 'autoszap-mobile',
  scheme: 'autoszap',
  version,
  orientation: 'portrait',
  icon: '../../frontend/public/brand/autoszap-mark.png',
  userInterfaceStyle: 'dark',
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: projectId
    ? {
        url: `https://u.expo.dev/${projectId}`,
      }
    : undefined,
  android: {
    package: 'com.autoszap.mobile',
    versionCode: Number(buildNumber),
  },
  ios: {
    bundleIdentifier: 'com.autoszap.mobile',
    buildNumber,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
    eas: {
      projectId,
    },
  },
  experiments: {
    typedRoutes: true,
  },
  plugins: ['expo-router', 'expo-notifications', 'expo-secure-store'],
};

export default config;
