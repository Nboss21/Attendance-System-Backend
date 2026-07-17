import { AuditService } from './audit.service';

const COMPANY_ID = 'comp-uuid-001';

function makePrisma() {
  return {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

describe('AuditService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AuditService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AuditService(prisma as any);
    jest.clearAllMocks();
  });

  describe('logAction', () => {
    it('successfully calls prisma.auditLog.create and fails silently on errors', async () => {
      prisma.auditLog.create.mockResolvedValue({ id: 'log-001' });

      const result = await service.logAction({
        companyId: COMPANY_ID,
        actorId: 'user-001',
        action: 'UPDATE',
        entity: 'Employee',
        entityId: 'emp-001',
        before: { name: 'Alice' },
        after: { name: 'Bob' },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(result).toEqual({ id: 'log-001' });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_ID,
          actorId: 'user-001',
          action: 'UPDATE',
          entity: 'Employee',
          entityId: 'emp-001',
          before: { name: 'Alice' },
          after: { name: 'Bob' },
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        },
      });
    });

    it('catches database exceptions and logs to console instead of throwing', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      prisma.auditLog.create.mockRejectedValue(new Error('DB Connection Failed'));

      await expect(
        service.logAction({
          action: 'CREATE',
          entity: 'Device',
        }),
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('findAll', () => {
    it('returns tenant-isolated audit logs ordered by timestamp desc', async () => {
      const mockLogs = [{ id: 'log-1', companyId: COMPANY_ID }];
      prisma.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.findAll(COMPANY_ID, { limit: 10, offset: 0 });

      expect(result).toEqual(mockLogs);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          companyId: COMPANY_ID,
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
        take: 10,
        skip: 0,
      });
    });

    it('applies entity and actorId filters when specified', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.findAll(COMPANY_ID, { entity: 'Employee', actorId: 'user-77' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: COMPANY_ID,
            entity: 'Employee',
            actorId: 'user-77',
          },
        }),
      );
    });
  });
});
