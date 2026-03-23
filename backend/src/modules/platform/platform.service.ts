import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import {
  CreateLeadInterestDto,
  PlatformReleasesQueryDto,
  RegisterDeviceDto,
} from './platform.dto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_GITHUB_RELEASES_REPO = 'Nycolazs/AutosZap';
const DEFAULT_WINDOWS_INSTALLER_ASSET_NAME = 'autoszap-setup-latest.exe';

type GitHubReleaseAsset = {
  id: number;
  name: string;
};

type GitHubLatestReleaseResponse = {
  assets?: GitHubReleaseAsset[];
};

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlanePrisma: ControlPlanePrismaService,
  ) {}

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

  async resolveWindowsInstallerDownloadUrl() {
    const token = process.env.GITHUB_RELEASES_TOKEN?.trim();

    if (!token) {
      this.logger.warn(
        'GITHUB_RELEASES_TOKEN nao definido; download do desktop indisponivel.',
      );
      throw new ServiceUnavailableException(
        'Download indisponivel no momento.',
      );
    }

    const repo = (
      process.env.GITHUB_RELEASES_REPO ?? DEFAULT_GITHUB_RELEASES_REPO
    ).trim();
    const assetName = (
      process.env.GITHUB_WINDOWS_ASSET_NAME ??
      DEFAULT_WINDOWS_INSTALLER_ASSET_NAME
    ).trim();

    const latestRelease =
      await this.fetchGitHubJson<GitHubLatestReleaseResponse>(
        `https://api.github.com/repos/${repo}/releases/latest`,
        token,
      );

    const assets = Array.isArray(latestRelease.assets)
      ? latestRelease.assets
      : [];
    const asset = assets.find((candidate) => candidate.name === assetName);

    if (!asset) {
      throw new NotFoundException(
        'Arquivo de download do Windows nao encontrado.',
      );
    }

    let assetResponse: Response;

    try {
      assetResponse = await fetch(
        `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`,
        {
          redirect: 'manual',
          headers: {
            Accept: 'application/octet-stream',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'autoszap-backend',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    } catch (error) {
      this.logger.error(
        'Falha ao consultar redirect do asset no GitHub.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Nao foi possivel gerar link de download.',
      );
    }

    const location = assetResponse.headers.get('location');

    if (!location) {
      this.logger.error(
        `Nao foi possivel resolver redirect do asset do GitHub (status ${assetResponse.status}).`,
      );
      throw new ServiceUnavailableException(
        'Nao foi possivel gerar link de download.',
      );
    }

    return location;
  }

  async createLeadInterest(
    payload: CreateLeadInterestDto,
    requestMeta?: {
      userAgent?: string;
      ipAddress?: string;
    },
  ) {
    const leadInterest = await this.controlPlanePrisma.leadInterest.create({
      data: {
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        phone: payload.phone?.trim() || null,
        companyName: payload.companyName?.trim() || null,
        attendantsCount: payload.attendantsCount ?? null,
        notes: payload.notes?.trim() || null,
        source: payload.source?.trim() || 'landing-home',
      },
    });

    this.logger.log(
      `Novo interessado capturado (${leadInterest.email}) via ${leadInterest.source ?? 'landing-home'} from ${requestMeta?.ipAddress ?? 'unknown-ip'}.`,
    );

    return {
      success: true,
      leadInterestId: leadInterest.id,
      message:
        'Recebemos seu interesse. Nosso time comercial vai entrar em contato em breve.',
    };
  }

  private async fetchGitHubJson<T>(url: string, token: string): Promise<T> {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'autoszap-backend',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch (error) {
      this.logger.error(
        `Falha ao chamar GitHub API (${url}).`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Nao foi possivel consultar o GitHub agora.',
      );
    }

    if (!response.ok) {
      this.logger.error(`GitHub API error (${response.status}) em ${url}.`);
      throw new ServiceUnavailableException(
        'Nao foi possivel consultar o GitHub agora.',
      );
    }

    return (await response.json()) as T;
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

  async createSupportTicket(
    user: CurrentAuthUser,
    payload: {
      title: string;
      body: string;
      category: 'IMPROVEMENT' | 'BUG' | 'QUESTION';
    },
  ) {
    const company = await this.controlPlanePrisma.company.findFirst({
      where: { workspaceId: user.workspaceId },
      select: { id: true, name: true },
    });

    const globalUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { globalUserId: true, name: true, email: true },
    });

    if (!company || !globalUser?.globalUserId) {
      throw new NotFoundException('Empresa ou usuario nao encontrado.');
    }

    return this.controlPlanePrisma.supportTicket.create({
      data: {
        companyId: company.id,
        globalUserId: globalUser.globalUserId,
        title: payload.title.trim(),
        body: payload.body.trim(),
        category: payload.category,
        companyName: company.name,
        authorName: globalUser.name,
        authorEmail: globalUser.email,
      },
    });
  }

  async listMyTickets(user: CurrentAuthUser) {
    const globalUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { globalUserId: true },
    });

    if (!globalUser?.globalUserId) return [];

    return this.controlPlanePrisma.supportTicket.findMany({
      where: { globalUserId: globalUser.globalUserId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
