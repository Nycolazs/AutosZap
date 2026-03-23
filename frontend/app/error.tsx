'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

export default function GlobalError({
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
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#040d19] font-sans text-[#eff6ff] antialiased">
        <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
          {/* Background radial gradients */}
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(50,151,255,0.10),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(255,107,129,0.08),transparent_35%)]" />

          <div className="relative z-10 flex flex-col items-center text-center">
            <Link href="/" className="mb-8 flex items-center gap-2.5">
              <span className="font-[Space_Grotesk,sans-serif] text-[18px] font-semibold tracking-tight">AutosZap</span>
            </Link>

            <div className="mb-6 rounded-[22px] bg-[rgba(255,107,129,0.14)] p-4 text-[#ff6b81]">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <h1 className="font-[Space_Grotesk,sans-serif] text-[28px] font-semibold tracking-tight sm:text-[32px]">
              Algo deu errado
            </h1>

            <p className="mt-3 max-w-md text-sm leading-6 text-[#8ea3c4]">
              Ocorreu um erro inesperado na aplicação. Tente recarregar a página ou volte para o início.
            </p>

            {error.digest ? (
              <p className="mt-2 font-mono text-[11px] text-[#8ea3c4]/60">
                Código: {error.digest}
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-xl bg-[#3297ff] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3297ff]/90"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-medium text-[#eff6ff] transition hover:bg-white/[0.09]"
              >
                <ArrowLeft className="h-4 w-4" />
                Página inicial
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
