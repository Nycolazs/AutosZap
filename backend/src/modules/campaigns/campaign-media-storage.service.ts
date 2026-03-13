import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

type SavedCampaignMedia = {
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

@Injectable()
export class CampaignMediaStorageService {
  private readonly rootDirectory = path.join(
    process.cwd(),
    'storage',
    'campaign-media',
  );

  async save(
    workspaceId: string,
    campaignId: string,
    file: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      size: number;
    },
  ): Promise<SavedCampaignMedia> {
    const safeName = this.sanitizeFileName(file.fileName);
    const extension =
      path.extname(safeName) || this.inferExtension(file.mimeType);
    const directory = path.join(this.rootDirectory, workspaceId, campaignId);
    const filePath = path.join(directory, `media${extension}`);

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, file.buffer);

    return {
      storagePath: path.relative(this.rootDirectory, filePath),
      fileName: safeName,
      mimeType: file.mimeType,
      size: file.size,
    };
  }

  async read(storagePath: string) {
    const absolutePath = path.join(this.rootDirectory, storagePath);
    return fs.readFile(absolutePath);
  }

  async delete(storagePath?: string | null) {
    if (!storagePath) {
      return;
    }

    const absolutePath = path.join(this.rootDirectory, storagePath);

    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private sanitizeFileName(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  }

  private inferExtension(mimeType: string) {
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    return '.jpg';
  }
}
