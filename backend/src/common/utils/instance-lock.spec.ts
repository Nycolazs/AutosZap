import { withInstanceLock, InstanceLockTimeoutError } from './instance-lock';

function createMockRedis() {
  const store = new Map<string, string>();

  return {
    setIfNotExists: jest.fn(async (key: string, value: string) => {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
}

describe('withInstanceLock', () => {
  it('should execute the function and release the lock', async () => {
    const redis = createMockRedis();
    const fn = jest.fn().mockResolvedValue('result');

    const result = await withInstanceLock(redis as any, 'inst-1', fn, {
      ttlMs: 5000,
      retryMs: 50,
      maxWaitMs: 1000,
      label: 'test',
    });

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalledWith(
      expect.stringContaining('inst-1'),
    );
  });

  it('should release the lock even if the function throws', async () => {
    const redis = createMockRedis();
    const fn = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(
      withInstanceLock(redis as any, 'inst-1', fn, {
        ttlMs: 5000,
        retryMs: 50,
        maxWaitMs: 1000,
      }),
    ).rejects.toThrow('boom');

    expect(redis.del).toHaveBeenCalled();
  });

  it('should wait and retry if lock is held', async () => {
    const redis = createMockRedis();

    // Simulate lock already held, then released after 100ms
    let calls = 0;
    redis.setIfNotExists.mockImplementation(async (key: string, value: string) => {
      calls++;
      if (calls <= 2) return false;
      redis._store.set(key, value);
      return true;
    });

    const fn = jest.fn().mockResolvedValue('delayed-result');

    const result = await withInstanceLock(redis as any, 'inst-locked', fn, {
      ttlMs: 5000,
      retryMs: 50,
      maxWaitMs: 2000,
    });

    expect(result).toBe('delayed-result');
    expect(redis.setIfNotExists).toHaveBeenCalledTimes(3);
  });

  it('should throw InstanceLockTimeoutError when lock cannot be acquired', async () => {
    const redis = createMockRedis();
    redis.setIfNotExists.mockResolvedValue(false);

    const fn = jest.fn();

    await expect(
      withInstanceLock(redis as any, 'inst-stuck', fn, {
        ttlMs: 5000,
        retryMs: 50,
        maxWaitMs: 200,
      }),
    ).rejects.toThrow(InstanceLockTimeoutError);

    expect(fn).not.toHaveBeenCalled();
  });
});
