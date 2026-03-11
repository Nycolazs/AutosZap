import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

@Injectable()
export class CryptoService {
  constructor(private readonly configService: ConfigService) {}

  private getKey() {
    const raw =
      this.configService.get<string>('APP_ENCRYPTION_KEY') ??
      'autoszap-local-encryption-key';
    return createHash('sha256').update(raw).digest();
  }

  encrypt(value?: string | null) {
    if (!value) {
      return null;
    }

    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.getKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(value?: string | null) {
    if (!value) {
      return null;
    }

    const [ivHex, encryptedHex] = value.split(':');

    if (!ivHex || !encryptedHex) {
      return value;
    }

    try {
      const decipher = createDecipheriv(
        'aes-256-cbc',
        this.getKey(),
        Buffer.from(ivHex, 'hex'),
      );
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, 'hex')),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      return value;
    }
  }
}
