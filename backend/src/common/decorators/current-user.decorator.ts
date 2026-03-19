import {
  UnauthorizedException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

export interface CurrentAuthUser {
  sub: string;
  globalUserId?: string;
  email: string;
  name: string;
  workspaceId: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT' | 'SELLER';
  companyId?: string;
  membershipId?: string;
  platformRole?: 'SUPER_ADMIN' | 'SUPPORT';
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: CurrentAuthUser }>();

    if (!request.user) {
      throw new UnauthorizedException(
        'Usuario autenticado nao disponivel na requisicao.',
      );
    }

    return request.user;
  },
);
