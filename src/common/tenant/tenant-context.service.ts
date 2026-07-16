import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
@Injectable() export class TenantContextService { private readonly storage = new AsyncLocalStorage<{ companyId?: string }>(); run<T>(companyId: string | undefined, callback: () => T): T { return this.storage.run({ companyId }, callback); } get companyId() { return this.storage.getStore()?.companyId; } companyIdOrThrow() { if (!this.companyId) throw new UnauthorizedException('A tenant companyId is required'); return this.companyId; } }
