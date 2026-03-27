import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AutoMessageType,
  ConversationEventType,
  ConversationOwnership,
  ConversationStatus,
  InstanceProvider,
  InstanceStatus,
  MessageDirection,
  MessageStatus,
  NotificationType,
  PermissionKey,
  Prisma,
  Role,
  UserStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildEquivalentContactPhones,
  normalizeContactPhone,
} from '../../../common/utils/phone';
import { AccessControlService } from '../../access-control/access-control.service';
import { normalizeRole } from '../../access-control/permissions.constants';
import { ConversationWorkflowService } from '../../conversations/conversation-workflow.service';
import { normalizeConversationStatus } from '../../conversations/conversation-workflow.utils';
import { NotificationsService } from '../../notifications/notifications.service';
import { WorkspaceSettingsService } from '../../workspace-settings/workspace-settings.service';
import { MetaWhatsAppProvider } from '../meta-whatsapp/meta-whatsapp.provider';
import type {
  InteractiveMessagePayload,
  MessagingInstanceConfig,
  MessagingProvider,
  ProviderSendResult,
  ProviderTemplateSummary,
  TemplateParameter,
} from '../meta-whatsapp/messaging-provider.interface';
import { getWhatsAppProviderCapabilities } from './whatsapp-provider-capabilities';
import { WhatsAppMediaStorageService } from './whatsapp-media-storage.service';
import { WhatsAppWebTransportProvider } from '../whatsapp-web/whatsapp-web.transport-provider';

type InteractiveMenuNodeRecord = {
  id: string;
  parentId: string | null;
  label: string;
  message: string;
  type: string;
  order: number;
};

type InteractiveMenuRecord = {
  id: string;
  name: string;
  headerText: string | null;
  footerText: string | null;
  triggerKeywords: string[];
  nodes: InteractiveMenuNodeRecord[];
};

type InteractiveMenuContextOption = {
  nodeId: string;
  label: string;
  order: number;
  replyId: string;
  type: string;
};

type InteractiveMenuContext = {
  menuId: string;
  parentNodeId: string | null;
  sentAs: 'button' | 'list' | 'text';
  options: InteractiveMenuContextOption[];
};

type ResolvedConversationContext = {
  conversation: {
    id: string;
    workspaceId: string;
    instanceId: string | null;
    contact: {
      id: string;
      phone: string;
      name: string;
    };
  };
  instanceId: string;
  config: MessagingInstanceConfig;
  transport: MessagingProvider;
};

@Injectable()
export class WhatsAppMessagingService {
  private readonly logger = new Logger(WhatsAppMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cryptoService: CryptoService,
    private readonly metaProvider: MetaWhatsAppProvider,
    private readonly whatsappWebTransportProvider: WhatsAppWebTransportProvider,
    private readonly conversationWorkflowService: ConversationWorkflowService,
    private readonly workspaceSettingsService: WorkspaceSettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly accessControlService: AccessControlService,
    private readonly mediaStorageService: WhatsAppMediaStorageService,
  ) {}

  async sendDirectMessage(
    workspaceId: string,
    payload: {
      instanceId: string;
      to: string;
      body: string;
      userId?: string | null;
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
      userId?: string | null;
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
      payload,
    );
  }

