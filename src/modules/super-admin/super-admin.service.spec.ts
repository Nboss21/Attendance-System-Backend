import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';

const COMPANY_ID = '123e4567-e89b-12d3-a456-426614174000';
const SUPER_ADMIN = { id: 'super-001', email: 'admin@platform.io' };

function makePrisma() {
  return {
    company: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function makePasswords() {
  return { hash: jest.fn().mockResolvedValue('hashed-password') };
}

function makeJwt() {
  return { sign: jest.fn().mockReturnValue('mock.impersonation.jwt') };
}

function makeAudit() {
  return { logAction: jest.fn().mockResolvedValue(undefined) };
}

function makeCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: COMPANY_ID,
    name: 'Acme Corp',
    code: 'ACME',
    plan: 'starter',
    status: 'ACTIVE',
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SuperAdminService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let passwords: ReturnType<typeof makePasswords>;
  let jwt: ReturnType<typeof makeJwt>;
  let auditService: ReturnType<typeof makeAudit>;
  let service: SuperAdminService;

  beforeEach(() => {
    prisma = makePrisma();
    passwords = makePasswords();
    jwt = makeJwt();
    auditService = makeAudit();
    service = new SuperAdminService(
      prisma as any,
      passwords as any,
      jwt as any,
      auditService as any,
    );
    jest.clearAllMocks();
  });

  // ── provisionCompany ──────────────────────────────────────────────────────

  describe('provisionCompany', () => {
    const dto = {
      name: 'Acme Corp',
      code: 'ACME',
      plan: 'starter',
      adminEmail: 'admin@acme.io',
      adminPassword: 'password123',
    };

    it('creates company and admin user in a transaction and audits the action', async () => {
      prisma.company.findUnique.mockResolvedValue(null); // code not taken
      prisma.user.findUnique.mockResolvedValue(null);    // email not taken
      const created = makeCompany();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
      prisma.company.create.mockResolvedValue(created);
      prisma.user.create.mockResolvedValue({});

      const result = await service.provisionCompany(dto);

      expect(result).toEqual(created);
      expect(passwords.hash).toHaveBeenCalledWith('password123');
      expect(prisma.company.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ code: 'ACME', name: 'Acme Corp' }) }),
      );
      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PROVISION', entity: 'Company' }),
      );
    });

    it('throws BadRequestException if company code already exists', async () => {
      prisma.company.findUnique.mockResolvedValue(makeCompany());

      await expect(service.provisionCompany(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if admin email already exists', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.provisionCompany(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── listCompanies ─────────────────────────────────────────────────────────

  describe('listCompanies', () => {
    it('returns paginated list with total count', async () => {
      const companies = [makeCompany()];
      prisma.company.findMany.mockResolvedValue(companies);
      prisma.company.count.mockResolvedValue(1);

      const result = await service.listCompanies(1, 20);

      expect(result).toEqual({ data: companies, total: 1, page: 1, limit: 20 });
      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });
  });

  // ── getCompany ────────────────────────────────────────────────────────────

  describe('getCompany', () => {
    it('returns a company by ID', async () => {
      const company = makeCompany();
      prisma.company.findUnique.mockResolvedValue(company);

      await expect(service.getCompany(COMPANY_ID)).resolves.toEqual(company);
    });

    it('throws NotFoundException if company is not found', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.getCompany('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── updateCompany ─────────────────────────────────────────────────────────

  describe('updateCompany', () => {
    it('updates company and audits the change', async () => {
      prisma.company.findUnique.mockResolvedValue(makeCompany());
      const updated = makeCompany({ plan: 'enterprise' });
      prisma.company.update.mockResolvedValue(updated);

      const result = await service.updateCompany(COMPANY_ID, { plan: 'enterprise' });

      expect(result.plan).toBe('enterprise');
      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', entity: 'Company', entityId: COMPANY_ID }),
      );
    });
  });

  // ── listDeviceHealth ──────────────────────────────────────────────────────

  describe('listDeviceHealth', () => {
    it('correctly classifies devices as online / offline / maintenance', async () => {
      const now = new Date();
      const recentHeartbeat = new Date(now.getTime() - 2 * 60 * 1000); // 2 min ago (online)
      const oldHeartbeat = new Date(now.getTime() - 10 * 60 * 1000);   // 10 min ago (offline)

      prisma.company.findMany.mockResolvedValue([
        {
          id: COMPANY_ID,
          name: 'Acme',
          code: 'ACME',
          devices: [
            { id: 'd1', status: 'ACTIVE', lastHeartbeatAt: recentHeartbeat },
            { id: 'd2', status: 'ACTIVE', lastHeartbeatAt: oldHeartbeat },
            { id: 'd3', status: 'MAINTENANCE', lastHeartbeatAt: null },
          ],
        },
      ]);

      const result = await service.listDeviceHealth({ heartbeatThresholdMinutes: 5 });

      expect(result[0].devices).toEqual({ total: 3, online: 1, offline: 1, maintenance: 1 });
    });
  });

  // ── impersonate ───────────────────────────────────────────────────────────

  describe('impersonate', () => {
    it('issues a 15-min impersonation token and writes an audit log', async () => {
      prisma.company.findUnique.mockResolvedValue(makeCompany());

      const result = await service.impersonate(COMPANY_ID, SUPER_ADMIN);

      expect(result).toHaveProperty('accessToken', 'mock.impersonation.jwt');
      expect(result.expiresIn).toBe(900);
      expect(result.impersonating.companyId).toBe(COMPANY_ID);
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: COMPANY_ID, role: 'COMPANY_ADMIN' }),
        900,
      );
      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IMPERSONATE', entity: 'Company', actorId: SUPER_ADMIN.id }),
      );
    });

    it('throws NotFoundException for an unknown company', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.impersonate('unknown', SUPER_ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException if company is not ACTIVE', async () => {
      prisma.company.findUnique.mockResolvedValue(makeCompany({ status: 'INACTIVE' }));

      await expect(service.impersonate(COMPANY_ID, SUPER_ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
