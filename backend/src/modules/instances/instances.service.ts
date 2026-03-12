import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InstanceMode, InstanceProvider, InstanceStatus } from '@prisma/client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';

type InstancePayload = {
  name: string;
  provider?: InstanceProvider;
  status?: InstanceStatus;
  mode?: InstanceMode;
  appId?: string;
  phoneNumber?: string;
  businessAccountId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
};

@Injectable()
export class InstancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  async list(workspaceId: string) {
    const items = await this.prisma.instance.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        _count: {
          select: {
            conversations: true,
            campaigns: true,
          },
        },
      },
    });

    return items.map((item) => this.sanitizeInstance(item));
  }

  async findOne(id: string, workspaceId: string) {
    const item = await this.prisma.instance.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            conversations: true,
            messages: true,
            campaigns: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Instancia nao encontrada.');
    }

    return this.sanitizeInstance(item);
  }

  async create(workspaceId: string, actorId: string, payload: InstancePayload) {
    const existing = await this.prisma.instance.findFirst({
      where: {
        workspaceId,
        name: payload.name,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException('Ja existe uma instancia com este nome.');
    }

    const instance = await this.prisma.instance.create({
      data: {
        workspaceId,
        createdById: actorId,
        name: payload.name,
        provider: payload.provider ?? InstanceProvider.META_WHATSAPP,
        status: payload.status ?? InstanceStatus.DISCONNECTED,
        mode: payload.mode ?? InstanceMode.DEV,
        appId: payload.appId,
        phoneNumber: payload.phoneNumber,
        businessAccountId: payload.businessAccountId,
        phoneNumberId: payload.phoneNumberId,
        accessTokenEncrypted: this.cryptoService.encrypt(payload.accessToken),
        webhookVerifyTokenEncrypted: this.cryptoService.encrypt(
          payload.webhookVerifyToken,
        ),
        appSecretEncrypted: this.cryptoService.encrypt(payload.appSecret),
      },
    });

    return this.findOne(instance.id, workspaceId);
  }

  async update(
    id: string,
    workspaceId: string,
    payload: Partial<InstancePayload>,
  ) {
    const instance = await this.prisma.instance.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!instance) {
      throw new NotFoundException('Instancia nao encontrada.');
    }

    await this.prisma.instance.update({
      where: { id },
      data: {
        name: payload.name ?? instance.name,
        provider: payload.provider ?? instance.provider,
        status: payload.status ?? instance.status,
        mode: payload.mode ?? instance.mode,
        appId: payload.appId ?? instance.appId,
        phoneNumber: payload.phoneNumber ?? instance.phoneNumber,
        businessAccountId:
          payload.businessAccountId ?? instance.businessAccountId,
        phoneNumberId: payload.phoneNumberId ?? instance.phoneNumberId,
        accessTokenEncrypted:
          payload.accessToken !== undefined
            ? this.cryptoService.encrypt(payload.accessToken)
            : instance.accessTokenEncrypted,
        webhookVerifyTokenEncrypted:
          payload.webhookVerifyToken !== undefined
            ? this.cryptoService.encrypt(payload.webhookVerifyToken)
            : instance.webhookVerifyTokenEncrypted,
        appSecretEncrypted:
          payload.appSecret !== undefined
            ? this.cryptoService.encrypt(payload.appSecret)
            : instance.appSecretEncrypted,
        lastSyncAt:
          payload.status === InstanceStatus.CONNECTED
            ? new Date()
            : instance.lastSyncAt,
      },
    });

    return this.findOne(id, workspaceId);
  }

  async connect(id: string, workspaceId: string) {
    return this.update(id, workspaceId, {
      status: InstanceStatus.CONNECTED,
    });
  }

  async disconnect(id: string, workspaceId: string) {
    return this.update(id, workspaceId, {
      status: InstanceStatus.DISCONNECTED,
    });
  }

  async remove(id: string, workspaceId: string) {
    const instance = await this.prisma.instance.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!instance) {
      throw new NotFoundException('Instancia nao encontrada.');
    }

    await this.prisma.instance.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  sanitizeInstance<
    T extends {
      accessTokenEncrypted?: string | null;
      webhookVerifyTokenEncrypted?: string | null;
      appSecretEncrypted?: string | null;
    },
  >(instance: T) {
    const accessToken = this.cryptoService.decrypt(
      instance.accessTokenEncrypted,
    );
    const webhookVerifyToken = this.cryptoService.decrypt(
      instance.webhookVerifyTokenEncrypted,
    );
    const appSecret = this.cryptoService.decrypt(instance.appSecretEncrypted);

    return {
      ...instance,
      accessTokenMasked: this.maskSecret(accessToken),
      webhookVerifyTokenMasked: this.maskSecret(webhookVerifyToken),
      appSecretMasked: this.maskSecret(appSecret),
      accessTokenEncrypted: undefined,
      webhookVerifyTokenEncrypted: undefined,
      appSecretEncrypted: undefined,
    };
  }

  private maskSecret(value?: string | null) {
    if (!value) {
      return null;
    }

    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }

    return `${value.slice(0, 4)}${'*'.repeat(Math.max(value.length - 8, 4))}${value.slice(-4)}`;
  }
}
