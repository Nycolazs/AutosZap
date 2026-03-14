import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RedisService } from '../redis/redis.service';

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'rate_limit';

/**
 * Redis-backed rate limiter guard.
 *
 * Apply via the @RateLimit() decorator on controller routes:
 *   @RateLimit({ limit: 10, windowSeconds: 60 })
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.resolveIp(request);
    const route = `${request.method}:${request.route?.path ?? request.path}`;
    const key = `rl:${route}:${ip}`;

    try {
      const count = await this.redis.increment(key, options.windowSeconds);
      if (count > options.limit) {
        throw new HttpException(
          'Muitas tentativas. Aguarde um momento e tente novamente.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw err;
      }
      // Redis unavailable — fail open to avoid blocking legitimate traffic
      this.logger.warn(`Rate-limit Redis error: ${String(err)}`);
    }

    return true;
  }

  private resolveIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0]?.trim() ?? 'unknown';
    }
    return request.ip ?? 'unknown';
  }
}
