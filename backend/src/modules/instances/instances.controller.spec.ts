import { BadRequestException } from '@nestjs/common';

jest.mock('../integrations/meta-whatsapp/meta-whatsapp.service', () => ({
  MetaWhatsAppService: class MetaWhatsAppService {},
}));

jest.mock('../integrations/whatsapp-web/whatsapp-web.service', () => ({
  WhatsAppWebService: class WhatsAppWebService {},
}));

jest.mock('./instances.service', () => ({
  InstancesService: class InstancesService {},
}));

import { InstancesController } from './instances.controller';

describe('InstancesController manual instance flow', () => {
  function createController() {
    const instancesService = {
      update: jest.fn(),
      remove: jest.fn(),
      findOne: jest.fn(),
    };
    const metaWhatsAppService = {};
    const whatsappWebService = {
      unregister: jest.fn(),
    };

    const controller = new InstancesController(
      instancesService as never,
      metaWhatsAppService as never,
      whatsappWebService as never,
    );

    return {
      controller,
      instancesService,
      whatsappWebService,
    };
  }

  it('rejects manual instance creation', () => {
    const { controller } = createController();
    const user = { workspaceId: 'ws-1', sub: 'user-1' } as never;
    const payload = {
      name: 'Instancia manual',
      provider: 'META_WHATSAPP',
    } as never;

    expect(() => controller.create(user, payload)).toThrow(BadRequestException);
    expect(() => controller.create(user, payload)).toThrow(
      'Cadastro manual de instancias oficiais foi desativado.',
    );
  });

  it('allows renaming an instance without exposing credential fields', () => {
    const { controller, instancesService } = createController();

    void controller.update({ workspaceId: 'ws-1' } as never, 'instance-1', {
      name: 'WhatsApp Oficina Matriz',
    });

    expect(instancesService.update).toHaveBeenCalledWith('instance-1', 'ws-1', {
      name: 'WhatsApp Oficina Matriz',
    });
  });

  it('unregisters qr instances before removing them from the workspace', async () => {
    const { controller, instancesService, whatsappWebService } =
      createController();

    instancesService.findOne.mockResolvedValue({
      id: 'instance-qr',
      provider: 'WHATSAPP_WEB',
    });
    instancesService.remove.mockResolvedValue({ success: true });

    await controller.remove({ workspaceId: 'ws-1' } as never, 'instance-qr');

    expect(whatsappWebService.unregister).toHaveBeenCalledWith(
      'ws-1',
      'instance-qr',
    );
    expect(instancesService.remove).toHaveBeenCalledWith('instance-qr', 'ws-1');
  });
});
