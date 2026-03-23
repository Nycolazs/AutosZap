'use client';

import { useEffect, useMemo } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { OAUTH_CALLBACK_MESSAGE_TYPE } from '@/lib/facebook-sdk';

export default function EmbeddedSignupCallbackPage() {
  const result = useMemo(() => {
    if (typeof window === 'undefined') {
      return { code: null, error: null };
    }

    const params = new URLSearchParams(window.location.search);
    return {
      code: params.get('code'),
      error: params.get('error_description') || params.get('error'),
    };
  }, []);

  useEffect(() => {
    if (!window.opener) {
      return;
    }

    window.opener.postMessage(
      {
        type: OAUTH_CALLBACK_MESSAGE_TYPE,
        code: result.code || null,
        error: result.error || null,
      },
      '*',
    );

    if (result.code) {
      window.setTimeout(() => window.close(), 1500);
    }
  }, [result]);

  const hasCode = Boolean(result.code);
  const hasError = Boolean(result.error);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#060918] text-white">
      <div className="space-y-3 p-8 text-center">
        {hasCode ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="text-sm text-white/70">
              Autorizacao concluida. Esta janela sera fechada automaticamente.
            </p>
          </>
        ) : hasError ? (
          <>
            <AlertCircle className="mx-auto h-10 w-10 text-rose-400" />
            <p className="text-sm text-white/70">{result.error}</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-400" />
            <p className="text-sm text-white/70">Processando autorizacao...</p>
          </>
        )}
      </div>
    </main>
  );
}
