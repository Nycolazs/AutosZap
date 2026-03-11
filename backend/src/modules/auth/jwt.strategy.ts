import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CurrentAuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') ??
        'autoszap-access-secret',
    });
  }

  async validate(payload: CurrentAuthUser) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        workspaceId: payload.workspaceId,
        deletedAt: null,
        workspace: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        workspaceId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Sessao invalida ou expirada.');
    }

    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceId: user.workspaceId,
    } satisfies CurrentAuthUser;
  }
}
