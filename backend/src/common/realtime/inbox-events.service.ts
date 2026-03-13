import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, concat, interval } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { Role } from '@prisma/client';
import { CurrentAuthUser } from '../decorators/current-user.decorator';
import { normalizeRole } from '../../modules/access-control/permissions.constants';

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
  assignedUserId?: string | null;
  audience?: 'WORKSPACE' | 'SELLERS_AND_ADMINS' | 'ADMINS_AND_ASSIGNEE';
};

@Injectable()
export class InboxEventsService {
  private readonly events$ = new Subject<InboxRealtimeEvent>();

  emit(event: InboxRealtimeEvent) {
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
          },
        } satisfies MessageEvent,
      ],
      this.events$.pipe(
        filter((event) => event.workspaceId === user.workspaceId),
        filter((event) => this.canUserReceiveEvent(user, event)),
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

  private canUserReceiveEvent(
    user: CurrentAuthUser,
    event: InboxRealtimeEvent,
  ) {
    const audience = event.audience ?? 'WORKSPACE';
    const normalizedRole = normalizeRole(user.role as Role);

    if (audience === 'WORKSPACE') {
      return true;
    }

    if (normalizedRole === Role.ADMIN) {
      return true;
    }

    if (audience === 'SELLERS_AND_ADMINS') {
      return true;
    }

    return event.assignedUserId === user.sub;
  }
}
