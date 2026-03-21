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
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

const MODULE_SECTIONS = [
  {
    title: 'Conta',
    items: [
      { label: 'Minha Conta', description: 'Perfil, workspace e senha', route: '/(tabs)/settings/profile', icon: '👤' },
    ],
  },
  {
    title: 'Operacional',
    items: [
      { label: 'Dashboard', description: 'Métricas e atividade', route: '/(tabs)/settings/dashboard', icon: '📊' },
      { label: 'Contatos', description: 'Base de clientes e dados', route: '/(tabs)/settings/contacts', icon: '📇' },
      { label: 'Tags', description: 'Organização operacional', route: '/(tabs)/settings/tags', icon: '🏷' },
      { label: 'Grupos e Listas', description: 'Segmentação de audiência', route: '/(tabs)/settings/groups-lists', icon: '📋' },
      { label: 'Mensagens Rápidas', description: 'Templates de atendimento', route: '/(tabs)/settings/quick-messages', icon: '⚡' },
    ],
  },
  {
    title: 'Equipe e Acesso',
    items: [
      { label: 'Equipe', description: 'Usuários, funções e permissões', route: '/(tabs)/settings/team', icon: '👥' },
    ],
  },
  {
    title: 'Inteligência Artificial',
    items: [
      { label: 'Assistentes IA', description: 'Configurar assistentes automatizados', route: '/(tabs)/settings/assistants', icon: '🤖' },
      { label: 'Bases de Conhecimento', description: 'Documentos e fontes de informação', route: '/(tabs)/settings/knowledge-bases', icon: '📚' },
      { label: 'Ferramentas IA', description: 'Ações e integrações para IA', route: '/(tabs)/settings/ai-tools', icon: '🔧' },
    ],
  },
  {
    title: 'Infraestrutura',
    items: [
      { label: 'Instâncias', description: 'WhatsApp e integrações', route: '/(tabs)/settings/instances', icon: '📱' },
      { label: 'Pipeline', description: 'Etapas do funil de vendas', route: '/(tabs)/settings/pipeline', icon: '🔄' },
      { label: 'Fluxo e Automações', description: 'Horários e respostas automáticas', route: '/(tabs)/settings/workflow', icon: '⚙' },
    ],
  },
];

export default function SettingsScreen() {
  const router = useRouter();
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
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Text style={styles.eyebrow}>PLATAFORMA</Text>
          <Text style={styles.title}>Configurações</Text>
          <Text style={styles.subtitle}>
            Gerencie sua conta, equipe, IA e todos os módulos do sistema.
          </Text>
        </View>

        {/* Session card */}
        <View style={styles.card}>
          <View style={styles.sessionRow}>
            <View style={styles.sessionAvatar}>
              <Text style={styles.sessionAvatarText}>
                {((me as any)?.name ?? '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionName}>{(me as any)?.name ?? '-'}</Text>
              <Text style={styles.sessionEmail}>{(me as any)?.email ?? '-'}</Text>
              <Text style={styles.sessionMeta}>
                {(me as any)?.workspace?.name ?? '-'} • {(me as any)?.normalizedRole ?? (me as any)?.role ?? '-'}
              </Text>
            </View>
          </View>

          <Pressable style={styles.logoutButton} onPress={() => void logout()}>
            <Text style={styles.logoutText}>Sair da conta</Text>
          </Pressable>
        </View>

        {/* Module sections */}
        {MODULE_SECTIONS.map((section) => (
          <View key={section.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.moduleList}>
              {section.items.map((item) => (
                <Pressable
                  key={item.route}
                  style={styles.moduleCard}
                  onPress={() => router.push(item.route as never)}
                >
                  <Text style={styles.moduleIcon}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.moduleTitle}>{item.label}</Text>
                    <Text style={styles.moduleDescription}>{item.description}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* Releases */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Releases publicadas</Text>

          {releasesQuery.isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : releases.length ? (
            releases.map((artifact: any) => (
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
                  onPress={() => { void Linking.openURL(artifact.url); }}
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
    paddingBottom: 32,
    gap: 14,
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

  // Session card
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 16,
    gap: 10,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sessionAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionAvatarText: {
    color: palette.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  sessionName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sessionEmail: {
    color: palette.textMuted,
    fontSize: 13,
  },
  sessionMeta: {
    color: palette.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  logoutButton: {
    marginTop: 2,
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

  // Section
  sectionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  moduleList: {
    gap: 4,
  },
  moduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: palette.surface,
    padding: 12,
    gap: 12,
  },
  moduleIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  moduleTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  moduleDescription: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  chevron: {
    color: palette.textMuted,
    fontSize: 22,
    fontWeight: '300',
  },

  // Misc
  cardTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  centerState: {
    minHeight: 80,
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
    color: '#fff',
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
