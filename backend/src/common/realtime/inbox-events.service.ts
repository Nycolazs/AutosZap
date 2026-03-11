import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, concat, interval } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export type InboxEventType =
  | 'conversation.message.created'
  | 'conversation.message.status.updated'
  | 'conversation.updated'
  | 'conversation.note.created';

export type InboxRealtimeEvent = {
  workspaceId: string;
  conversationId: string;
  type: InboxEventType;
  direction?: 'INBOUND' | 'OUTBOUND';
};

@Injectable()
export class InboxEventsService {
  private readonly events$ = new Subject<InboxRealtimeEvent>();

  emit(event: InboxRealtimeEvent) {
    this.events$.next(event);
  }

  stream(workspaceId: string): Observable<MessageEvent> {
    return concat(
      [
        {
          type: 'connected',
          data: {
            ok: true,
            workspaceId,
          },
        } satisfies MessageEvent,
      ],
      this.events$.pipe(
        filter((event) => event.workspaceId === workspaceId),
        map(
          (event) =>
            ({
              type: 'inbox-event',
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
