import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../common/auth/password.service';
import { JwtService } from '../../common/auth/jwt.service';
import { TokenBlacklistService } from '../../common/auth/token-blacklist.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService, private readonly jwt: JwtService, private readonly blacklist: TokenBlacklistService) {}
  private hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private async issue(user: any) { const claims = { id: user.id, email: user.email, companyId: user.companyId || undefined, role: user.role }; const accessToken = this.jwt.sign(claims, Number(process.env.JWT_ACCESS_TTL_SECONDS || 900)); const refreshToken = randomBytes(48).toString('base64url'); const refreshTtl = Number(process.env.JWT_REFRESH_TTL_SECONDS || 2592000); await this.prisma.refreshToken.create({ data: { userId: user.id, tokenHash: this.hash(refreshToken), expiresAt: new Date(Date.now() + refreshTtl * 1000) } }); return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: Number(process.env.JWT_ACCESS_TTL_SECONDS || 900), user: { id: user.id, email: user.email, companyId: user.companyId, role: user.role } }; }
  async login(email: string, password: string) { const user = await this.prisma.user.findUnique({ where: { email } }); if (!user || user.status !== 'ACTIVE' || !(await this.passwords.verify(password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password'); return this.issue(user); }
  async refresh(rawToken: string) { const token = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(rawToken) }, include: { user: true } }); if (!token || token.revokedAt || token.expiresAt <= new Date() || token.user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid refresh token'); await this.prisma.$transaction([this.prisma.refreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } })]); return this.issue(token.user); }
  async logout(accessToken: string, refreshToken?: string) { const payload = this.jwt.verify(accessToken); await this.blacklist.blacklist(payload.jti, payload.exp); if (refreshToken) await this.prisma.refreshToken.updateMany({ where: { tokenHash: this.hash(refreshToken), userId: payload.id, revokedAt: null }, data: { revokedAt: new Date() } }); return { success: true }; }
}
