import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import Constants from 'expo-constants';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers/app-providers';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

async function loadNotificationsModule() {
  if (
    Platform.OS === 'android' &&
    Constants.executionEnvironment === 'storeClient'
  ) {
    return null;
  }

  try {
    const module = await import('expo-notifications');
    return module;
  } catch {
    return null;
  }
}

function RootNavigation() {
  const segments = useSegments();
  const { ready, session } = useSession();

  useEffect(() => {
    if (!ready) {
      return;
    }

    const inAuthGroup = segments[0] === 'login';

    if (!session && !inAuthGroup) {
      router.replace('/login');
    }

    if (session && inAuthGroup) {
      router.replace('/(tabs)/conversations');
    }
  }, [ready, segments, session]);

  useEffect(() => {
    let removeListener: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const notifications = await loadNotificationsModule();

      if (!notifications || cancelled) {
        return;
      }

      const subscription =
        notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as {
            linkHref?: string;
            conversationId?: string;
          };

          if (data.linkHref?.includes('conversationId=')) {
            const conversationId = data.linkHref.split('conversationId=').pop();

            if (conversationId) {
              router.push(`/conversation/${conversationId}`);
              return;
            }
          }

          if (data.conversationId) {
            router.push(`/conversation/${String(data.conversationId)}`);
          }
        });

      removeListener = () => subscription.remove();
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.background,
        }}
      >
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          animation: 'fade_from_bottom',
          headerStyle: {
            backgroundColor: palette.background,
          },
          headerTintColor: palette.text,
          contentStyle: {
            backgroundColor: palette.background,
          },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="conversation/[id]"
          options={{
            title: 'Conversa',
            headerBackTitle: 'Voltar',
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigation />
    </AppProviders>
  );
}
