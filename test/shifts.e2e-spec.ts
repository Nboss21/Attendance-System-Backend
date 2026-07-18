import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ShiftType } from '@prisma/client';
import { ShiftsController } from '../src/modules/shifts/shifts.controller';
import { ShiftsService } from '../src/modules/shifts/shifts.service';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { RbacGuard } from '../src/common/auth/rbac.guard';

// ─── Shared test data ─────────────────────────────────────────────────────────

const SHIFT_ID = '123e4567-e89b-12d3-a456-426614174000';
const EMPLOYEE_ID = '123e4567-e89b-12d3-a456-426614174001';

const fakeShift = {
  id: SHIFT_ID,
  companyId: '123e4567-e89b-12d3-a456-426614174002',
  name: 'Morning Shift',
  type: ShiftType.FIXED,
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: 60,
  gracePeriodMins: 10,
  isOvernight: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

/** Stub that always allows authenticated requests (no real JWT needed in tests). */
const allowAll = { canActivate: () => true };

const mockShiftsService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  assign: jest.fn(),
  findAssignments: jest.fn(),
  updateAssignment: jest.fn(),
  removeAssignment: jest.fn(),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ShiftsController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ShiftsController],
      providers: [{ provide: ShiftsService, useValue: mockShiftsService }],
    })
      // Bypass real JWT/RBAC so we can focus on the controller/service contract.
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

  // ── POST /shifts ──────────────────────────────────────────────────────────

  describe('POST /api/v1/shifts', () => {
    it('creates a shift', async () => {
      mockShiftsService.create.mockResolvedValue(fakeShift);

      const res = await request(app.getHttpServer())
        .post('/api/v1/shifts')
        .send({ name: 'Morning Shift', startTime: '08:00', endTime: '17:00', breakMinutes: 60 })
        .expect(201);

      expect(res.body.name).toBe('Morning Shift');
      expect(mockShiftsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ startTime: '08:00' }),
      );
    });

    it('rejects a malformed time (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/shifts')
        .send({ name: 'Bad Shift', startTime: '8am', endTime: '17:00' })
        .expect(400);

      expect(mockShiftsService.create).not.toHaveBeenCalled();
    });

    it('rejects unknown properties (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/shifts')
        .send({ name: 'Shift', startTime: '08:00', endTime: '17:00', companyId: 'sneaky' })
        .expect(400);
    });
  });

  // ── GET /shifts ───────────────────────────────────────────────────────────

  describe('GET /api/v1/shifts', () => {
    it('lists shifts', async () => {
      mockShiftsService.findAll.mockResolvedValue([fakeShift]);

      const res = await request(app.getHttpServer()).get('/api/v1/shifts').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(SHIFT_ID);
    });
  });

  // ── POST /shifts/:id/assignments (main endpoint) ──────────────────────────

  describe('POST /api/v1/shifts/:id/assignments', () => {
    it('bulk-assigns employees over a date range', async () => {
      mockShiftsService.assign.mockResolvedValue({ assigned: 7, employees: 1, days: 7 });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/shifts/${SHIFT_ID}/assignments`)
        .send({ employeeIds: [EMPLOYEE_ID], from: '2026-07-20', to: '2026-07-26' })
        .expect(201);

      expect(res.body).toEqual({ assigned: 7, employees: 1, days: 7 });
      expect(mockShiftsService.assign).toHaveBeenCalledWith(
        SHIFT_ID,
        expect.objectContaining({ employeeIds: [EMPLOYEE_ID] }),
      );
    });

    it('rejects an empty employee list (400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/shifts/${SHIFT_ID}/assignments`)
        .send({ employeeIds: [], from: '2026-07-20' })
        .expect(400);

      expect(mockShiftsService.assign).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID shift id (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/shifts/not-a-uuid/assignments')
        .send({ employeeIds: [EMPLOYEE_ID], from: '2026-07-20' })
        .expect(400);
    });
  });

  // ── GET /shifts/schedule ──────────────────────────────────────────────────

  describe('GET /api/v1/shifts/schedule', () => {
    it('passes query filters through to the service', async () => {
      mockShiftsService.findAssignments.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/api/v1/shifts/schedule')
        .query({ from: '2026-07-20', to: '2026-07-26', employeeId: EMPLOYEE_ID })
        .expect(200);

      expect(mockShiftsService.findAssignments).toHaveBeenCalledWith(
        expect.objectContaining({ from: '2026-07-20', employeeId: EMPLOYEE_ID }),
      );
    });
  });
});
