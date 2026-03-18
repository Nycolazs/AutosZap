import { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function SettingsScreen() {
  const { api, me, logout } = useSession();

  const releasesQuery = useQuery({
    queryKey: ['platform-releases'],
    queryFn: () => api.listPlatformReleases(),
    refetchInterval: 60_000,
  });

  const releases = useMemo(
    () => releasesQuery.data?.artifacts ?? [],
    [releasesQuery.data?.artifacts],
  );

  return (
    <ScreenTransition>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerCard}>
          <Text style={styles.eyebrow}>CONTA</Text>
          <Text style={styles.title}>Configurações</Text>
          <Text style={styles.subtitle}>
            Dados da conta ativa e distribuição das builds mobile/desktop.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sessão atual</Text>
          <Text style={styles.rowLabel}>Nome</Text>
          <Text style={styles.rowValue}>{me?.name ?? '-'}</Text>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.rowValue}>{me?.email ?? '-'}</Text>
          <Text style={styles.rowLabel}>Workspace</Text>
          <Text style={styles.rowValue}>{me?.workspace?.name ?? '-'}</Text>
          <Text style={styles.rowLabel}>Perfil</Text>
          <Text style={styles.rowValue}>{me?.normalizedRole ?? me?.role ?? '-'}</Text>

          <Pressable style={styles.logoutButton} onPress={() => void logout()}>
            <Text style={styles.logoutText}>Sair da conta</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Releases publicadas</Text>

          {releasesQuery.isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : releases.length ? (
            releases.map((artifact) => (
              <View key={artifact.id} style={styles.releaseCard}>
                <View style={styles.releaseTop}>
                  <Text style={styles.releaseLabel}>{artifact.label}</Text>
                  <View style={styles.channelPill}>
                    <Text style={styles.channelText}>{artifact.channel}</Text>
                  </View>
                </View>
                <Text style={styles.releaseMeta}>
                  Plataforma: {artifact.platform} • v{artifact.version} ({artifact.buildNumber})
                </Text>
                {artifact.notes ? (
                  <Text style={styles.releaseNotes}>{artifact.notes}</Text>
                ) : null}

                <Pressable
                  style={styles.releaseButton}
                  onPress={() => {
                    void Linking.openURL(artifact.url);
                  }}
                >
                  <Text style={styles.releaseButtonText}>Abrir download</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Sem releases publicadas.</Text>
              <Text style={styles.emptyDescription}>
                Assim que uma distribuição for publicada, ela aparece aqui.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  headerCard: {
    gap: 6,
  },
  eyebrow: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.1,
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  rowLabel: {
    color: palette.textMuted,
    fontSize: 12,
  },
  rowValue: {
    color: palette.text,
    fontSize: 14,
    marginBottom: 3,
  },
  logoutButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 141, 155, 0.4)',
    backgroundColor: 'rgba(255, 141, 155, 0.1)',
  },
  logoutText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  centerState: {
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  releaseCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 12,
    gap: 6,
  },
  releaseTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  releaseLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  channelPill: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  channelText: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  releaseMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  releaseNotes: {
    color: palette.text,
    fontSize: 12,
    lineHeight: 18,
  },
  releaseButton: {
    marginTop: 4,
    minHeight: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  releaseButtonText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 12,
    gap: 4,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyDescription: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
