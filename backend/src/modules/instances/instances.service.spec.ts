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
        delete: jest.fn(),
      },
      conversationMessage: {
        findMany: jest.fn(),
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
      {
        delete: jest.fn(),
        deleteInstanceDirectory: jest.fn(),
      } as never,
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

  it('permanently deletes a removed instance before creating another with the same name', async () => {
    const { service, prisma } = createService();

    prisma.instance.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'instance-removed',
        workspaceId: 'ws-1',
        deletedAt: new Date('2026-03-29T20:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'instance-new',
        workspaceId: 'ws-1',
        name: 'QR provisoria',
        provider: 'WHATSAPP_WEB',
        status: 'DISCONNECTED',
        mode: 'DEV',
        deletedAt: null,
        _count: {
          messages: 0,
          conversations: 0,
          campaigns: 0,
        },
      });
    prisma.conversationMessage.findMany.mockResolvedValueOnce([]);
    prisma.instance.create.mockResolvedValue({
      id: 'instance-new',
    });

    const result = await service.create('ws-1', 'user-1', {
      name: 'QR provisoria',
      provider: 'WHATSAPP_WEB' as never,
    });

    expect(prisma.instance.delete).toHaveBeenCalledWith({
      where: { id: 'instance-removed' },
    });
    expect(prisma.instance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        createdById: 'user-1',
        name: 'QR provisoria',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'instance-new',
        name: 'QR provisoria',
      }),
    );
  });

  it('removes locally stored media paths when deleting an instance', async () => {
    const { service, prisma } = createService();
    const mediaStorageService = (service as any).mediaStorageService as {
      delete: jest.Mock;
      deleteInstanceDirectory: jest.Mock;
    };

    prisma.instance.findFirst.mockResolvedValue({
      id: 'instance-1',
      workspaceId: 'ws-1',
      deletedAt: null,
    });
    prisma.conversationMessage.findMany
      .mockResolvedValueOnce([
        {
          id: 'message-1',
          metadata: {
            storagePath: 'ws-1/instance-1/conversation-1/inbound/a.jpg',
          },
        },
        {
          id: 'message-2',
          metadata: {
            media: {
              storagePath: 'ws-1/instance-1/conversation-2/outbound/b.ogg',
            },
          },
        },
        {
          id: 'message-3',
          metadata: {
            storagePath: 'ws-1/instance-1/conversation-1/inbound/a.jpg',
          },
        },
      ])
      .mockResolvedValueOnce([]);

    await service.remove('instance-1', 'ws-1');

    expect(mediaStorageService.delete).toHaveBeenCalledTimes(2);
    expect(mediaStorageService.delete).toHaveBeenCalledWith(
      'ws-1/instance-1/conversation-1/inbound/a.jpg',
    );
    expect(mediaStorageService.delete).toHaveBeenCalledWith(
      'ws-1/instance-1/conversation-2/outbound/b.ogg',
    );
    expect(mediaStorageService.deleteInstanceDirectory).toHaveBeenCalledWith(
      'ws-1',
      'instance-1',
    );
    expect(prisma.instance.delete).toHaveBeenCalledWith({
      where: { id: 'instance-1' },
    });
  });

  it('rejects renaming an instance to an already active name', async () => {
    const { service, prisma } = createService();

    prisma.instance.findFirst
      .mockResolvedValueOnce({
        id: 'instance-1',
        workspaceId: 'ws-1',
        name: 'QR provisoria',
        provider: 'WHATSAPP_WEB',
        status: 'CONNECTED',
        mode: 'PRODUCTION',
        deletedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'instance-2',
        workspaceId: 'ws-1',
        name: 'Atendimento Comercial',
        deletedAt: null,
      });

    await expect(
      service.update('instance-1', 'ws-1', {
        name: 'Atendimento Comercial',
      }),
    ).rejects.toThrow('Ja existe uma instancia com este nome.');
  });

  it('permanently deletes a removed instance that blocks a rename', async () => {
    const { service, prisma } = createService();

    prisma.instance.findFirst
      .mockResolvedValueOnce({
        id: 'instance-1',
        workspaceId: 'ws-1',
        name: 'QR provisoria',
        provider: 'WHATSAPP_WEB',
        status: 'CONNECTED',
        mode: 'PRODUCTION',
        deletedAt: null,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'instance-removed',
        workspaceId: 'ws-1',
        deletedAt: new Date('2026-03-29T20:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'instance-1',
        workspaceId: 'ws-1',
        name: 'Atendimento Comercial',
        provider: 'WHATSAPP_WEB',
        status: 'CONNECTED',
        mode: 'PRODUCTION',
        deletedAt: null,
        _count: {
          messages: 0,
          conversations: 0,
          campaigns: 0,
        },
      });
    prisma.conversationMessage.findMany.mockResolvedValueOnce([]);

    const result = await service.update('instance-1', 'ws-1', {
      name: 'Atendimento Comercial',
    });

    expect(prisma.instance.delete).toHaveBeenCalledWith({
      where: { id: 'instance-removed' },
    });
    expect(prisma.instance.update).toHaveBeenCalledWith({
      where: { id: 'instance-1' },
      data: expect.objectContaining({
        name: 'Atendimento Comercial',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'instance-1',
        name: 'Atendimento Comercial',
      }),
    );
  });

  it('does not reuse a removed embedded-signup instance and deletes it permanently', async () => {
    const { service, prisma } = createService({
      META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'default-verify-token',
    });
    const axiosGetSpy = jest.spyOn(axios, 'get');

    axiosGetSpy
      .mockResolvedValueOnce({
        data: {
          access_token: 'business-token-789',
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          display_phone_number: '+55 85 97777-6666',
          verified_name: 'AutosZap Oficina',
        },
      } as never);

    prisma.instance.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'instance-removed',
        workspaceId: 'ws-1',
        createdById: 'user-old',
        deletedAt: new Date('2026-03-29T20:00:00.000Z'),
        webhookVerifyTokenEncrypted: 'enc:legacy-verify-token',
      })
      .mockResolvedValueOnce(null);
    prisma.conversationMessage.findMany.mockResolvedValueOnce([]);
    prisma.instance.create.mockResolvedValue({
      id: 'instance-new',
    });

    const result = await service.createFromEmbeddedSignup('ws-1', 'user-1', {
      code: 'fungible-code',
      phoneNumberId: 'phone-789',
      wabaId: 'waba-789',
    });

    expect(result).toEqual({
      instanceId: 'instance-new',
      reusedExistingInstance: false,
    });
    expect(prisma.instance.delete).toHaveBeenCalledWith({
      where: { id: 'instance-removed' },
    });
    expect(prisma.instance.update).not.toHaveBeenCalled();
    expect(prisma.instance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        createdById: 'user-1',
        phoneNumberId: 'phone-789',
        businessAccountId: 'waba-789',
        webhookVerifyTokenEncrypted: 'enc:default-verify-token',
      }),
    });
  });
});
