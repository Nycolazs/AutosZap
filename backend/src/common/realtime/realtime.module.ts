import { Global, Module } from '@nestjs/common';
import { InboxEventsService } from './inbox-events.service';
import { NotificationEventsService } from './notification-events.service';

@Global()
@Module({
  providers: [InboxEventsService, NotificationEventsService],
  exports: [InboxEventsService, NotificationEventsService],
})
export class RealtimeModule {}
