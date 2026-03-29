'use client';

import { Loader2, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConnectionUiState } from '@/hooks/use-instance-connection';

interface ConnectionStatusIndicatorProps {
  state: ConnectionUiState;
  instanceName?: string;
  compact?: boolean;
  className?: string;
}

const STATE_CONFIG: Record<
  ConnectionUiState,
  { color: string; dotColor: string; label: string; spinning?: boolean }
> = {
  connected: {
    color: 'text-emerald-600',
    dotColor: 'bg-emerald-500',
    label: 'Conectado',
  },
  generating_qr: {
    color: 'text-amber-600',
    dotColor: 'bg-amber-500',
    label: 'Gerando QR...',
    spinning: true,
  },
  waiting_scan: {
    color: 'text-amber-600',
    dotColor: 'bg-amber-500',
    label: 'Aguardando leitura do QR',
  },
  scanned: {
    color: 'text-blue-600',
    dotColor: 'bg-blue-500',
    label: 'QR lido! Conectando...',
    spinning: true,
  },
  syncing: {
    color: 'text-blue-600',
    dotColor: 'bg-blue-500',
    label: 'Sincronizando...',
    spinning: true,
  },
  reconnecting: {
    color: 'text-orange-600',
    dotColor: 'bg-orange-500',
    label: 'Reconectando...',
    spinning: true,
  },
  disconnected: {
    color: 'text-muted-foreground',
    dotColor: 'bg-muted-foreground/60',
    label: 'Desconectado',
  },
  failed: {
    color: 'text-destructive',
    dotColor: 'bg-destructive',
    label: 'Erro',
  },
  idle: {
    color: 'text-muted-foreground',
    dotColor: 'bg-muted-foreground/40',
    label: 'Inativo',
  },
};

export function ConnectionStatusIndicator({
  state,
  instanceName,
  compact = false,
  className,
}: ConnectionStatusIndicatorProps) {
  const config = STATE_CONFIG[state] ?? STATE_CONFIG.idle;

  if (compact) {
    return (
      <span
        className={cn('inline-block h-2 w-2 shrink-0 rounded-full', config.dotColor, className)}
        title={`${instanceName ? `${instanceName}: ` : ''}${config.label}`}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        config.color,
        className,
      )}
    >
      {config.spinning ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state === 'connected' ? (
        <Wifi className="h-3 w-3" />
      ) : state === 'disconnected' || state === 'failed' ? (
        <WifiOff className="h-3 w-3" />
      ) : (
        <span className={cn('h-2 w-2 rounded-full', config.dotColor)} />
      )}
      {config.label}
    </span>
  );
}
