import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { InstancesService } from './instances.service';

describe('InstancesService embedded signup', () => {
  function createService(configOverrides?: Record<string, string>) {
    const prisma = {
      instance: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const cryptoService = {
      encrypt: jest.fn((value?: string | null) =>
        value ? `enc:${value}` : null,
      ),
      decrypt: jest.fn((value?: string | null) => {
        if (!value) {
          return null;
        }

        return value.startsWith('enc:') ? value.slice(4) : value;
      }),
    };

    const service = new InstancesService(
      prisma as never,
      cryptoService as never,
      new ConfigService({
        META_APP_ID: 'meta-app-id',
        META_APP_SECRET: 'meta-app-secret',
        META_EMBEDDED_SIGNUP_CONFIG_ID: 'meta-config-id',
        META_GRAPH_API_VERSION: 'v23.0',
        BACKEND_PUBLIC_URL: 'https://api.autoszap.com/',
        ...configOverrides,
      }),
    );

    return {
      service,
      prisma,
      cryptoService,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('returns the frontend config required to launch embedded signup', () => {
    const { service } = createService();

    expect(service.getEmbeddedSignupConfig()).toEqual({
      appId: 'meta-app-id',
      configurationId: 'meta-config-id',
      graphApiVersion: 'v23.0',
      callbackUri: 'https://api.autoszap.com/api/webhooks/meta/whatsapp',
    });
  });

  it('reuses an existing instance with the same phone number id', async () => {
    const { service, prisma, cryptoService } = createService();
    const axiosGetSpy = jest.spyOn(axios, 'get');

    axiosGetSpy
      .mockResolvedValueOnce({
        data: {
          access_token: 'business-token-123',
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          display_phone_number: '+55 85 99999-0000',
          verified_name: 'AutosZap Oficina',
        },
      } as never);

    prisma.instance.findFirst
      .mockResolvedValueOnce({
        id: 'instance-existing',
        workspaceId: 'ws-1',
        createdById: 'user-old',
        deletedAt: null,
        webhookVerifyTokenEncrypted: 'enc:existing-verify-token',
      })
      .mockResolvedValueOnce(null);

    const result = await service.createFromEmbeddedSignup('ws-1', 'user-1', {
      code: 'fungible-code',
      phoneNumberId: 'phone-123',
      wabaId: 'waba-123',
    });

    expect(result).toEqual({
      instanceId: 'instance-existing',
      reusedExistingInstance: true,
    });
    expect(prisma.instance.create).not.toHaveBeenCalled();
    expect(prisma.instance.update).toHaveBeenCalledWith({
      where: { id: 'instance-existing' },
      data: expect.objectContaining({
        name: 'AutosZap Oficina',
        phoneNumber: '+55 85 99999-0000',
        phoneNumberId: 'phone-123',
        businessAccountId: 'waba-123',
        deletedAt: null,
        accessTokenEncrypted: 'enc:business-token-123',
        webhookVerifyTokenEncrypted: 'enc:existing-verify-token',
        appSecretEncrypted: 'enc:meta-app-secret',
      }),
    });
    expect(cryptoService.decrypt).toHaveBeenCalledWith(
      'enc:existing-verify-token',
    );
  });

  it('deduplicates the generated name before creating a new instance', async () => {
    const { service, prisma } = createService({
      META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'default-verify-token',
    });
    const axiosGetSpy = jest.spyOn(axios, 'get');

    axiosGetSpy
      .mockResolvedValueOnce({
        data: {
          access_token: 'business-token-456',
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          display_phone_number: '+55 85 98888-7777',
          verified_name: 'AutosZap Oficina',
        },
      } as never);

    prisma.instance.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'duplicate-name' })
      .mockResolvedValueOnce(null);
    prisma.instance.create.mockResolvedValue({
      id: 'instance-new',
    });

    const result = await service.createFromEmbeddedSignup('ws-1', 'user-1', {
      code: 'fungible-code',
      phoneNumberId: 'phone-456',
      wabaId: 'waba-456',
    });

    expect(result).toEqual({
      instanceId: 'instance-new',
      reusedExistingInstance: false,
    });
    expect(prisma.instance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        createdById: 'user-1',
        name: 'AutosZap Oficina (2)',
        phoneNumberId: 'phone-456',
        businessAccountId: 'waba-456',
        webhookVerifyTokenEncrypted: 'enc:default-verify-token',
      }),
    });
  });
});
