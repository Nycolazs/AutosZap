import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { CryptoModule } from './common/crypto/crypto.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { RealtimeModule } from './common/realtime/realtime.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { AssistantsModule } from './modules/assistants/assistants.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { CrmModule } from './modules/crm/crm.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DevelopmentModule } from './modules/development/development.module';
import { GroupsModule } from './modules/groups/groups.module';
import { MetaWhatsAppModule } from './modules/integrations/meta-whatsapp/meta-whatsapp.module';
import { InstancesModule } from './modules/instances/instances.module';
import { ListsModule } from './modules/lists/lists.module';
import { TagsModule } from './modules/tags/tags.module';
import { TeamModule } from './modules/team/team.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    RedisModule,
    CryptoModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    TeamModule,
    ContactsModule,
    TagsModule,
    ListsModule,
    GroupsModule,
    MetaWhatsAppModule,
    DevelopmentModule,
    InstancesModule,
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
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
