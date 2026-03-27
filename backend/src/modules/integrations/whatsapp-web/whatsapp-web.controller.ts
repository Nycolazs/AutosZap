import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import type { WhatsAppWebGatewayEventEnvelope } from './whatsapp-web.types';
import { WhatsAppWebService } from './whatsapp-web.service';

@Controller()
export class WhatsAppWebController {
  constructor(private readonly whatsappWebService: WhatsAppWebService) {}

  @Public()
  @Post('internal/whatsapp-web/events')
  handleInternalEvent(
    @Body() payload: WhatsAppWebGatewayEventEnvelope,
    @Headers('x-autoszap-instance-id') instanceId: string | undefined,
    @Headers('x-autoszap-event-signature') signature: string | undefined,
    @Headers('x-autoszap-event-timestamp') timestamp: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
  ) {
    const rawBody =
      request.rawBody ?? Buffer.from(JSON.stringify(payload), 'utf8');

    return this.whatsappWebService.handleGatewayEvent(payload, {
      instanceId,
      signature,
      timestamp,
      rawBody,
    });
  }
}
