import { Stack } from 'expo-router';
import { palette } from '@/theme';

export default function SettingsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: palette.background,
        },
        headerTintColor: palette.text,
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: palette.background,
        },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="contacts" options={{ title: 'Contatos' }} />
      <Stack.Screen name="tags" options={{ title: 'Tags' }} />
      <Stack.Screen name="team" options={{ title: 'Equipe' }} />
      <Stack.Screen name="groups-lists" options={{ title: 'Grupos e Listas' }} />
      <Stack.Screen name="instances" options={{ title: 'Instâncias' }} />
      <Stack.Screen name="workflow" options={{ title: 'Fluxo e Automações' }} />
    </Stack>
  );
}
