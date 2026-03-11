import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;

  constructor(private readonly configService: ConfigService) {}

  private getClient() {
    if (!this.client) {
      const url = this.configService.get<string>('REDIS_URL');

      this.client = new Redis(url ?? 'redis://localhost:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });

      this.client.on('error', (error) => {
        this.logger.warn(`Redis indisponivel: ${error.message}`);
      });
    }

    return this.client;
  }

  async getJson<T>(key: string) {
    try {
      const client = this.getClient();
      if (client.status === 'wait') {
        await client.connect();
      }
      const value = await client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds = 60) {
    try {
      const client = this.getClient();
      if (client.status === 'wait') {
        await client.connect();
      }
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      return null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }
}
