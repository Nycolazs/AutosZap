'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type {
  InstanceConnectionState,
  InstanceConnectionPhase,
  InstanceQrState,
} from '@/lib/types';

/**
 * Unified connection state exposed by the hook.
 * Maps backend phases into a simpler set of UI states.
 */
export type ConnectionUiState =
  | 'idle'
  | 'generating_qr'
  | 'waiting_scan'
  | 'scanned'
  | 'syncing'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

interface UseInstanceConnectionOptions {
  instanceId: string | null | undefined;
  /** Enable automatic polling (defaults to true). */
  enabled?: boolean;
}

interface UseInstanceConnectionReturn {
  state: ConnectionUiState;
  phase: InstanceConnectionPhase | null;
  qrCode: string | null;
  qrExpiresAt: string | null;
  isConnected: boolean;
  isGeneratingQr: boolean;
  isSyncing: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Derive a simplified UI state from the backend connection phase + QR state.
 */
function deriveUiState(
  connectionPhase: InstanceConnectionPhase | null | undefined,
  qrStatus: InstanceQrState['status'] | null | undefined,
): ConnectionUiState {
  if (!connectionPhase) {
    return 'idle';
  }

  switch (connectionPhase) {
    case 'CONNECTED':
      return 'connected';
    case 'RECONNECTING':
      return 'reconnecting';
    case 'DISCONNECTED':
    case 'LOGGED_OUT':
      return 'disconnected';
    case 'ERROR':
      return 'failed';
    case 'CONNECTING':
    case 'AUTHENTICATING':
      return 'syncing';
    case 'QR_SCANNED':
      return 'scanned';
    case 'QR_PENDING': {
      if (qrStatus === 'READY') return 'waiting_scan';
      if (qrStatus === 'SCANNED') return 'scanned';
      return 'generating_qr';
    }
    default:
      return 'idle';
  }
}

/**
 * Determine polling interval based on the current UI state.
 * - Active QR states poll fast (3 s) so the user sees updates quickly.
 * - Reconnecting / syncing poll at 5 s.
 * - Connected / idle / failed do not poll (returns `false`).
 */
function getRefetchInterval(state: ConnectionUiState): number | false {
  switch (state) {
    case 'generating_qr':
    case 'waiting_scan':
    case 'scanned':
      return 3_000;
    case 'syncing':
    case 'reconnecting':
      return 5_000;
    default:
      return false;
  }
}

export function useInstanceConnection({
  instanceId,
  enabled = true,
}: UseInstanceConnectionOptions): UseInstanceConnectionReturn {
  const queryClient = useQueryClient();
  const previousStateRef = useRef<ConnectionUiState>('idle');

  // --- Connection state query ------------------------------------------------
  const connectionQuery = useQuery({
    queryKey: ['instance', instanceId, 'connection-state'] as const,
    queryFn: () =>
      apiRequest<InstanceConnectionState>(
        `instances/${instanceId}/connection-state`,
      ),
    enabled: enabled && Boolean(instanceId),
    staleTime: 2_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // --- QR state query --------------------------------------------------------
  const qrQuery = useQuery({
    queryKey: ['instance', instanceId, 'qr'] as const,
    queryFn: () =>
      apiRequest<InstanceQrState>(`instances/${instanceId}/qr`),
    enabled: enabled && Boolean(instanceId),
    staleTime: 2_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // --- Derived state ---------------------------------------------------------
  const connectionPhase = connectionQuery.data?.phase ?? null;
  const qrStatus = qrQuery.data?.status ?? null;
  const state = deriveUiState(connectionPhase, qrStatus);

  const qrCode = qrQuery.data?.qrCode ?? connectionQuery.data?.qrCode ?? null;
  const qrExpiresAt =
    qrQuery.data?.qrCodeExpiresAt ??
    connectionQuery.data?.qrCodeExpiresAt ??
    null;

  // --- Dynamic polling -------------------------------------------------------
  const refetchInterval = getRefetchInterval(state);

  useEffect(() => {
    if (!instanceId || !enabled || refetchInterval === false) return;

    const id = window.setInterval(() => {
      void connectionQuery.refetch();
      void qrQuery.refetch();
    }, refetchInterval);

    return () => window.clearInterval(id);
    // We intentionally depend only on stable identifiers + the interval value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, enabled, refetchInterval]);

  // Track state transitions so consumers can react (e.g. auto-close dialog).
  useEffect(() => {
    previousStateRef.current = state;
  }, [state]);

  // --- Refetch helper --------------------------------------------------------
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['instance', instanceId, 'connection-state'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['instance', instanceId, 'qr'],
    });
  }, [queryClient, instanceId]);

  // --- Error aggregation -----------------------------------------------------
  const error = connectionQuery.error ?? qrQuery.error ?? null;

  return useMemo(
    () => ({
      state,
      phase: connectionPhase,
      qrCode,
      qrExpiresAt,
      isConnected: state === 'connected',
      isGeneratingQr:
        state === 'generating_qr' || state === 'waiting_scan',
      isSyncing: state === 'syncing',
      error,
      refetch,
    }),
    [state, connectionPhase, qrCode, qrExpiresAt, error, refetch],
  );
}
