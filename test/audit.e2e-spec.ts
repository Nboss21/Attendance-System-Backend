import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuditController } from '../src/modules/audit/audit.controller';
import { AuditService } from '../src/modules/audit/audit.service';
import { TenantContextService } from '../src/common/tenant/tenant-context.service';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { RbacGuard } from '../src/common/auth/rbac.guard';

const mockAuditLogs = [
  {
    id: 'log-uuid-1',
    companyId: 'company-uuid-123',
    action: 'CREATE',
    entity: 'Employee',
    timestamp: new Date().toISOString(),
  },
];

const mockAuditService = {
  findAll: jest.fn(),
};

const mockTenantContextService = {
  companyIdOrThrow: jest.fn(() => 'company-uuid-123'),
};

const allowAll = { canActivate: () => true };

describe('AuditController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: AuditService, useValue: mockAuditService },
        { provide: TenantContextService, useValue: mockTenantContextService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAll)
      .overrideGuard(RbacGuard)
      .useValue(allowAll)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  describe('GET /api/v1/audit-logs', () => {
    it('returns 200 with tenant-scoped logs', async () => {
      mockAuditService.findAll.mockResolvedValue(mockAuditLogs);

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .query({ limit: 10 })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe('log-uuid-1');
      expect(mockAuditService.findAll).toHaveBeenCalledWith(
        'company-uuid-123',
        expect.objectContaining({ limit: 10 }),
      );
    });
  });
});
