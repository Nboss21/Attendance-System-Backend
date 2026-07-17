import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
