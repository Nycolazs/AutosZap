'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { loadFacebookSdk } from '@/lib/facebook-sdk';
import { resolvePostAuthRedirect } from '@/lib/auth-redirect';

/* ── SVG Icons ── */

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

/* ── Google SDK ── */

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
  '121260038469-oqt0ujgfinc815bmolr61md8egkkokni.apps.googleusercontent.com';
const FACEBOOK_APP_ID =
  process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? '1904602866817490';

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar ${id}`));
    document.head.appendChild(script);
  });
}

/* ── Component ── */

interface SocialLoginButtonsProps {
  mode: 'login' | 'register';
  companyName?: string;
  inviteCode?: string;
}

export function SocialLoginButtons({ mode, companyName, inviteCode }: SocialLoginButtonsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const fbSdkReady = useRef(false);

  const hasGoogle = Boolean(GOOGLE_CLIENT_ID);
  const hasFacebook = Boolean(FACEBOOK_APP_ID);

  /* ── Pre-load SDKs on mount so popups fire within the user gesture ── */
  useEffect(() => {
    if (hasGoogle) {
      loadScript('https://accounts.google.com/gsi/client', 'google-gsi').catch(() => {});
    }
    if (hasFacebook) {
      loadFacebookSdk({ appId: FACEBOOK_APP_ID })
        .then(() => { fbSdkReady.current = true; })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendToBackend = useCallback(
    async (provider: string, token: string, name?: string) => {
      const response = await fetch('/api/auth/social-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          token,
          name,
          companyName: companyName || undefined,
          inviteCode: inviteCode || undefined,
          loginOnly: mode === 'login' ? true : undefined,
        }),
      });

      const data = (await response.json()) as {
        message?: string | string[];
        user?: { isPlatformAdmin?: boolean; companyId?: string | null };
      };

      if (!response.ok) {
        if (mode === 'login') {
          toast.error('Nao encontramos sua conta. Cadastre-se para continuar.');
          router.push('/register');
          return;
        }
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(', ')
            : (data.message ?? 'Erro na autenticacao social.'),
        );
      }

      toast.success(
        mode === 'register'
          ? 'Conta criada com sucesso!'
          : 'Sessao iniciada com sucesso.',
      );
      const nextPath = data.user?.isPlatformAdmin
        ? '/platform'
        : await resolvePostAuthRedirect();
      router.push(nextPath);
    },
    [companyName, inviteCode, mode, router],
  );

  const handleGoogle = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) {
      toast.error('Login com Google nao configurado.');
      return;
    }
    setLoading('google');
    try {
      await loadScript('https://accounts.google.com/gsi/client', 'google-gsi');
      await new Promise<void>((resolve) => {
        const check = () => {
          if (window.google?.accounts?.oauth2) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });

      const accessToken = await new Promise<string>((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'email profile',
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new Error(response.error ?? 'Login Google cancelado.'));
            } else {
              resolve(response.access_token);
            }
          },
        });
        client.requestAccessToken();
      });

      await sendToBackend('google', accessToken);
    } catch (error) {
      if (error instanceof Error && error.message !== 'Login Google cancelado.') {
        toast.error(error.message);
      }
    } finally {
      setLoading(null);
    }
  }, [sendToBackend]);

  /* ── Facebook: SDK pre-carregado no mount; FB.login() chamado de forma sincrona ── */
  const handleFacebook = useCallback(() => {
    if (!FACEBOOK_APP_ID) {
      toast.error('Login com Facebook nao configurado.');
      return;
    }

    /* Se o SDK ainda nao foi carregado, iniciar agora e pedir para tentar novamente */
    if (!window.FB) {
      setLoading('facebook');
      loadFacebookSdk({ appId: FACEBOOK_APP_ID })
        .then(() => {
          fbSdkReady.current = true;
          toast.info('Facebook carregado. Clique novamente para continuar.');
        })
        .catch(() => {
          toast.error('Nao foi possivel carregar o Facebook. Tente novamente.');
        })
        .finally(() => setLoading(null));
      return;
    }

    setLoading('facebook');

    /* FB.login() deve ser chamado de forma sincrona dentro do evento de clique */
    window.FB.login(
      (response) => {
        if (!response.authResponse?.accessToken) {
          setLoading(null);
          return;
        }
        sendToBackend('facebook', response.authResponse.accessToken)
          .catch((error) => {
            if (error instanceof Error) {
              toast.error(error.message);
            }
          })
          .finally(() => setLoading(null));
      },
      { scope: 'email' },
    );
  }, [sendToBackend]);

  const hasAny = hasGoogle || hasFacebook;
  if (!hasAny) return null;

  return (
    <div className="mx-auto w-full max-w-[400px] space-y-2">
      <div className="relative flex items-center gap-3 py-0.5">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] text-muted-foreground">
          {mode === 'login' ? 'ou entre com' : 'ou cadastre-se com'}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-2">
        {hasGoogle ? (
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-full rounded-xl border border-border/70 bg-white/[0.03] text-[12px] font-medium hover:bg-white/[0.06]"
            disabled={loading !== null}
            onClick={handleGoogle}
          >
            {loading === 'google' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon className="mr-2 h-4 w-4" />
            )}
            Continuar com Google
          </Button>
        ) : null}

        {hasFacebook ? (
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-full rounded-xl border border-border/70 bg-white/[0.03] text-[12px] font-medium hover:bg-white/[0.06]"
            disabled={loading !== null}
            onClick={handleFacebook}
          >
            {loading === 'facebook' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FacebookIcon className="mr-2 h-4 w-4" />
            )}
            Continuar com Facebook
          </Button>
        ) : null}
      </div>
    </div>
  );
}
