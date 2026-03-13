import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { PlatformReleasesQueryDto, RegisterDeviceDto } from './platform.dto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ReleaseArtifact = {
  id: string;
  platform: string;
  label: string;
  version: string;
  buildNumber: string;
  channel: string;
  url: string;
  fileSizeMb?: number | null;
  notes?: string | null;
  minimumOsVersion?: string | null;
  qrCodeUrl?: string | null;
  checksum?: string | null;
  updatedAt: string;
};

type ReleasesManifest = {
  generatedAt: string;
  supportEmail?: string | null;
  documentationUrl?: string | null;
  artifacts: ReleaseArtifact[];
};

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(user: CurrentAuthUser, payload: RegisterDeviceDto) {
    const device = await this.prisma.clientDevice.upsert({
      where: {
        userId_installationId: {
          userId: user.sub,
          installationId: payload.installationId,
        },
      },
      update: {
        workspaceId: user.workspaceId,
        platform: payload.platform,
        provider: payload.provider,
        pushToken: payload.pushToken?.trim() || null,
        deviceName: payload.deviceName?.trim() || null,
        osVersion: payload.osVersion?.trim() || null,
        appVersion: payload.appVersion?.trim() || null,
        buildNumber: payload.buildNumber?.trim() || null,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
      create: {
        workspaceId: user.workspaceId,
        userId: user.sub,
        installationId: payload.installationId,
        platform: payload.platform,
        provider: payload.provider,
        pushToken: payload.pushToken?.trim() || null,
        deviceName: payload.deviceName?.trim() || null,
        osVersion: payload.osVersion?.trim() || null,
        appVersion: payload.appVersion?.trim() || null,
        buildNumber: payload.buildNumber?.trim() || null,
        lastSeenAt: new Date(),
      },
    });

    return device;
  }

  async unregisterDevice(user: CurrentAuthUser, installationId: string) {
    await this.prisma.clientDevice.updateMany({
      where: {
        workspaceId: user.workspaceId,
        userId: user.sub,
        installationId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      success: true,
    };
  }

  listReleases(query: PlatformReleasesQueryDto) {
    const manifest = this.readManifest();
    const normalizedPlatform = query.platform?.trim().toLowerCase();
    const normalizedChannel = query.channel?.trim().toLowerCase();
    const filteredArtifacts = manifest.artifacts.filter((artifact) => {
      if (
        normalizedPlatform &&
        artifact.platform.trim().toLowerCase() !== normalizedPlatform
      ) {
        return false;
      }

      if (
        normalizedChannel &&
        artifact.channel.trim().toLowerCase() !== normalizedChannel
      ) {
        return false;
      }

      return true;
    });

    const recommended =
      filteredArtifacts
        .slice()
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        )[0] ?? null;

    return {
      ...manifest,
      artifacts: filteredArtifacts,
      recommended,
    };
  }

  private readManifest(): ReleasesManifest {
    const explicitPath = process.env.PLATFORM_RELEASES_MANIFEST_PATH;
    const candidatePaths = [
      explicitPath,
      resolve(process.cwd(), '../deploy/platform-releases.json'),
      resolve(process.cwd(), 'deploy/platform-releases.json'),
    ].filter((value): value is string => Boolean(value));

    const manifestPath = candidatePaths.find((candidate) =>
      existsSync(candidate),
    );

    if (!manifestPath) {
      this.logger.warn(
        'Manifesto de releases nao encontrado. Retornando lista vazia.',
      );
      return {
        generatedAt: new Date().toISOString(),
        artifacts: [],
      };
    }

    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as ReleasesManifest;

      return {
        generatedAt: parsed.generatedAt ?? new Date().toISOString(),
        supportEmail: parsed.supportEmail ?? null,
        documentationUrl: parsed.documentationUrl ?? null,
        artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      };
    } catch (error) {
      this.logger.error(
        `Nao foi possivel ler o manifesto de releases em ${manifestPath}.`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        generatedAt: new Date().toISOString(),
        artifacts: [],
      };
    }
  }
}
