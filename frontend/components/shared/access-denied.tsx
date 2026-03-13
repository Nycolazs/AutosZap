'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from './empty-state';
import { Button } from '../ui/button';

export function AccessDenied({
  title = 'Acesso não liberado',
  description = 'Seu usuário não possui permissão para abrir esta área no momento.',
  fallbackHref = '/app/inbox',
}: {
  title?: string;
  description?: string;
  fallbackHref?: string;
}) {
  return (
    <div className="flex h-full min-h-[420px] items-center justify-center">
      <div className="w-full max-w-xl rounded-[28px] border border-border bg-background-elevated p-6">
        <EmptyState icon={ShieldAlert} title={title} description={description} />
        <div className="mt-6 flex justify-center">
          <Button asChild>
            <Link href={fallbackHref}>Voltar para uma área disponível</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
