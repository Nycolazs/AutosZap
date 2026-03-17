import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutoMessageType,
  ConversationEventType,
  ConversationOwnership,
  ConversationStatus,
  InstanceStatus,
  MessageDirection,
  MessageStatus,
  NotificationType,
  PermissionKey,
  Prisma,
  Role,
  UserStatus,
  WebhookEventType,
} from '@prisma/client';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildEquivalentContactPhones,
  normalizeContactPhone,
} from '../../../common/utils/phone';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider';
import {
  MessagingInstanceConfig,
  ProviderInstanceDiagnostics,
  ProviderTemplateSummary,
  TemplateParameter,
} from './messaging-provider.interface';
import { ConversationWorkflowService } from '../../conversations/conversation-workflow.service';
import { WorkspaceSettingsService } from '../../workspace-settings/workspace-settings.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AccessControlService } from '../../access-control/access-control.service';
import { normalizeRole } from '../../access-control/permissions.constants';
import { normalizeConversationStatus } from '../../conversations/conversation-workflow.utils';

@Injectable()
export class MetaWhatsAppService {
  private readonly logger = new Logger(MetaWhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
    private readonly provider: MetaWhatsAppProvider,
    private readonly configService: ConfigService,
    private readonly conversationWorkflowService: ConversationWorkflowService,
    private readonly workspaceSettingsService: WorkspaceSettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  async testConnection(workspaceId: string, instanceId: string) {
    const config = await this.getInstanceConfig(instanceId, workspaceId);
    return this.provider.healthCheck(config);
  }

  async syncInstance(
    workspaceId: string,
    instanceId: string,
  ): Promise<ProviderInstanceDiagnostics> {
    const config = await this.getInstanceConfig(instanceId, workspaceId);
    const diagnostics = await this.provider.getInstanceDiagnostics(config);

    await this.prisma.instance.update({
      where: { id: instanceId },
      data: {
        phoneNumber:
          diagnostics.phoneNumber?.displayPhoneNumber ?? config.phoneNumber,
        status: diagnostics.healthy
          ? InstanceStatus.CONNECTED
          : InstanceStatus.SYNCING,
        lastSyncAt: new Date(),
      },
    });

    return diagnostics;
  }

  async subscribeApp(
    workspaceId: string,
    instanceId: string,
    payload?: {
      overrideCallbackUri?: string;
      verifyToken?: string;
    },
  ) {
    const config = await this.getInstanceConfig(instanceId, workspaceId);
    const subscribePayload = this.buildSubscribePayload(config, payload);
    const result = await this.provider.subscribeApp(config, subscribePayload);

    await this.prisma.instance.update({
      where: { id: instanceId },
      data: {
        status: InstanceStatus.CONNECTED,
        lastSyncAt: new Date(),
      },
    });

    return result;
  }

  async listTemplates(
    workspaceId: string,
    instanceId: string,
  ): Promise<ProviderTemplateSummary[]> {
    const config = await this.getInstanceConfig(instanceId, workspaceId);
    return this.provider.listTemplates(config);
  }

  async getBusinessProfile(workspaceId: string, instanceId: string) {
    const config = await this.getInstanceConfig(instanceId, workspaceId);

    try {
      return await this.provider.getBusinessProfile(config);
    } catch (error) {
      throw this.buildFriendlyProfileError(
        'Nao foi possivel carregar o perfil do WhatsApp.',
        error,
      );
    }
  }

  async updateBusinessProfile(
    workspaceId: string,
    instanceId: string,
    payload: {
      about?: string;
      description?: string;
      email?: string;
      websites?: string[];
      address?: string;
      vertical?: string;
    },
  ) {
    const config = await this.getInstanceConfig(instanceId, workspaceId);
    const sanitizedPayload = {
      about: payload.about?.trim() || undefined,
      description: payload.description?.trim() || undefined,
      email: payload.email?.trim() || undefined,
      websites: payload.websites?.map((item) => item.trim()).filter(Boolean),
      address: payload.address?.trim() || undefined,
      vertical: payload.vertical?.trim() || undefined,
    };

    if (
      !sanitizedPayload.about &&
      !sanitizedPayload.description &&
      !sanitizedPayload.email &&
      !sanitizedPayload.websites?.length &&
      !sanitizedPayload.address &&
      !sanitizedPayload.vertical
    ) {
      throw new BadRequestException(
        'Informe ao menos um campo do perfil para atualizar.',
      );
    }

    try {
      const result = await this.provider.updateBusinessProfile(
        config,
        sanitizedPayload,
      );

      await this.prisma.instance.update({
        where: { id: instanceId },
        data: {
          lastSyncAt: new Date(),
        },
      });

      return result;
    } catch (error) {
      throw this.buildFriendlyProfileError(
        'Nao foi possivel atualizar o perfil do WhatsApp.',
        error,
      );
    }
  }

  async updateProfilePicture(
    workspaceId: string,
    instanceId: string,
    payload: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      contentLength: number;
    },
  ) {
    const allowedMimeTypes = new Set(['image/jpeg', 'image/png']);

    if (!allowedMimeTypes.has(payload.mimeType)) {
      throw new BadRequestException(
        'Use uma imagem PNG ou JPG para atualizar a foto do WhatsApp.',
      );
    }

    const config = await this.getInstanceConfig(instanceId, workspaceId);

    try {
      const result = await this.provider.updateBusinessProfilePicture(
        config,
        payload,
      );

      await this.prisma.instance.update({
        where: { id: instanceId },
        data: {
          lastSyncAt: new Date(),
        },
      });

      return result;
    } catch (error) {
      throw this.buildFriendlyProfileError(
        'Nao foi possivel atualizar a foto do WhatsApp.',
        error,
      );
    }
  }

