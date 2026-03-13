import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import { ConversationRemindersService } from './conversation-reminders.service';

const REMINDER_LOCK_KEY = 'autoszap:conversation-reminders';
const REMINDER_INTERVAL_MS = 60_000;
const REMINDER_LOCK_TTL_SECONDS = 55;

@Injectable()
export class ConversationReminderAutomationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    ConversationReminderAutomationService.name,
  );
  private intervalHandle?: NodeJS.Timeout;

  constructor(
    private readonly conversationRemindersService: ConversationRemindersService,
    private readonly redisService: RedisService,
  ) {}

  onModuleInit() {
    this.intervalHandle = setInterval(() => {
      void this.processDueReminders();
    }, REMINDER_INTERVAL_MS);

    void this.processDueReminders();
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }

  private async processDueReminders() {
    const acquiredLock = await this.redisService.setIfNotExists(
      REMINDER_LOCK_KEY,
      `${process.pid}-${Date.now()}`,
      REMINDER_LOCK_TTL_SECONDS,
    );

    if (!acquiredLock) {
      return;
    }

    try {
      const result =
        await this.conversationRemindersService.processDueReminders();

      if (result.processedCount > 0) {
        this.logger.log(
          `Lembretes processados com sucesso. Notificados: ${result.processedCount}.`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Falha ao processar lembretes vencidos.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
