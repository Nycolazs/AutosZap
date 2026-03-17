import { BadRequestException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ContactsService } from './contacts.service';

describe('ContactsService duplicate phone guard', () => {
  function createService() {
    const prisma = {
      contact: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      contactTag: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const service = new ContactsService(prisma as never);

    return {
      service,
      prisma,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('blocks create when an equivalent formatted number already exists', async () => {
    const { service, prisma } = createService();

    prisma.contact.findFirst.mockResolvedValue({ id: 'contact-existing' });

    await expect(
      service.create('ws-1', {
        name: 'Novo contato',
        phone: '(85) 98888-0000',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Ja existe um contato cadastrado com este numero.',
      ),
    );

    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-1',
          phone: expect.objectContaining({
            in: expect.arrayContaining(['+5585988880000']),
          }),
        }),
      }),
    );
  });

  it('maps Prisma unique violations to a friendly duplicate-phone message', async () => {
    const { service, prisma } = createService();

    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockRejectedValue(
      new PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create('ws-1', {
        name: 'Contato concorrente',
        phone: '85988880000',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Ja existe um contato cadastrado com este numero.',
      ),
    );
  });

  it('blocks update when the new phone collides with another contact', async () => {
    const { service, prisma } = createService();

    prisma.contact.findFirst
      .mockResolvedValueOnce({
        id: 'contact-1',
        workspaceId: 'ws-1',
        phone: '+558598887777',
        name: 'Contato 1',
        email: null,
        company: null,
        jobTitle: null,
        source: 'MANUAL',
        notes: null,
        deletedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'contact-2',
      });

    await expect(
      service.update('contact-1', 'ws-1', {
        phone: '(85) 98888-0000',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Ja existe um contato cadastrado com este numero.',
      ),
    );
  });
});