  async sendDirectMessage(
    workspaceId: string,
    payload: {
      instanceId: string;
      to: string;
      body: string;
      userId?: string;
      contactName?: string;
    },
  ) {
    const contact = await this.ensureContact(
      workspaceId,
      payload.to,
      payload.contactName,
    );
    const conversation = await this.ensureConversation(
      workspaceId,
      contact.id,
      payload.instanceId,
      payload.userId,
    );
    return this.sendConversationMessage(
      workspaceId,
      conversation.id,
      payload.userId ?? null,
      payload.body,
    );
  }

  async sendDirectMediaMessage(
    workspaceId: string,
    payload: {
      instanceId: string;
      to: string;
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      caption?: string;
      voice?: boolean;
      userId?: string;
      contactName?: string;
    },
  ) {
    const contact = await this.ensureContact(
      workspaceId,
      payload.to,
      payload.contactName,
    );
    const conversation = await this.ensureConversation(
      workspaceId,
      contact.id,
      payload.instanceId,
      payload.userId,
    );

    return this.sendConversationMediaMessage(
      workspaceId,
      conversation.id,
      payload.userId ?? null,
      {
        buffer: payload.buffer,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        caption: payload.caption,
        voice: payload.voice,
      },
    );
  }

  async sendTemplateDirectMessage(
    workspaceId: string,
    payload: {
      instanceId: string;
      to: string;
      templateName: string;
      languageCode: string;
      userId?: string;
      contactName?: string;
      headerParameters?: string[];
      bodyParameters?: string[];
    },
  ) {
    const contact = await this.ensureContact(
      workspaceId,
      payload.to,
      payload.contactName,
    );
    const conversation = await this.ensureConversation(
      workspaceId,
      contact.id,
      payload.instanceId,
      payload.userId,
    );

    return this.sendTemplateConversationMessage(
      workspaceId,
      conversation.id,
      payload.userId ?? null,
      {
        instanceId: payload.instanceId,
        templateName: payload.templateName,
        languageCode: payload.languageCode,
        headerParameters: payload.headerParameters,
        bodyParameters: payload.bodyParameters,
      },
    );
  }

  async sendConversationMessage(
    workspaceId: string,
    conversationId: string,
    senderUserId: string | null,
    content: string,
    options?: {
      direction?: MessageDirection;
      isAutomated?: boolean;
      autoMessageType?: AutoMessageType;
    },
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
        deletedAt: null,
      },
      include: {
        contact: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    const instanceId = conversation.instanceId
      ? conversation.instanceId
      : (
          await this.prisma.instance.findFirst({
            where: {
              workspaceId,
              deletedAt: null,
            },
            orderBy: {
              updatedAt: 'desc',
            },
          })
        )?.id;

    if (!instanceId) {
      throw new BadRequestException('Nenhuma instancia disponivel para envio.');
    }

    const config = await this.getInstanceConfig(instanceId, workspaceId);
    const windowStatus = await this.getCustomerServiceWindowStatus(
      conversation.id,
      workspaceId,
      config,
    );

    if (!windowStatus.isOpen) {
      const templateFallbackMessage =
        await this.trySendClosedWindowTemplateReply({
          workspaceId,
          conversationId: conversation.id,
          senderUserId,
          instanceId,
          content,
        });

      if (templateFallbackMessage) {
        return templateFallbackMessage;
      }

      throw new BadRequestException(
        'A janela de atendimento de 24 horas nao esta aberta. Configure um template aprovado para envio automatico fora da janela ou use envio manual por template aprovado.',
      );
    }

    const providerResult = await this.provider.sendTextMessage(
      config,
      conversation.contact.phone,
      content,
    );

    return this.persistOutboundMessage({
      workspaceId,
      conversationId: conversation.id,
      senderUserId,
      instanceId,
      content,
      direction: options?.direction,
      isAutomated: options?.isAutomated,
      autoMessageType: options?.autoMessageType,
      providerResult,
    });
  }

