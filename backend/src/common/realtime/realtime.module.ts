import { Global, Module } from '@nestjs/common';
import { InboxEventsService } from './inbox-events.service';

@Global()
@Module({
  providers: [InboxEventsService],
  exports: [InboxEventsService],
})
export class RealtimeModule {}
