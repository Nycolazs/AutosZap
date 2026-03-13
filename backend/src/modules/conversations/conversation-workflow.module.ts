import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RealtimeModule } from '../../common/realtime/realtime.module';
import { RedisModule } from '../../common/redis/redis.module';
import { WorkspaceSettingsModule } from '../workspace-settings/workspace-settings.module';
import { ConversationAutomationService } from './conversation-automation.service';
import { ConversationWorkflowService } from './conversation-workflow.service';

@Global()
@Module({
  imports: [PrismaModule, RealtimeModule, RedisModule, WorkspaceSettingsModule],
  providers: [ConversationWorkflowService, ConversationAutomationService],
  exports: [ConversationWorkflowService],
})
export class ConversationWorkflowModule {}
