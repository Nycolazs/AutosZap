import {
  InstanceConnectionManager,
  InvalidStateTransitionError,
  type InstanceState,
} from './instance-connection-manager';

function createMockRedis() {
  const store = new Map<string, string>();

  return {
    getJson: jest.fn(async (key: string) => {
      const value = store.get(key);
      return value ? JSON.parse(value) : null;
    }),
    setJson: jest.fn(async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    }),
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

function createMockInstanceEvents() {
  return {
    emitStateChange: jest.fn(),
    emitQrUpdate: jest.fn(),
    emitSyncProgress: jest.fn(),
    stream: jest.fn(),
  };
}

describe('InstanceConnectionManager', () => {
  let manager: InstanceConnectionManager;
  let redis: ReturnType<typeof createMockRedis>;
  let events: ReturnType<typeof createMockInstanceEvents>;

  beforeEach(() => {
    redis = createMockRedis();
    events = createMockInstanceEvents();
    manager = new InstanceConnectionManager(redis as any, events as any);
  });

  it('should start in idle state', async () => {
    const state = await manager.getState('test-instance');
    expect(state).toBe('idle');
  });

  it('should transition from idle to generating_qr', async () => {
    const entry = await manager.transition(
      'inst-1',
      'generating_qr',
      { event: 'qr.updated' },
      'ws-1',
    );

    expect(entry.state).toBe('generating_qr');
    expect(events.emitStateChange).toHaveBeenCalledWith(
      'ws-1',
      'inst-1',
      'generating_qr',
      expect.objectContaining({ previousState: 'idle' }),
    );
  });

  it('should follow the full QR scan flow', async () => {
    const id = 'inst-flow';
    const ws = 'ws-1';

    await manager.transition(id, 'generating_qr', {}, ws);
    await manager.transition(id, 'waiting_scan', {}, ws);
    await manager.transition(id, 'scanned', {}, ws);
    await manager.transition(id, 'syncing', {}, ws);
    await manager.transition(id, 'connected', {}, ws);

    const state = await manager.getState(id);
    expect(state).toBe('connected');
    expect(events.emitStateChange).toHaveBeenCalledTimes(5);
  });

  it('should reject invalid transitions', async () => {
    await expect(
      manager.transition('inst-bad', 'connected'),
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it('should allow reconnecting from connected', async () => {
    const id = 'inst-reconnect';
    await manager.transition(id, 'generating_qr');
    await manager.transition(id, 'waiting_scan');
    await manager.transition(id, 'scanned');
    await manager.transition(id, 'connected');
    await manager.transition(id, 'reconnecting');

    const state = await manager.getState(id);
    expect(state).toBe('reconnecting');
  });

  it('should allow disconnected from any active state', async () => {
    const id = 'inst-disc';
    await manager.transition(id, 'generating_qr');
    await manager.transition(id, 'disconnected');

    expect(await manager.getState(id)).toBe('disconnected');
  });

  it('should fire onStateChange callbacks', async () => {
    const callback = jest.fn();
    manager.onStateChange(callback);

    await manager.transition('inst-cb', 'generating_qr');

    expect(callback).toHaveBeenCalledWith(
      'inst-cb',
      'idle',
      'generating_qr',
      undefined,
    );
  });

  it('should unsubscribe from state changes', async () => {
    const callback = jest.fn();
    const unsub = manager.onStateChange(callback);

    await manager.transition('inst-unsub', 'generating_qr');
    expect(callback).toHaveBeenCalledTimes(1);

    unsub();
    await manager.transition('inst-unsub', 'disconnected');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('isTransitionAllowed should validate without transitioning', () => {
    expect(manager.isTransitionAllowed('idle', 'generating_qr')).toBe(true);
    expect(manager.isTransitionAllowed('idle', 'connected')).toBe(false);
    expect(manager.isTransitionAllowed('connected', 'reconnecting')).toBe(true);
    expect(manager.isTransitionAllowed('connected', 'generating_qr')).toBe(false);
  });
});
