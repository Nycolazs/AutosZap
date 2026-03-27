'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api-client';
import {
  assertFacebookLoginSupportedOnCurrentOrigin,
  loadFacebookSdk,
} from '@/lib/facebook-sdk';
import { AuthMeResponse } from '@/lib/types';

type WorkspaceResponse = {
  id: string;
  name: string;
  companyName: string;
  legalName?: string | null;
  cnpj?: string | null;
  stateRegistration?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  district?: string | null;
  city?: string | null;
  stateCode?: string | null;
  zipCode?: string | null;
  settings?: Record<string, unknown>;
};

type SocialProvider = 'google' | 'facebook';
type WorkspaceFormDraft = {
  name?: string;
  companyName?: string;
  legalName?: string;
  cnpj?: string;
  stateRegistration?: string;
  phone?: string;
  email?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  district?: string;
  city?: string;
  stateCode?: string;
  zipCode?: string;
};

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

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return 'AZ';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const hasGoogle = Boolean(GOOGLE_CLIENT_ID);
  const hasFacebook = Boolean(FACEBOOK_APP_ID);

  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiRequest<AuthMeResponse>('auth/me'),
  });
  const workspaceQuery = useQuery({
    queryKey: ['workspace'],
    queryFn: () => apiRequest<WorkspaceResponse>('users/workspace'),
  });

  const [profileValues, setProfileValues] = useState({
    name: undefined as string | undefined,
    email: undefined as string | undefined,
    title: undefined as string | undefined,
  });
  const [workspaceValues, setWorkspaceValues] = useState<WorkspaceFormDraft>({
    name: undefined,
    companyName: undefined,
    legalName: undefined,
    cnpj: undefined,
    stateRegistration: undefined,
    phone: undefined,
    email: undefined,
    website: undefined,
    addressLine1: undefined,
    addressLine2: undefined,
    district: undefined,
    city: undefined,
    stateCode: undefined,
    zipCode: undefined,
  });
  const [passwordValues, setPasswordValues] = useState({
    currentPassword: '',
    newPassword: '',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarInputKey, setAvatarInputKey] = useState(0);
  const [connectingProvider, setConnectingProvider] =
    useState<SocialProvider | null>(null);

  const resolvedProfileValues = useMemo(
    () => ({
      name: profileValues.name ?? meQuery.data?.name ?? '',
      email: profileValues.email ?? meQuery.data?.email ?? '',
      title: profileValues.title ?? meQuery.data?.title ?? '',
    }),
    [
      meQuery.data?.email,
      meQuery.data?.name,
      meQuery.data?.title,
      profileValues.email,
      profileValues.name,
      profileValues.title,
    ],
  );
  const resolvedWorkspaceValues = {
    name: workspaceValues.name ?? workspaceQuery.data?.name ?? '',
    companyName: workspaceValues.companyName ?? workspaceQuery.data?.companyName ?? '',
    legalName: workspaceValues.legalName ?? workspaceQuery.data?.legalName ?? '',
    cnpj: workspaceValues.cnpj ?? workspaceQuery.data?.cnpj ?? '',
    stateRegistration:
      workspaceValues.stateRegistration ??
      workspaceQuery.data?.stateRegistration ??
      '',
    phone: workspaceValues.phone ?? workspaceQuery.data?.phone ?? '',
    email: workspaceValues.email ?? workspaceQuery.data?.email ?? '',
    website: workspaceValues.website ?? workspaceQuery.data?.website ?? '',
    addressLine1:
      workspaceValues.addressLine1 ?? workspaceQuery.data?.addressLine1 ?? '',
    addressLine2:
      workspaceValues.addressLine2 ?? workspaceQuery.data?.addressLine2 ?? '',
    district: workspaceValues.district ?? workspaceQuery.data?.district ?? '',
    city: workspaceValues.city ?? workspaceQuery.data?.city ?? '',
    stateCode: workspaceValues.stateCode ?? workspaceQuery.data?.stateCode ?? '',
    zipCode: workspaceValues.zipCode ?? workspaceQuery.data?.zipCode ?? '',
  };

  const avatarUrl = avatarPreviewUrl ?? meQuery.data?.avatarUrl ?? null;
  const canManageWorkspace = meQuery.data?.normalizedRole === 'ADMIN';
  const socialConnections = meQuery.data?.socialConnections ?? {
    google: false,
    facebook: false,
  };

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [avatarFile]);

  useEffect(() => {
    if (hasGoogle) {
      loadScript('https://accounts.google.com/gsi/client', 'google-gsi').catch(
        () => {},
      );
    }

    if (hasFacebook) {
      loadFacebookSdk({ appId: FACEBOOK_APP_ID })
        .then(() => {})
        .catch(() => {});
    }
  }, [hasFacebook, hasGoogle]);

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      apiRequest('users/profile', {
        method: 'PATCH',
        body: resolvedProfileValues,
      }),
    onSuccess: async () => {
      toast.success('Perfil atualizado.');
      await queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async () => {
      if (!avatarFile) {
        throw new Error('Selecione uma imagem para enviar.');
      }

      const formData = new FormData();
      formData.append('file', avatarFile);

      return apiRequest<{ avatarUrl: string }>('users/profile/avatar', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: async () => {
      toast.success('Foto de perfil atualizada.');
      setAvatarFile(null);
      setAvatarInputKey((current) => current + 1);
      await queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connectProviderMutation = useMutation({
    mutationFn: ({
      provider,
      token,
    }: {
      provider: SocialProvider;
      token: string;
    }) =>
      apiRequest('auth/connect-provider', {
        method: 'POST',
        body: {
          provider,
          token,
        },
      }),
    onSuccess: async (_data, variables) => {
      toast.success(
        variables.provider === 'google'
          ? 'Google conectado com sucesso.'
          : 'Facebook conectado com sucesso.',
      );
      await queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: () => {
      if (!resolvedWorkspaceValues.name.trim()) {
        throw new Error('Informe o nome da workspace.');
      }

      if (!resolvedWorkspaceValues.companyName.trim()) {
        throw new Error('Informe o nome fantasia da empresa.');
      }

      return apiRequest('users/workspace', {
        method: 'PATCH',
        body: resolvedWorkspaceValues,
      });
    },
    onSuccess: async () => {
      toast.success('Dados da empresa atualizados.');
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      apiRequest('users/change-password', {
        method: 'PATCH',
        body: passwordValues,
      }),
    onSuccess: () => {
      toast.success('Senha alterada.');
      setPasswordValues({
        currentPassword: '',
        newPassword: '',
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleAvatarSelection(file: File | null) {
    if (!file) {
      setAvatarFile(null);
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Use uma imagem JPG, PNG ou WEBP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('A foto deve ter no maximo 5 MB.');
      return;
    }

    setAvatarFile(file);
  }

  function clearAvatarSelection() {
    setAvatarFile(null);
    setAvatarInputKey((current) => current + 1);
  }

  async function handleGoogleConnect() {
    if (!GOOGLE_CLIENT_ID) {
      toast.error('Login com Google nao configurado.');
      return;
    }

    setConnectingProvider('google');

    try {
      await loadScript('https://accounts.google.com/gsi/client', 'google-gsi');

      await new Promise<void>((resolve) => {
        const check = () => {
          if (window.google?.accounts?.oauth2) {
            resolve();
            return;
          }

          setTimeout(check, 100);
        };

        check();
      });

      const token = await new Promise<string>((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'email profile',
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new Error(response.error ?? 'Conexao com Google cancelada.'));
            } else {
              resolve(response.access_token);
            }
          },
        });

        client.requestAccessToken();
      });

      await connectProviderMutation.mutateAsync({
        provider: 'google',
        token,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message !== 'Conexao com Google cancelada.'
      ) {
        toast.error(error.message);
      }
    } finally {
      setConnectingProvider(null);
    }
  }

  function handleFacebookConnect() {
    if (!FACEBOOK_APP_ID) {
      toast.error('Login com Facebook nao configurado.');
      return;
    }

    try {
      assertFacebookLoginSupportedOnCurrentOrigin();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'O Facebook exige HTTPS para o login web.',
      );
      return;
    }

    if (!window.FB) {
      setConnectingProvider('facebook');
      loadFacebookSdk({ appId: FACEBOOK_APP_ID })
        .then(() => {
          toast.info('Facebook carregado. Clique novamente para continuar.');
        })
        .catch(() => {
          toast.error('Nao foi possivel carregar o Facebook. Tente novamente.');
        })
        .finally(() => setConnectingProvider(null));
      return;
    }

    setConnectingProvider('facebook');

    window.FB.login(
      (response) => {
        const token = response.authResponse?.accessToken;

        if (!token) {
          setConnectingProvider(null);
          return;
        }

        connectProviderMutation
          .mutateAsync({
            provider: 'facebook',
            token,
          })
          .catch((error) => {
            if (error instanceof Error) {
              toast.error(error.message);
            }
          })
          .finally(() => setConnectingProvider(null));
      },
      { scope: 'email' },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Atualize perfil, dados da empresa e ajustes principais da conta."
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsFormCard
          title="Perfil"
          description="Dados do usuário autenticado."
          onSubmit={() => updateProfileMutation.mutate()}
          disabled={updateProfileMutation.isPending}
          pending={updateProfileMutation.isPending}
        >
          <div className="rounded-[24px] border border-border bg-white/[0.03] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20 rounded-[28px] border-border/80">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={resolvedProfileValues.name} />
                  ) : null}
                  <AvatarFallback className="text-lg">
                    {getInitials(resolvedProfileValues.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Foto de perfil
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Faça upload de uma imagem quadrada em JPG, PNG ou WEBP.
                  </p>
                  {avatarFile ? (
                    <p className="text-xs text-primary">
                      Preview pronto para envio: {avatarFile.name}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="w-full lg:max-w-sm">
                <input
                  key={avatarInputKey}
                  id={`avatar-upload-${avatarInputKey}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) =>
                    handleAvatarSelection(event.target.files?.[0] ?? null)
                  }
                />

                <label
                  htmlFor={`avatar-upload-${avatarInputKey}`}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background-panel px-4 py-3 transition-colors hover:border-border-strong"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-muted-foreground">
                    <Upload className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {avatarFile ? avatarFile.name : 'Selecionar imagem'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {avatarFile
                        ? 'Imagem pronta para envio.'
                        : 'PNG, JPG ou WEBP com até 5 MB.'}
                    </p>
                  </div>
                </label>

                <div className="mt-3 flex justify-end gap-2">
                  {avatarFile ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full sm:w-auto"
                      onClick={clearAvatarSelection}
                      disabled={uploadAvatarMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                      Limpar
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    disabled={!avatarFile || uploadAvatarMutation.isPending}
                    onClick={() => uploadAvatarMutation.mutate()}
                  >
                    {uploadAvatarMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploadAvatarMutation.isPending
                      ? 'Enviando foto...'
                      : 'Enviar foto'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Conexões sociais
              </p>
              <p className="text-xs text-muted-foreground">
                Vincule Google ou Facebook para entrar sem depender apenas da
                senha.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {hasGoogle ? (
                <SocialConnectionButton
                  label="Google"
                  description={
                    socialConnections.google
                      ? 'Conta Google já conectada.'
                      : 'Conectar sua conta Google.'
                  }
                  connected={socialConnections.google}
                  pending={connectingProvider === 'google'}
                  icon={<GoogleIcon className="h-4 w-4" />}
                  onClick={handleGoogleConnect}
                />
              ) : null}

              {hasFacebook ? (
                <SocialConnectionButton
                  label="Facebook"
                  description={
                    socialConnections.facebook
                      ? 'Conta Facebook já conectada.'
                      : 'Conectar sua conta Facebook.'
                  }
                  connected={socialConnections.facebook}
                  pending={connectingProvider === 'facebook'}
                  icon={<FacebookIcon className="h-4 w-4" />}
                  onClick={handleFacebookConnect}
                />
              ) : null}
            </div>
          </div>

          <Field
            label="Nome"
            value={resolvedProfileValues.name}
            onChange={(value) =>
              setProfileValues((current) => ({ ...current, name: value }))
            }
          />
          <Field
            label="Email"
            value={resolvedProfileValues.email}
            onChange={(value) =>
              setProfileValues((current) => ({ ...current, email: value }))
            }
          />
          <Field
            label="Cargo"
            value={resolvedProfileValues.title}
            onChange={(value) =>
              setProfileValues((current) => ({ ...current, title: value }))
            }
          />

          <div className="space-y-4 rounded-[24px] border border-border bg-white/[0.03] p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Segurança</p>
              <p className="text-xs text-muted-foreground">
                Altere sua senha atual.
              </p>
            </div>

            <Field
              label="Senha atual"
              type="password"
              value={passwordValues.currentPassword}
              onChange={(value) =>
                setPasswordValues((current) => ({
                  ...current,
                  currentPassword: value,
                }))
              }
            />
            <Field
              label="Nova senha"
              type="password"
              value={passwordValues.newPassword}
              onChange={(value) =>
                setPasswordValues((current) => ({
                  ...current,
                  newPassword: value,
                }))
              }
            />

            <div className="flex">
              <Button
                type="button"
                onClick={() => changePasswordMutation.mutate()}
                disabled={changePasswordMutation.isPending}
                className="w-full sm:w-auto"
              >
                {changePasswordMutation.isPending ? 'Salvando...' : 'Salvar senha'}
              </Button>
            </div>
          </div>
        </SettingsFormCard>

        {canManageWorkspace ? (
          <SettingsFormCard
            title="Empresa"
            description="Dados do workspace e do cadastro principal da empresa."
            onSubmit={() => updateWorkspaceMutation.mutate()}
            disabled={updateWorkspaceMutation.isPending}
            pending={updateWorkspaceMutation.isPending}
          >
            <WorkspaceCompanyFields
              values={resolvedWorkspaceValues}
              onChange={(field, value) =>
                setWorkspaceValues((current) => ({
                  ...current,
                  [field]: value,
                }))
              }
            />
          </SettingsFormCard>
        ) : (
          <Card className="p-0">
            <CardHeader className="px-5 pt-5 sm:px-6 sm:pt-6">
              <CardTitle>Empresa</CardTitle>
              <CardDescription>
                Visualização dos dados da empresa. Somente administradores podem
                alterar essas informações.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
              <div className="rounded-[24px] border border-border bg-white/[0.03] p-4 text-sm text-muted-foreground">
                Somente administradores podem alterar os dados do workspace e do
                cadastro da empresa.
              </div>
              <WorkspaceCompanyFields
                values={resolvedWorkspaceValues}
                disabled
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function SettingsFormCard({
  title,
  description,
  disabled,
  pending,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  pending?: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-0">
      <CardHeader className="px-5 pt-5 sm:px-6 sm:pt-6">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
        {children}
        <div className="flex">
          <Button onClick={onSubmit} disabled={disabled} className="w-full sm:w-auto">
            {pending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SocialConnectionButton({
  label,
  description,
  icon,
  connected,
  pending,
  onClick,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-[20px] border border-border bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {icon}
            <span>{label}</span>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span
          className={
            connected
              ? 'rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300'
              : 'rounded-full border border-border bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-muted-foreground'
          }
        >
          {connected ? 'Conectado' : 'Pendente'}
        </span>
      </div>

      <Button
        type="button"
        variant={connected ? 'ghost' : 'secondary'}
        className="mt-4 w-full"
        disabled={connected || pending}
        onClick={onClick}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {connected ? 'Conta vinculada' : `Conectar ${label}`}
      </Button>
    </div>
  );
}

function WorkspaceCompanyFields({
  values,
  onChange,
  disabled = false,
}: {
  values: {
    name: string;
    companyName: string;
    legalName: string;
    cnpj: string;
    stateRegistration: string;
    phone: string;
    email: string;
    website: string;
    addressLine1: string;
    addressLine2: string;
    district: string;
    city: string;
    stateCode: string;
    zipCode: string;
  };
  onChange?: (field: keyof WorkspaceFormDraft, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label="Nome da workspace"
        value={values.name}
        onChange={(value) => onChange?.('name', value)}
        disabled={disabled}
        className="md:col-span-2"
        placeholder="Nao informado"
      />
      <Field
        label="Nome fantasia"
        value={values.companyName}
        onChange={(value) => onChange?.('companyName', value)}
        disabled={disabled}
        placeholder="Nao informado"
      />
      <Field
        label="Razão social"
        value={values.legalName}
        onChange={(value) => onChange?.('legalName', value)}
        disabled={disabled}
        placeholder="Nao informado"
      />
      <Field
        label="CNPJ"
        value={values.cnpj}
        onChange={(value) => onChange?.('cnpj', value)}
        disabled={disabled}
        placeholder="00.000.000/0000-00"
      />
      <Field
        label="Inscrição estadual"
        value={values.stateRegistration}
        onChange={(value) => onChange?.('stateRegistration', value)}
        disabled={disabled}
        placeholder="Nao informado"
      />
      <Field
        label="Telefone"
        value={values.phone}
        onChange={(value) => onChange?.('phone', value)}
        disabled={disabled}
        placeholder="Nao informado"
      />
      <Field
        label="Email da empresa"
        type="email"
        value={values.email}
        onChange={(value) => onChange?.('email', value)}
        disabled={disabled}
        placeholder="contato@empresa.com"
      />
      <Field
        label="Website"
        type="url"
        value={values.website}
        onChange={(value) => onChange?.('website', value)}
        disabled={disabled}
        placeholder="https://empresa.com"
      />
      <Field
        label="Endereço"
        value={values.addressLine1}
        onChange={(value) => onChange?.('addressLine1', value)}
        disabled={disabled}
        className="md:col-span-2"
        placeholder="Rua, número e complemento principal"
      />
      <Field
        label="Complemento"
        value={values.addressLine2}
        onChange={(value) => onChange?.('addressLine2', value)}
        disabled={disabled}
        placeholder="Sala, bloco, referência"
      />
      <Field
        label="Bairro"
        value={values.district}
        onChange={(value) => onChange?.('district', value)}
        disabled={disabled}
        placeholder="Nao informado"
      />
      <Field
        label="Cidade"
        value={values.city}
        onChange={(value) => onChange?.('city', value)}
        disabled={disabled}
        placeholder="Nao informado"
      />
      <Field
        label="Estado / UF"
        value={values.stateCode}
        onChange={(value) => onChange?.('stateCode', value)}
        disabled={disabled}
        placeholder="CE"
      />
      <Field
        label="CEP"
        value={values.zipCode}
        onChange={(value) => onChange?.('zipCode', value)}
        disabled={disabled}
        placeholder="00000-000"
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  className,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </div>
  );
}
