import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { createPlatformClient } from '@autoszap/platform-client';
import type { AuthSession } from '@autoszap/platform-types';

type SessionAccessors = {
  getSession: () => AuthSession | null;
  saveSession: (session: AuthSession | null) => Promise<void>;
  clearSession: () => Promise<void>;
};

function isLoopbackUrl(value: string) {
  return (
    value.includes('://localhost') ||
    value.includes('://127.0.0.1') ||
    value.includes('://0.0.0.0')
  );
}

function getExpoHostName() {
  try {
    const url = Linking.createURL('/');
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

export function resolveApiUrl() {
  const defaultApiUrl =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:4000'
      : 'https://api.autoszap.com';

  const value =
    Constants.expoConfig?.extra?.apiUrl ??
    process.env.EXPO_PUBLIC_API_URL ??
    defaultApiUrl;

  const normalizedValue = String(value).replace(/\/+$/, '');

  if (
    process.env.NODE_ENV === 'development' &&
    Platform.OS !== 'web' &&
    isLoopbackUrl(normalizedValue)
  ) {
    const hostName = getExpoHostName();

    if (hostName) {
      return `http://${hostName}:4000`;
    }
  }

  return normalizedValue;
}

export function createMobileApi(accessors: SessionAccessors) {
  return createPlatformClient({
    baseUrl: resolveApiUrl(),
    getAccessToken: () => accessors.getSession()?.accessToken ?? null,
    getRefreshToken: () => accessors.getSession()?.refreshToken ?? null,
    onSessionUpdate: async (session) => {
      await accessors.saveSession(session);
    },
    onAuthFailure: async () => {
      await accessors.clearSession();
    },
  });
}
