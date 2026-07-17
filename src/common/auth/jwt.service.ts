import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AuthenticatedUser } from './auth.types';

const b64 = (input: string | Buffer) => Buffer.from(input).toString('base64url');
const unb64 = (input: string) => Buffer.from(input, 'base64url').toString('utf8');

@Injectable()
export class JwtService {
  private readonly secret = process.env.JWT_SECRET || 'development-only-change-me';
  sign(payload: Omit<AuthenticatedUser, 'jti'>, expiresInSeconds: number) { const now = Math.floor(Date.now() / 1000); const body = { ...payload, jti: randomUUID(), iat: now, exp: now + expiresInSeconds }; const base = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify(body))}`; return `${base}.${createHmac('sha256', this.secret).update(base).digest('base64url')}`; }
  verify(token: string): AuthenticatedUser & { exp: number } { try { const [header, payload, signature] = token.split('.'); if (!header || !payload || !signature) throw new Error(); const expected = createHmac('sha256', this.secret).update(`${header}.${payload}`).digest(); if (!timingSafeEqual(expected, Buffer.from(signature, 'base64url'))) throw new Error(); const data = JSON.parse(unb64(payload)); if (!data.id || !data.email || !data.role || !data.jti || data.exp <= Math.floor(Date.now() / 1000)) throw new Error(); return data; } catch { throw new UnauthorizedException('Invalid or expired access token'); } }
}
