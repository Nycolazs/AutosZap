import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { AuthSession } from '@autoszap/platform-types';

const SESSION_KEY = 'autoszap.mobile.session';
const INSTALLATION_KEY = 'autoszap.mobile.installation-id';
const LOGIN_CREDENTIALS_KEY = 'autoszap.mobile.login-credentials';

type SavedLoginCredentials = {
  email: string;
  password: string;
  remember: boolean;
};

const inMemoryFallback = new Map<string, string>();

function readWebStorage(key: string) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  return window.localStorage.getItem(key);
}

function writeWebStorage(key: string, value: string) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  window.localStorage.setItem(key, value);
}

function deleteWebStorage(key: string) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  window.localStorage.removeItem(key);
}

async function getStoredValue(key: string) {
  if (Platform.OS === 'web') {
    return readWebStorage(key);
  }

  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return inMemoryFallback.get(key) ?? null;
    }
  }
}

async function setStoredValue(key: string, value: string) {
  if (Platform.OS === 'web') {
    writeWebStorage(key, value);
    return;
  }

  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      inMemoryFallback.set(key, value);
    }
  }
}

async function removeStoredValue(key: string) {
  if (Platform.OS === 'web') {
    deleteWebStorage(key);
    return;
  }

  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      inMemoryFallback.delete(key);
    }
  }
}

export async function readSession() {
  const raw = await getStoredValue(SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    await removeStoredValue(SESSION_KEY);
    return null;
  }
}

export async function writeSession(session: AuthSession | null) {
  if (!session) {
    await removeStoredValue(SESSION_KEY);
    return;
  }

  await setStoredValue(SESSION_KEY, JSON.stringify(session));
}

export async function getInstallationId() {
  const existing = await getStoredValue(INSTALLATION_KEY);

  if (existing) {
    return existing;
  }

  const nextId = Crypto.randomUUID();
  await setStoredValue(INSTALLATION_KEY, nextId);
  return nextId;
}

export async function readLoginCredentials() {
  const raw = await getStoredValue(LOGIN_CREDENTIALS_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SavedLoginCredentials;

    if (!parsed?.email || !parsed?.password) {
      await removeStoredValue(LOGIN_CREDENTIALS_KEY);
      return null;
    }

    return parsed;
  } catch {
    await removeStoredValue(LOGIN_CREDENTIALS_KEY);
    return null;
  }
}

export async function writeLoginCredentials(credentials: SavedLoginCredentials | null) {
  if (!credentials || !credentials.remember) {
    await removeStoredValue(LOGIN_CREDENTIALS_KEY);
    return;
  }

  await setStoredValue(LOGIN_CREDENTIALS_KEY, JSON.stringify(credentials));
}
