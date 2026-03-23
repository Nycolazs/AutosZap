'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to an error reporting service when available
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-5 rounded-[22px] bg-danger/10 p-4 text-danger">
        <AlertTriangle className="h-8 w-8" />
      </div>

      <h1 className="font-heading text-[22px] font-semibold tracking-tight">Algo deu errado</h1>

      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        Ocorreu um erro inesperado nesta área. Tente recarregar ou volte para o painel.
      </p>

      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground/60">
          Código: {error.digest}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
        <Button asChild variant="secondary">
          <Link href="/app">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao painel
          </Link>
        </Button>
      </div>
    </div>
  );
}
