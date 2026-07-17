import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_OPTIONS_KEY, AuditOptions } from '../decorators/audit.decorator';
import { AuditService } from '../../modules/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Global interceptor that records mutating actions asynchronously.
 * For PATCH/PUT/DELETE, it fetches the existing record (before state) dynamically.
 * After success, it logs actor, action, entity details, and before/after states.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const handler = context.getHandler();
    const targetClass = context.getClass();

    // Check for audit metadata
    const options = this.reflector.getAllAndOverride<AuditOptions>(AUDIT_OPTIONS_KEY, [
      handler,
      targetClass,
    ]);

    if (!options) {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest();
    const method = request.method;
    const ipAddress = request.ip || request.headers['x-forwarded-for'];
    const userAgent = request.headers['user-agent'];

    // Resolve action (default to HTTP method mapping)
    const action =
      options.action ||
      (method === 'POST' ? 'CREATE' : method === 'DELETE' ? 'DELETE' : 'UPDATE');

    const entity = options.entity;
    const entityId = request.params?.id;

    let before: any = null;

    // Fetch before state for mutating updates or deletions
    if (entityId && (method === 'PATCH' || method === 'PUT' || method === 'DELETE')) {
      try {
        const delegateName = entity.charAt(0).toLowerCase() + entity.slice(1);
        if (delegateName in this.prisma) {
          before = await (this.prisma as any)[delegateName].findUnique({
            where: { id: entityId },
          });
        }
      } catch (err) {
        console.warn(`[AuditLogInterceptor] Could not fetch "before" state:`, err);
      }
    }

    return next.handle().pipe(
      tap((responseBody) => {
        // Extract actor and tenant context
        const companyId = request.tenant?.companyId || request.user?.companyId || before?.companyId;
        const actorId = request.user?.id;

        // If POST/CREATE, request param id is empty but response body contains the new id
        const finalEntityId = entityId || responseBody?.id;

        let after = responseBody;
        if (method === 'DELETE') {
          after = null;
        }

        // Trigger log write asynchronously without awaiting
        this.auditService
          .logAction({
            companyId,
            actorId,
            action,
            entity,
            entityId: finalEntityId,
            before,
            after,
            ipAddress,
            userAgent,
          })
          .catch((err) => {
            console.error('[AuditLogInterceptor] Error executing async logAction:', err);
          });
      }),
    );
  }
}
