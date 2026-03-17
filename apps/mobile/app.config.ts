import type { ExpoConfig } from 'expo/config';

const version = process.env.APP_VERSION ?? '0.1.0';
const buildNumber = process.env.APP_BUILD_NUMBER ?? '1';
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const hasEasProject = Boolean(projectId);

const config: ExpoConfig = {
  name: 'AutoZap',
  slug: 'autoszap-mobile',
  scheme: 'autoszap',
  version,
  orientation: 'portrait',
  icon: '../../frontend/public/brand/autoszap-mark.png',
  userInterfaceStyle: 'dark',
  runtimeVersion: hasEasProject
    ? {
        policy: 'appVersion',
      }
    : undefined,
  updates: hasEasProject
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
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.autoszap.com',
    eas: {
      projectId,
    },
  },
  experiments: {
    typedRoutes: true,
  },
  plugins: [
    'expo-router',
    'expo-notifications',
    'expo-secure-store',
    'expo-font',
  ],
};

export default config;
