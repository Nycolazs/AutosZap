import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject, concat, interval } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { CurrentAuthUser } from '../decorators/current-user.decorator';

export type InstanceEventType =
  | 'instance.state.changed'
  | 'instance.qr.updated'
  | 'instance.sync.progress';

export type InstanceRealtimeEvent = {
  workspaceId: string;
  instanceId: string;
  type: InstanceEventType;
  state?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class InstanceEventsService {
  private readonly logger = new Logger(InstanceEventsService.name);
  private readonly events$ = new Subject<InstanceRealtimeEvent>();

  /**
   * Emits an instance connection state change event.
   */
  emitStateChange(
    workspaceId: string,
    instanceId: string,
    state: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.logger.debug(
      `State change: instance=${instanceId} state=${state}`,
    );

    this.events$.next({
      workspaceId,
      instanceId,
      type: 'instance.state.changed',
      state,
      metadata,
    });
  }

  /**
   * Emits a QR code update event for an instance.
   */
  emitQrUpdate(
    workspaceId: string,
    instanceId: string,
    qrData: string,
  ): void {
    this.logger.debug(`QR update: instance=${instanceId}`);

    this.events$.next({
      workspaceId,
      instanceId,
      type: 'instance.qr.updated',
      metadata: { qr: qrData },
    });
  }

  /**
   * Emits a history sync progress event for an instance.
   */
  emitSyncProgress(
    workspaceId: string,
    instanceId: string,
    progress: Record<string, unknown>,
  ): void {
    this.logger.debug(
      `Sync progress: instance=${instanceId} progress=${JSON.stringify(progress)}`,
    );

    this.events$.next({
      workspaceId,
      instanceId,
      type: 'instance.sync.progress',
      metadata: progress,
    });
  }

  /**
   * Returns an SSE-compatible observable stream filtered by the user's workspace.
   * Includes a heartbeat every 25 seconds to keep the connection alive.
   */
  stream(user: CurrentAuthUser): Observable<MessageEvent> {
    return concat(
      [
        {
          type: 'connected',
          data: {
            ok: true,
            workspaceId: user.workspaceId,
          },
        } satisfies MessageEvent,
      ],
      this.events$.pipe(
        filter((event) => event.workspaceId === user.workspaceId),
        map(
          (event) =>
            ({
              type: 'instance-event',
              data: event,
            }) satisfies MessageEvent,
        ),
      ),
      interval(25_000).pipe(
        map(
          () =>
            ({
              type: 'heartbeat',
              data: {
                ts: new Date().toISOString(),
              },
            }) satisfies MessageEvent,
        ),
      ),
    );
  }
}
