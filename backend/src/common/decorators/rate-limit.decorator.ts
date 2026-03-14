import { SetMetadata } from '@nestjs/common';
import type { RateLimitOptions } from '../guards/rate-limit.guard';

export const RATE_LIMIT_KEY = 'rate_limit';

/**
 * Apply a Redis-backed rate limit to a controller or route.
 *
 * @example
 * // Allow 5 login attempts per minute per IP
 * @RateLimit({ limit: 5, windowSeconds: 60 })
 * @Post('login')
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
