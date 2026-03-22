'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  EMBEDDED_SIGNUP_BRIDGE_MESSAGE_TYPE,
  launchEmbeddedSignupDirect,
  type EmbeddedSignupResult,
} from '@/lib/facebook-sdk';

type BridgeStatus = 'launching' | 'success' | 'error';

type BridgeState = {
  status: BridgeStatus;
  message: string;
};

function getSearchParam(name: string) {
  if (typeof window === 'undefined') {
    return '';
  }

  return new URLSearchParams(window.location.search).get(name)?.trim() ?? '';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Nao foi possivel concluir o Embedded Signup da Meta.';
}

export default function EmbeddedSignupBridgePage() {
  const [bridgeState, setBridgeState] = useState<BridgeState>({
    status: 'launching',
    message: 'Preparando a janela segura da Meta...',
  });
  const launchStartedRef = useRef(false);
  const openerOrigin = useMemo(() => getSearchParam('origin'), []);
  const appId = useMemo(() => getSearchParam('appId'), []);
  const configurationId = useMemo(() => getSearchParam('configurationId'), []);
  const graphApiVersion = useMemo(
    () => getSearchParam('graphApiVersion') || 'v23.0',
    [],
  );
  const autoStart = useMemo(() => getSearchParam('autoStart') === '1', []);

  useEffect(() => {
    if (!autoStart) {
      setBridgeState({
        status: 'error',
        message:
          'Abra esta janela pelo modulo de instancias para iniciar o Embedded Signup.',
      });
      return;
    }

    void startEmbeddedSignup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, appId, configurationId, graphApiVersion]);

  async function startEmbeddedSignup() {
    if (launchStartedRef.current) {
      return;
    }

    launchStartedRef.current = true;
    setBridgeState({
      status: 'launching',
      message: 'Abrindo autenticacao segura da Meta...',
    });

    if (!appId || !configurationId) {
      launchStartedRef.current = false;
      setBridgeState({
        status: 'error',
        message:
          'A configuracao do Embedded Signup nao chegou completa para esta janela.',
      });
      return;
    }

    try {
      const result = await launchEmbeddedSignupDirect({
        appId,
        configurationId,
        graphApiVersion,
      });

      notifyOpener({
        type: EMBEDDED_SIGNUP_BRIDGE_MESSAGE_TYPE,
        success: true,
        result,
      });

      setBridgeState({
        status: 'success',
        message: 'Conexao autorizada na Meta. Esta janela pode ser fechada.',
      });

      window.setTimeout(() => window.close(), 1200);
    } catch (error) {
      launchStartedRef.current = false;
      const message = getErrorMessage(error);

      notifyOpener({
        type: EMBEDDED_SIGNUP_BRIDGE_MESSAGE_TYPE,
        success: false,
        error: message,
      });

      setBridgeState({
        status: 'error',
        message,
      });
    }
  }

  function notifyOpener(
    payload:
      | {
          type: typeof EMBEDDED_SIGNUP_BRIDGE_MESSAGE_TYPE;
          success: true;
          result: EmbeddedSignupResult;
        }
      | {
          type: typeof EMBEDDED_SIGNUP_BRIDGE_MESSAGE_TYPE;
          success: false;
          error: string;
        },
  ) {
    if (!window.opener || !openerOrigin) {
      return;
    }

    try {
      window.opener.postMessage(payload, openerOrigin);
    } catch {
      // Ignore cross-window delivery errors and keep the bridge UI visible.
    }
  }

  const isLoading = bridgeState.status === 'launching';
  const isSuccess = bridgeState.status === 'success';
  const isError = bridgeState.status === 'error';

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#060918] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-[25%] -top-[18%] h-[360px] w-[360px] rounded-full bg-blue-600/[0.10] blur-[110px]" />
        <div className="absolute -right-[20%] top-[18%] h-[300px] w-[300px] rounded-full bg-cyan-500/[0.08] blur-[110px]" />
        <div className="absolute inset-x-0 bottom-[-25%] mx-auto h-[320px] w-[320px] rounded-full bg-blue-500/[0.06] blur-[120px]" />
      </div>

      <div className="mx-auto flex min-h-dvh max-w-xl items-center justify-center px-4 py-8">
        <div className="w-full rounded-[28px] border border-white/[0.08] bg-white/[0.04] p-6 shadow-[0_32px_90px_rgba(5,10,25,0.45)] backdrop-blur-xl sm:p-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-blue-200">
            <Lock className="h-3.5 w-3.5" />
            Janela segura da Meta
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div
                className={[
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border',
                  isSuccess
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : isError
                      ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
                      : 'border-blue-400/30 bg-blue-400/10 text-blue-100',
                ].join(' ')}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isSuccess ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">
                  Embedded Signup
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
                  {isSuccess
                    ? 'Tudo certo com a Meta'
                    : isError
                      ? 'Nao foi possivel abrir o fluxo'
                      : 'Conectando seu numero oficial'}
                </h1>
                <p className="text-sm leading-6 text-white/70">
                  {bridgeState.message}
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/[0.08] bg-[#0b1228]/70 p-4">
              <div className="grid gap-3 text-sm text-white/72">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                  1. Entrar na conta Business correta.
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                  2. Escolher a WABA e o numero da API oficial.
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                  3. Autorizar o app e voltar automaticamente ao AutosZap.
                </div>
              </div>
            </div>

            {isError ? (
              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="button" onClick={() => void startEmbeddedSignup()}>
                  <RefreshCw className="h-4 w-4" />
                  Tentar novamente
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => window.close()}
                >
                  Fechar
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
