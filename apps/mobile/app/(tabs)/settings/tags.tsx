import { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function TagsModuleScreen() {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3d96ff');

  const tagsQuery = useQuery({
    queryKey: ['mobile-tags'],
    queryFn: () => api.listTags(),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createTag({
        name: name.trim(),
        color: color.trim() || '#3d96ff',
      }),
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['mobile-tags'] });
    },
    onError: (error: Error) => {
      Alert.alert('Falha ao criar tag', error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (tagId: string) => api.deleteTag(tagId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-tags'] });
    },
    onError: (error: Error) => {
      Alert.alert('Falha ao remover tag', error.message);
    },
  });

  return (
    <ScreenTransition>
      <View style={styles.screen}>
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Nova tag</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nome da tag"
            placeholderTextColor={palette.textMuted}
            style={styles.input}
          />
          <TextInput
            value={color}
            onChangeText={setColor}
            placeholder="#3d96ff"
            autoCapitalize="none"
            placeholderTextColor={palette.textMuted}
            style={styles.input}
          />
          <Pressable
            style={[styles.button, (!name.trim() || createMutation.isPending) && styles.buttonDisabled]}
            onPress={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {createMutation.isPending ? 'Criando...' : 'Criar tag'}
            </Text>
          </Pressable>
        </View>

        <FlatList
          data={tagsQuery.data ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              tintColor={palette.primary}
              refreshing={tagsQuery.isRefetching}
              onRefresh={() => void tagsQuery.refetch()}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Sem tags cadastradas.</Text>
              <Text style={styles.emptyDescription}>Crie tags para organizar contatos e conversas.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={[styles.colorDot, { backgroundColor: item.color || palette.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tagName}>{item.name}</Text>
                {item.color ? <Text style={styles.tagMeta}>{item.color}</Text> : null}
              </View>
              <Pressable
                style={styles.deleteButton}
                disabled={deleteMutation.isPending}
                onPress={() => deleteMutation.mutate(item.id)}
              >
                <Text style={styles.deleteText}>Remover</Text>
              </Pressable>
            </View>
          )}
        />
      </View>
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
    padding: 16,
    gap: 12,
  },
  formCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 12,
    gap: 8,
  },
  formTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    color: palette.text,
  },
  button: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 24,
    gap: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  tagName: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  tagMeta: {
    color: palette.textMuted,
    fontSize: 11,
  },
  deleteButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 141, 155, 0.4)',
    backgroundColor: 'rgba(255, 141, 155, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    borderRadius: 14,
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
