import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { SuperAdminController } from '../src/modules/super-admin/super-admin.controller';
import { SuperAdminService } from '../src/modules/super-admin/super-admin.service';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { RbacGuard } from '../src/common/auth/rbac.guard';

const COMPANY_ID = '123e4567-e89b-12d3-a456-426614174000';

const mockCompany = {
  id: COMPANY_ID,
  name: 'Acme Corp',
  code: 'ACME',
  plan: 'starter',
  status: 'ACTIVE',
  _count: { employees: 10, devices: 3, users: 2, branches: 1 },
};

const mockService = {
  provisionCompany: jest.fn(),
  listCompanies: jest.fn(),
  getCompany: jest.fn(),
  updateCompany: jest.fn(),
  listDeviceHealth: jest.fn(),
  impersonate: jest.fn(),
};

const allowAll = { canActivate: () => true };

describe('SuperAdminController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SuperAdminController],
      providers: [{ provide: SuperAdminService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAll)
      .overrideGuard(RbacGuard)
      .useValue(allowAll)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  // ── POST /admin/companies ─────────────────────────────────────────────────

  describe('POST /api/v1/admin/companies', () => {
    it('returns 201 with the provisioned company', async () => {
      mockService.provisionCompany.mockResolvedValue(mockCompany);

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/companies')
        .send({
          name: 'Acme Corp',
          code: 'ACME',
          adminEmail: 'admin@acme.io',
          adminPassword: 'password123',
        })
        .expect(201);

      expect(res.body.id).toBe(COMPANY_ID);
      expect(mockService.provisionCompany).toHaveBeenCalled();
    });

    it('returns 400 when adminPassword is too short', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/companies')
        .send({
          name: 'Acme Corp',
          code: 'ACME',
          adminEmail: 'admin@acme.io',
          adminPassword: 'short',
        })
        .expect(400);
    });

    it('returns 400 when adminEmail is invalid', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/companies')
        .send({
          name: 'Acme Corp',
          code: 'ACME',
          adminEmail: 'not-an-email',
          adminPassword: 'password123',
        })
        .expect(400);
    });
  });

  // ── GET /admin/companies ──────────────────────────────────────────────────

  describe('GET /api/v1/admin/companies', () => {
    it('returns 200 with paginated list', async () => {
      mockService.listCompanies.mockResolvedValue({ data: [mockCompany], total: 1, page: 1, limit: 20 });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/companies')
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].code).toBe('ACME');
    });
  });

  // ── GET /admin/companies/:id ──────────────────────────────────────────────

  describe('GET /api/v1/admin/companies/:id', () => {
    it('returns 200 with company detail', async () => {
      mockService.getCompany.mockResolvedValue(mockCompany);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/companies/${COMPANY_ID}`)
        .expect(200);

      expect(res.body.name).toBe('Acme Corp');
    });
  });

  // ── GET /admin/devices/health ─────────────────────────────────────────────

  describe('GET /api/v1/admin/devices/health', () => {
    it('returns 200 with health snapshot array', async () => {
      mockService.listDeviceHealth.mockResolvedValue([
        { companyId: COMPANY_ID, companyName: 'Acme Corp', devices: { total: 3, online: 2, offline: 1, maintenance: 0 } },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/devices/health')
        .query({ heartbeatThresholdMinutes: 5 })
        .expect(200);

      expect(res.body[0].devices.online).toBe(2);
    });
  });

  // ── POST /admin/companies/:id/impersonate ─────────────────────────────────

  describe('POST /api/v1/admin/companies/:id/impersonate', () => {
    it('returns 201 with impersonation token', async () => {
      mockService.impersonate.mockResolvedValue({
        accessToken: 'eyJ.impersonation.token',
        tokenType: 'Bearer',
        expiresIn: 900,
        impersonating: { companyId: COMPANY_ID, companyName: 'Acme Corp' },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/companies/${COMPANY_ID}/impersonate`)
        .expect(201);

      expect(res.body.accessToken).toBe('eyJ.impersonation.token');
      expect(res.body.expiresIn).toBe(900);
    });
  });
});
