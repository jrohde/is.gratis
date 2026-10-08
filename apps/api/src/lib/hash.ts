import { createHash, randomBytes } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Salted hash of an IP address. Enough to rate limit, useless to identify someone. */
export function hashIp(ip: string, salt: string): string {
  return sha256(`${salt}:${ip}`);
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}
