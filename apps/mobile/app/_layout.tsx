import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers/app-providers';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

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
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
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
      },
    );

    return () => subscription.remove();
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
