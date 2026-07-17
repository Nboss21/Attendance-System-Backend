import { SetMetadata } from '@nestjs/common';

export interface AuditOptions {
  entity: string; // e.g. 'Employee', 'Device', 'Branch', 'Company'
  action?: 'CREATE' | 'UPDATE' | 'DELETE' | string;
}

export const AUDIT_OPTIONS_KEY = 'audit_options';
export const Audited = (options: AuditOptions) => SetMetadata(AUDIT_OPTIONS_KEY, options);
