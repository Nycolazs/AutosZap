import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      {/* Background radial gradients */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(50,151,255,0.12),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(25,183,215,0.10),transparent_35%)]" />

      <div className="relative z-10 flex flex-col items-center text-center">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <Image
            src="/brand/autoszap-mark.png"
            alt="AutosZap"
            width={36}
            height={36}
            className="brand-logo-shadow h-9 w-9 object-contain"
          />
          <span className="font-heading text-[18px] font-semibold tracking-tight">AutosZap</span>
        </Link>

        <div className="mb-6 rounded-[22px] bg-primary-soft p-4 text-primary">
          <Search className="h-8 w-8" />
        </div>

        <p className="font-heading text-[80px] font-semibold leading-none tracking-tight text-primary sm:text-[96px]">
          404
        </p>

        <h1 className="mt-3 font-heading text-[22px] font-semibold tracking-tight sm:text-[26px]">
          Página não encontrada
        </h1>

        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          A página que você tentou acessar não existe ou foi movida. Verifique o endereço ou volte para a plataforma.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href="/app">
              Ir para o painel
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Página inicial
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
