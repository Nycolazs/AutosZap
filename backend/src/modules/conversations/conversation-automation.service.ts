import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
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
      const result =
        await this.conversationWorkflowService.processWaitingTimeouts();

      if (result.updatedCount > 0) {
        this.logger.log(
          `Timeouts processados com sucesso. Liberadas para AGUARDANDO: ${result.returnedToWaitingCount}. Encerradas como NAO RESPONDIDO: ${result.autoClosedCount}.`,
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
