import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

@Injectable()
export class WhatsAppMediaStorageService {
  private readonly storageRoot = resolve(process.cwd(), 'storage', 'whatsapp');

  async save(payload: {
    workspaceId: string;
    instanceId: string;
    conversationId: string;
    direction: 'inbound' | 'outbound';
    buffer: Buffer;
    fileName?: string | null;
    mimeType?: string | null;
  }) {
    const safeFileName = this.sanitizeFileName(payload.fileName);
    const extension =
      extname(safeFileName) || this.extensionFromMimeType(payload.mimeType);
    const relativeDir = this.buildConversationDirectory(payload);
    const relativePath = join(
      relativeDir,
      `${Date.now()}-${randomUUID()}${extension}`,
    );
    const absolutePath = resolve(this.storageRoot, relativePath);

    await mkdir(resolve(this.storageRoot, relativeDir), {
      recursive: true,
    });
    await writeFile(absolutePath, payload.buffer);

    return {
      storagePath: relativePath,
      fileName: safeFileName,
      mimeType: payload.mimeType ?? 'application/octet-stream',
      size: payload.buffer.length,
    };
  }

  async read(storagePath: string) {
    return readFile(resolve(this.storageRoot, storagePath));
  }

  async delete(storagePath?: string | null) {
    if (!storagePath) {
      return;
    }

    await rm(resolve(this.storageRoot, storagePath), {
      force: true,
    });
  }

  async deleteInstanceDirectory(workspaceId: string, instanceId: string) {
    await rm(this.resolveInstanceDirectory(workspaceId, instanceId), {
      recursive: true,
      force: true,
    });
  }

  private buildConversationDirectory(payload: {
    workspaceId: string;
    instanceId: string;
    conversationId: string;
    direction: 'inbound' | 'outbound';
  }) {
    return join(
      payload.workspaceId,
      payload.instanceId,
      payload.conversationId,
      payload.direction,
    );
  }

  private resolveInstanceDirectory(workspaceId: string, instanceId: string) {
    return resolve(this.storageRoot, join(workspaceId, instanceId));
  }

  private sanitizeFileName(value?: string | null) {
    const normalized = basename(value?.trim() || 'arquivo');
    const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '_');
    return safe || 'arquivo';
  }

  private extensionFromMimeType(mimeType?: string | null) {
    if (!mimeType) {
      return '';
    }

    const normalizedMimeType = mimeType.split(';', 1)[0]?.trim().toLowerCase();

    if (!normalizedMimeType) {
      return '';
    }

    if (normalizedMimeType === 'image/jpeg') return '.jpg';
    if (normalizedMimeType === 'image/png') return '.png';
    if (normalizedMimeType === 'image/webp') return '.webp';
    if (normalizedMimeType === 'audio/ogg') return '.ogg';
    if (normalizedMimeType === 'audio/mpeg') return '.mp3';
    if (normalizedMimeType === 'audio/mp4') return '.m4a';
    if (normalizedMimeType === 'audio/webm') return '.webm';
    if (normalizedMimeType === 'audio/wav') return '.wav';
    if (normalizedMimeType === 'video/mp4') return '.mp4';
    if (normalizedMimeType === 'video/webm') return '.webm';
    if (normalizedMimeType === 'application/pdf') return '.pdf';

    return '';
  }
}
