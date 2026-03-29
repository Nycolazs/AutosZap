import { retryWithBackoff, RetryAbortedError } from './retry';

describe('retryWithBackoff', () => {
  it('should return immediately on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      label: 'test',
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    let attempt = 0;
    const fn = jest.fn().mockImplementation(async () => {
      attempt++;
      if (attempt < 3) throw new Error('transient');
      return 'recovered';
    });

    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 50,
      label: 'test-retry',
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after exhausting all retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('persistent'));

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 2,
        baseDelayMs: 10,
        label: 'test-exhaust',
      }),
    ).rejects.toThrow('persistent');

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should not retry non-retryable errors', async () => {
    class CustomError extends Error {}
    const fn = jest.fn().mockRejectedValue(new CustomError('fatal'));

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        nonRetryableErrors: [CustomError],
        label: 'test-nonretryable',
      }),
    ).rejects.toThrow('fatal');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should abort via AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    const fn = jest.fn().mockResolvedValue('never');

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        signal: controller.signal,
        label: 'test-abort',
      }),
    ).rejects.toThrow(RetryAbortedError);

    expect(fn).not.toHaveBeenCalled();
  });

  it('should respect custom shouldRetry predicate', async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(async () => {
      calls++;
      throw new Error(`fail-${calls}`);
    });

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 5,
        baseDelayMs: 10,
        shouldRetry: (_error, attempt) => attempt < 1,
        label: 'test-predicate',
      }),
    ).rejects.toThrow('fail-2');

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
