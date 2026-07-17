import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes an audit log record asynchronously.
   * Prevents any failures from disrupting the client response.
   */
  async logAction(data: {
    companyId?: string;
    actorId?: string;
    action: string;
    entity: string;
    entityId?: string;
    before?: any;
    after?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          companyId: data.companyId || null,
          actorId: data.actorId || null,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId || null,
          before: data.before || null,
          after: data.after || null,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
        },
      });
    } catch (error) {
      // Fail silently to satisfy non-blocking requirement
      console.error('[AuditService] Failed to persist audit log:', error);
    }
  }

  /**
   * Fetch audit logs for the given companyId (tenant-scoped).
   */
  async findAll(
    companyId: string,
    query: { limit?: number; offset?: number; entity?: string; actorId?: string },
  ) {
    return this.prisma.auditLog.findMany({
      where: {
        companyId,
        ...(query.entity ? { entity: query.entity } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
      },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: Number(query.limit || 50),
      skip: Number(query.offset || 0),
    });
  }
}
