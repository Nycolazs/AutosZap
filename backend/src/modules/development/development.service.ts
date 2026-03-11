import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type DevelopmentSettingsPayload = {
  localFrontendUrl?: string;
  localBackendUrl?: string;
  localTunnelUrl?: string;
  preferredInstanceId?: string;
  notes?: string;
};

type WorkspaceDevelopmentSettings = {
  localFrontendUrl?: string | null;
  localBackendUrl?: string | null;
  localTunnelUrl?: string | null;
  preferredInstanceId?: string | null;
  notes?: string | null;
};

@Injectable()
export class DevelopmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getOverview(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        settings: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace nao encontrada.');
    }

    const instances = await this.prisma.instance.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        status: true,
        mode: true,
        phoneNumber: true,
        businessAccountId: true,
        phoneNumberId: true,
        lastSyncAt: true,
      },
    });

    const developmentSettings = this.getDevelopmentSettings(workspace.settings);
    const selectedInstanceId = instances.some(
      (instance) => instance.id === developmentSettings.preferredInstanceId,
    )
      ? developmentSettings.preferredInstanceId
      : (instances[0]?.id ?? null);

    const backendPublicUrl = this.normalizeUrl(
      this.configService.get<string>('BACKEND_PUBLIC_URL'),
    );
    const localTunnelUrl = this.normalizeUrl(
      developmentSettings.localTunnelUrl,
    );
    const webhookPath = '/api/webhooks/meta/whatsapp';
    const verifyToken =
      this.configService.get<string>('META_WHATSAPP_WEBHOOK_VERIFY_TOKEN') ??
      null;
    const metaMode = (
      this.configService.get<string>('META_MODE') ?? 'DEV'
    ).toUpperCase();
    const hasMetaCredentials = Boolean(
      this.configService.get<string>('META_WHATSAPP_ACCESS_TOKEN') &&
      this.configService.get<string>('META_WHATSAPP_PHONE_NUMBER_ID') &&
      this.configService.get<string>('META_WHATSAPP_BUSINESS_ACCOUNT_ID') &&
      this.configService.get<string>('META_APP_SECRET'),
    );

    return {
      environment: {
        nodeEnv: this.configService.get<string>('NODE_ENV') ?? 'development',
        metaMode,
        backendPublicUrl,
        productionCallbackUrl: this.appendPath(backendPublicUrl, webhookPath),
        healthUrl: this.appendPath(backendPublicUrl, '/api/health'),
        docsUrl: this.appendPath(backendPublicUrl, '/docs'),
        webhookPath,
        hasMetaCredentials,
        signatureValidationEnabled: metaMode === 'PRODUCTION',
      },
      local: {
        frontendUrl:
          developmentSettings.localFrontendUrl ?? 'http://localhost:3000',
        backendUrl:
          developmentSettings.localBackendUrl ?? 'http://localhost:4000',
        tunnelUrl: localTunnelUrl,
        callbackUrl: this.appendPath(localTunnelUrl, webhookPath),
        ready: Boolean(localTunnelUrl && verifyToken),
        notes: developmentSettings.notes ?? '',
      },
      webhook: {
        verifyToken,
        callbackPath: webhookPath,
        hasVerifyToken: Boolean(verifyToken),
      },
      checklist: {
        hasMetaCredentials,
        hasInstance: instances.length > 0,
        hasProductionUrl: Boolean(backendPublicUrl),
        hasTunnel: Boolean(localTunnelUrl),
        hasVerifyToken: Boolean(verifyToken),
        canRouteLocal: Boolean(
          instances.length > 0 && localTunnelUrl && verifyToken,
        ),
        canRouteProduction: Boolean(
          instances.length > 0 && backendPublicUrl && verifyToken,
        ),
      },
      commands: {
        startStack: 'docker compose up -d --build',
        seed: 'docker compose exec backend npm run seed',
        startFrontend: 'cd frontend && npm run dev',
        startTunnel: 'cloudflared tunnel --url http://localhost:4000',
      },
      selectedInstanceId,
      instances,
    };
  }

  async updateSettings(
    workspaceId: string,
    payload: DevelopmentSettingsPayload,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        settings: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace nao encontrada.');
    }

    const currentSettings = this.asObject(workspace.settings);
    const currentDevelopment = this.getDevelopmentSettings(workspace.settings);

    const nextDevelopment: WorkspaceDevelopmentSettings = {
      ...currentDevelopment,
    };

    if (payload.localFrontendUrl !== undefined) {
      nextDevelopment.localFrontendUrl = this.normalizeOptionalUrl(
        payload.localFrontendUrl,
      );
    }

    if (payload.localBackendUrl !== undefined) {
      nextDevelopment.localBackendUrl = this.normalizeOptionalUrl(
        payload.localBackendUrl,
      );
    }

    if (payload.localTunnelUrl !== undefined) {
      nextDevelopment.localTunnelUrl = this.normalizeOptionalUrl(
        payload.localTunnelUrl,
      );
    }

    if (payload.preferredInstanceId !== undefined) {
      nextDevelopment.preferredInstanceId = this.normalizeOptionalString(
        payload.preferredInstanceId,
      );
    }

    if (payload.notes !== undefined) {
      nextDevelopment.notes = this.normalizeOptionalString(payload.notes);
    }

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        settings: {
          ...currentSettings,
          development: nextDevelopment,
        } as Prisma.InputJsonValue,
      },
    });

    return this.getOverview(workspaceId);
  }

  private getDevelopmentSettings(settings: Prisma.JsonValue | null) {
    const settingsObject = this.asObject(settings);
    const developmentSettings = this.asObject(settingsObject.development);

    return {
      localFrontendUrl: this.readString(developmentSettings.localFrontendUrl),
      localBackendUrl: this.readString(developmentSettings.localBackendUrl),
      localTunnelUrl: this.readString(developmentSettings.localTunnelUrl),
      preferredInstanceId: this.readString(
        developmentSettings.preferredInstanceId,
      ),
      notes: this.readString(developmentSettings.notes),
    } satisfies WorkspaceDevelopmentSettings;
  }

  private asObject(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, Prisma.JsonValue>;
  }

  private readString(value: Prisma.JsonValue | undefined) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private normalizeOptionalUrl(value?: string | null) {
    const normalized = this.normalizeUrl(value);
    return normalized || null;
  }

  private normalizeOptionalString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeUrl(value?: string | null) {
    const normalized = value?.trim();

    if (!normalized) {
      return null;
    }

    return normalized.replace(/\/+$/, '');
  }

  private appendPath(baseUrl: string | null, path: string) {
    if (!baseUrl) {
      return null;
    }

    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
