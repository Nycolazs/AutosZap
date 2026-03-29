import { MediaProxyService } from './media-proxy.service';

function createMockGatewayClient() {
  return {
    downloadMedia: jest.fn(async () => ({
      buffer: Buffer.from('fake-media-content'),
      mimeType: 'image/jpeg',
      fileName: 'photo.jpg',
      contentLength: 18,
    })),
  };
}

describe('MediaProxyService', () => {
  let service: MediaProxyService;
  let gatewayClient: ReturnType<typeof createMockGatewayClient>;

  beforeEach(() => {
    gatewayClient = createMockGatewayClient();
    // Short TTL for tests
    service = new MediaProxyService(gatewayClient as any, 2000);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should download and return media as buffer', async () => {
    const result = await service.getOrFetchMedia('inst-1', 'msg-1');

    expect(result.buffer.toString()).toBe('fake-media-content');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.fileName).toBe('photo.jpg');
    expect(gatewayClient.downloadMedia).toHaveBeenCalledWith({
      instanceId: 'inst-1',
      messageId: 'msg-1',
    });
  });

  it('should return cached result on second call', async () => {
    await service.getOrFetchMedia('inst-1', 'msg-1');
    const result = await service.getOrFetchMedia('inst-1', 'msg-1');

    expect(result.buffer.toString()).toBe('fake-media-content');
    // Gateway should only be called once — second call is cached
    expect(gatewayClient.downloadMedia).toHaveBeenCalledTimes(1);
  });

  it('should download fresh for different messages', async () => {
    await service.getOrFetchMedia('inst-1', 'msg-1');
    await service.getOrFetchMedia('inst-1', 'msg-2');

    expect(gatewayClient.downloadMedia).toHaveBeenCalledTimes(2);
  });

  it('should stream media without caching', async () => {
    const result = await service.streamMedia('inst-1', 'msg-1');

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.contentLength).toBe(18);
    expect(result.stream).toBeDefined();
    expect(result.stream.readable).toBe(true);
  });

  it('should cleanup expired entries', async () => {
    // Manually set a very short TTL service for this test
    const shortService = new MediaProxyService(gatewayClient as any, 1);
    await shortService.getOrFetchMedia('inst-1', 'msg-1');

    // Wait for the entry to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    shortService.cleanupExpired();

    // Next call should re-download
    await shortService.getOrFetchMedia('inst-1', 'msg-1');
    expect(gatewayClient.downloadMedia).toHaveBeenCalledTimes(2);

    await shortService.onModuleDestroy();
  });
});
