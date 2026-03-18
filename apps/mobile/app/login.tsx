import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenTransition } from '@/components/screen-transition';
import {
  readLoginCredentials,
  writeLoginCredentials,
} from '@/lib/storage';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

export default function LoginScreen() {
  const { login } = useSession();
  const [email, setEmail] = useState('admin@autoszap.com');
  const [password, setPassword] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberCredentials, setRememberCredentials] = useState(false);
  const [booting, setBooting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const saved = await readLoginCredentials();

      if (saved) {
        setEmail(saved.email);
        setPassword(saved.password);
        setRememberCredentials(true);
      }

      setBooting(false);
    })();
  }, []);

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
            <Text style={styles.eyebrow}>APP MOBILE</Text>
            <Text style={styles.title}>AutoZap no ritmo do atendimento.</Text>
            <Text style={styles.description}>
              Converse com clientes, acompanhe lembretes e reaja mais rápido a novas mensagens.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Entrar</Text>
            <Text style={styles.cardDescription}>
              Use sua conta do AutoZap para acessar o app do vendedor.
            </Text>

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

            <View style={styles.passwordWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
                placeholder="Sua senha"
                placeholderTextColor={palette.textMuted}
                style={styles.passwordInput}
              />
              <Pressable
                onPress={() => setShowPassword((current) => !current)}
                style={styles.eyeButton}
                hitSlop={10}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={palette.textMuted}
                />
              </Pressable>
            </View>

            <View style={styles.rememberRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rememberTitle}>Lembrar usuario e senha</Text>
                <Text style={styles.rememberHint}>
                  Salva os dados neste dispositivo para facilitar o proximo login.
                </Text>
              </View>
              <Switch
                value={rememberCredentials}
                onValueChange={setRememberCredentials}
                thumbColor={rememberCredentials ? '#ffffff' : '#d1d8e5'}
                trackColor={{
                  false: 'rgba(148, 167, 199, 0.35)',
                  true: 'rgba(61, 150, 255, 0.62)',
                }}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.button, (submitting || booting) && styles.buttonDisabled]}
              disabled={submitting || booting}
              onPress={async () => {
                try {
                  setSubmitting(true);
                  setError(null);
                  await writeLoginCredentials({
                    email,
                    password,
                    remember: rememberCredentials,
                  });
                  await login(email, password);
                  router.replace('/(tabs)/conversations');
                } catch (nextError) {
                  setError(
                    nextError instanceof Error
                      ? nextError.message
                      : 'Nao foi possivel entrar agora.',
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting || booting ? (
                <ActivityIndicator color={palette.text} />
              ) : (
                <Text style={styles.buttonText}>Entrar</Text>
              )}
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
  passwordWrap: {
    height: 54,
    borderRadius: 18,
    paddingRight: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 16,
    color: palette.text,
    fontSize: 16,
  },
  eyeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rememberTitle: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
  },
  rememberHint: {
    color: palette.textMuted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18,
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
});
