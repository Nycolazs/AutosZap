import { ConfigService } from '@nestjs/config';
import { InstanceMode } from '@prisma/client';
import axios from 'axios';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider';

describe('MetaWhatsAppProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('keeps outbound text messages simulated when credentials are missing', async () => {
    const provider = new MetaWhatsAppProvider(
      new ConfigService({
        META_MODE: 'DEV',
      }),
    );
    const axiosPostSpy = jest.spyOn(axios, 'post');

    const result = await provider.sendTextMessage(
      {
        id: 'instance-1',
        workspaceId: 'ws-1',
        mode: InstanceMode.DEV,
        accessToken: null,
        phoneNumberId: null,
      },
      '+5585999990000',
      'Mensagem de teste',
    );

    expect(result.simulated).toBe(true);
    expect(result.status).toBe('delivered');
    expect(axiosPostSpy).not.toHaveBeenCalled();
  });

  it('sends outbound text messages through the real Meta API in DEV when credentials are available', async () => {
    const provider = new MetaWhatsAppProvider(
      new ConfigService({
        META_MODE: 'DEV',
        META_GRAPH_API_VERSION: 'v23.0',
      }),
    );
    const axiosPostSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        messages: [{ id: 'wamid.real.1' }],
      },
    });

    const result = await provider.sendTextMessage(
      {
        id: 'instance-1',
        workspaceId: 'ws-1',
        mode: InstanceMode.DEV,
        accessToken: 'token',
        phoneNumberId: 'phone-1',
      },
      '+5585999990000',
      'Mensagem real',
    );

    expect(result.simulated).toBe(false);
    expect(result.status).toBe('sent');
    expect(result.externalMessageId).toBe('wamid.real.1');
    expect(axiosPostSpy).toHaveBeenCalledWith(
      'https://graph.facebook.com/v23.0/phone-1/messages',
      {
        messaging_product: 'whatsapp',
        to: '5585999990000',
        type: 'text',
        text: {
          preview_url: false,
          body: 'Mensagem real',
        },
      },
      expect.any(Object),
    );

    const firstRequestConfig = axiosPostSpy.mock.calls[0]?.[2] as {
      headers: Record<string, string>;
    };

    expect(firstRequestConfig.headers.Authorization).toBe('Bearer token');
    expect(firstRequestConfig.headers['Content-Type']).toBe('application/json');
  });

  it('subscribes the app with a real Meta API call in DEV when credentials are available', async () => {
    const provider = new MetaWhatsAppProvider(
      new ConfigService({
        META_MODE: 'DEV',
        META_GRAPH_API_VERSION: 'v23.0',
      }),
    );
    const axiosPostSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { success: true },
    });

    const result = await provider.subscribeApp(
      {
        id: 'instance-1',
        workspaceId: 'ws-1',
        mode: InstanceMode.DEV,
        accessToken: 'token',
        businessAccountId: 'business-1',
        phoneNumberId: 'phone-1',
      },
      {
        overrideCallbackUri:
          'https://example.trycloudflare.com/api/webhooks/meta/whatsapp',
        verifyToken: 'verify-token',
      },
    );

    expect(result.simulated).toBe(false);
    expect(result.healthy).toBe(true);
    expect(axiosPostSpy).toHaveBeenCalledWith(
      'https://graph.facebook.com/v23.0/business-1/subscribed_apps',
      {
        override_callback_uri:
          'https://example.trycloudflare.com/api/webhooks/meta/whatsapp',
        verify_token: 'verify-token',
      },
      expect.any(Object),
    );

    const subscribeRequestConfig = axiosPostSpy.mock.calls[0]?.[2] as {
      headers: Record<string, string>;
    };

    expect(subscribeRequestConfig.headers.Authorization).toBe('Bearer token');
    expect(subscribeRequestConfig.headers['Content-Type']).toBe(
      'application/json',
    );
  });

  it('fails fast when the instance does not have the credentials required to subscribe the app', async () => {
    const provider = new MetaWhatsAppProvider(
      new ConfigService({
        META_MODE: 'DEV',
      }),
    );

    await expect(
      provider.subscribeApp({
        id: 'instance-1',
        workspaceId: 'ws-1',
        mode: InstanceMode.DEV,
        accessToken: null,
        businessAccountId: null,
        phoneNumberId: 'phone-1',
      }),
    ).rejects.toThrow(
      'Nao foi possivel atualizar o callback da Meta. Configure Access Token e Business Account ID na instancia antes de assinar o app na WABA.',
    );
  });
});
