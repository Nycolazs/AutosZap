import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function ContactsModuleScreen() {
  const { api } = useSession();
  const [search, setSearch] = useState('');

  const contactsQuery = useQuery({
    queryKey: ['mobile-contacts', search],
    queryFn: () => api.listContacts({ search, limit: 100 }),
    refetchInterval: 30_000,
  });

  const contacts = contactsQuery.data?.data ?? [];

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar contato por nome, telefone ou email"
          placeholderTextColor={palette.textMuted}
          style={styles.search}
        />

        {contactsQuery.isLoading && !contacts.length ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                tintColor={palette.primary}
                refreshing={contactsQuery.isRefetching}
                onRefresh={() => void contactsQuery.refetch()}
              />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Nenhum contato encontrado.</Text>
                <Text style={styles.emptyDescription}>
                  Ajuste a busca ou cadastre contatos pelo web para sincronizar no app.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>Telefone: {item.phone}</Text>
                {item.email ? <Text style={styles.meta}>Email: {item.email}</Text> : null}
                {item.company ? <Text style={styles.meta}>Empresa: {item.company}</Text> : null}
                {item.tags?.length ? (
                  <View style={styles.tags}>
                    {item.tags.map((tag) => (
                      <View key={tag.id} style={styles.tagPill}>
                        <Text style={styles.tagText}>{tag.name}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            )}
          />
        )}
      </View>
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  search: {
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    color: palette.text,
    marginBottom: 12,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    gap: 10,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 12,
    gap: 4,
  },
  name: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  meta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  tags: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 4,
    marginTop: 12,
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
