import { BadRequestException } from '@nestjs/common';
import { InstancesController } from './instances.controller';

describe('InstancesController manual instance flow', () => {
  function createController() {
    const instancesService = {
      update: jest.fn(),
    };
    const metaWhatsAppService = {};

    const controller = new InstancesController(
      instancesService as never,
      metaWhatsAppService as never,
    );

    return {
      controller,
      instancesService,
    };
  }

  it('rejects manual instance creation', () => {
    const { controller } = createController();

    expect(() => controller.create()).toThrow(BadRequestException);
    expect(() => controller.create()).toThrow(
      'Cadastro manual de instancias foi desativado.',
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
});
