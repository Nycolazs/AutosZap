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

export default function RegisterScreen() {
  const { api } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
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
            <Text style={styles.eyebrow}>CRIAR CONTA</Text>
            <Text style={styles.title}>Comece a usar o AutoZap.</Text>
            <Text style={styles.description}>
              Crie sua conta e conecte sua equipe ao atendimento inteligente.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cadastro</Text>
            <Text style={styles.cardDescription}>
              Preencha os dados abaixo para criar sua conta no AutoZap.
            </Text>

            <TextInput
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              placeholder="Seu nome completo"
              placeholderTextColor={palette.textMuted}
              style={styles.input}
            />

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

            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Crie uma senha"
              placeholderTextColor={palette.textMuted}
              style={styles.input}
            />

            <TextInput
              value={companyName}
              onChangeText={setCompanyName}
              autoCapitalize="words"
              placeholder="Nome da empresa"
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
                  await api.register({ name, email, password, companyName });
                  router.replace('/login');
                } catch (nextError) {
                  setError(
                    nextError instanceof Error
                      ? nextError.message
                      : 'Nao foi possivel criar a conta agora.',
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? (
                <ActivityIndicator color={palette.text} />
              ) : (
                <Text style={styles.buttonText}>Criar conta</Text>
              )}
            </Pressable>

            <Pressable onPress={() => router.replace('/login')}>
              <Text style={styles.link}>
                Ja tem uma conta? <Text style={styles.linkHighlight}>Entrar</Text>
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
