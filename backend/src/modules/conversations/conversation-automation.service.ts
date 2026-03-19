import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { TenantConnectionService } from '../../common/tenancy/tenant-connection.service';
import { ConversationWorkflowService } from './conversation-workflow.service';

const WAITING_TIMEOUT_LOCK_KEY = 'autoszap:conversation-waiting-timeouts';
const WAITING_TIMEOUT_INTERVAL_MS = 60_000;
const WAITING_TIMEOUT_LOCK_TTL_SECONDS = 55;

@Injectable()
export class ConversationAutomationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ConversationAutomationService.name);
  private intervalHandle?: NodeJS.Timeout;

  constructor(
    private readonly conversationWorkflowService: ConversationWorkflowService,
    private readonly redisService: RedisService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly prismaService: PrismaService,
  ) {}

  onModuleInit() {
    this.intervalHandle = setInterval(() => {
      void this.processWaitingTimeouts();
    }, WAITING_TIMEOUT_INTERVAL_MS);

    void this.processWaitingTimeouts();
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }

  private async processWaitingTimeouts() {
    const acquiredLock = await this.redisService.setIfNotExists(
      WAITING_TIMEOUT_LOCK_KEY,
      `${process.pid}-${Date.now()}`,
      WAITING_TIMEOUT_LOCK_TTL_SECONDS,
    );

    if (!acquiredLock) {
      return;
    }

    try {
      const tenantIds =
        await this.tenantConnectionService.listActiveTenantIds();
      const aggregateResult = {
        updatedCount: 0,
        returnedToWaitingCount: 0,
        autoClosedCount: 0,
      };

      if (!tenantIds.length) {
        const fallbackResult =
          await this.conversationWorkflowService.processWaitingTimeouts();
        aggregateResult.updatedCount += fallbackResult.updatedCount;
        aggregateResult.returnedToWaitingCount +=
          fallbackResult.returnedToWaitingCount;
        aggregateResult.autoClosedCount += fallbackResult.autoClosedCount;
      }

      for (const tenantId of tenantIds) {
        const result = await this.prismaService.runWithTenant(tenantId, () =>
          this.conversationWorkflowService.processWaitingTimeouts(),
        );
        aggregateResult.updatedCount += result.updatedCount;
        aggregateResult.returnedToWaitingCount += result.returnedToWaitingCount;
        aggregateResult.autoClosedCount += result.autoClosedCount;
      }

      if (aggregateResult.updatedCount > 0) {
        this.logger.log(
          `Timeouts processados com sucesso. Liberadas para AGUARDANDO: ${aggregateResult.returnedToWaitingCount}. Encerradas como NAO RESPONDIDO: ${aggregateResult.autoClosedCount}.`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Falha ao processar timeouts automaticos de conversas.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
