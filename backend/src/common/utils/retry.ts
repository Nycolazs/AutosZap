import { Logger } from '@nestjs/common';

const logger = new Logger('RetryWithBackoff');

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Whether to add random jitter to delays (default: true) */
  jitter?: boolean;
  /** AbortSignal to cancel retries externally */
  signal?: AbortSignal;
  /** Optional label for log messages */
  label?: string;
  /** Error types that should NOT be retried (will throw immediately) */
  nonRetryableErrors?: Array<new (...args: any[]) => Error>;
  /** Custom predicate — return false to stop retrying for a specific error */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;

/**
 * Executes an async function with exponential backoff and optional jitter.
 *
 * Delay formula: min(baseDelay * 2^attempt + jitter, maxDelay)
 *
 * @throws The last error encountered after all retries are exhausted,
 *         or immediately for non-retryable errors / abort signals.
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    jitter = true,
    signal,
    label = 'operation',
    nonRetryableErrors = [],
    shouldRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new RetryAbortedError(
        `Retry aborted for "${label}" before attempt ${attempt + 1}`,
        { cause: signal.reason },
      );
    }

    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      // Check non-retryable error types
      if (isNonRetryable(error, nonRetryableErrors)) {
        logger.warn(
          `[${label}] Non-retryable error on attempt ${attempt + 1}/${maxRetries + 1}: ${errorMessage(error)}`,
        );
        throw error;
      }

      // Check custom predicate
      if (shouldRetry && !shouldRetry(error, attempt)) {
        logger.warn(
          `[${label}] Custom predicate stopped retry on attempt ${attempt + 1}/${maxRetries + 1}: ${errorMessage(error)}`,
        );
        throw error;
      }

      // If this was the last attempt, do not delay — just fall through
      if (attempt >= maxRetries) {
        logger.error(
          `[${label}] All ${maxRetries + 1} attempts exhausted. Last error: ${errorMessage(error)}`,
        );
        break;
      }

      const delayMs = computeDelay(attempt, baseDelayMs, maxDelayMs, jitter);

      logger.warn(
        `[${label}] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${errorMessage(error)}. Retrying in ${delayMs}ms...`,
      );

      await sleep(delayMs, signal);
    }
  }

  throw lastError;
}

/**
 * Computes exponential backoff delay with optional full jitter.
 */
function computeDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: boolean,
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  if (!jitter) {
    return cappedDelay;
  }

  // Full jitter: random value between 0 and cappedDelay
  return Math.floor(Math.random() * cappedDelay);
}

/**
 * Sleeps for a given duration, respecting an optional AbortSignal.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new RetryAbortedError('Retry aborted during sleep', {
          cause: signal.reason,
        }),
      );
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(
          new RetryAbortedError('Retry aborted during sleep', {
            cause: signal.reason,
          }),
        );
      };
      signal.addEventListener('abort', onAbort, { once: true });

      // Cleanup listener after timer fires
      const originalResolve = resolve;
      resolve = (() => {
        signal.removeEventListener('abort', onAbort);
        originalResolve();
      }) as typeof resolve;
    }
  });
}

function isNonRetryable(
  error: unknown,
  nonRetryableErrors: Array<new (...args: any[]) => Error>,
): boolean {
  return nonRetryableErrors.some(
    (ErrorClass) => error instanceof ErrorClass,
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Thrown when a retry sequence is cancelled via AbortSignal.
 */
export class RetryAbortedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RetryAbortedError';
  }
}
