import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const DEDUP_KEY_PREFIX = 'dedup:';
const DEFAULT_TTL_SECONDS = 86_400; // 24 hours

@Injectable()
export class EventDedupService {
  private readonly logger = new Logger(EventDedupService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Checks whether an event has already been processed.
   *
   * Uses Redis SETNX with TTL for idempotency: if the key already exists,
   * the event is a duplicate. If it does not exist, the key is atomically
   * created — marking the event as processed in a single round-trip.
   *
   * @returns true if the event was already processed (duplicate), false if new
   */
  async isDuplicate(
    instanceId: string,
    eventKey: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<boolean> {
    const key = this.buildRedisKey(instanceId, eventKey);

    // setIfNotExists returns true when the key was newly created (not a dup)
    const wasNew = await this.redis.setIfNotExists(
      key,
      Date.now().toString(),
      ttlSeconds,
    );

    if (!wasNew) {
      this.logger.debug(
        `Duplicate event detected: instance=${instanceId} key=${eventKey}`,
      );
    }

    return !wasNew;
  }

  /**
   * Explicitly marks an event as processed. Useful when the processing
   * and dedup-check need to happen at different stages of a pipeline.
   */
  async markProcessed(
    instanceId: string,
    eventKey: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    const key = this.buildRedisKey(instanceId, eventKey);

    await this.redis.setJson(key, { processedAt: Date.now() }, ttlSeconds);

    this.logger.debug(
      `Event marked as processed: instance=${instanceId} key=${eventKey}`,
    );
  }

  /**
   * Builds a deterministic, collision-resistant cache key from parts.
   *
   * @example
   *   buildKey(['message', 'abc123', 'received'])
   *   // => 'message:abc123:received'
   */
  buildKey(parts: string[]): string {
    return parts
      .map((part) => part.replace(/:/g, '_'))
      .join(':');
  }

  /**
   * Composes the full Redis key with the dedup prefix and instance scope.
   */
  private buildRedisKey(instanceId: string, eventKey: string): string {
    return `${DEDUP_KEY_PREFIX}${instanceId}:${eventKey}`;
  }
}
