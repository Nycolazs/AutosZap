import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type { AuthMe, AuthSession } from '@autoszap/platform-types';
import { createMobileApi } from '@/lib/api';
import { registerForPushToken } from '@/lib/notifications';
import { getInstallationId, readSession, writeSession } from '@/lib/storage';

type SessionContextValue = {
  api: ReturnType<typeof createMobileApi>;
  session: AuthSession | null;
  me: AuthMe | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const sessionRef = useRef<AuthSession | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [me, setMe] = useState<AuthMe | null>(null);
  const [ready, setReady] = useState(false);

  const saveSession = useCallback(async (nextSession: AuthSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    await writeSession(nextSession);
  }, []);

  const clearSession = useCallback(async () => {
    sessionRef.current = null;
    setSession(null);
    setMe(null);
    await writeSession(null);
  }, []);

  const api = useMemo(
    () =>
      createMobileApi({
        getSession: () => sessionRef.current,
        saveSession,
        clearSession,
      }),
    [clearSession, saveSession],
  );

  const refreshMe = useCallback(async () => {
    if (!sessionRef.current) {
      setMe(null);
      return;
    }

    const nextMe = await api.me();
    setMe(nextMe);
  }, [api]);

  const registerDevice = useCallback(async () => {
    if (!sessionRef.current) {
      return;
    }

    const installationId = await getInstallationId();
    const pushToken = await registerForPushToken();

    await api.registerDevice({
      installationId,
      platform: Device.osName === 'Android' ? 'ANDROID' : 'IOS',
      provider: 'EXPO',
      pushToken: pushToken ?? undefined,
      deviceName: Device.deviceName ?? Device.modelName ?? undefined,
      osVersion: Device.osVersion ?? undefined,
      appVersion: Constants.expoConfig?.version,
      buildNumber:
        Constants.expoConfig?.ios?.buildNumber ??
        String(Constants.expoConfig?.android?.versionCode ?? ''),
    });
  }, [api]);

  const login = useCallback(
    async (email: string, password: string) => {
      const nextSession = await api.login(email, password);
      await saveSession(nextSession);
      const nextMe = await api.me();
      setMe(nextMe);
      await registerDevice();
    },
    [api, registerDevice, saveSession],
  );

  const logout = useCallback(async () => {
    const currentSession = sessionRef.current;

    if (currentSession) {
      try {
        const installationId = await getInstallationId();
        await api.unregisterDevice(installationId);
      } catch {
        // O logout local deve prevalecer se o backend estiver indisponivel.
      }

      try {
        await api.logout(currentSession.refreshToken);
      } catch {
        // Ignorado para garantir limpeza local.
      }
    }

    await clearSession();
  }, [api, clearSession]);

  useEffect(() => {
    void (async () => {
      const storedSession = await readSession();

      if (storedSession) {
        sessionRef.current = storedSession;
        setSession(storedSession);

        try {
          const nextMe = await api.me();
          setMe(nextMe);
          await registerDevice();
        } catch {
          await clearSession();
        }
      }

      setReady(true);
    })();
  }, [api, clearSession, registerDevice]);

  const value = useMemo<SessionContextValue>(
    () => ({
      api,
      session,
      me,
      ready,
      login,
      logout,
      refreshMe,
    }),
    [api, login, logout, me, ready, refreshMe, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error('useSession precisa ser usado dentro de SessionProvider.');
  }

  return value;
}
