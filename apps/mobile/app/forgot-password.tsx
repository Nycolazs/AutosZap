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
import { router } from 'expo-router';
import { ScreenTransition } from '@/components/screen-transition';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function ForgotPasswordScreen() {
  const { api } = useSession();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
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
            <Text style={styles.eyebrow}>RECUPERAR ACESSO</Text>
            <Text style={styles.title}>Esqueceu sua senha?</Text>
            <Text style={styles.description}>
              Informe seu e-mail e enviaremos um link para redefinir sua senha.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recuperar senha</Text>
            <Text style={styles.cardDescription}>
              Digite o e-mail cadastrado na sua conta do AutoZap.
            </Text>

            {sent ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>
                  Enviamos um link de recuperacao para {email}. Verifique sua caixa de entrada e
                  spam.
                </Text>
              </View>
            ) : (
              <>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="voce@empresa.com"
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
                      await api.forgotPassword({ email });
                      setSent(true);
                    } catch (nextError) {
                      setError(
                        nextError instanceof Error
                          ? nextError.message
                          : 'Nao foi possivel enviar o e-mail agora.',
                      );
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator color={palette.text} />
                  ) : (
                    <Text style={styles.buttonText}>Enviar link</Text>
                  )}
                </Pressable>
              </>
            )}

            <Pressable onPress={() => router.replace('/login')}>
              <Text style={styles.link}>
                Lembrou a senha? <Text style={styles.linkHighlight}>Entrar</Text>
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
  successBox: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(73, 216, 185, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(73, 216, 185, 0.25)',
  },
  successText: {
    color: palette.success,
    fontSize: 14,
    lineHeight: 22,
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