  async sendConversationMediaMessage(
    workspaceId: string,
    conversationId: string,
    senderUserId: string | null,
    payload: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      caption?: string;
      voice?: boolean;
    },
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
        deletedAt: null,
      },
      include: {
        contact: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    const instanceId = conversation.instanceId
      ? conversation.instanceId
      : (
          await this.prisma.instance.findFirst({
            where: {
              workspaceId,
              deletedAt: null,
            },
            orderBy: {
              updatedAt: 'desc',
            },
          })
        )?.id;

    if (!instanceId) {
      throw new BadRequestException('Nenhuma instancia disponivel para envio.');
    }

    const config = await this.getInstanceConfig(instanceId, workspaceId);
    await this.assertCustomerServiceWindow(
      conversation.id,
      workspaceId,
      config,
    );

    const normalizedMessageType = this.resolveOutboundMediaType(
      payload.mimeType,
    );
    const uploadResult = await this.provider.uploadMedia(config, {
      buffer: payload.buffer,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
    });

    const providerResult = await this.provider.sendMediaMessage(
      config,
      conversation.contact.phone,
      {
        type: normalizedMessageType,
        mediaId: uploadResult.mediaId,
        caption: payload.caption,
        fileName: payload.fileName,
      },
    );

    return this.persistOutboundMessage({
      workspaceId,
      conversationId: conversation.id,
      senderUserId,
      instanceId,
      content:
        payload.caption?.trim() ||
        this.buildMediaPlaceholder(normalizedMessageType, payload.fileName),
      direction: MessageDirection.OUTBOUND,
      isAutomated: false,
      providerResult: {
        ...providerResult,
        messageType: normalizedMessageType,
        metadata: {
          ...(providerResult.metadata ?? {}),
          mediaId: uploadResult.mediaId,
          mimeType: payload.mimeType,
          fileName: payload.fileName,
          caption: payload.caption,
          voice: payload.voice ?? false,
        },
      },
    });
  }

  async sendTemplateConversationMessage(
    workspaceId: string,
    conversationId: string,
    senderUserId: string | null,
    payload: {
      instanceId?: string;
      templateName: string;
      languageCode: string;
      headerParameters?: string[];
      bodyParameters?: string[];
      contentPreview?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
        deletedAt: null,
      },
      include: {
        contact: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    const instanceId =
      payload.instanceId ??
      conversation.instanceId ??
      (
        await this.prisma.instance.findFirst({
          where: {
            workspaceId,
            deletedAt: null,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        })
      )?.id;

    if (!instanceId) {
      throw new BadRequestException('Nenhuma instancia disponivel para envio.');
    }

    const config = await this.getInstanceConfig(instanceId, workspaceId);
    const providerResult = await this.provider.sendTemplateMessage(
      config,
      conversation.contact.phone,
      {
        name: payload.templateName,
        languageCode: payload.languageCode,
        headerParameters: this.mapTemplateParameters(payload.headerParameters),
        bodyParameters: this.mapTemplateParameters(payload.bodyParameters),
      },
    );

    const content =
      payload.contentPreview?.trim() ||
      `Template ${payload.templateName} (${payload.languageCode})`;

    return this.persistOutboundMessage({
      workspaceId,
      conversationId: conversation.id,
      senderUserId,
      instanceId,
      content,
      providerResult: {
        ...providerResult,
        metadata: {
          ...(providerResult.metadata ?? {}),
          templateName: payload.templateName,
          languageCode: payload.languageCode,
          headerParameters: payload.headerParameters ?? [],
          bodyParameters: payload.bodyParameters ?? [],
          ...(payload.metadata ?? {}),
        },
      },
    });
  }

  async verifyWebhook(query: {
    'hub.mode'?: string;
    'hub.verify_token'?: string;
    'hub.challenge'?: string;
  }) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode !== 'subscribe' || !token || !challenge) {
      throw new BadRequestException('Parametros de verificacao ausentes.');
    }

    const instances = await this.prisma.instance.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        webhookVerifyTokenEncrypted: true,
      },
    });

    const envVerifyToken = this.configService.get<string>(
      'META_WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    );

    const matchedInstanceToken = instances.some(
      (instance) =>
        this.cryptoService.decrypt(instance.webhookVerifyTokenEncrypted) ===
        token,
    );

    const matchedEnvToken = envVerifyToken === token;

    if (!matchedInstanceToken && !matchedEnvToken) {
      throw new UnauthorizedException('Webhook verify token invalido.');
    }

    return challenge;
  }

  async handleWebhook(
    payload: Record<string, unknown>,
    context?: {
      signature?: string;
      rawBody?: Buffer;
    },
  ) {
    const parsed = this.provider.parseWebhook(payload);
    const firstPhoneNumberId =
      parsed.messages[0]?.phoneNumberId ?? parsed.statuses[0]?.phoneNumberId;

    const instance = firstPhoneNumberId
      ? await this.prisma.instance.findFirst({
          where: {
            phoneNumberId: firstPhoneNumberId,
            deletedAt: null,
          },
        })
      : null;

    await this.assertWebhookSignature(
      instance?.id,
      firstPhoneNumberId,
      context?.signature,
      context?.rawBody,
    );

    const webhookEvent = await this.prisma.whatsAppWebhookEvent.create({
      data: {
        workspaceId: instance?.workspaceId,
        instanceId: instance?.id,
        externalId: Array.isArray(payload.entry)
          ? payload.entry
              .map((entry) => (entry as { id?: string }).id)
              .filter(Boolean)
              .join(',')
          : undefined,
        eventType:
          parsed.messages.length > 0
            ? WebhookEventType.MESSAGE
            : parsed.statuses.length > 0
              ? WebhookEventType.STATUS
              : WebhookEventType.OTHER,
        payload: payload as Prisma.InputJsonValue,
      },
    });

    for (const inbound of parsed.messages) {
      const inboundInstance =
        inbound.phoneNumberId &&
        (await this.prisma.instance.findFirst({
          where: {
            phoneNumberId: inbound.phoneNumberId,
            deletedAt: null,
          },
        }));

      if (!inboundInstance) {
        continue;
      }

      const contact = await this.ensureContact(
        inboundInstance.workspaceId,
        inbound.from,
        inbound.profileName,
      );
      const conversation = await this.ensureConversation(
        inboundInstance.workspaceId,
        contact.id,
        inboundInstance.id,
      );

      await this.prisma.conversationMessage.create({
        data: {
          workspaceId: inboundInstance.workspaceId,
          conversationId: conversation.id,
          senderContactId: contact.id,
          instanceId: inboundInstance.id,
          externalMessageId: inbound.externalMessageId,
          direction: MessageDirection.INBOUND,
          messageType: inbound.messageType,
          content: inbound.body,
          metadata: inbound.metadata as Prisma.InputJsonValue | undefined,
          status: MessageStatus.READ,
          sentAt: inbound.timestamp
            ? new Date(Number(inbound.timestamp) * 1000)
            : new Date(),
          deliveredAt: new Date(),
          readAt: new Date(),
        },
      });

      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview:
            inbound.body || this.buildMediaPlaceholder(inbound.messageType),
        },
      });

      await this.conversationWorkflowService.registerInboundActivity(
        conversation.id,
        inboundInstance.workspaceId,
      );
      await this.notifyConversationRecipientsAboutInboundMessage({
        workspaceId: inboundInstance.workspaceId,
        conversationId: conversation.id,
        contactName: contact.name,
        preview:
          inbound.body || this.buildMediaPlaceholder(inbound.messageType),
      });
      await this.conversationWorkflowService.emitConversationRealtimeEvent(
        inboundInstance.workspaceId,
        conversation.id,
        'conversation.message.created',
        'INBOUND',
      );
      await this.maybeSendAutomaticReply(
        inboundInstance.workspaceId,
        conversation.id,
      );
    }

    for (const status of parsed.statuses) {
      const message = await this.prisma.conversationMessage.findFirst({
        where: {
          externalMessageId: status.externalMessageId,
        },
      });

      if (!message) {
        continue;
      }

      const nextStatus = this.mapMetaStatus(status.status);

      await this.prisma.conversationMessage.update({
        where: { id: message.id },
        data: {
          status: nextStatus,
          deliveredAt:
            nextStatus === MessageStatus.DELIVERED ||
            nextStatus === MessageStatus.READ
              ? new Date()
              : message.deliveredAt,
          readAt:
            nextStatus === MessageStatus.READ ? new Date() : message.readAt,
        },
      });

      await this.prisma.messageDeliveryStatus.create({
        data: {
          workspaceId: message.workspaceId,
          messageId: message.id,
          instanceId: message.instanceId,
          provider: (instance?.provider ?? 'META_WHATSAPP') as never,
          externalMessageId: status.externalMessageId,
          status: nextStatus,
          payload: status as Prisma.InputJsonValue,
        },
      });

      await this.conversationWorkflowService.emitConversationRealtimeEvent(
        message.workspaceId,
        message.conversationId,
        'conversation.message.status.updated',
        'OUTBOUND',
      );
    }

    await this.prisma.whatsAppWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        processedAt: new Date(),
      },
    });

    return {
      success: true,
      processedMessages: parsed.messages.length,
      processedStatuses: parsed.statuses.length,
    };
  }

  async getMessageMedia(
    workspaceId: string,
    messageId: string,
  ): Promise<{
    buffer: Buffer;
    mimeType?: string | null;
    fileName?: string | null;
    contentLength?: number | null;
  }> {
    const message = await this.prisma.conversationMessage.findFirst({
      where: {
        id: messageId,
        workspaceId,
      },
      include: {
        conversation: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Mensagem nao encontrada.');
    }

    const metadata = this.readMessageMetadata(message.metadata);
    const mediaId = metadata.mediaId;

    if (!mediaId) {
      throw new BadRequestException('A mensagem nao possui midia anexada.');
    }

    const instanceId = message.instanceId ?? message.conversation.instanceId;

    if (!instanceId) {
      throw new BadRequestException(
        'A mensagem nao possui uma instancia associada para baixar a midia.',
      );
    }

    const config = await this.getInstanceConfig(instanceId, workspaceId);
    const download = await this.provider.downloadMedia(config, mediaId);

    return {
      ...download,
      mimeType: download.mimeType ?? metadata.mimeType ?? null,
      fileName: download.fileName ?? metadata.fileName ?? null,
    };
  }

  private async maybeSendAutomaticReply(
    workspaceId: string,
    conversationId: string,
  ) {
    const context =
      await this.workspaceSettingsService.getBusinessHoursContext(workspaceId);
    const autoMessageType = context.isOpen
      ? AutoMessageType.IN_BUSINESS_HOURS
      : AutoMessageType.OUT_OF_BUSINESS_HOURS;
    const enabled = context.isOpen
      ? context.settings.sendBusinessHoursAutoReply
      : context.settings.sendOutOfHoursAutoReply;
    const message = context.isOpen
      ? context.settings.businessHoursAutoReply?.trim()
      : context.settings.outOfHoursAutoReply?.trim();

    if (!enabled || !message) {
      return;
    }

    const cooldownMs = context.settings.autoReplyCooldownMinutes * 60_000;
    const [latestSameAutoReply, latestOutboundMessage] = await Promise.all([
      this.prisma.conversationMessage.findFirst({
        where: {
          workspaceId,
          conversationId,
          direction: MessageDirection.SYSTEM,
          autoMessageType,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.conversationMessage.findFirst({
        where: {
          workspaceId,
          conversationId,
          direction: {
            in: [MessageDirection.OUTBOUND, MessageDirection.SYSTEM],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    if (
      latestSameAutoReply &&
      Date.now() - latestSameAutoReply.createdAt.getTime() < cooldownMs
    ) {
      return;
    }

    if (
      latestOutboundMessage &&
      Date.now() - latestOutboundMessage.createdAt.getTime() < cooldownMs
    ) {
      return;
    }

    await this.sendConversationMessage(
      workspaceId,
      conversationId,
      null,
      message,
      {
        direction: MessageDirection.SYSTEM,
        isAutomated: true,
        autoMessageType,
      },
    );
  }

  private async getInstanceConfig(
    instanceId: string,
    workspaceId: string,
  ): Promise<MessagingInstanceConfig & { provider: 'META_WHATSAPP' }> {
    const instance = await this.prisma.instance.findFirst({
      where: {
        id: instanceId,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!instance) {
      throw new NotFoundException('Instancia nao encontrada.');
    }

    return {
      id: instance.id,
      workspaceId: instance.workspaceId,
      provider: 'META_WHATSAPP',
      mode: instance.mode,
      appId: instance.appId ?? this.configService.get<string>('META_APP_ID'),
      phoneNumber: instance.phoneNumber,
      phoneNumberId: instance.phoneNumberId,
      businessAccountId: instance.businessAccountId,
      accessToken: this.cryptoService.decrypt(instance.accessTokenEncrypted),
      verifyToken: this.cryptoService.decrypt(
        instance.webhookVerifyTokenEncrypted,
      ),
      appSecret: this.cryptoService.decrypt(instance.appSecretEncrypted),
    };
  }

  private async assertWebhookSignature(
    instanceId: string | undefined,
    phoneNumberId: string | undefined,
    signature: string | undefined,
    rawBody: Buffer | undefined,
  ) {
    if (
      (this.configService.get<string>('META_MODE') ?? 'DEV').toUpperCase() !==
      'PRODUCTION'
    ) {
      return;
    }

    const candidateInstances = await this.prisma.instance.findMany({
      where: {
        deletedAt: null,
        ...(instanceId
          ? { id: instanceId }
          : phoneNumberId
            ? { phoneNumberId }
            : {}),
      },
      select: {
        appSecretEncrypted: true,
      },
    });

    const secrets = candidateInstances
      .map((candidate) =>
        this.cryptoService.decrypt(candidate.appSecretEncrypted),
      )
      .filter((value): value is string => Boolean(value));

    if (!secrets.length) {
      return;
    }

    if (!signature || !rawBody) {
      throw new UnauthorizedException(
        'Assinatura X-Hub-Signature-256 obrigatoria para webhooks em producao.',
      );
    }

    const valid = secrets.some((secret) =>
      this.provider.validateWebhookSignature(rawBody, signature, secret),
    );

    if (!valid) {
      throw new UnauthorizedException('Assinatura do webhook Meta invalida.');
    }
  }

  private async getCustomerServiceWindowStatus(
    conversationId: string,
    workspaceId: string,
    config: MessagingInstanceConfig,
  ) {
    if (!this.provider.canUseRealTransport(config)) {
      return {
        isOpen: true,
        latestInboundAt: null,
      };
    }

    const latestInbound = await this.prisma.conversationMessage.findFirst({
      where: {
        workspaceId,
        conversationId,
        direction: MessageDirection.INBOUND,
      },
      orderBy: {
        sentAt: 'desc',
      },
    });

    const serviceWindowMs = 24 * 60 * 60 * 1000;
    const latestInboundAt = latestInbound?.sentAt ?? null;

    return {
      isOpen: latestInboundAt
        ? Date.now() - latestInboundAt.getTime() <= serviceWindowMs
        : false,
      latestInboundAt,
    };
  }

  private async assertCustomerServiceWindow(
    conversationId: string,
    workspaceId: string,
    config: MessagingInstanceConfig,
  ) {
    const status = await this.getCustomerServiceWindowStatus(
      conversationId,
      workspaceId,
      config,
    );

    if (!status.isOpen) {
      throw new BadRequestException(
        'A janela de atendimento de 24 horas nao esta aberta. Use envio por template aprovado.',
      );
    }
  }

  private async trySendClosedWindowTemplateReply(payload: {
    workspaceId: string;
    conversationId: string;
    senderUserId: string | null;
    instanceId: string;
    content: string;
  }) {
    if (!payload.senderUserId) {
      return null;
    }

    const settings =
      await this.workspaceSettingsService.getConversationSettings(
        payload.workspaceId,
      );

    if (!settings.sendWindowClosedTemplateReply) {
      return null;
    }

    const templateName = settings.windowClosedTemplateName?.trim();
    const languageCode = this.normalizeTemplateLanguageCode(
      settings.windowClosedTemplateLanguageCode,
    );

    if (!templateName || !languageCode) {
      throw new BadRequestException(
        'O template automatico para fora da janela de 24 horas nao esta configurado corretamente.',
      );
    }

    try {
      return await this.sendTemplateConversationMessage(
        payload.workspaceId,
        payload.conversationId,
        payload.senderUserId,
        {
          instanceId: payload.instanceId,
          templateName,
          languageCode,
          bodyParameters: [payload.content],
          contentPreview: payload.content,
          metadata: {
            windowClosedTemplateReply: true,
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Falha ao enviar template configurado para janela fechada (workspace=${payload.workspaceId}, template=${templateName}, language=${languageCode}): ${error instanceof Error ? error.message : String(error)}. Tentando auto-descoberta.`,
      );

      const autoCandidates = await this.resolveClosedWindowTemplateCandidates({
        workspaceId: payload.workspaceId,
        instanceId: payload.instanceId,
        preferredLanguageCode: languageCode,
        attemptedTemplateKey: `${templateName}|${languageCode}`,
      });

      for (const candidate of autoCandidates) {
        try {
          const message = await this.sendTemplateConversationMessage(
            payload.workspaceId,
            payload.conversationId,
            payload.senderUserId,
            {
              instanceId: payload.instanceId,
              templateName: candidate.templateName,
              languageCode: candidate.languageCode,
              bodyParameters: [payload.content],
              contentPreview: payload.content,
              metadata: {
                windowClosedTemplateReply: true,
                autoTemplateConfigured: true,
              },
            },
          );

          await this.prisma.workspaceConversationSettings.update({
            where: {
              workspaceId: payload.workspaceId,
            },
            data: {
              sendWindowClosedTemplateReply: true,
              windowClosedTemplateName: candidate.templateName,
              windowClosedTemplateLanguageCode: candidate.languageCode,
            },
          });

          this.logger.log(
            `Template fora da janela auto-configurado (workspace=${payload.workspaceId}, template=${candidate.templateName}, language=${candidate.languageCode}).`,
          );

          return message;
        } catch {
          continue;
        }
      }

      this.logger.warn(
        `Auto-descoberta de template falhou para workspace=${payload.workspaceId}.`,
      );

      throw new BadRequestException(
        'Nao foi possivel enviar o template aprovado configurado para fora da janela de 24 horas. Revise o nome e o idioma configurados na Meta.',
      );
    }
  }

  private async resolveClosedWindowTemplateCandidates(payload: {
    workspaceId: string;
    instanceId: string;
    preferredLanguageCode?: string | null;
    attemptedTemplateKey?: string;
  }) {
    try {
      const preferredLanguage = this.normalizeTemplateLanguageCode(
        payload.preferredLanguageCode,
      );
      const templates = await this.listTemplates(
        payload.workspaceId,
        payload.instanceId,
      );

      const approved = templates.filter((template) => {
        const status = template.status?.trim().toUpperCase();
        return status === 'APPROVED';
      });

      const compatibleTemplates = approved.filter((template) =>
        this.isClosedWindowTemplateCandidateCompatible(template),
      );

      const scored = compatibleTemplates
        .map((template) => {
          const languageCode = this.normalizeTemplateLanguageCode(
            template.language,
          );
          const key = `${template.name}|${languageCode}`;
          let score = 0;

          if (preferredLanguage && languageCode === preferredLanguage) {
            score += 100;
          }

          if (
            preferredLanguage &&
            languageCode &&
            this.baseTemplateLanguage(languageCode) ===
              this.baseTemplateLanguage(preferredLanguage)
          ) {
            score += 20;
          }

          if ((template.qualityScore ?? '').toUpperCase() === 'GREEN') {
            score += 10;
          }

          if ((template.category ?? '').trim().toUpperCase() === 'UTILITY') {
            score += 15;
          }

          return {
            templateName: template.name,
            languageCode,
            key,
            score,
            lastUpdatedTime: template.lastUpdatedTime ?? null,
          };
        })
        .filter(
          (item) =>
            item.languageCode &&
            item.templateName.trim() &&
            item.key !== payload.attemptedTemplateKey,
        )
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          if (left.lastUpdatedTime && right.lastUpdatedTime) {
            return right.lastUpdatedTime.localeCompare(left.lastUpdatedTime);
          }

          return left.templateName.localeCompare(right.templateName);
        });

      return scored.map(({ templateName, languageCode }) => ({
        templateName,
        languageCode,
      }));
    } catch (error) {
      this.logger.warn(
        `Falha ao listar templates aprovados para auto-configuracao (workspace=${payload.workspaceId}).`,
      );
      return [];
    }
  }

  private normalizeTemplateLanguageCode(value?: string | null) {
    if (!value?.trim()) {
      return '';
    }

    const normalized = value.trim().replace('-', '_');
    const [language, region] = normalized.split('_');

    if (!language) {
      return normalized;
    }

    if (!region) {
      return language.toLowerCase();
    }

    return `${language.toLowerCase()}_${region.toUpperCase()}`;
  }

  private baseTemplateLanguage(value: string) {
    return value.split('_')[0]?.toLowerCase() ?? value.toLowerCase();
  }

  private isClosedWindowTemplateCandidateCompatible(
    template: ProviderTemplateSummary,
  ) {
    const headerFormat = template.headerFormat?.trim().toUpperCase() ?? null;
    // null means components data was not returned by the API - be lenient and allow the attempt
    const headerParameterCount = template.headerParameterCount;
    const bodyParameterCount = template.bodyParameterCount;

    if (headerFormat && headerFormat !== 'TEXT') {
      return false;
    }

    if (
      headerParameterCount !== null &&
      headerParameterCount !== undefined &&
      headerParameterCount > 0
    ) {
      return false;
    }

    // If count is unknown (null/undefined), allow it — Meta will validate the actual parameter count
    if (bodyParameterCount === null || bodyParameterCount === undefined) {
      return true;
    }

    return bodyParameterCount === 1;
  }

  private async persistOutboundMessage(payload: {
    workspaceId: string;
    conversationId: string;
    senderUserId: string | null;
    instanceId: string;
    content: string;
    direction?: MessageDirection;
    isAutomated?: boolean;
    autoMessageType?: AutoMessageType;
    providerResult: {
      externalMessageId: string;
      simulated: boolean;
      raw: Record<string, unknown>;
      messageType?: string;
      metadata?: Record<string, unknown>;
    };
  }) {
    const message = await this.prisma.conversationMessage.create({
      data: {
        workspaceId: payload.workspaceId,
        conversationId: payload.conversationId,
        senderUserId: payload.senderUserId ?? undefined,
        instanceId: payload.instanceId,
        externalMessageId: payload.providerResult.externalMessageId,
        direction: payload.direction ?? MessageDirection.OUTBOUND,
        messageType: payload.providerResult.messageType ?? 'text',
        content: payload.content,
        metadata: payload.providerResult.metadata as
          | Prisma.InputJsonValue
          | undefined,
        status: payload.providerResult.simulated
          ? MessageStatus.DELIVERED
          : MessageStatus.SENT,
        isAutomated: payload.isAutomated ?? false,
        autoMessageType: payload.autoMessageType,
        sentAt: new Date(),
        deliveredAt: payload.providerResult.simulated ? new Date() : null,
      },
    });

    await this.prisma.messageDeliveryStatus.create({
      data: {
        workspaceId: payload.workspaceId,
        messageId: message.id,
        instanceId: payload.instanceId,
        provider: 'META_WHATSAPP',
        externalMessageId: payload.providerResult.externalMessageId,
        status: payload.providerResult.simulated
          ? MessageStatus.DELIVERED
          : MessageStatus.SENT,
        payload: payload.providerResult.raw as Prisma.InputJsonValue,
      },
    });

    await this.prisma.conversation.update({
      where: { id: payload.conversationId },
      data: {
        instanceId: payload.instanceId,
        lastMessageAt: new Date(),
        lastMessagePreview:
          payload.content ||
          this.buildMediaPlaceholder(payload.providerResult.messageType),
        updatedAt: new Date(),
      },
    });

    if (payload.autoMessageType) {
      await this.prisma.conversationEvent.create({
        data: {
          workspaceId: payload.workspaceId,
          conversationId: payload.conversationId,
          type: ConversationEventType.AUTO_MESSAGE_SENT,
          metadata: {
            autoMessageType: payload.autoMessageType,
          },
        },
      });
    }

    await this.conversationWorkflowService.emitConversationRealtimeEvent(
      payload.workspaceId,
      payload.conversationId,
      'conversation.message.created',
      'OUTBOUND',
    );

    return message;
  }

  private mapTemplateParameters(values?: string[]): TemplateParameter[] {
    return (values ?? []).filter(Boolean).map((value) => ({
      type: 'text',
      text: value,
    }));
  }

  private async ensureContact(
    workspaceId: string,
    phone: string,
    name?: string,
  ) {
    const normalizedPhone = normalizeContactPhone(phone);
    const equivalentPhones = buildEquivalentContactPhones(phone);
    const existing = await this.prisma.contact.findFirst({
      where: {
        workspaceId,
        phone: {
          in: equivalentPhones.length ? equivalentPhones : [normalizedPhone],
        },
        deletedAt: null,
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.contact.create({
      data: {
        workspaceId,
        name: name ?? `Contato ${normalizedPhone.slice(-4)}`,
        phone: normalizedPhone,
      },
    });
  }

  private async ensureConversation(
    workspaceId: string,
    contactId: string,
    instanceId: string,
    assignedUserId?: string | null,
  ) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        workspaceId,
        contactId,
        deletedAt: null,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (existing) {
      if (existing.instanceId !== instanceId) {
        try {
          return await this.prisma.conversation.update({
            where: {
              id: existing.id,
            },
            data: {
              instanceId,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            // If another active conversation already holds this unique triplet,
            // keep using the latest conversation found for this contact.
            return existing;
          }

          throw error;
        }
      }

      return existing;
    }

    try {
      return await this.prisma.conversation.create({
        data: {
          workspaceId,
          contactId,
          instanceId,
          assignedUserId: assignedUserId ?? undefined,
          status: assignedUserId
            ? ConversationStatus.IN_PROGRESS
            : ConversationStatus.NEW,
          ownership: assignedUserId
            ? ConversationOwnership.MINE
            : ConversationOwnership.UNASSIGNED,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicateConversation = await this.prisma.conversation.findFirst({
          where: {
            workspaceId,
            contactId,
            deletedAt: null,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        });

        if (duplicateConversation) {
          return duplicateConversation;
        }
      }

      throw error;
    }
  }

  private mapMetaStatus(status: string) {
    if (status === 'read') return MessageStatus.READ;
    if (status === 'delivered') return MessageStatus.DELIVERED;
    if (status === 'failed') return MessageStatus.FAILED;
    return MessageStatus.SENT;
  }

  private buildSubscribePayload(
    config: MessagingInstanceConfig,
    payload?: {
      overrideCallbackUri?: string;
      verifyToken?: string;
    },
  ) {
    const backendPublicUrl = this.normalizeBaseUrl(
      this.configService.get<string>('BACKEND_PUBLIC_URL'),
    );
    const envVerifyToken = this.configService.get<string>(
      'META_WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    );

    const overrideCallbackUri =
      payload?.overrideCallbackUri ??
      (backendPublicUrl
        ? `${backendPublicUrl}/api/webhooks/meta/whatsapp`
        : undefined);
    const verifyToken =
      payload?.verifyToken ?? config.verifyToken ?? envVerifyToken;

    if (!overrideCallbackUri && !verifyToken) {
      return undefined;
    }

    return {
      overrideCallbackUri,
      verifyToken,
    };
  }

  private buildFriendlyProfileError(message: string, error: unknown) {
    const detail =
      error instanceof Error
        ? error.message
        : 'Erro inesperado na integracao com a Meta.';

    this.logger.error(`${message} ${detail}`);

    return new BadRequestException(`${message} ${detail}`);
  }

  private normalizeBaseUrl(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized.replace(/\/+$/, '') : null;
  }

  private resolveOutboundMediaType(mimeType: string) {
    if (mimeType === 'image/webp') return 'sticker';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'document';
  }

  private buildMediaPlaceholder(
    messageType?: string,
    fileName?: string | null,
  ) {
    if (messageType === 'image') return 'Imagem';
    if (messageType === 'audio') return 'Audio';
    if (messageType === 'video') return 'Video';
    if (messageType === 'sticker') return 'Figurinha';
    if (messageType === 'document')
      return fileName ? `Documento: ${fileName}` : 'Documento';
    if (messageType === 'template') return 'Template enviado';
    return 'Mensagem';
  }

  private readMessageMetadata(metadata: Prisma.JsonValue | null): {
    mediaId?: string;
    mimeType?: string | null;
    fileName?: string | null;
  } {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }

    const value = metadata as Record<string, Prisma.JsonValue>;

    return {
      mediaId: typeof value.mediaId === 'string' ? value.mediaId : undefined,
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : null,
      fileName: typeof value.fileName === 'string' ? value.fileName : null,
    };
  }

  private async notifyConversationRecipientsAboutInboundMessage(payload: {
    workspaceId: string;
    conversationId: string;
    contactName: string;
    preview: string;
  }) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: payload.conversationId,
        workspaceId: payload.workspaceId,
      },
      select: {
        status: true,
        assignedUserId: true,
        resolvedById: true,
        closedById: true,
      },
    });

    if (!conversation) {
      return;
    }

    const recipientIds = await this.resolveNotificationRecipients(
      payload.workspaceId,
      {
        status: conversation.status,
        assignedUserId: conversation.assignedUserId,
        resolvedById: conversation.resolvedById,
        closedById: conversation.closedById,
      },
    );

    if (!recipientIds.length) {
      return;
    }

    await this.notificationsService.createForUsers({
      workspaceId: payload.workspaceId,
      userIds: recipientIds,
      title: `Nova mensagem: ${payload.contactName}`,
      body: payload.preview.slice(0, 180),
      type: NotificationType.INFO,
      entityType: 'conversation',
      entityId: payload.conversationId,
      linkHref: `/app/inbox?conversationId=${payload.conversationId}`,
      metadata: {
        conversationId: payload.conversationId,
        contactName: payload.contactName,
        preview: payload.preview,
        source: 'customer_message',
      },
    });
  }

  private async resolveNotificationRecipients(
    workspaceId: string,
    conversation: {
      status: ConversationStatus;
      assignedUserId: string | null;
      resolvedById: string | null;
      closedById: string | null;
    },
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        role: true,
      },
    });

    const normalizedStatus = normalizeConversationStatus(
      conversation.status,
      conversation.assignedUserId,
    );
    const recipientIds: string[] = [];
    const linkedUserIds = new Set(
      [
        conversation.assignedUserId,
        conversation.resolvedById,
        conversation.closedById,
      ].filter((value): value is string => Boolean(value)),
    );

    for (const user of users) {
      if (normalizeRole(user.role) === Role.ADMIN) {
        recipientIds.push(user.id);
        continue;
      }

      const permissions = await this.accessControlService.getUserPermissions(
        user.id,
        workspaceId,
      );

      if (!permissions.permissionMap[PermissionKey.INBOX_VIEW]) {
        continue;
      }

      // For sellers, only notify users already linked to this conversation.
      if (!linkedUserIds.has(user.id)) {
        continue;
      }

      if (
        normalizedStatus === ConversationStatus.NEW ||
        normalizedStatus === ConversationStatus.WAITING ||
        normalizedStatus === ConversationStatus.IN_PROGRESS
      ) {
        recipientIds.push(user.id);
        continue;
      }

      if (
        (normalizedStatus === ConversationStatus.RESOLVED ||
          normalizedStatus === ConversationStatus.CLOSED) &&
        [
          conversation.assignedUserId,
          conversation.resolvedById,
          conversation.closedById,
        ].includes(user.id)
      ) {
        recipientIds.push(user.id);
      }
    }

    return recipientIds;
  }
}
