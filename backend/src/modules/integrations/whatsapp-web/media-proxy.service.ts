import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { WhatsAppWebGatewayClient } from './whatsapp-web-gateway.client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StreamMediaResult = {
  stream: Readable;
  mimeType: string | null;
  fileName: string | null;
  contentLength: number | null;
};

export type BufferMediaResult = {
  buffer: Buffer;
  mimeType: string | null;
  fileName: string | null;
};

type CachedFile = {
  filePath: string;
  mimeType: string | null;
  fileName: string | null;
  createdAt: number;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CACHE_DIR_NAME = 'autoszap-media-cache';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1_000; // Run cleanup every 60 seconds

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class MediaProxyService implements OnModuleDestroy {
  private readonly logger = new Logger(MediaProxyService.name);
  private readonly cacheDir: string;
  private readonly cache = new Map<string, CachedFile>();
  private readonly cacheTtlMs = DEFAULT_CACHE_TTL_MS;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly gatewayClient: WhatsAppWebGatewayClient) {
    this.cacheDir = path.join(os.tmpdir(), CACHE_DIR_NAME);
    this.ensureCacheDir();
    this.startCleanupInterval();
  }

  /**
   * Downloads media from the gateway and returns it as a readable stream.
   * Does NOT cache — suitable for large files or one-time downloads.
   */
  async streamMedia(
    instanceId: string,
    messageId: string,
  ): Promise<StreamMediaResult> {
    const result = await this.gatewayClient.downloadMedia({
      instanceId,
      messageId,
    });

    const stream = Readable.from(result.buffer);

    return {
      stream,
      mimeType: result.mimeType ?? null,
      fileName: result.fileName ?? null,
      contentLength: result.contentLength ?? result.buffer.length,
    };
  }

  /**
   * Downloads media from the gateway, caching it in a temp file for the
   * configured TTL. Subsequent calls for the same instance+message will
   * return the cached buffer without hitting the gateway again.
   */
  async getOrFetchMedia(
    instanceId: string,
    messageId: string,
  ): Promise<BufferMediaResult> {
    const cacheKey = this.buildCacheKey(instanceId, messageId);

    // Check in-memory cache
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      try {
        const buffer = await fs.promises.readFile(cached.filePath);
        this.logger.debug(
          `Cache hit: instance=${instanceId} message=${messageId}`,
        );
        return {
          buffer,
          mimeType: cached.mimeType,
          fileName: cached.fileName,
        };
      } catch {
        // File was removed externally — evict and re-download
        this.cache.delete(cacheKey);
      }
    }

    // Download from gateway
    this.logger.debug(
      `Cache miss — downloading: instance=${instanceId} message=${messageId}`,
    );

    const result = await this.gatewayClient.downloadMedia({
      instanceId,
      messageId,
    });

    // Write to temp file
    const tempFileName = `${crypto.randomUUID()}${this.extensionFromMime(result.mimeType)}`;
    const tempFilePath = path.join(this.cacheDir, tempFileName);

    await fs.promises.writeFile(tempFilePath, result.buffer);

    this.cache.set(cacheKey, {
      filePath: tempFilePath,
      mimeType: result.mimeType ?? null,
      fileName: result.fileName ?? null,
      createdAt: Date.now(),
    });

    return {
      buffer: result.buffer,
      mimeType: result.mimeType ?? null,
      fileName: result.fileName ?? null,
    };
  }

  /**
   * Removes all expired entries from the cache and deletes their temp files.
   */
  cleanupExpired(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > this.cacheTtlMs) {
        this.removeCacheEntry(key, entry);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug(
        `Cache cleanup: removed ${removed} expired entries, ${this.cache.size} remaining`,
      );
    }
  }

  async onModuleDestroy() {
    this.stopCleanupInterval();
    await this.clearAllCache();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildCacheKey(instanceId: string, messageId: string): string {
    return `${instanceId}:${messageId}`;
  }

  private isCacheValid(entry: CachedFile): boolean {
    return Date.now() - entry.createdAt < this.cacheTtlMs;
  }

  private removeCacheEntry(key: string, entry: CachedFile): void {
    this.cache.delete(key);
    try {
      fs.unlinkSync(entry.filePath);
    } catch {
      // File may already be gone — that is fine
    }
  }

  private async clearAllCache(): Promise<void> {
    for (const [key, entry] of this.cache.entries()) {
      this.removeCacheEntry(key, entry);
    }

    // Best-effort removal of the entire cache directory
    try {
      await fs.promises.rm(this.cacheDir, { recursive: true, force: true });
    } catch {
      // Ignore — may not exist or be in use
    }
  }

  private ensureCacheDir(): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch (error) {
      this.logger.warn(
        `Failed to create cache directory at ${this.cacheDir}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private startCleanupInterval(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, CLEANUP_INTERVAL_MS);

    // Unref so the interval doesn't prevent graceful shutdown
    if (this.cleanupTimer && typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  private stopCleanupInterval(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private extensionFromMime(mimeType: string | null | undefined): string {
    if (!mimeType) return '';

    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        '.docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        '.xlsx',
    };

    return map[mimeType] ?? '';
  }
}
