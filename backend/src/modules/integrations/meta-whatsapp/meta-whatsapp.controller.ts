import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { MetaWhatsAppService } from './meta-whatsapp.service';

class TestMetaDto {
  @IsString()
  instanceId!: string;
}

class SendMetaDto {
  @IsString()
  instanceId!: string;

  @IsString()
  to!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  contactName?: string;
}

class SendTemplateMetaDto {
  @IsString()
  instanceId!: string;

  @IsString()
  to!: string;

  @IsString()
  templateName!: string;

  @IsString()
  languageCode!: string;

  @IsOptional()
  headerParameters?: string[];

  @IsOptional()
  bodyParameters?: string[];

  @IsOptional()
  @IsString()
  contactName?: string;
}

@Controller()
export class MetaWhatsAppController {
  constructor(private readonly metaWhatsAppService: MetaWhatsAppService) {}

  @Public()
  @Get('webhooks/meta/whatsapp')
  verifyWebhook(@Query() query: Record<string, string | undefined>) {
    return this.metaWhatsAppService.verifyWebhook({
      'hub.mode': query['hub.mode'],
      'hub.verify_token': query['hub.verify_token'],
      'hub.challenge': query['hub.challenge'],
    });
  }

  @Public()
  @Post('webhooks/meta/whatsapp')
  handleWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
  ) {
    // Fallback for environments where Express does not preserve `rawBody`.
    const rawBody =
      request.rawBody ?? Buffer.from(JSON.stringify(payload), 'utf8');

    return this.metaWhatsAppService.handleWebhook(payload, {
      signature,
      rawBody,
    });
  }

  @Post('integrations/meta/whatsapp/test')
  test(@CurrentUser() user: CurrentAuthUser, @Body() dto: TestMetaDto) {
    return this.metaWhatsAppService.testConnection(
      user.workspaceId,
      dto.instanceId,
    );
  }

  @Post('integrations/meta/whatsapp/send')
  send(@CurrentUser() user: CurrentAuthUser, @Body() dto: SendMetaDto) {
    return this.metaWhatsAppService.sendDirectMessage(user.workspaceId, {
      instanceId: dto.instanceId,
      to: dto.to,
      body: dto.body,
      userId: user.sub,
      contactName: dto.contactName,
    });
  }

  @Post('integrations/meta/whatsapp/send-template')
  sendTemplate(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: SendTemplateMetaDto,
  ) {
    return this.metaWhatsAppService.sendTemplateDirectMessage(
      user.workspaceId,
      {
        instanceId: dto.instanceId,
        to: dto.to,
        templateName: dto.templateName,
        languageCode: dto.languageCode,
        headerParameters: dto.headerParameters,
        bodyParameters: dto.bodyParameters,
        userId: user.sub,
        contactName: dto.contactName,
      },
    );
  }
}
