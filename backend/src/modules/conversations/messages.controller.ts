import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PermissionKey } from '@prisma/client';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
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

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

class SendMessageDto {
  @IsString()
  conversationId!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  quotedMessageId?: string;
}

class SendInternalMessageDto {
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

  @IsOptional()
  @IsString()
  quotedMessageId?: string;
}

function parseByteRangeHeader(
  rangeHeader: string | undefined,
  totalLength: number,
) {
  if (!rangeHeader?.startsWith('bytes=') || totalLength <= 0) {
    return null;
  }

  const [rawRange] = rangeHeader.replace(/^bytes=/, '').split(',');

  if (!rawRange) {
    return null;
  }

  const [rawStart, rawEnd] = rawRange.split('-');
  const start = rawStart ? Number.parseInt(rawStart, 10) : Number.NaN;
  const end = rawEnd ? Number.parseInt(rawEnd, 10) : Number.NaN;

  if (Number.isNaN(start)) {
    if (Number.isNaN(end) || end <= 0) {
      return null;
    }

    const suffixLength = Math.min(end, totalLength);

    return {
      start: totalLength - suffixLength,
      end: totalLength - 1,
    };
  }

  if (start < 0 || start >= totalLength) {
    return null;
  }

  const boundedStart = Math.max(0, Math.min(start, totalLength - 1));
  const boundedEnd = Number.isNaN(end)
    ? totalLength - 1
    : Math.max(boundedStart, Math.min(end, totalLength - 1));

  return {
    start: boundedStart,
    end: boundedEnd,
  };
}

@Controller('messages')
@Permissions(PermissionKey.INBOX_VIEW)
export class MessagesController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser, @Query() query: MessagesQueryDto) {
    return this.conversationsService.listMessages(query.conversationId, user, {
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Post()
  send(@CurrentUser() user: CurrentAuthUser, @Body() dto: SendMessageDto) {
    return this.conversationsService.sendMessage(
      dto.conversationId,
      user,
      dto.content,
      dto.quotedMessageId,
    );
  }

  @Post('internal')
  sendInternal(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: SendInternalMessageDto,
  ) {
    return this.conversationsService.sendInternalMessage(
      dto.conversationId,
      user,
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
      user,
      {
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        caption: dto.caption,
        voice: dto.isVoiceNote === 'true',
        quotedMessageId: dto.quotedMessageId,
      },
    );
  }

  @Get(':id/media')
  async getMedia(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const media = await this.conversationsService.getMessageMedia(id, user);
    const totalLength = media.buffer.length;
    const byteRange = parseByteRangeHeader(request.headers.range, totalLength);
    const buffer =
      byteRange === null
        ? media.buffer
        : media.buffer.subarray(byteRange.start, byteRange.end + 1);

    response.setHeader(
      'Content-Type',
      media.mimeType ?? 'application/octet-stream',
    );
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader('Accept-Ranges', 'bytes');

    if (byteRange) {
      response.status(206);
      response.setHeader(
        'Content-Range',
        `bytes ${byteRange.start}-${byteRange.end}/${totalLength}`,
      );
      response.setHeader('Content-Length', String(buffer.length));
    } else if (totalLength || media.contentLength) {
      response.setHeader(
        'Content-Length',
        String(media.contentLength ?? totalLength),
      );
    }

    if (media.fileName) {
      response.setHeader(
        'Content-Disposition',
        `inline; filename="${media.fileName.replace(/"/g, '')}"`,
      );
    }

    return new StreamableFile(buffer);
  }
}
