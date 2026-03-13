import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeviceProvider } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PushUsersPayload = {
  workspaceId: string;
  userIds: string[];
  title: string;
  body: string;
  linkHref?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private readonly endpoint = 'https://exp.host/--/api/v2/push/send';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async sendToUsers(payload: PushUsersPayload) {
    const userIds = [...new Set(payload.userIds.filter(Boolean))];

    if (!userIds.length) {
      return { deliveredCount: 0 };
    }

    const devices = await this.prisma.clientDevice.findMany({
      where: {
        workspaceId: payload.workspaceId,
        userId: {
          in: userIds,
        },
        revokedAt: null,
        provider: DeviceProvider.EXPO,
        pushToken: {
          not: null,
        },
      },
      select: {
        pushToken: true,
      },
    });

    const tokens = [
      ...new Set(
        devices
          .map((device) => device.pushToken)
          .filter((token): token is string => this.isExpoPushToken(token)),
      ),
    ];

    if (!tokens.length) {
      return { deliveredCount: 0 };
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.configService.get<string>('EXPO_ACCESS_TOKEN')
          ? {
              Authorization: `Bearer ${this.configService.get<string>('EXPO_ACCESS_TOKEN')}`,
            }
          : {}),
      },
      body: JSON.stringify(
        tokens.map((token) => ({
          to: token,
          title: payload.title,
          body: payload.body,
          sound: 'default',
          priority: 'high',
          data: {
            linkHref: payload.linkHref,
            ...(payload.metadata ?? {}),
          },
        })),
      ),
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.warn(
        `Falha ao enviar push Expo (${response.status}): ${detail}`,
      );
      return { deliveredCount: 0 };
    }

    return {
      deliveredCount: tokens.length,
    };
  }

  private isExpoPushToken(token?: string | null): token is string {
    if (!token) {
      return false;
    }

    return (
      token.startsWith('ExponentPushToken[') ||
      token.startsWith('ExpoPushToken[')
    );
  }
}
