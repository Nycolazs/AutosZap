import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function ResetPasswordScreen() {
  const { api } = useSession();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <ScreenTransition>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.select({ ios: 'padding', android: 'height' })}
        keyboardVerticalOffset={Platform.select({ ios: 32, android: 12 })}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>NOVA SENHA</Text>
            <Text style={styles.title}>Redefinir sua senha.</Text>
            <Text style={styles.description}>
              Escolha uma nova senha segura para acessar sua conta.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nova senha</Text>
            <Text style={styles.cardDescription}>
              Insira e confirme sua nova senha abaixo.
            </Text>

            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Nova senha"
              placeholderTextColor={palette.textMuted}
              style={styles.input}
            />

            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Confirme a nova senha"
              placeholderTextColor={palette.textMuted}
              style={styles.input}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.button, submitting && styles.buttonDisabled]}
              disabled={submitting}
              onPress={async () => {
                try {
                  setSubmitting(true);
                  setError(null);

                  if (password !== confirmPassword) {
                    setError('As senhas nao coincidem.');
                    return;
                  }

                  if (!token) {
                    setError('Token de recuperacao invalido ou ausente.');
                    return;
                  }

                  await api.resetPassword({ token, password });
                  router.replace('/login');
                } catch (nextError) {
                  setError(
                    nextError instanceof Error
                      ? nextError.message
                      : 'Nao foi possivel redefinir a senha agora.',
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? (
                <ActivityIndicator color={palette.text} />
              ) : (
                <Text style={styles.buttonText}>Redefinir senha</Text>
              )}
            </Pressable>

            <Pressable onPress={() => router.replace('/login')}>
              <Text style={styles.link}>
                Voltar para o <Text style={styles.linkHighlight}>login</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    minHeight: '100%',
    justifyContent: 'center',
    gap: 24,
  },
  hero: {
    gap: 10,
  },
  eyebrow: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.2,
  },
  title: {
    color: palette.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
  },
  description: {
    color: palette.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    gap: 14,
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElevated,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
  },
  cardDescription: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 6,
  },
  input: {
    height: 54,
    borderRadius: 18,
    paddingHorizontal: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontSize: 16,
  },
  button: {
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: palette.danger,
    fontSize: 13,
    lineHeight: 20,
  },
  link: {
    color: palette.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 2,
  },
  linkHighlight: {
    color: palette.primary,
    fontWeight: '600',
  },
});
