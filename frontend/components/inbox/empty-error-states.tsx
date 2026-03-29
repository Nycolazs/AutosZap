'use client';

import {
  Inbox,
  MessageSquare,
  WifiOff,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  className?: string;
}

export function EmptyConversationList({ className }: EmptyStateProps) {
  return (
    <div className={`flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center ${className ?? ''}`}>
      <div className="rounded-xl bg-muted/50 p-4">
        <Inbox className="h-10 w-10 text-muted-foreground/60" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        Nenhuma conversa encontrada
      </h3>
      <p className="max-w-xs text-xs text-muted-foreground">
        As conversas aparecerao aqui quando seus contatos enviarem mensagens ou
        quando voce iniciar uma nova conversa.
      </p>
    </div>
  );
}

export function EmptyMessageList({ className }: EmptyStateProps) {
  return (
    <div className={`flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center ${className ?? ''}`}>
      <div className="rounded-xl bg-muted/50 p-4">
        <MessageSquare className="h-10 w-10 text-muted-foreground/60" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        Nenhuma mensagem ainda
      </h3>
      <p className="max-w-xs text-xs text-muted-foreground">
        Envie a primeira mensagem para iniciar a conversa.
      </p>
    </div>
  );
}

interface ConnectionErrorStateProps {
  error?: string | null;
  onRetry?: () => void;
  onReconnect?: () => void;
  className?: string;
}

export function ConnectionErrorState({
  error,
  onRetry,
  onReconnect,
  className,
}: ConnectionErrorStateProps) {
  return (
    <div className={`flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center ${className ?? ''}`}>
      <div className="rounded-xl bg-destructive/10 p-4">
        <WifiOff className="h-10 w-10 text-destructive/70" />
      </div>
      <h3 className="text-sm font-semibold text-destructive">
        Erro de conexao
      </h3>
      {error && (
        <p className="max-w-xs text-xs text-muted-foreground">{error}</p>
      )}
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button onClick={onRetry} variant="secondary" size="sm">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        )}
        {onReconnect && (
          <Button onClick={onReconnect} variant="default" size="sm">
            Reconectar
          </Button>
        )}
      </div>
    </div>
  );
}

interface SyncProgressStateProps {
  progress?: number;
  syncedChats?: number;
  totalChats?: number;
  className?: string;
}

export function SyncProgressState({
  progress = 0,
  syncedChats = 0,
  totalChats = 0,
  className,
}: SyncProgressStateProps) {
  return (
    <div className={`flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center ${className ?? ''}`}>
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">
          Sincronizando mensagens...
        </h3>
        <p className="text-xs text-muted-foreground">
          {totalChats > 0
            ? `${syncedChats} de ${totalChats} conversas sincronizadas`
            : 'Carregando lista de conversas...'}
        </p>
      </div>
      {totalChats > 0 && (
        <div className="w-48">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{progress}%</p>
        </div>
      )}
    </div>
  );
}
