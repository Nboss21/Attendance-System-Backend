import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DeviceType } from '@prisma/client';
import { DevicesController } from '../src/modules/devices/devices.controller';
import { DevicesService } from '../src/modules/devices/devices.service';
import { DeviceApiKeyGuard } from '../src/common/guards/device-api-key.guard';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { RbacGuard } from '../src/common/auth/rbac.guard';

// ─── Shared test data ─────────────────────────────────────────────────────────

const DEVICE_ID = '123e4567-e89b-12d3-a456-426614174000';
const API_KEY = 'test-plaintext-api-key';

const fakeDevice = {
  id: DEVICE_ID,
  companyId: '123e4567-e89b-12d3-a456-426614174001',
  serialNumber: 'SN-E2E-001',
  type: DeviceType.FACE,
  status: 'ACTIVE',
  branchId: null,
  ipAddress: null,
  firmwareVersion: null,
  matchingMode: 'ON_DEVICE',
  lastHeartbeatAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

/** Stub that always allows authenticated requests (no real JWT needed in tests). */
const allowAll = { canActivate: () => true };

const mockDevicesService = {
  register: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  heartbeat: jest.fn(),
  sendCommand: jest.fn(),
  getStatus: jest.fn(),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('DevicesController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DevicesController],
      providers: [
        { provide: DevicesService, useValue: mockDevicesService },
        // DeviceApiKeyGuard needs PrismaService — provide a no-op for guard tests below.
        { provide: DeviceApiKeyGuard, useValue: { canActivate: () => true } },
      ],
    })
      // Bypass real JWT/RBAC so we can focus on the controller/service contract.
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAll)
      .overrideGuard(RbacGuard)
      .useValue(allowAll)
      .overrideGuard(DeviceApiKeyGuard)
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

  // ── POST /devices/register ────────────────────────────────────────────────

  describe('POST /api/v1/devices/register', () => {
    it('returns 201 with device and apiKey', async () => {
      mockDevicesService.register.mockResolvedValue({
        device: fakeDevice,
        apiKey: API_KEY,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .send({ serialNumber: 'SN-E2E-001', type: DeviceType.FACE })
        .expect(201);

      expect(res.body).toHaveProperty('device');
      expect(res.body).toHaveProperty('apiKey', API_KEY);
      expect(res.body.device.id).toBe(DEVICE_ID);
    });

    it('returns 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .send({ serialNumber: 'SN-NO-TYPE' }) // missing `type`
        .expect(400);
    });

    it('returns 400 for an invalid DeviceType value', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .send({ serialNumber: 'SN-001', type: 'INVALID_TYPE' })
        .expect(400);
    });
  });

  // ── GET /devices ──────────────────────────────────────────────────────────

  describe('GET /api/v1/devices', () => {
    it('returns 200 with array of devices', async () => {
      mockDevicesService.findAll.mockResolvedValue([fakeDevice]);

      const res = await request(app.getHttpServer()).get('/api/v1/devices').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe(DEVICE_ID);
    });
  });

  // ── GET /devices/:id ──────────────────────────────────────────────────────

  describe('GET /api/v1/devices/:id', () => {
    it('returns 200 with the device', async () => {
      mockDevicesService.findOne.mockResolvedValue(fakeDevice);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/devices/${DEVICE_ID}`)
        .expect(200);

      expect(res.body.serialNumber).toBe('SN-E2E-001');
    });
  });

  // ── POST /devices/:id/heartbeat ───────────────────────────────────────────

  describe('POST /api/v1/devices/:id/heartbeat', () => {
    it('returns 201 with updated heartbeat data', async () => {
      const now = new Date().toISOString();
      mockDevicesService.heartbeat.mockResolvedValue({
        id: DEVICE_ID,
        lastHeartbeatAt: now,
        firmwareVersion: '2.0.0',
        status: 'ACTIVE',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/devices/${DEVICE_ID}/heartbeat`)
        .set('X-Device-Api-Key', API_KEY)
        .send({ firmwareVersion: '2.0.0' })
        .expect(201);

      expect(res.body).toHaveProperty('lastHeartbeatAt');
      expect(res.body.firmwareVersion).toBe('2.0.0');
    });
  });

  // ── POST /devices/:id/commands ────────────────────────────────────────────

  describe('POST /api/v1/devices/:id/commands', () => {
    it('returns 201 with queued=true and a commandId', async () => {
      mockDevicesService.sendCommand.mockResolvedValue({ queued: true, commandId: 'cmd-001' });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/devices/${DEVICE_ID}/commands`)
        .send({ command: 'REBOOT' })
        .expect(201);

      expect(res.body.queued).toBe(true);
      expect(res.body.commandId).toBe('cmd-001');
    });

    it('returns 400 for an invalid command value', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/devices/${DEVICE_ID}/commands`)
        .send({ command: 'SELF_DESTRUCT' })
        .expect(400);
    });
  });

  // ── GET /devices/:id/status ───────────────────────────────────────────────

  describe('GET /api/v1/devices/:id/status', () => {
    it('returns 200 with status fields', async () => {
      mockDevicesService.getStatus.mockResolvedValue({
        id: DEVICE_ID,
        serialNumber: 'SN-E2E-001',
        status: 'ACTIVE',
        lastHeartbeatAt: null,
        firmwareVersion: null,
        ipAddress: null,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/devices/${DEVICE_ID}/status`)
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
      expect(res.body).not.toHaveProperty('apiKey');
    });
  });
});
