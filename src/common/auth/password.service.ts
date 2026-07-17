import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

@Injectable()
export class PasswordService {
  async hash(value: string) { const salt = randomBytes(16).toString('hex'); const derived = await scrypt(value, salt, 64) as Buffer; return `scrypt$${salt}$${derived.toString('hex')}`; }
  async verify(value: string, encoded: string) { const [, salt, expected] = encoded.split('$'); if (!salt || !expected) return false; const derived = await scrypt(value, salt, 64) as Buffer; return timingSafeEqual(derived, Buffer.from(expected, 'hex')); }
}
