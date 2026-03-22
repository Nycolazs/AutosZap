'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api-client';
import {
  AUTOSZAP_PUBLIC_APP_URL,
  launchEmbeddedSignup,
  loadFacebookSdk,
} from '@/lib/facebook-sdk';
import type {
  CreateEmbeddedSignupPayload,
  EmbeddedSignupConfig,
  EmbeddedSignupInstance,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import type { ButtonProps } from '@/components/ui/button';

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Nao foi possivel concluir a conexao com a Meta.';
}

function getConfigHint(message?: string | null) {
  if (!message) {
    return null;
  }

  if (message.includes('META_APP_ID')) {
    return 'O backend ainda nao recebeu o META_APP_ID.';
  }

  if (message.includes('META_EMBEDDED_SIGNUP_CONFIG_ID')) {
    return 'O backend ainda nao recebeu o config ID do Embedded Signup.';
  }

  if (message.includes('BACKEND_PUBLIC_URL')) {
    return 'O backend ainda nao recebeu a URL publica usada no webhook.';
  }

  return message;
}

type EmbeddedSignupActionProps = {
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
};

export function EmbeddedSignupAction({
  label = 'Conectar via Meta',
  variant = 'secondary',
  size = 'default',
  className,
}: EmbeddedSignupActionProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [instanceName, setInstanceName] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);

  const configQuery = useQuery({
    queryKey: ['instances', 'embedded-signup-config'],
    queryFn: () =>
      apiRequest<EmbeddedSignupConfig>('instances/embedded-signup-config'),
    enabled: open,
    retry: false,
  });

  // Preload the Facebook SDK as soon as config is available so that
  // FB.login() can be called synchronously from the user's click handler
  // (preserving user gesture context and avoiding popup blockers).
  useEffect(() => {
    if (!configQuery.data) {
      return;
    }

    loadFacebookSdk({
      appId: configQuery.data.appId,
    }).catch(() => {
      // Silently ignore — the SDK will be retried when the user clicks.
    });
  }, [configQuery.data]);

  async function handleEmbeddedSignup() {
    setIsLaunching(true);

    try {
      const config =
        configQuery.data ?? (await configQuery.refetch()).data ?? null;

      if (!config) {
        throw new Error(
          'Nao foi possivel carregar a configuracao do Embedded Signup.',
        );
      }

      const signupResult = await launchEmbeddedSignup({
        appId: config.appId,
        configurationId: config.configurationId,
        bridgeBaseUrl: AUTOSZAP_PUBLIC_APP_URL,
      });

      const payload: CreateEmbeddedSignupPayload = {
        ...signupResult,
        name: instanceName.trim() || undefined,
      };

      const response = await apiRequest<EmbeddedSignupInstance>(
        'instances/embedded-signup',
        {
          method: 'POST',
          body: payload,
        },
      );

      await queryClient.invalidateQueries({ queryKey: ['instances'] });

      toast.success(
        response.embeddedSignup.reusedExistingInstance
          ? 'Numero reconectado e instancia existente atualizada.'
          : 'Nova instancia conectada com sucesso pela Meta.',
      );

      if (
        response.embeddedSignup.sync.success &&
        response.embeddedSignup.subscribe.success
      ) {
        toast.info(
          'Sincronizacao inicial e inscricao do webhook concluidas automaticamente.',
        );
      } else {
        if (!response.embeddedSignup.sync.success) {
          toast.info(`Sync pendente: ${response.embeddedSignup.sync.message}`);
        }
        if (!response.embeddedSignup.subscribe.success) {
          toast.info(
            `Inscricao do webhook pendente: ${response.embeddedSignup.subscribe.message}`,
          );
        }
      }

      setOpen(false);
      setInstanceName('');
    } catch (error) {
      const message = getErrorMessage(error);
      if (/cancelado/i.test(message)) {
        toast.info(message);
      } else {
        toast.error(message);
      }
    } finally {
      setIsLaunching(false);
    }
  }

  const configError = configQuery.error instanceof Error
    ? configQuery.error.message
    : null;
  const configHint = getConfigHint(configError);
  const callbackUri = configQuery.data?.callbackUri;
  const metaReady = Boolean(configQuery.data && !configError);
  const webhookReady = Boolean(callbackUri);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn(className)}
        onClick={() => setOpen(true)}
      >
        <Smartphone className="h-4 w-4" />
        {label}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setInstanceName('');
          }
        }}
      >
        <DialogContent className="w-[min(520px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>Adicionar via Embedded Signup</DialogTitle>
            <DialogDescription>
              Conecte um numero oficial pela jornada da Meta, sem preencher
              token, app secret ou webhook manualmente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Fluxo oficial da Meta</Badge>
              <Badge variant="secondary">Sem token manual</Badge>
              {metaReady ? <Badge variant="success">Servidor pronto</Badge> : null}
              {webhookReady ? <Badge variant="success">Webhook pronto</Badge> : null}
            </div>

            <div className="rounded-[20px] border border-border/70 bg-background-panel/45 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-primary-soft p-2.5 text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    O AutosZap vai abrir a janela segura da Meta.
                  </p>
                  <ol className="space-y-1 text-sm leading-6 text-muted-foreground">
                    <li>1. Entrar na conta Business correta.</li>
                    <li>2. Escolher a WABA e o numero.</li>
                    <li>3. Autorizar o app e voltar com a instancia criada.</li>
                  </ol>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Se esse numero ja existir neste workspace, a instancia atual
                    sera reaproveitada.
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Em ambiente local, a janela segura pode ser aberta por{' '}
                    <span className="text-foreground">autoszap.com</span> para
                    evitar bloqueios do login da Meta no localhost.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="embedded-signup-name">
                Nome interno da instancia
              </Label>
              <Input
                id="embedded-signup-name"
                placeholder="Opcional. Ex.: WhatsApp Oficina Matriz"
                value={instanceName}
                onChange={(event) => setInstanceName(event.target.value)}
                disabled={isLaunching}
              />
              <p className="text-xs text-muted-foreground">
                Se ficar em branco, usamos o nome verificado ou o numero vindo da
                Meta.
              </p>
            </div>

            {callbackUri ? (
              <div className="rounded-[18px] border border-border/70 bg-background-panel/35 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
                Webhook de callback:{' '}
                <span className="text-foreground">{callbackUri}</span>
              </div>
            ) : null}

            {configHint ? (
              <div className="rounded-[18px] border border-danger/30 bg-danger/6 px-3.5 py-3 text-sm text-danger">
                {configHint}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={isLaunching}
              >
                Fechar
              </Button>
              <Button
                type="button"
                onClick={handleEmbeddedSignup}
                disabled={
                  isLaunching ||
                  configQuery.isLoading ||
                  Boolean(configError)
                }
              >
                {isLaunching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                Continuar com Meta
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

