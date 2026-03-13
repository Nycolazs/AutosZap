import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, concat, interval } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { CurrentAuthUser } from '../decorators/current-user.decorator';

export type NotificationRealtimeEvent = {
  workspaceId: string;
  userId: string;
  type: 'notification.created' | 'notification.read' | 'notification.read-all';
  notificationId?: string;
  unreadCount?: number;
  payload?: Record<string, unknown>;
};

@Injectable()
export class NotificationEventsService {
  private readonly events$ = new Subject<NotificationRealtimeEvent>();

  emit(event: NotificationRealtimeEvent) {
    this.events$.next(event);
  }

  stream(user: CurrentAuthUser): Observable<MessageEvent> {
    return concat(
      [
        {
          type: 'connected',
          data: {
            ok: true,
            workspaceId: user.workspaceId,
            userId: user.sub,
          },
        } satisfies MessageEvent,
      ],
      this.events$.pipe(
        filter(
          (event) =>
            event.workspaceId === user.workspaceId && event.userId === user.sub,
        ),
        map(
          (event) =>
            ({
              type: 'notification-event',
              data: event,
            }) satisfies MessageEvent,
        ),
      ),
      interval(25000).pipe(
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
