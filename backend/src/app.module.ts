import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { CryptoModule } from './common/crypto/crypto.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantContextGuard } from './common/guards/tenant-context.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { RealtimeModule } from './common/realtime/realtime.module';
import { RedisModule } from './common/redis/redis.module';
import { TenantContextMiddleware } from './common/tenancy/tenant-context.middleware';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { AuthModule } from './modules/auth/auth.module';
import { AssistantsModule } from './modules/assistants/assistants.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { ConversationWorkflowModule } from './modules/conversations/conversation-workflow.module';
import { CrmModule } from './modules/crm/crm.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DevelopmentModule } from './modules/development/development.module';
import { GroupsModule } from './modules/groups/groups.module';
import { MetaWhatsAppModule } from './modules/integrations/meta-whatsapp/meta-whatsapp.module';
import { InstancesModule } from './modules/instances/instances.module';
import { ListsModule } from './modules/lists/lists.module';
import { ControlPlaneModule } from './modules/control-plane/control-plane.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { TagsModule } from './modules/tags/tags.module';
import { TeamModule } from './modules/team/team.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspaceSettingsModule } from './modules/workspace-settings/workspace-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    TenancyModule,
    ControlPlaneModule,
    RedisModule,
    CryptoModule,
    RealtimeModule,
    AccessControlModule,
    AuthModule,
    UsersModule,
    WorkspaceSettingsModule,
    TeamModule,
    ContactsModule,
    TagsModule,
    ListsModule,
    GroupsModule,
    MetaWhatsAppModule,
    PlatformModule,
    PlatformAdminModule,
    DevelopmentModule,
    InstancesModule,
    ConversationWorkflowModule,
    ConversationsModule,
    CrmModule,
    CampaignsModule,
    AssistantsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantContextGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
