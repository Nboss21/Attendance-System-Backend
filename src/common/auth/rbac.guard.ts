import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PERMISSIONS_KEY, ROLES_KEY } from './auth.decorators';
import { ROLE_PERMISSIONS } from './auth.types';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) { const roles = this.reflector.getAllAndOverride<any[]>(ROLES_KEY, [context.getHandler(), context.getClass()]); const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]); if (!roles && !permissions) return true; const user = context.switchToHttp().getRequest().user; if (!user) return false; if (roles && !roles.includes(user.role)) throw new ForbiddenException('Role is not permitted'); const granted = ROLE_PERMISSIONS[user.role as UserRole] || []; if (permissions && !permissions.every(p => granted.includes('*') || granted.includes(p))) throw new ForbiddenException('Permission is not granted'); return true; }
}
