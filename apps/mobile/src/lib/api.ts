import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import { createPlatformClient } from '@autoszap/platform-client';
import type { AuthSession } from '@autoszap/platform-types';

type SessionAccessors = {
  getSession: () => AuthSession | null;
  saveSession: (session: AuthSession | null) => Promise<void>;
  clearSession: () => Promise<void>;
};

function resolveApiUrl() {
  const value =
    Constants.expoConfig?.extra?.apiUrl ??
    process.env.EXPO_PUBLIC_API_URL ??
    'http://localhost:4000';

  return String(value).replace(/\/+$/, '');
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
