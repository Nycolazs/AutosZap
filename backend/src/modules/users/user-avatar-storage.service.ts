import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

type SavedUserAvatar = {
  storagePath: string;
  mimeType: string;
  size: number;
};

@Injectable()
export class UserAvatarStorageService {
  private readonly rootDirectory = path.join(
    process.cwd(),
    'storage',
    'user-avatars',
  );

  async save(
    globalUserId: string,
    file: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      size: number;
    },
  ): Promise<SavedUserAvatar> {
    const directory = path.join(this.rootDirectory, globalUserId);
    const extension =
      path.extname(this.sanitizeFileName(file.fileName)) ||
      this.inferExtension(file.mimeType);
    const filePath = path.join(directory, `avatar${extension}`);

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, file.buffer);

    return {
      storagePath: path.relative(this.rootDirectory, filePath),
      mimeType: file.mimeType,
      size: file.size,
    };
  }

  async read(storagePath: string) {
    return fs.readFile(path.join(this.rootDirectory, storagePath));
  }

  async delete(storagePath?: string | null) {
    if (!storagePath) {
      return;
    }

    try {
      await fs.unlink(path.join(this.rootDirectory, storagePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  getMimeType(storagePath: string) {
    const extension = path.extname(storagePath).toLowerCase();

    if (extension === '.png') {
      return 'image/png';
    }

    if (extension === '.webp') {
      return 'image/webp';
    }

    return 'image/jpeg';
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
