import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';

type UploadedMediaFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

class MessagesQueryDto {
  @IsString()
  conversationId!: string;
}

class SendMessageDto {
  @IsString()
  conversationId!: string;

  @IsString()
  content!: string;
}

class SendMediaDto {
  @IsString()
  conversationId!: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsString()
  isVoiceNote?: string;
}

@Controller('messages')
export class MessagesController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser, @Query() query: MessagesQueryDto) {
    return this.conversationsService.listMessages(
      query.conversationId,
      user.workspaceId,
    );
  }

  @Post()
  send(@CurrentUser() user: CurrentAuthUser, @Body() dto: SendMessageDto) {
    return this.conversationsService.sendMessage(
      dto.conversationId,
      user.workspaceId,
      user.sub,
      dto.content,
    );
  }

  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 25 * 1024 * 1024,
      },
    }),
  )
  sendMedia(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: SendMediaDto,
    @UploadedFile() file: UploadedMediaFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Selecione um arquivo para envio.');
    }

    return this.conversationsService.sendMediaMessage(
      dto.conversationId,
      user.workspaceId,
      user.sub,
      {
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        caption: dto.caption,
        voice: dto.isVoiceNote === 'true',
      },
    );
  }

  @Get(':id/media')
  async getMedia(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const media = await this.conversationsService.getMessageMedia(
      id,
      user.workspaceId,
    );

    response.setHeader(
      'Content-Type',
      media.mimeType ?? 'application/octet-stream',
    );
    response.setHeader('Cache-Control', 'private, max-age=300');

    if (media.contentLength) {
      response.setHeader('Content-Length', String(media.contentLength));
    }

    if (media.fileName) {
      response.setHeader(
        'Content-Disposition',
        `inline; filename="${media.fileName.replace(/"/g, '')}"`,
      );
    }

    return new StreamableFile(media.buffer);
  }
}
