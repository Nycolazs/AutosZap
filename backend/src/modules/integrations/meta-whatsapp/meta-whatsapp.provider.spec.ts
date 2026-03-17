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

  it('loads all template pages from Meta diagnostics', async () => {
    const provider = new MetaWhatsAppProvider(
      new ConfigService({
        META_MODE: 'DEV',
        META_GRAPH_API_VERSION: 'v23.0',
      }),
    );
    const axiosGetSpy = jest.spyOn(axios, 'get');

    axiosGetSpy
      .mockResolvedValueOnce({
        data: {
          id: 'phone-1',
          display_phone_number: '+55 85 99999-0000',
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'tmpl-1',
              name: 'primeiro_template',
              status: 'APPROVED',
              language: 'pt_BR',
              components: [{ type: 'BODY', text: 'Oi {{1}}' }],
            },
          ],
          paging: {
            cursors: {
              after: 'cursor-2',
            },
            next: 'https://graph.facebook.com/v23.0/business-1/message_templates?after=cursor-2',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'tmpl-2',
              name: 'segundo_template',
              status: 'APPROVED',
              language: 'pt_BR',
              components: [{ type: 'BODY', text: 'Ola {{1}}' }],
            },
          ],
        },
      });

    const diagnostics = await provider.getInstanceDiagnostics({
      id: 'instance-1',
      workspaceId: 'ws-1',
      mode: InstanceMode.DEV,
      accessToken: 'token',
      phoneNumberId: 'phone-1',
      businessAccountId: 'business-1',
    });

    expect(diagnostics.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'primeiro_template' }),
        expect.objectContaining({ name: 'segundo_template' }),
      ]),
    );

    expect(axiosGetSpy).toHaveBeenCalledWith(
      'https://graph.facebook.com/v23.0/business-1/message_templates?fields=id,name,status,language,category,quality_score,last_updated_time,components&limit=100',
      expect.any(Object),
    );
    expect(axiosGetSpy).toHaveBeenCalledWith(
      'https://graph.facebook.com/v23.0/business-1/message_templates?fields=id,name,status,language,category,quality_score,last_updated_time,components&limit=100&after=cursor-2',
      expect.any(Object),
    );
  });
});
