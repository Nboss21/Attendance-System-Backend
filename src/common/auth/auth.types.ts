import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  companyId?: string;
  role: UserRole;
  jti: string;
}

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SUPER_ADMIN: ['*'],
  COMPANY_ADMIN: [
    'company:manage',
    'employees:manage',
    'departments:manage',
    'positions:manage',
    'devices:manage',
    'devices:read',
    'audit:read',
  ],
  HR_MANAGER: [
    'employees:manage',
    'departments:manage',
    'positions:manage',
    'devices:read',
    'audit:read',
  ],
  BRANCH_MANAGER: ['employees:read', 'devices:read'],
  EMPLOYEE: ['profile:read'],
  DEVICE: ['device:connect', 'device:heartbeat'],
};
