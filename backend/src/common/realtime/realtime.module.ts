import { Global, Module } from '@nestjs/common';
import { InboxEventsService } from './inbox-events.service';
import { InstanceEventsService } from './instance-events.service';
import { NotificationEventsService } from './notification-events.service';

@Global()
@Module({
  providers: [InboxEventsService, InstanceEventsService, NotificationEventsService],
  exports: [InboxEventsService, InstanceEventsService, NotificationEventsService],
})
export class RealtimeModule {}
