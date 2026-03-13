import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { AuthSession } from '@autoszap/platform-types';

const SESSION_KEY = 'autoszap.mobile.session';
const INSTALLATION_KEY = 'autoszap.mobile.installation-id';

export async function readSession() {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return null;
  }
}

export async function writeSession(session: AuthSession | null) {
  if (!session) {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return;
  }

  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function getInstallationId() {
  const existing = await SecureStore.getItemAsync(INSTALLATION_KEY);

  if (existing) {
    return existing;
  }

  const nextId = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_KEY, nextId);
  return nextId;
}
