import { EventDedupService } from './event-dedup.service';

function createMockRedis() {
  const store = new Map<string, string>();

  return {
    setIfNotExists: jest.fn(async (key: string, value: string) => {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    }),
    setJson: jest.fn(async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    }),
    _store: store,
  };
}

describe('EventDedupService', () => {
  let service: EventDedupService;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
    service = new EventDedupService(redis as any);
  });

  it('should return false (not duplicate) for a new event', async () => {
    const result = await service.isDuplicate('inst-1', 'msg:abc123');
    expect(result).toBe(false);
  });

  it('should return true (duplicate) for the same event key', async () => {
    await service.isDuplicate('inst-1', 'msg:abc123');
    const result = await service.isDuplicate('inst-1', 'msg:abc123');
    expect(result).toBe(true);
  });

  it('should not conflict between different instances', async () => {
    await service.isDuplicate('inst-1', 'msg:abc123');
    const result = await service.isDuplicate('inst-2', 'msg:abc123');
    expect(result).toBe(false);
  });

  it('should not conflict between different event keys', async () => {
    await service.isDuplicate('inst-1', 'msg:abc123');
    const result = await service.isDuplicate('inst-1', 'msg:def456');
    expect(result).toBe(false);
  });

  it('buildKey should produce deterministic keys', () => {
    const key1 = service.buildKey(['message', 'abc123', 'received']);
    const key2 = service.buildKey(['message', 'abc123', 'received']);
    expect(key1).toBe(key2);
    expect(key1).toBe('message:abc123:received');
  });

  it('buildKey should escape colons in parts', () => {
    const key = service.buildKey(['msg', 'id:with:colons', 'status']);
    expect(key).toBe('msg:id_with_colons:status');
  });

  it('markProcessed should mark an event as processed', async () => {
    await service.markProcessed('inst-1', 'msg:manual');
    expect(redis.setJson).toHaveBeenCalledWith(
      expect.stringContaining('msg:manual'),
      expect.objectContaining({ processedAt: expect.any(Number) }),
      expect.any(Number),
    );
  });
});
