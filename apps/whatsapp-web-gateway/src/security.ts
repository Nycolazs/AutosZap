import { createHmac, timingSafeEqual } from 'node:crypto';

export function deriveInstanceSecret(
  sharedSecret: string,
  instanceId: string,
) {
  return createHmac('sha256', sharedSecret).update(instanceId).digest('hex');
}

export function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