  async sendTemplateDirectMessage(
    workspaceId: string,
    payload: {
      instanceId: string;
      to: string;
      templateName: string;
      languageCode: string;
      userId?: string | null;
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
      quotedMessageId?: string;
    },
  ) {
    const context = await this.resolveConversationContext(
      workspaceId,
      conversationId,
    );
    const capabilities = getWhatsAppProviderCapabilities(
      context.config.provider,
    );

    if (capabilities.enforces24HourWindow) {
      const windowStatus = await this.getCustomerServiceWindowStatus(
        conversationId,
        workspaceId,
        context.config,
      );

      if (!windowStatus.isOpen) {
        const templateFallbackMessage =
          await this.trySendClosedWindowTemplateReply({
            workspaceId,
            conversationId,
            senderUserId,
            instanceId: context.instanceId,
            content,
            config: context.config,
          });

        if (templateFallbackMessage) {
          return templateFallbackMessage;
        }

        throw new BadRequestException(
          'A janela de atendimento de 24 horas nao esta aberta. Configure um template aprovado para envio automatico fora da janela ou use envio manual por template aprovado.',
        );
      }
    }

    const quoteContext = await this.resolveQuotedMessageContext({
      workspaceId,
      conversationId,
      quotedMessageId: options?.quotedMessageId,
    });
    const providerResult = await context.transport.sendTextMessage(
      context.config,
      context.conversation.contact.phone,
      content,
      {
        quotedExternalMessageId: quoteContext?.externalMessageId,
      },
    );

    return this.persistOutboundMessage({
      workspaceId,
      conversationId,
      senderUserId,
      instanceId: context.instanceId,
      provider: context.config.provider,
      content,
      direction: options?.direction,
      isAutomated: options?.isAutomated,
      autoMessageType: options?.autoMessageType,
      providerResult: {
        ...providerResult,
        metadata: {
          ...(providerResult.metadata ?? {}),
          ...(quoteContext?.metadata ?? {}),
        },
      },
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
      quotedMessageId?: string;
    },
  ) {
    const context = await this.resolveConversationContext(
      workspaceId,
      conversationId,
    );
    const capabilities = getWhatsAppProviderCapabilities(
      context.config.provider,
    );

    if (capabilities.enforces24HourWindow) {
      await this.assertCustomerServiceWindow(
        conversationId,
        workspaceId,
        context.config,
      );
    }

    const normalizedMessageType = this.resolveOutboundMediaType(
      payload.mimeType,
    );
    const quoteContext = await this.resolveQuotedMessageContext({
      workspaceId,
      conversationId,
      quotedMessageId: payload.quotedMessageId,
    });

    let providerResult: ProviderSendResult;
    let mediaMetadata: Record<string, unknown> = {
      mimeType: payload.mimeType,
      fileName: payload.fileName,
      caption: payload.caption,
      voice: payload.voice ?? false,
      ...(quoteContext?.metadata ?? {}),
    };

    if (context.config.provider === InstanceProvider.META_WHATSAPP) {
      const uploadResult = await context.transport.uploadMedia(context.config, {
        buffer: payload.buffer,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
      });
      providerResult = await context.transport.sendMediaMessage(
        context.config,
        context.conversation.contact.phone,
        {
          type: normalizedMessageType,
          mediaId: uploadResult.mediaId,
          caption: payload.caption,
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          voice: payload.voice ?? false,
          quotedExternalMessageId: quoteContext?.externalMessageId,
        },
      );
      mediaMetadata = {
        ...mediaMetadata,
        mediaId: uploadResult.mediaId,
      };
    } else {
      providerResult = await context.transport.sendMediaMessage(
        context.config,
        context.conversation.contact.phone,
        {
          type: normalizedMessageType,
          mediaBufferBase64: payload.buffer.toString('base64'),
          caption: payload.caption,
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          voice: payload.voice ?? false,
          quotedExternalMessageId: quoteContext?.externalMessageId,
        },
      );
      mediaMetadata = {
        ...mediaMetadata,
        mediaId: null,
        size: payload.buffer.length,
        downloadStrategy: 'session',
      };
    }

    if (context.config.provider === InstanceProvider.WHATSAPP_WEB) {
      mediaMetadata = {
        ...mediaMetadata,
        mediaId: providerResult.externalMessageId,
      };
    }

    return this.persistOutboundMessage({
      workspaceId,
      conversationId,
      senderUserId,
      instanceId: context.instanceId,
      provider: context.config.provider,
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
          ...mediaMetadata,
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
    const context = await this.resolveConversationContext(
      workspaceId,
      conversationId,
      payload.instanceId,
    );

    if (context.config.provider !== InstanceProvider.META_WHATSAPP) {
      throw new BadRequestException(
        'Templates aprovados estao disponiveis apenas para instancias oficiais da Meta.',
      );
    }

    const providerResult = await context.transport.sendTemplateMessage(
      context.config,
      context.conversation.contact.phone,
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
      conversationId,
      senderUserId,
      instanceId: context.instanceId,
      provider: context.config.provider,
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

  async sendConversationInteractiveMessage(
    workspaceId: string,
    conversationId: string,
    interactivePayload: InteractiveMessagePayload,
    fallbackText: string,
    metadata: Record<string, unknown>,
  ) {
    const context = await this.resolveConversationContext(
      workspaceId,
      conversationId,
    );
    const capabilities = getWhatsAppProviderCapabilities(
      context.config.provider,
    );

    if (!capabilities.interactiveMessages) {
      const message = await this.sendConversationMessage(
        workspaceId,
        conversationId,
        null,
        fallbackText,
        {
          direction: MessageDirection.SYSTEM,
          isAutomated: true,
        },
      );

      await this.prisma.conversationMessage.update({
        where: {
          id: message.id,
        },
        data: {
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      return message;
    }

    if (capabilities.enforces24HourWindow) {
      const windowStatus = await this.getCustomerServiceWindowStatus(
        conversationId,
        workspaceId,
        context.config,
      );

      if (!windowStatus.isOpen) {
        return this.sendConversationMessage(
          workspaceId,
          conversationId,
          null,
          fallbackText,
          {
            direction: MessageDirection.SYSTEM,
            isAutomated: true,
          },
        );
      }
    }

    const providerResult = await context.transport.sendInteractiveMessage(
      context.config,
      context.conversation.contact.phone,
      interactivePayload,
    );

    return this.persistOutboundMessage({
      workspaceId,
      conversationId,
      senderUserId: null,
      instanceId: context.instanceId,
      provider: context.config.provider,
      content: fallbackText,
      direction: MessageDirection.SYSTEM,
      isAutomated: true,
      providerResult: {
        ...providerResult,
        messageType: 'interactive',
        metadata: {
          ...(providerResult.metadata ?? {}),
          ...metadata,
        },
      },
    });
  }

  async processIncomingPayload(payload: {
    messages: Array<{
      instanceId?: string;
      phoneNumberId?: string;
      from: string;
      profileName?: string;
      externalMessageId: string;
      messageType: string;
      body: string;
      timestamp?: string;
      metadata?: Record<string, unknown>;
    }>;
    statuses: Array<{
      instanceId?: string;
      phoneNumberId?: string;
      externalMessageId: string;
      status: string;
      timestamp?: string;
      conversationId?: string;
      conversationOriginType?: string;
      pricingCategory?: string;
      errors?: Array<{
        code?: number;
        title?: string;
        message?: string;
        details?: string;
      }>;
    }>;
  }) {
    for (const inbound of payload.messages) {
      if (this.shouldIgnoreInboundMessage(inbound)) {
        this.logger.warn(
          `Webhook inbound ignorado: ${inbound.externalMessageId || 'sem-id'} marcado como status ou thread nao privada do WhatsApp.`,
        );
        continue;
      }

      const providerMessageContext = this.readProviderMessageContext(
        inbound.metadata,
      );
      const isSyncedOutboundMessage = providerMessageContext?.fromMe === true;

      const inboundInstance = await this.resolveInboundInstance({
        instanceId: inbound.instanceId,
        phoneNumberId: inbound.phoneNumberId,
      });

      if (!inboundInstance) {
        continue;
      }

      const messageSentAt = this.resolveInboundMessageSentAt(inbound.timestamp);
      const messageAgeMs = Date.now() - messageSentAt.getTime();
      const isStaleMessage = messageAgeMs > 10 * 60 * 1000;

      if (isStaleMessage) {
        this.logger.warn(
          `Webhook com mensagem antiga (${Math.round(messageAgeMs / 60_000)} min atras) de ${inbound.from}. Salvando apenas no historico.`,
        );
      }

      const contact = await this.ensureContact(
        inboundInstance.workspaceId,
        inbound.from,
        inbound.profileName,
        {
          provider: inboundInstance.provider,
          remoteJid: this.pickString(
            providerMessageContext?.remoteJid,
            providerMessageContext?.fromMe === true
              ? providerMessageContext?.toRaw
              : providerMessageContext?.fromRaw,
          ),
        },
      );
      const conversation = await this.ensureConversation(
        inboundInstance.workspaceId,
        contact.id,
        inboundInstance.id,
      );
      const shouldTreatAsNewInboundActivity =
        !isStaleMessage &&
        (!conversation.lastMessageAt ||
          messageSentAt.getTime() >= conversation.lastMessageAt.getTime());
      const inboundMetadata = await this.enrichInboundMessageMetadata({
        workspaceId: inboundInstance.workspaceId,
        instanceId: inboundInstance.id,
        conversationId: conversation.id,
        provider: inboundInstance.provider,
        externalMessageId: inbound.externalMessageId,
        metadata: inbound.metadata,
        direction: isSyncedOutboundMessage ? 'outbound' : 'inbound',
      });

      if (inbound.externalMessageId) {
        const existingMessage = await this.prisma.conversationMessage.findFirst(
          {
            where: {
              externalMessageId: inbound.externalMessageId,
            },
            select: { id: true },
          },
        );

        if (existingMessage) {
          await this.refreshDuplicateMessageMetadata(
            existingMessage.id,
            inboundMetadata,
          );
          this.logger.warn(
            `Webhook duplicado ignorado: mensagem ${inbound.externalMessageId} ja existe no banco.`,
          );
          continue;
        }
      }

      const inboundPreview =
        inbound.body || this.buildMediaPlaceholder(inbound.messageType);

      if (isSyncedOutboundMessage) {
        await this.persistSyncedPrivateOutboundMessage({
          workspaceId: inboundInstance.workspaceId,
          conversationId: conversation.id,
          instanceId: inboundInstance.id,
          provider: inboundInstance.provider,
          externalMessageId: inbound.externalMessageId,
          messageType: inbound.messageType,
          content: inbound.body,
          metadata: inboundMetadata,
          sentAt: messageSentAt,
        });

        await this.updateConversationLastMessageSnapshot({
          conversationId: conversation.id,
          messageSentAt,
          preview: inboundPreview,
        });

        await this.prisma.instance.update({
          where: { id: inboundInstance.id },
          data: {
            status: InstanceStatus.CONNECTED,
            connectedAt: new Date(),
            lastSeenAt: new Date(),
            lastSyncAt: new Date(),
          },
        });

        await this.conversationWorkflowService.emitConversationRealtimeEvent(
          inboundInstance.workspaceId,
          conversation.id,
          'conversation.message.created',
          'OUTBOUND',
        );
        continue;
      }

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
          metadata: inboundMetadata as Prisma.InputJsonValue | undefined,
          status: MessageStatus.READ,
          sentAt: messageSentAt,
          deliveredAt: new Date(),
          readAt: new Date(),
        },
      });

      await this.updateConversationLastMessageSnapshot({
        conversationId: conversation.id,
        messageSentAt,
        preview: inboundPreview,
      });

      await this.prisma.instance.update({
        where: { id: inboundInstance.id },
        data: {
          status: InstanceStatus.CONNECTED,
          connectedAt: new Date(),
          lastSeenAt: new Date(),
          lastSyncAt: new Date(),
        },
      });

      if (shouldTreatAsNewInboundActivity) {
        await this.conversationWorkflowService.registerInboundActivity(
          conversation.id,
          inboundInstance.workspaceId,
        );
        await this.notifyConversationRecipientsAboutInboundMessage({
          workspaceId: inboundInstance.workspaceId,
          conversationId: conversation.id,
          contactName: contact.name,
          preview: inboundPreview,
        });
      }

      await this.conversationWorkflowService.emitConversationRealtimeEvent(
        inboundInstance.workspaceId,
        conversation.id,
        'conversation.message.created',
        'INBOUND',
      );

      if (shouldTreatAsNewInboundActivity) {
        const menuReplySent = await this.maybeSendInteractiveMenuReply(
          inboundInstance.workspaceId,
          conversation.id,
          inbound.body,
          inboundMetadata,
        );

        if (!menuReplySent) {
          await this.maybeSendAutomaticReply(
            inboundInstance.workspaceId,
            conversation.id,
          );
        }
      }
    }

    for (const status of payload.statuses) {
      if (this.isNonPrivateExternalMessageId(status.externalMessageId)) {
        continue;
      }

      const message = await this.prisma.conversationMessage.findFirst({
        where: {
          externalMessageId: status.externalMessageId,
        },
      });

      if (!message || this.shouldIgnoreStoredConversationMessage(message)) {
        continue;
      }

      const instance = message.instanceId
        ? await this.prisma.instance.findUnique({
            where: { id: message.instanceId },
            select: { provider: true, id: true, workspaceId: true },
          })
        : null;
      const nextStatus = this.mapProviderStatus(status.status);

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
          provider: instance?.provider ?? InstanceProvider.META_WHATSAPP,
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

    return {
      success: true,
      processedMessages: payload.messages.length,
      processedStatuses: payload.statuses.length,
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
    const instanceId = message.instanceId ?? message.conversation.instanceId;

    if (!instanceId) {
      throw new BadRequestException(
        'A mensagem nao possui uma instancia associada para baixar a midia.',
      );
    }

    const config = await this.getInstanceConfig(instanceId, workspaceId);
    const transport = this.resolveTransport(config.provider);
    const mediaId = metadata.mediaId ?? message.externalMessageId ?? undefined;

    if (config.provider === InstanceProvider.WHATSAPP_WEB && mediaId) {
      try {
        const download = await transport.downloadMedia(config, mediaId);

        return {
          ...download,
          mimeType: download.mimeType ?? metadata.mimeType ?? null,
          fileName: download.fileName ?? metadata.fileName ?? null,
        };
      } catch (error) {
        if (metadata.storagePath) {
          this.logger.warn(
            `Falha no download sob demanda da mensagem ${messageId}; tentando storage legado: ${error instanceof Error ? error.message : String(error)}`,
          );

          return this.readStoredMessageMedia({
            messageId,
            storagePath: metadata.storagePath,
            mimeType: metadata.mimeType ?? null,
            fileName: metadata.fileName ?? null,
          });
        }

        throw error;
      }
    }

    if (metadata.storagePath) {
      return this.readStoredMessageMedia({
        messageId,
        storagePath: metadata.storagePath,
        mimeType: metadata.mimeType ?? null,
        fileName: metadata.fileName ?? null,
      });
    }

    if (!mediaId) {
      throw new BadRequestException('A mensagem nao possui midia anexada.');
    }

    const download = await transport.downloadMedia(config, mediaId);

    return {
      ...download,
      mimeType: download.mimeType ?? metadata.mimeType ?? null,
      fileName: download.fileName ?? metadata.fileName ?? null,
    };
  }

  private async readStoredMessageMedia(payload: {
    messageId: string;
    storagePath: string;
    mimeType?: string | null;
    fileName?: string | null;
  }) {
    try {
      const buffer = await this.mediaStorageService.read(payload.storagePath);

      return {
        buffer,
        mimeType: payload.mimeType ?? null,
        fileName: payload.fileName ?? null,
        contentLength: buffer.length,
      };
    } catch (error) {
      this.logger.warn(
        `Midia local indisponivel para a mensagem ${payload.messageId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new NotFoundException(
        'A midia desta mensagem nao esta mais disponivel no servidor.',
      );
    }
  }

  private async resolveConversationContext(
    workspaceId: string,
    conversationId: string,
    preferredInstanceId?: string,
  ): Promise<ResolvedConversationContext> {
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
      preferredInstanceId ??
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

    return {
      conversation,
      instanceId,
      config,
      transport: this.resolveTransport(config.provider),
    };
  }

  private resolveTransport(provider: InstanceProvider): MessagingProvider {
    if (provider === InstanceProvider.WHATSAPP_WEB) {
      return this.whatsappWebTransportProvider;
    }

    return this.metaProvider;
  }

  async getInstanceConfig(
    instanceId: string,
    workspaceId: string,
  ): Promise<MessagingInstanceConfig> {
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
      provider: instance.provider,
      mode: instance.mode,
      externalInstanceId: instance.externalInstanceId,
      appId: instance.appId,
      phoneNumber: instance.phoneNumber,
      phoneNumberId: instance.phoneNumberId,
      businessAccountId: instance.businessAccountId,
      accessToken:
        this.cryptoService.decrypt(instance.accessTokenEncrypted) ??
        this.configService.get<string>('META_WHATSAPP_ACCESS_TOKEN') ??
        null,
      verifyToken:
        this.cryptoService.decrypt(instance.webhookVerifyTokenEncrypted) ??
        this.configService.get<string>('META_WHATSAPP_WEBHOOK_VERIFY_TOKEN') ??
        null,
      appSecret:
        this.cryptoService.decrypt(instance.appSecretEncrypted) ??
        this.configService.get<string>('META_APP_SECRET') ??
        null,
      internalWebhookSecret:
        this.cryptoService.decrypt(instance.internalWebhookSecretEncrypted) ??
        null,
      providerConfig: this.toRecord(instance.providerConfig),
      providerMetadata: this.toRecord(instance.providerMetadata),
      providerSessionState: this.toRecord(instance.providerSessionState),
    };
  }

  private async resolveInboundInstance(payload: {
    instanceId?: string;
    phoneNumberId?: string;
  }) {
    if (payload.instanceId) {
      return this.prisma.instance.findFirst({
        where: {
          id: payload.instanceId,
          deletedAt: null,
        },
      });
    }

    if (!payload.phoneNumberId) {
      return null;
    }

    return this.prisma.instance.findFirst({
      where: {
        phoneNumberId: payload.phoneNumberId,
        deletedAt: null,
      },
    });
  }

  private resolveInboundMessageSentAt(timestamp?: string) {
    const parsedTimestamp = timestamp ? Number(timestamp) * 1000 : Date.now();

    if (!Number.isFinite(parsedTimestamp) || parsedTimestamp <= 0) {
      return new Date();
    }

    return new Date(parsedTimestamp);
  }

  private async updateConversationLastMessageSnapshot(payload: {
    conversationId: string;
    messageSentAt: Date;
    preview: string;
  }) {
    await this.prisma.conversation.updateMany({
      where: {
        id: payload.conversationId,
        OR: [
          {
            lastMessageAt: null,
          },
          {
            lastMessageAt: {
              lte: payload.messageSentAt,
            },
          },
        ],
      },
      data: {
        lastMessageAt: payload.messageSentAt,
        lastMessagePreview: payload.preview,
        updatedAt: new Date(),
      },
    });
  }

  private async persistSyncedPrivateOutboundMessage(payload: {
    workspaceId: string;
    conversationId: string;
    instanceId: string;
    provider: InstanceProvider;
    externalMessageId: string;
    messageType: string;
    content: string;
    metadata?: Record<string, unknown>;
    sentAt: Date;
  }) {
    const status = this.resolveSyncedPrivateOutboundStatus(payload.metadata);

    const message = await this.prisma.conversationMessage.create({
      data: {
        workspaceId: payload.workspaceId,
        conversationId: payload.conversationId,
        instanceId: payload.instanceId,
        externalMessageId: payload.externalMessageId,
        direction: MessageDirection.OUTBOUND,
        messageType: payload.messageType,
        content: payload.content,
        metadata: payload.metadata as Prisma.InputJsonValue | undefined,
        status,
        sentAt: payload.sentAt,
        deliveredAt:
          status === MessageStatus.DELIVERED || status === MessageStatus.READ
            ? new Date()
            : null,
        readAt: status === MessageStatus.READ ? new Date() : null,
      },
    });

    await this.prisma.messageDeliveryStatus.create({
      data: {
        workspaceId: payload.workspaceId,
        messageId: message.id,
        instanceId: payload.instanceId,
        provider: payload.provider,
        externalMessageId: payload.externalMessageId,
        status,
        payload: payload.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    return message;
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

  private normalizeInteractiveMenuTrigger(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  private buildInteractiveMenuMessage(
    menu: Pick<InteractiveMenuRecord, 'headerText' | 'footerText'>,
    options: InteractiveMenuNodeRecord[],
  ): string | null {
    if (!options.length) {
      return null;
    }

    const lines: string[] = [];
    if (menu.headerText?.trim()) {
      lines.push(menu.headerText.trim());
    }

    options.forEach((node, index) => {
      lines.push(`${index + 1}. ${node.label.trim()}`);
    });

    if (menu.footerText?.trim()) {
      lines.push(menu.footerText.trim());
    }

    return lines.join('\n').trim() || null;
  }

  private async maybeSendInteractiveMenuReply(
    workspaceId: string,
    conversationId: string,
    inboundBody?: string | null,
    inboundMetadata?: Record<string, unknown>,
  ): Promise<boolean> {
    const activeMenus = await this.prisma.autoResponseMenu.findMany({
      where: {
        workspaceId,
        isActive: true,
      },
      include: {
        nodes: {
          select: {
            id: true,
            parentId: true,
            label: true,
            message: true,
            type: true,
            order: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!activeMenus.length) {
      return false;
    }

    const normalizedInbound = inboundBody?.trim()
      ? this.normalizeInteractiveMenuTrigger(inboundBody)
      : '';

    if (normalizedInbound) {
      const matchedMenu = activeMenus.find((menu) =>
        (menu.triggerKeywords ?? []).some(
          (keyword) =>
            this.normalizeInteractiveMenuTrigger(keyword) === normalizedInbound,
        ),
      );

      if (matchedMenu) {
        const latestContext = await this.findLatestInteractiveMenuContext(
          workspaceId,
          conversationId,
        );

        if (
          latestContext &&
          latestContext.context.menuId === matchedMenu.id &&
          latestContext.context.parentNodeId === null &&
          Date.now() - latestContext.createdAt.getTime() < 2 * 60_000
        ) {
          return true;
        }

        return this.sendInteractiveMenuStep(
          workspaceId,
          conversationId,
          matchedMenu,
          null,
        );
      }
    }

    const latestContext = await this.findLatestInteractiveMenuContext(
      workspaceId,
      conversationId,
    );

    if (
      !latestContext ||
      Date.now() - latestContext.createdAt.getTime() > 30 * 60_000
    ) {
      return false;
    }

    const menu = activeMenus.find(
      (item) => item.id === latestContext.context.menuId,
    );
    if (!menu) {
      return false;
    }

    const options = this.getMenuStepOptions(
      menu,
      latestContext.context.parentNodeId,
    );
    if (!options.length) {
      return false;
    }

    const inboundReplyId = this.readInboundInteractiveReplyId(inboundMetadata);
    const selectedOption = this.resolveSelectedInteractiveOption({
      options: latestContext.context.options,
      inboundReplyId,
      inboundBody: inboundBody ?? null,
      normalizedInbound,
    });

    if (!selectedOption) {
      const fallbackMessage =
        this.buildInteractiveMenuMessage(menu, options) ??
        'Nao consegui identificar a opcao escolhida. Selecione uma das opcoes enviadas.';

      await this.sendConversationMessage(
        workspaceId,
        conversationId,
        null,
        fallbackMessage,
        {
          direction: MessageDirection.SYSTEM,
          isAutomated: true,
        },
      );
      return true;
    }

    const selectedNode = options.find(
      (node) => node.id === selectedOption.nodeId,
    );
    if (!selectedNode) {
      return false;
    }

    const selectedMessage = selectedNode.message ?? '';
    const defaultAgentMessage =
      selectedNode.type === 'talk_to_agent'
        ? 'Perfeito. Vou te encaminhar para um atendente agora mesmo.'
        : null;
    const outgoingMessage =
      selectedMessage.length > 0 ? selectedMessage : defaultAgentMessage;

    if (outgoingMessage) {
      await this.sendConversationMessage(
        workspaceId,
        conversationId,
        null,
        outgoingMessage,
        {
          direction: MessageDirection.SYSTEM,
          isAutomated: true,
        },
      );
    }

    const hasChildren =
      this.getMenuStepOptions(menu, selectedNode.id).length > 0;

    if (hasChildren) {
      await this.sendInteractiveMenuStep(
        workspaceId,
        conversationId,
        menu,
        selectedNode.id,
      );
    }

    return true;
  }

  private getMenuStepOptions(
    menu: InteractiveMenuRecord,
    parentNodeId: string | null,
  ) {
    return menu.nodes
      .filter(
        (node) =>
          node.parentId === parentNodeId &&
          typeof node.label === 'string' &&
          node.label.trim().length > 0,
      )
      .sort((left, right) => left.order - right.order);
  }

  private readInboundInteractiveReplyId(metadata?: Record<string, unknown>) {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const interactive =
      metadata.interactive && typeof metadata.interactive === 'object'
        ? (metadata.interactive as Record<string, unknown>)
        : null;

    if (!interactive) {
      return null;
    }

    return typeof interactive.replyId === 'string' && interactive.replyId.trim()
      ? interactive.replyId.trim()
      : null;
  }

  private resolveSelectedInteractiveOption(payload: {
    options: InteractiveMenuContextOption[];
    inboundReplyId: string | null;
    inboundBody: string | null;
    normalizedInbound: string;
  }) {
    const sortedOptions = [...payload.options].sort(
      (left, right) => left.order - right.order,
    );

    if (payload.inboundReplyId) {
      const byReplyId = sortedOptions.find(
        (option) => option.replyId === payload.inboundReplyId,
      );

      if (byReplyId) {
        return byReplyId;
      }
    }

    const leadingNumberMatch = payload.inboundBody
      ?.trim()
      .match(/^(\d{1,2})\D?/);
    const requestedIndex = leadingNumberMatch
      ? Number(leadingNumberMatch[1])
      : Number.NaN;

    if (Number.isFinite(requestedIndex) && requestedIndex > 0) {
      const byIndex = sortedOptions[requestedIndex - 1];
      if (byIndex) {
        return byIndex;
      }
    }

    if (payload.normalizedInbound) {
      return sortedOptions.find(
        (option) =>
          this.normalizeInteractiveMenuTrigger(option.label) ===
          payload.normalizedInbound,
      );
    }

    return null;
  }

  private async findLatestInteractiveMenuContext(
    workspaceId: string,
    conversationId: string,
  ) {
    const candidates = await this.prisma.conversationMessage.findMany({
      where: {
        workspaceId,
        conversationId,
        direction: MessageDirection.SYSTEM,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 12,
      select: {
        createdAt: true,
        metadata: true,
      },
    });

    for (const candidate of candidates) {
      const metadata =
        candidate.metadata && typeof candidate.metadata === 'object'
          ? (candidate.metadata as Record<string, unknown>)
          : null;

      if (!metadata) {
        continue;
      }

      const menuContext =
        metadata.menuContext && typeof metadata.menuContext === 'object'
          ? (metadata.menuContext as Record<string, unknown>)
          : null;

      if (!menuContext) {
        continue;
      }

      const menuId =
        typeof menuContext.menuId === 'string' ? menuContext.menuId : null;
      if (!menuId) {
        continue;
      }

      const parentNodeId =
        typeof menuContext.parentNodeId === 'string'
          ? menuContext.parentNodeId
          : null;
      const sentAsRaw =
        typeof menuContext.sentAs === 'string' ? menuContext.sentAs : 'text';
      const sentAs: 'button' | 'list' | 'text' =
        sentAsRaw === 'button' || sentAsRaw === 'list' ? sentAsRaw : 'text';
      const options = Array.isArray(menuContext.options)
        ? menuContext.options
            .map((item) => {
              if (!item || typeof item !== 'object') {
                return null;
              }

              const row = item as Record<string, unknown>;
              const nodeId = typeof row.nodeId === 'string' ? row.nodeId : null;
              const label = typeof row.label === 'string' ? row.label : null;
              const replyId =
                typeof row.replyId === 'string' ? row.replyId : null;
              const order =
                typeof row.order === 'number' ? row.order : Number.NaN;
              const type = typeof row.type === 'string' ? row.type : 'message';

              if (!nodeId || !label || !replyId || !Number.isFinite(order)) {
                return null;
              }

              return {
                nodeId,
                label,
                replyId,
                order,
                type,
              } satisfies InteractiveMenuContextOption;
            })
            .filter(
              (item): item is InteractiveMenuContextOption => item !== null,
            )
        : [];

      if (!options.length) {
        continue;
      }

      return {
        createdAt: candidate.createdAt,
        context: {
          menuId,
          parentNodeId,
          sentAs,
          options,
        } satisfies InteractiveMenuContext,
      };
    }

    return null;
  }

  private buildInteractiveMenuReplyId(menuId: string, nodeId: string) {
    return `menu:${menuId}:node:${nodeId}`;
  }

  private trimInteractiveLabel(label: string, limit: number) {
    const normalized = label.replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, limit - 3)).trim()}...`;
  }

  private async sendInteractiveMenuStep(
    workspaceId: string,
    conversationId: string,
    menu: InteractiveMenuRecord,
    parentNodeId: string | null,
  ): Promise<boolean> {
    const options = this.getMenuStepOptions(menu, parentNodeId);
    if (!options.length) {
      return false;
    }

    const contextOptions: InteractiveMenuContextOption[] = options.map(
      (node) => ({
        nodeId: node.id,
        label: node.label.trim(),
        order: node.order,
        replyId: this.buildInteractiveMenuReplyId(menu.id, node.id),
        type: node.type,
      }),
    );

    const fallbackText = this.buildInteractiveMenuMessage(menu, options);
    if (!fallbackText) {
      return false;
    }

    const bodyText = menu.headerText?.trim() || 'Escolha uma opcao:';
    const footerText = menu.footerText?.trim() || undefined;

    let interactivePayload: InteractiveMessagePayload | null = null;
    let sentAs: 'button' | 'list' | 'text' = 'text';

    if (contextOptions.length <= 3) {
      interactivePayload = {
        type: 'button',
        body: this.trimInteractiveLabel(bodyText, 1024),
        footer: footerText
          ? this.trimInteractiveLabel(footerText, 60)
          : undefined,
        buttons: contextOptions.map((option) => ({
          id: option.replyId,
          title: this.trimInteractiveLabel(option.label, 20),
        })),
      };
      sentAs = 'button';
    } else if (contextOptions.length <= 10) {
      interactivePayload = {
        type: 'list',
        body: this.trimInteractiveLabel(bodyText, 1024),
        footer: footerText
          ? this.trimInteractiveLabel(footerText, 60)
          : undefined,
        buttonText: 'Ver opcoes',
        sections: [
          {
            title: 'Opcoes',
            rows: contextOptions.map((option) => ({
              id: option.replyId,
              title: this.trimInteractiveLabel(option.label, 24),
            })),
          },
        ],
      };
      sentAs = 'list';
    }

    const metadata = {
      menuContext: {
        menuId: menu.id,
        parentNodeId,
        sentAs,
        options: contextOptions,
      },
    };

    if (!interactivePayload) {
      const message = await this.sendConversationMessage(
        workspaceId,
        conversationId,
        null,
        fallbackText,
        {
          direction: MessageDirection.SYSTEM,
          isAutomated: true,
        },
      );

      await this.prisma.conversationMessage.update({
        where: {
          id: message.id,
        },
        data: {
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      return true;
    }

    await this.sendConversationInteractiveMessage(
      workspaceId,
      conversationId,
      interactivePayload,
      fallbackText,
      metadata,
    );

    return true;
  }

  private async getCustomerServiceWindowStatus(
    conversationId: string,
    workspaceId: string,
    config: MessagingInstanceConfig,
  ) {
    if (config.provider !== InstanceProvider.META_WHATSAPP) {
      return {
        isOpen: true,
        latestInboundAt: null,
      };
    }

    if (!this.metaProvider.canUseRealTransport(config)) {
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
    config: MessagingInstanceConfig;
  }) {
    if (
      !payload.senderUserId ||
      payload.config.provider !== InstanceProvider.META_WHATSAPP
    ) {
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
      const config = await this.getInstanceConfig(
        payload.instanceId,
        payload.workspaceId,
      );
      const templates = await this.metaProvider.listTemplates(config);
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
    } catch {
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
    provider: InstanceProvider;
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
        provider: payload.provider,
        externalMessageId: payload.providerResult.externalMessageId,
        status: payload.providerResult.simulated
          ? MessageStatus.DELIVERED
          : MessageStatus.SENT,
        payload: payload.providerResult.raw as Prisma.InputJsonValue,
      },
    });

    const now = new Date();

    await Promise.all([
      this.prisma.conversation.update({
        where: { id: payload.conversationId },
        data: {
          instanceId: payload.instanceId,
          lastMessageAt: now,
          lastMessagePreview:
            payload.content ||
            this.buildMediaPlaceholder(payload.providerResult.messageType),
          updatedAt: now,
        },
      }),
      this.prisma.instance.update({
        where: { id: payload.instanceId },
        data: {
          status: InstanceStatus.CONNECTED,
          lastSyncAt: now,
          lastSeenAt: now,
          connectedAt: now,
        },
      }),
    ]);

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
    options?: {
      provider?: InstanceProvider;
      remoteJid?: string | null;
    },
  ) {
    const normalizedPhone = normalizeContactPhone(phone);
    const equivalentPhones = buildEquivalentContactPhones(phone);
    const normalizedName = this.normalizeIncomingContactName(name);
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
      if (
        normalizedName &&
        this.shouldRefreshContactName(existing.name, normalizedPhone)
      ) {
        return this.prisma.contact.update({
          where: {
            id: existing.id,
          },
          data: {
            name: normalizedName,
          },
        });
      }

      return existing;
    }

    if (
      options?.provider === InstanceProvider.WHATSAPP_WEB &&
      options.remoteJid?.trim()
    ) {
      const legacyQrContact = await this.findLegacyQrContactByRemoteJid(
        workspaceId,
        options.remoteJid,
      );

      if (legacyQrContact) {
        const conflictingContact = await this.prisma.contact.findFirst({
          where: {
            workspaceId,
            id: {
              not: legacyQrContact.id,
            },
            phone: {
              in: equivalentPhones.length
                ? equivalentPhones
                : [normalizedPhone],
            },
            deletedAt: null,
          },
          select: {
            id: true,
          },
        });

        if (!conflictingContact) {
          return this.prisma.contact.update({
            where: {
              id: legacyQrContact.id,
            },
            data: {
              phone: normalizedPhone,
              ...(normalizedName &&
              this.shouldRefreshContactName(
                legacyQrContact.name,
                normalizedPhone,
              )
                ? {
                    name: normalizedName,
                  }
                : {}),
            },
          });
        }
      }
    }

    return this.prisma.contact.create({
      data: {
        workspaceId,
        name: normalizedName ?? this.buildFallbackContactName(normalizedPhone),
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
        instanceId,
        deletedAt: null,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (existing) {
      return existing;
    }

    const legacyConversation = await this.prisma.conversation.findFirst({
      where: {
        workspaceId,
        contactId,
        instanceId: null,
        deletedAt: null,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (legacyConversation) {
      try {
        return await this.prisma.conversation.update({
          where: {
            id: legacyConversation.id,
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
          const resolvedConversation = await this.prisma.conversation.findFirst(
            {
              where: {
                workspaceId,
                contactId,
                instanceId,
                deletedAt: null,
              },
              orderBy: {
                updatedAt: 'desc',
              },
            },
          );

          if (resolvedConversation) {
            return resolvedConversation;
          }
        } else {
          throw error;
        }
      }
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
            instanceId,
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

  private normalizeIncomingContactName(name?: string | null) {
    const normalizedName = name?.trim();
    return normalizedName ? normalizedName : null;
  }

  private buildFallbackContactName(normalizedPhone: string) {
    return `Contato ${normalizedPhone.slice(-4)}`;
  }

  private shouldRefreshContactName(
    currentName: string | null | undefined,
    normalizedPhone: string,
  ) {
    const normalizedCurrentName = currentName?.trim();

    if (!normalizedCurrentName) {
      return true;
    }

    const placeholderName = this.buildFallbackContactName(normalizedPhone);

    return (
      normalizedCurrentName === placeholderName ||
      normalizedCurrentName === normalizedPhone
    );
  }

  private mapProviderStatus(status: string) {
    const normalized = status.trim().toLowerCase();

    if (normalized === 'read' || normalized === 'played') {
      return MessageStatus.READ;
    }

    if (normalized === 'delivered' || normalized === 'server_ack') {
      return MessageStatus.DELIVERED;
    }

    if (normalized === 'failed' || normalized === 'error') {
      return MessageStatus.FAILED;
    }

    return MessageStatus.SENT;
  }

  private shouldIgnoreInboundMessage(payload: {
    externalMessageId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const providerMessageContext = this.readProviderMessageContext(
      payload.metadata,
    );

    if (this.isNonPrivateExternalMessageId(payload.externalMessageId)) {
      return true;
    }

    if (!providerMessageContext) {
      return false;
    }

    const peerJid = this.pickString(
      providerMessageContext.remoteJid,
      providerMessageContext.fromMe === true
        ? providerMessageContext.toRaw
        : providerMessageContext.fromRaw,
    );

    return (
      providerMessageContext.isPrivateChat === false ||
      providerMessageContext.isStatus === true ||
      providerMessageContext.isGroupMsg === true ||
      (providerMessageContext.broadcast === true &&
        this.pickString(providerMessageContext.messageType) ===
          'broadcast_notification') ||
      (peerJid !== null &&
        peerJid.includes('@') &&
        !this.isPrivateChatJid(peerJid)) ||
      this.isStatusBroadcastJid(providerMessageContext.remoteJid) ||
      this.isStatusBroadcastJid(providerMessageContext.fromRaw) ||
      this.isStatusBroadcastJid(providerMessageContext.toRaw) ||
      this.isGroupJid(providerMessageContext.remoteJid) ||
      this.isGroupJid(providerMessageContext.fromRaw) ||
      this.isGroupJid(providerMessageContext.toRaw)
    );
  }

  private readProviderMessageContext(metadata?: Record<string, unknown>) {
    return this.toRecord(metadata?.providerMessageContext);
  }

  private async findLegacyQrContactByRemoteJid(
    workspaceId: string,
    remoteJid: string,
  ) {
    const normalizedRemoteJid = remoteJid.trim();

    if (!normalizedRemoteJid) {
      return null;
    }

    const message = await this.prisma.conversationMessage.findFirst({
      where: {
        workspaceId,
        metadata: {
          path: ['providerMessageContext', 'remoteJid'],
          equals: normalizedRemoteJid,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        conversation: {
          select: {
            contact: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    return message?.conversation.contact ?? null;
  }

  private async refreshDuplicateMessageMetadata(
    messageId: string,
    metadata?: Record<string, unknown>,
  ) {
    const incomingMetadata = this.toRecord(metadata);

    if (!incomingMetadata) {
      return;
    }

    const currentMessage = await this.prisma.conversationMessage.findFirst({
      where: {
        id: messageId,
      },
      select: {
        metadata: true,
      },
    });

    const currentMetadata = this.toRecord(currentMessage?.metadata);
    const mergedMetadata = {
      ...(currentMetadata ?? {}),
      ...incomingMetadata,
      ...(this.mergeMetadataRecords(
        currentMetadata?.contact,
        incomingMetadata.contact,
      )
        ? {
            contact: this.mergeMetadataRecords(
              currentMetadata?.contact,
              incomingMetadata.contact,
            ),
          }
        : {}),
      ...(this.mergeMetadataRecords(
        currentMetadata?.providerMessageContext,
        incomingMetadata.providerMessageContext,
      )
        ? {
            providerMessageContext: this.mergeMetadataRecords(
              currentMetadata?.providerMessageContext,
              incomingMetadata.providerMessageContext,
            ),
          }
        : {}),
      ...(this.mergeMetadataRecords(
        currentMetadata?.media,
        incomingMetadata.media,
      )
        ? {
            media: this.mergeMetadataRecords(
              currentMetadata?.media,
              incomingMetadata.media,
            ),
          }
        : {}),
      ...(this.mergeQuoteMetadata(
        currentMetadata?.quote,
        incomingMetadata.quote,
      )
        ? {
            quote: this.mergeQuoteMetadata(
              currentMetadata?.quote,
              incomingMetadata.quote,
            ),
          }
        : {}),
    };

    await this.prisma.conversationMessage.update({
      where: {
        id: messageId,
      },
      data: {
        metadata: mergedMetadata as Prisma.InputJsonValue,
      },
    });
  }

  private shouldIgnoreStoredConversationMessage(message: {
    externalMessageId?: string | null;
    metadata?: Prisma.JsonValue | null;
  }) {
    return this.shouldIgnoreInboundMessage({
      externalMessageId: message.externalMessageId ?? undefined,
      metadata: this.toRecord(message.metadata) ?? undefined,
    });
  }

  private isStatusBroadcastJid(value: unknown) {
    return typeof value === 'string' && value.trim() === 'status@broadcast';
  }

  private isGroupJid(value: unknown) {
    return typeof value === 'string' && value.trim().endsWith('@g.us');
  }

  private isPrivateChatJid(value: string) {
    const normalized = value.trim();

    return normalized.endsWith('@c.us') || normalized.endsWith('@lid');
  }

  private isNonPrivateExternalMessageId(value?: string) {
    return Boolean(
      value &&
      (value.includes('@g.us') ||
        value.includes('@newsletter') ||
        value.includes('status@broadcast') ||
        value.includes('@broadcast')),
    );
  }

  private resolveSyncedPrivateOutboundStatus(
    metadata?: Record<string, unknown>,
  ) {
    const ack = this.toRecord(metadata)?.ack;

    if (typeof ack === 'number') {
      if (ack >= 3) {
        return MessageStatus.READ;
      }

      if (ack >= 2) {
        return MessageStatus.DELIVERED;
      }
    }

    return MessageStatus.SENT;
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
    if (messageType === 'video_note') return 'Video';
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
    storagePath?: string | null;
  } {
    const value = this.toRecord(metadata);

    if (!value) {
      return {};
    }

    const nestedMedia = this.toRecord(value.media);
    const mediaId = this.pickString(
      value.mediaId,
      value.media_id,
      value.id,
      nestedMedia?.id,
      nestedMedia?.mediaId,
      nestedMedia?.media_id,
    );
    const mimeType = this.pickString(
      value.mimeType,
      value.mime_type,
      value.mimetype,
      nestedMedia?.mimeType,
      nestedMedia?.mime_type,
      nestedMedia?.mimetype,
    );
    const fileName = this.pickString(
      value.fileName,
      value.file_name,
      value.filename,
      nestedMedia?.fileName,
      nestedMedia?.file_name,
      nestedMedia?.filename,
      value.documentName,
    );
    const storagePath = this.pickString(
      value.storagePath,
      nestedMedia?.storagePath,
    );

    return {
      mediaId: mediaId ?? undefined,
      mimeType: mimeType ?? null,
      fileName: fileName ?? null,
      storagePath: storagePath ?? null,
    };
  }

  private async resolveQuotedMessageContext(payload: {
    workspaceId: string;
    conversationId: string;
    quotedMessageId?: string;
  }) {
    const quotedMessageId = payload.quotedMessageId?.trim();

    if (!quotedMessageId) {
      return null;
    }

    const quotedMessage = await this.prisma.conversationMessage.findFirst({
      where: {
        id: quotedMessageId,
        workspaceId: payload.workspaceId,
        conversationId: payload.conversationId,
      },
      select: {
        id: true,
        externalMessageId: true,
        content: true,
        messageType: true,
        direction: true,
        createdAt: true,
        metadata: true,
      },
    });

    if (!quotedMessage) {
      throw new BadRequestException(
        'A mensagem selecionada para quote nao foi encontrada nesta conversa.',
      );
    }

    if (!quotedMessage.externalMessageId) {
      throw new BadRequestException(
        'A mensagem selecionada ainda nao pode ser citada. Aguarde sincronizar e tente novamente.',
      );
    }

    return {
      externalMessageId: quotedMessage.externalMessageId,
      metadata: {
        quote: {
          messageId: quotedMessage.id,
          externalMessageId: quotedMessage.externalMessageId,
          contentPreview: this.buildQuotePreview(quotedMessage),
          messageType: quotedMessage.messageType,
          direction: quotedMessage.direction,
          createdAt: quotedMessage.createdAt.toISOString(),
        },
      },
    };
  }

  private async enrichInboundMessageMetadata(payload: {
    workspaceId: string;
    instanceId: string;
    conversationId: string;
    provider: InstanceProvider;
    externalMessageId?: string;
    metadata?: Record<string, unknown>;
    direction?: 'inbound' | 'outbound';
  }) {
    const baseMetadata = this.toRecord(payload.metadata);

    if (!baseMetadata) {
      return undefined;
    }

    const materializedMetadata = await this.materializeInboundMediaMetadata({
      workspaceId: payload.workspaceId,
      instanceId: payload.instanceId,
      conversationId: payload.conversationId,
      provider: payload.provider,
      externalMessageId: payload.externalMessageId,
      metadata: baseMetadata,
      direction: payload.direction ?? 'inbound',
    });
    const quote = this.readQuoteMetadata(materializedMetadata);

    if (!quote?.externalMessageId) {
      return materializedMetadata;
    }

    const quotedMessage = await this.prisma.conversationMessage.findFirst({
      where: {
        workspaceId: payload.workspaceId,
        conversationId: payload.conversationId,
        externalMessageId: quote.externalMessageId,
      },
      select: {
        id: true,
        content: true,
        messageType: true,
        direction: true,
        createdAt: true,
        metadata: true,
      },
    });

    return {
      ...materializedMetadata,
      quote: {
        ...quote,
        messageId: quotedMessage?.id ?? null,
        contentPreview: quotedMessage
          ? this.buildQuotePreview(quotedMessage)
          : (quote.contentPreview ?? 'Mensagem citada'),
        messageType: quotedMessage?.messageType ?? quote.messageType ?? null,
        direction: quotedMessage?.direction ?? quote.direction ?? null,
        createdAt: quotedMessage?.createdAt.toISOString() ?? null,
      },
    };
  }

  private async materializeInboundMediaMetadata(payload: {
    workspaceId: string;
    instanceId: string;
    conversationId: string;
    provider: InstanceProvider;
    externalMessageId?: string;
    metadata: Record<string, unknown>;
    direction: 'inbound' | 'outbound';
  }) {
    const media = this.toRecord(payload.metadata.media);
    const mediaBase64 =
      typeof media?.dataBase64 === 'string'
        ? media.dataBase64.trim()
        : typeof media?.base64 === 'string'
          ? media.base64.trim()
          : null;

    if (payload.provider === InstanceProvider.WHATSAPP_WEB) {
      return this.buildWhatsAppWebSessionMediaMetadata({
        metadata: payload.metadata,
        externalMessageId: payload.externalMessageId,
      });
    }

    if (!mediaBase64) {
      return payload.metadata;
    }

    try {
      const buffer = Buffer.from(mediaBase64, 'base64');
      const stored = await this.mediaStorageService.save({
        workspaceId: payload.workspaceId,
        instanceId: payload.instanceId,
        conversationId: payload.conversationId,
        direction: payload.direction,
        buffer,
        fileName:
          typeof media?.fileName === 'string' ? media.fileName : 'arquivo',
        mimeType:
          typeof media?.mimeType === 'string'
            ? media.mimeType
            : 'application/octet-stream',
      });

      return {
        ...payload.metadata,
        media: {
          ...media,
          dataBase64: undefined,
          base64: undefined,
          storagePath: stored.storagePath,
          mimeType: stored.mimeType,
          fileName: stored.fileName,
          size: stored.size,
        },
        mediaId: stored.storagePath,
        storagePath: stored.storagePath,
        mimeType: stored.mimeType,
        fileName: stored.fileName,
      };
    } catch (error) {
      this.logger.warn(
        `Falha ao materializar midia inbound: ${error instanceof Error ? error.message : String(error)}`,
      );
      return payload.metadata;
    }
  }

  private buildWhatsAppWebSessionMediaMetadata(payload: {
    metadata: Record<string, unknown>;
    externalMessageId?: string;
  }) {
    const media = this.toRecord(payload.metadata.media);
    const normalizedMediaId =
      payload.externalMessageId?.trim() ||
      this.pickString(
        payload.metadata.mediaId,
        payload.metadata.media_id,
        media?.id,
        media?.mediaId,
        media?.media_id,
      ) ||
      null;
    const mimeType = this.pickString(
      payload.metadata.mimeType,
      payload.metadata.mime_type,
      payload.metadata.mimetype,
      media?.mimeType,
      media?.mime_type,
      media?.mimetype,
    );
    const fileName = this.pickString(
      payload.metadata.fileName,
      payload.metadata.file_name,
      payload.metadata.filename,
      media?.fileName,
      media?.file_name,
      media?.filename,
      payload.metadata.documentName,
    );
    const normalizedMedia = media
      ? {
          mimeType: mimeType ?? null,
          fileName: fileName ?? null,
          size: typeof media.size === 'number' ? media.size : null,
          voice: typeof media.voice === 'boolean' ? media.voice : null,
          durationSeconds:
            typeof media.durationSeconds === 'number'
              ? media.durationSeconds
              : null,
          downloadError:
            typeof media.downloadError === 'string'
              ? media.downloadError
              : null,
          isBase64: false,
          downloadStrategy: 'session',
        }
      : undefined;

    return {
      ...payload.metadata,
      media: normalizedMedia,
      mediaId: normalizedMediaId,
      storagePath: undefined,
      mimeType: mimeType ?? undefined,
      fileName: fileName ?? undefined,
    };
  }

  private buildQuotePreview(message: {
    content?: string | null;
    messageType?: string | null;
    metadata?: Prisma.JsonValue | null;
  }) {
    const normalizedContent = message.content?.trim();

    if (normalizedContent) {
      return normalizedContent.slice(0, 220);
    }

    const metadata = this.readMessageMetadata(message.metadata ?? null);

    return this.buildMediaPlaceholder(
      message.messageType ?? undefined,
      metadata.fileName,
    );
  }

  private readQuoteMetadata(metadata: Record<string, unknown>) {
    const quote = this.toRecord(metadata.quote);

    if (!quote) {
      return null;
    }

    const normalizedQuote = {
      messageId: typeof quote.messageId === 'string' ? quote.messageId : null,
      externalMessageId:
        typeof quote.externalMessageId === 'string'
          ? quote.externalMessageId
          : null,
      contentPreview:
        typeof quote.contentPreview === 'string' ? quote.contentPreview : null,
      messageType:
        typeof quote.messageType === 'string' ? quote.messageType : null,
      direction:
        typeof quote.direction === 'string'
          ? (quote.direction as MessageDirection)
          : null,
      createdAt: typeof quote.createdAt === 'string' ? quote.createdAt : null,
      from: typeof quote.from === 'string' ? quote.from : null,
    };

    return this.hasRenderableQuoteMetadata(normalizedQuote)
      ? normalizedQuote
      : null;
  }

  private mergeMetadataRecords(currentValue: unknown, incomingValue: unknown) {
    const mergedRecord = {
      ...(this.toRecord(currentValue) ?? {}),
      ...(this.toRecord(incomingValue) ?? {}),
    };

    return Object.keys(mergedRecord).length ? mergedRecord : null;
  }

  private mergeQuoteMetadata(currentValue: unknown, incomingValue: unknown) {
    const mergedQuote = this.mergeMetadataRecords(currentValue, incomingValue);

    if (!mergedQuote) {
      return null;
    }

    return this.readQuoteMetadata({ quote: mergedQuote });
  }

  private hasRenderableQuoteMetadata(quote: {
    messageId?: string | null;
    externalMessageId?: string | null;
    contentPreview?: string | null;
    messageType?: string | null;
    direction?: string | null;
    createdAt?: string | null;
    from?: string | null;
  }) {
    return Boolean(
      quote.messageId?.trim() ||
      quote.externalMessageId?.trim() ||
      quote.contentPreview?.trim() ||
      quote.messageType?.trim() ||
      quote.direction?.trim() ||
      quote.createdAt?.trim() ||
      quote.from?.trim(),
    );
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

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private pickString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }
}
