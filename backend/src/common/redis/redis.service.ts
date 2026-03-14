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

  async setIfNotExists(key: string, value: string, ttlSeconds: number) {
    try {
      const client = this.getClient();
      if (client.status === 'wait') {
        await client.connect();
      }

      const response = await client.set(key, value, 'EX', ttlSeconds, 'NX');
      return response === 'OK';
    } catch {
      return false;
    }
  }

  /**
   * Atomically increments a counter. Sets the TTL on first creation.
   * Returns the new counter value. Used for rate limiting.
   */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    const client = this.getClient();
    if (client.status === 'wait') {
      await client.connect();
    }
    const pipeline = client.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, ttlSeconds, 'NX');
    const results = await pipeline.exec();
    const count = results?.[0]?.[1];
    return typeof count === 'number' ? count : 1;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }
}
