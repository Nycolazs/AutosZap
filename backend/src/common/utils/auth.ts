import { createHash, randomBytes } from 'crypto';

export function generateSecureToken(size = 24) {
  return randomBytes(size).toString('hex');
}

export function hashOpaqueToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function parseDurationToMs(value: string) {
  const match = value.match(/^(\d+)([smhd])$/);

  if (!match) {
    return 1000 * 60 * 60 * 24 * 7;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 1000 * 60;
  if (unit === 'h') return amount * 1000 * 60 * 60;
  return amount * 1000 * 60 * 60 * 24;
}
