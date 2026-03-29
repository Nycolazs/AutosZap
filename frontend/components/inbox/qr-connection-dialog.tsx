'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, QrCode, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  useInstanceConnection,
  type ConnectionUiState,
} from '@/hooks/use-instance-connection';
import { ConnectionStatusIndicator } from './connection-status-indicator';
import { apiRequest } from '@/lib/api-client';

interface QrConnectionDialogProps {
  instanceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
}

function QrCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setRemaining(diff);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (remaining <= 0) return <span className="text-xs text-destructive">QR expirado</span>;

  return (
    <span className="text-xs text-muted-foreground">
      Expira em {remaining}s
    </span>
  );
}

function QrStateContent({
  state,
  qrCode,
  qrExpiresAt,
  instanceId,
  onRefresh,
}: {
  state: ConnectionUiState;
  qrCode: string | null;
  qrExpiresAt: string | null;
  instanceId: string;
  onRefresh: () => void;
}) {
  if (state === 'connected') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        <p className="text-lg font-semibold text-emerald-700">Conectado!</p>
        <p className="text-sm text-muted-foreground">
          O WhatsApp foi vinculado com sucesso.
        </p>
      </div>
    );
  }

  if (state === 'scanned' || state === 'syncing') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <Loader2 className="h-14 w-14 animate-spin text-blue-500" />
        <p className="text-base font-semibold">
          {state === 'scanned' ? 'QR lido! Conectando...' : 'Sincronizando mensagens...'}
        </p>
        <p className="text-sm text-muted-foreground">
          Aguarde enquanto preparamos tudo.
        </p>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <XCircle className="h-14 w-14 text-destructive" />
        <p className="text-base font-semibold text-destructive">
          Falha na conexao
        </p>
        <p className="text-sm text-muted-foreground">
          Nao foi possivel conectar ao WhatsApp. Tente novamente.
        </p>
        <Button onClick={onRefresh} variant="secondary" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (
    (state === 'generating_qr' || state === 'waiting_scan') &&
    qrCode
  ) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <img
            src={qrCode}
            alt="QR Code WhatsApp"
            className="h-64 w-64"
          />
        </div>
        <div className="flex items-center gap-3">
          {qrExpiresAt && <QrCountdown expiresAt={qrExpiresAt} />}
          <Button onClick={onRefresh} variant="ghost" size="sm">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Atualizar QR
          </Button>
        </div>
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          Abra o WhatsApp no celular, va em <strong>Aparelhos conectados</strong>{' '}
          e escaneie o codigo acima.
        </p>
      </div>
    );
  }

  // generating_qr without QR yet, or idle/reconnecting
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Gerando codigo QR...</p>
    </div>
  );
}

export function QrConnectionDialog({
  instanceId,
  open,
  onOpenChange,
  onConnected,
}: QrConnectionDialogProps) {
  const { state, qrCode, qrExpiresAt, isConnected, refetch } =
    useInstanceConnection({
      instanceId,
      enabled: open,
    });

  const connectedRef = useRef(false);

  useEffect(() => {
    if (isConnected && !connectedRef.current) {
      connectedRef.current = true;
      onConnected?.();
      // Auto-close after showing success briefly
      const timer = setTimeout(() => onOpenChange(false), 1500);
      return () => clearTimeout(timer);
    }

    if (!isConnected) {
      connectedRef.current = false;
    }
  }, [isConnected, onConnected, onOpenChange]);

  const handleRefresh = async () => {
    try {
      await apiRequest(`instances/${instanceId}/qr/refresh`, {
        method: 'POST',
      });
      refetch();
    } catch {
      refetch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Conectar WhatsApp</h3>
          </div>

          <ConnectionStatusIndicator state={state} />

          <QrStateContent
            state={state}
            qrCode={qrCode}
            qrExpiresAt={qrExpiresAt}
            instanceId={instanceId}
            onRefresh={handleRefresh}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
