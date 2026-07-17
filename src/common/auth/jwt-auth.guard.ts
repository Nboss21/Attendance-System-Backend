import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC } from './auth.decorators';
import { JwtService } from './jwt.service';
import { TokenBlacklistService } from './token-blacklist.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService, private readonly blacklist: TokenBlacklistService) {}
  async canActivate(context: ExecutionContext) { if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true; const req = context.switchToHttp().getRequest<Request & { user?: any }>(); const token = req.headers.authorization?.replace(/^Bearer\s+/i, ''); if (!token) throw new UnauthorizedException('Bearer token is required'); const user = this.jwt.verify(token); if (await this.blacklist.isBlacklisted(user.jti)) throw new UnauthorizedException('Token has been revoked'); req.user = user; return true; }
}
